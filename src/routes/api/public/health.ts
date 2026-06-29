import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
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
        return new Response(
          JSON.stringify({
            status: allOk ? "ok" : "degraded",
            timestamp: new Date().toISOString(),
            uptime_check_ms: Date.now() - started,
            checks,
          }),
          {
            status: allOk ? 200 : 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
