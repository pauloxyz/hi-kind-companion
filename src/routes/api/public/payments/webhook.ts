/**
 * Webhook do Stripe → tabela public.subscriptions.
 *
 * Endpoint: /api/public/payments/webhook?env=sandbox|live
 *
 * Segurança: rota é pública (Lovable bypassa auth em /api/public/*),
 * então a autenticação é feita via `verifyWebhook` (HMAC-SHA256 com
 * PAYMENTS_{SANDBOX,LIVE}_WEBHOOK_SECRET) ANTES de qualquer escrita.
 *
 * Escrita usa service_role (bypassa RLS) — as policies só permitem SELECT.
 */
import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeSubscription = any;

function resolvePlan(item: StripeSubscription): string {
  return (
    item?.price?.lookup_key ||
    item?.price?.nickname ||
    item?.price?.metadata?.lovable_external_id ||
    item?.price?.id ||
    "unknown"
  );
}

function computeAmountCents(item: StripeSubscription, quantity: number): number | null {
  const unit = item?.price?.unit_amount;
  if (typeof unit !== "number") return null;
  return unit * (quantity || 1);
}

async function handleSubscriptionUpsert(
  subscription: StripeSubscription,
  eventType: string,
) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error(`[stripe-webhook] ${eventType}: missing metadata.userId`);
    return;
  }

  const item = subscription.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const status = eventType === "customer.subscription.deleted" ? "canceled" : subscription.status;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        plan: resolvePlan(item),
        status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        amount_cents: computeAmountCents(item, item?.quantity ?? 1),
        currency: item?.price?.currency ?? "brl",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  if (error) {
    console.error(`[stripe-webhook] ${eventType} upsert failed:`, error.message);
    throw error;
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscriptionUpsert(event.data.object, event.type);
      break;
    default:
      // Eventos não tratados (invoice.*, checkout.session.completed, etc.)
      // — logar e retornar 200 para o Stripe parar de reenviar.
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
          // 400 para erros de assinatura/payload — Stripe reenviará.
          return new Response(`Webhook error: ${msg}`, { status: 400 });
        }
      },
    },
  },
});
