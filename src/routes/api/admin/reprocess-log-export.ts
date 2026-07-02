/**
 * Server route: baixar CSV/JSON do stripe_webhook_reprocess_log filtrado.
 * Mesma mecânica do stripe-events-export: Response cru com
 * Content-Disposition e Bearer + admin obrigatórios.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  reprocessLogExportSchema,
  type ReprocessLogEntry,
} from "@/lib/stripe-webhook-events.functions";
import { reprocessLogToCsv } from "@/lib/stripe-events-format";
import {
  buildReprocessLogFilename,
  contentDispositionAttachment,
} from "@/lib/export-filename";

export const Route = createFileRoute("/api/admin/reprocess-log-export")({
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
          /* corpo vazio permitido */
        }
        const parsed = reprocessLogExportSchema.safeParse(body ?? {});
        if (!parsed.success) {
          return new Response(JSON.stringify(parsed.error.flatten()), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const data = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let q = supabaseAdmin
          .from("stripe_webhook_reprocess_log")
          .select(
            "id,event_row_id,stripe_event_id,event_type,environment,actor_user_id,outcome,message,duration_ms,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(data.limit);
        if (data.outcome !== "all") q = q.eq("outcome", data.outcome);
        if (data.stripe_event_id) {
          const s = data.stripe_event_id.replace(/[^\w:-]/g, "").slice(0, 100);
          if (s) q = q.ilike("stripe_event_id", `%${s}%`);
        }
        if (data.actor_user_id) {
          const a = data.actor_user_id.replace(/[^\w-]/g, "").slice(0, 60);
          if (a) q = q.eq("actor_user_id", a);
        }
        if (data.since) q = q.gte("created_at", data.since);
        if (data.until) q = q.lte("created_at", data.until);

        const { data: rows, error } = await q;
        if (error) return new Response(error.message, { status: 500 });

        const list = (rows ?? []) as unknown as ReprocessLogEntry[];
        const filename = buildReprocessLogFilename(
          {
            outcome: data.outcome,
            stripe_event_id: data.stripe_event_id ?? null,
            actor_user_id: data.actor_user_id ?? null,
          },
          format,
        );

        const body_ =
          format === "csv"
            ? "\uFEFF" + reprocessLogToCsv(list)
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
