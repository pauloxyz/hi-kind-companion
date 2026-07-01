import { createFileRoute } from "@tanstack/react-router";
import { runSeoChecks } from "@/lib/seo-runner";
import { verifyCronSecret, unauthorizedCronResponse, logCronCall } from "@/lib/cron-auth.server";
import { checkRateLimit } from "@/lib/rate-limit.server";

/**
 * SEO scan hook — called by pg_cron daily.
 * Runs the internal SEO check suite and persists the snapshot.
 */
export const Route = createFileRoute("/api/public/hooks/seo-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = verifyCronSecret(request);
        await logCronCall({ hook: "seo-scan", request, result: auth });
        if (!auth.ok) return unauthorizedCronResponse(auth.reason);
        if (!(await checkRateLimit("cron:seo-scan", 5, 60))) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429,
            headers: { "content-type": "application/json" },
          });
        }


        try {
          const snap = await runSeoChecks();
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const failing = snap.tests
            .filter((t) => !t.passed)
            .map((t) => ({ name: t.name, severity: t.severity, message: t.message }));
          const { data, error } = await supabaseAdmin
            .from("seo_scan_runs")
            .insert({
              source: "cron",
              tests_total: snap.testsTotal,
              tests_passed: snap.testsPassed,
              tests_failed: snap.testsFailed,
              critical_count: snap.severityCounts.critical,
              high_count: snap.severityCounts.high,
              medium_count: snap.severityCounts.medium,
              low_count: snap.severityCounts.low,
              routes_total: snap.routesTotal,
              routes_in_sitemap: snap.routesInSitemap,
              duration_ms: snap.durationMs,
              details: { failing } as never,
            })
            .select("id")
            .single();
          if (error) throw error;
          return Response.json({ ok: true, runId: data!.id, ...snap });
        } catch (e) {
          console.error("seo-scan hook failed", e);
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
