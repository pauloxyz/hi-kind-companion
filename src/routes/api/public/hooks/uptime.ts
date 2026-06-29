import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Uptime hook — called by pg_cron every 5 minutes.
 * Runs the same checks as /api/public/health and persists the result.
 */
export const Route = createFileRoute("/api/public/hooks/uptime")({
  server: {
    handlers: {
      POST: async () => {
        const started = Date.now();
        const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};

        try {
          const sb = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
          );
          const t0 = Date.now();
          const { error } = await sb.from("public_jobs" as unknown as "jobs").select("id", { count: "exact", head: true }).limit(1);
          checks.database = error
            ? { ok: false, error: error.message }
            : { ok: true, latency_ms: Date.now() - t0 };
        } catch (e) {
          checks.database = { ok: false, error: (e as Error).message };
        }

        const allOk = Object.values(checks).every((c) => c.ok);
        const status = allOk ? "ok" : "degraded";
        const latency_ms = Date.now() - started;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("uptime_checks").insert({
            status,
            http_status: allOk ? 200 : 503,
            latency_ms,
            checks: checks as never,
            error: allOk ? null : Object.entries(checks).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.error}`).join("; "),
          });
        } catch (e) {
          console.error("uptime insert failed", e);
        }

        return new Response(
          JSON.stringify({ status, latency_ms, checks }),
          { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
        );
      },
    },
  },
});
