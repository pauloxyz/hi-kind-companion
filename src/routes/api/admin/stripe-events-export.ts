/**
 * Server route: baixar CSV/JSON dos stripe_webhook_events filtrados.
 *
 * Devolve `Response` cru com `Content-Disposition: attachment; filename=...`
 * para que o browser respeite o nome de arquivo definido no servidor.
 * Auth: Bearer JWT do usuário + role admin (assertAdminRequest).
 *
 * Body (JSON): { environment, status, eventType?, search?, errorMessage?, sortBy?, sortDir? }
 * Query: ?format=csv|json
 * Response headers extras:
 *   - X-Export-Count: número de registros contidos
 *   - Cache-Control: no-store
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  stripeEventsExportSchema,
  applyStripeEventsFilters,
  type StripeWebhookEventRow,
} from "@/lib/stripe-webhook-events.functions";
import { stripeEventsToCsv } from "@/lib/stripe-events-format";
import {
  buildStripeEventsFilename,
  contentDispositionAttachment,
} from "@/lib/export-filename";

export const Route = createFileRoute("/api/admin/stripe-events-export")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { assertAdminRequest } = await import("@/lib/admin-request-auth.server");
          await assertAdminRequest(request);
        } catch (r) {
          if (r instanceof Response) return r;
          return new Response("Unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const format = url.searchParams.get("format") === "json" ? "json" : "csv";

        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          /* aceita corpo vazio */
        }

        const parsed = stripeEventsExportSchema.safeParse(body ?? {});
        if (!parsed.success) {
          return new Response(JSON.stringify(parsed.error.flatten()), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const base = supabaseAdmin
          .from("stripe_webhook_events")
          .select(
            "id,stripe_event_id,event_type,environment,status,error_message,payload_summary,received_at,processed_at",
          )
          .order(parsed.data.sortBy, { ascending: parsed.data.sortDir === "asc" })
          .limit(10000);

        const { data: rows, error } = await applyStripeEventsFilters(base, parsed.data);
        if (error) {
          return new Response(error.message, { status: 500 });
        }

        const list = (rows ?? []) as unknown as StripeWebhookEventRow[];
        const filename = buildStripeEventsFilename(
          {
            environment: parsed.data.environment,
            status: parsed.data.status,
            eventType: parsed.data.eventType ?? null,
          },
          format,
        );

        const body_ =
          format === "csv"
            ? "\uFEFF" + stripeEventsToCsv(list)
            : JSON.stringify(list, null, 2);
        const type =
          format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";

        return new Response(body_, {
          status: 200,
          headers: {
            "Content-Type": type,
            "Content-Disposition": contentDispositionAttachment(filename),
            "X-Export-Count": String(list.length),
            "X-Export-Filename": filename,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
