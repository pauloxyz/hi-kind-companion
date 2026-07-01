/**
 * Webhook do Stripe → tabela public.subscriptions.
 *
 * Endpoint: /api/public/payments/webhook?env=sandbox|live
 *
 * Segurança: rota é pública (Lovable bypassa auth em /api/public/*),
 * então a autenticação é feita via `verifyWebhook` (HMAC-SHA256 com
 * PAYMENTS_{SANDBOX,LIVE}_WEBHOOK_SECRET) ANTES de qualquer escrita.
 * A escrita usa service_role (bypassa RLS) — as policies só permitem SELECT.
 *
 * Eventos tratados:
 *  - customer.subscription.created/updated/deleted  (recorrentes)
 *  - invoice.paid                                    (renovação — reforça status/period_end)
 *  - checkout.session.completed (mode=payment)       (pagamento único → linha
 *      vitalícia com status=active e current_period_end=NULL, que satisfaz is_pro())
 *
 * O ambiente (sandbox|live) vem do querystring `?env=` que o Stripe carrega
 * na URL do webhook — cada endpoint (test/live) é registrado com o seu.
 */
import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyStripeWebhook } from "@/lib/stripe-webhook.server";

// Tipos Stripe são pesados e o payload aqui é JSON puro (sem SDK), então usamos
// `any` interno com resolvers tipados nas fronteiras.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function resolvePlanFromSubscriptionItem(item: Json): string {
  return (
    item?.price?.lookup_key ||
    item?.price?.nickname ||
    item?.price?.metadata?.lovable_external_id ||
    item?.price?.id ||
    "unknown"
  );
}

function computeAmountCents(unit: unknown, quantity: number | undefined): number | null {
  if (typeof unit !== "number") return null;
  return unit * (quantity && quantity > 0 ? quantity : 1);
}

async function upsertFromSubscription(
  subscription: Json,
  eventType: string,
  env: StripeEnv,
) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error(`[stripe-webhook] ${eventType}: missing metadata.userId on subscription ${subscription.id}`);
    return;
  }

  const item = subscription.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const status =
    eventType === "customer.subscription.deleted" ? "canceled" : subscription.status;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        plan: resolvePlanFromSubscriptionItem(item),
        status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        amount_cents: computeAmountCents(item?.price?.unit_amount, item?.quantity),
        currency: item?.price?.currency ?? "brl",
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  if (error) {
    console.error(`[stripe-webhook] ${eventType} upsert failed:`, error.message);
    throw error;
  }
}

/**
 * Renovação: invoice.paid dispara depois de cada cobrança bem-sucedida.
 * Reforça status=active e o current_period_end mais recente.
 * Ignora invoices sem subscription (avulsas).
 */
async function handleInvoicePaid(invoice: Json, env: StripeEnv) {
  const subscriptionId: string | null =
    typeof invoice.subscription === "string" ? invoice.subscription : null;
  if (!subscriptionId) return;

  const line = invoice.lines?.data?.[0];
  const periodEnd = line?.period?.end;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "active",
      ...(periodEnd && { current_period_end: new Date(periodEnd * 1000).toISOString() }),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId)
    .eq("environment", env);

  if (error) {
    console.error("[stripe-webhook] invoice.paid update failed:", error.message);
    throw error;
  }
}

/**
 * Pagamento único (Checkout mode=payment) — Stripe não cria subscription.
 * Gravamos uma linha vitalícia (current_period_end=NULL) para satisfazer is_pro().
 * Idempotente via `stripe_checkout_session_id`.
 */
async function handleCheckoutCompleted(session: Json, env: StripeEnv) {
  if (session.mode !== "payment") {
    // subscriptions são tratadas via customer.subscription.created
    return;
  }
  if (session.payment_status !== "paid") return;

  const userId = session.metadata?.userId;
  if (!userId) {
    console.error(
      `[stripe-webhook] checkout.session.completed: missing metadata.userId on session ${session.id}`,
    );
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_checkout_session_id: session.id,
        stripe_customer_id:
          typeof session.customer === "string" ? session.customer : null,
        plan: "one_time",
        status: "active",
        current_period_end: null, // vitalício
        amount_cents:
          typeof session.amount_total === "number" ? session.amount_total : null,
        currency: session.currency ?? "brl",
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_checkout_session_id" },
    );

  if (error) {
    console.error("[stripe-webhook] checkout.session.completed upsert failed:", error.message);
    throw error;
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyStripeWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await upsertFromSubscription(event.data.object, event.type, env);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object, env);
      break;
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    default:
      // Retornar 200 pra Stripe parar de reenviar eventos que não usamos.
      console.log("[stripe-webhook] unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("[stripe-webhook] invalid ?env=", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[stripe-webhook] error:", msg);
          // 400 para assinatura/payload inválido — Stripe reenviará.
          return new Response(`Webhook error: ${msg}`, { status: 400 });
        }
      },
    },
  },
});
