/**
 * DEV-ONLY: dispara um evento assinado de teste contra o próprio webhook
 * para validar o fluxo end-to-end sem depender do Stripe real.
 *
 * Só responde em desenvolvimento (NODE_ENV !== 'production'). Em produção
 * retorna 404 para não expor superfície de teste.
 *
 * Uso:
 *   POST /api/public/payments/dev-selftest?userId=<uuid>
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payments/dev-selftest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.NODE_ENV === "production") {
          return new Response("Not found", { status: 404 });
        }

        const url = new URL(request.url);
        const userId = url.searchParams.get("userId");
        if (!userId) {
          return Response.json({ error: "missing ?userId" }, { status: 400 });
        }

        const secret = process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET;
        if (!secret) {
          return Response.json({ error: "sandbox secret not configured" }, { status: 500 });
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const periodEnd = nowSec + 60 * 60 * 24 * 30;
        const subId = `sub_selftest_${nowSec}`;

        const event = {
          id: `evt_selftest_${nowSec}`,
          type: "customer.subscription.created",
          data: {
            object: {
              id: subId,
              customer: "cus_selftest",
              status: "active",
              current_period_end: periodEnd,
              metadata: { userId },
              items: {
                data: [
                  {
                    quantity: 1,
                    current_period_end: periodEnd,
                    price: {
                      id: "price_selftest",
                      unit_amount: 2990,
                      currency: "brl",
                      lookup_key: "pro_monthly",
                    },
                  },
                ],
              },
            },
          },
        };

        const body = JSON.stringify(event);
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const signed = await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(`${nowSec}.${body}`),
        );
        const sig = Array.from(new Uint8Array(signed))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const target = new URL("/api/public/payments/webhook?env=sandbox", url.origin);
        const res = await fetch(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "stripe-signature": `t=${nowSec},v1=${sig}`,
          },
          body,
        });
        const text = await res.text();
        return Response.json({
          sent_event_id: event.id,
          subscription_id: subId,
          webhook_status: res.status,
          webhook_body: text,
        });
      },
    },
  },
});
