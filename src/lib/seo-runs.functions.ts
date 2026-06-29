/**
 * Admin SEO history server functions.
 * Caller must have role='admin'.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runSeoChecks, type Severity } from "@/lib/seo-runner";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role check failed");
  if (!data) throw new Error("Forbidden");
}

export type SeoScanRun = {
  id: string;
  created_at: string;
  source: "cron" | "manual";
  tests_total: number;
  tests_passed: number;
  tests_failed: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  routes_total: number;
  routes_in_sitemap: number;
  duration_ms: number;
  details: {
    failing?: Array<{ name: string; severity: Severity; message?: string }>;
  };
};

export const listSeoRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => ({
    limit: Math.min(Math.max(input?.limit ?? 90, 1), 365),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("seo_scan_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as SeoScanRun[];
  });

export const triggerManualSeoScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const snap = await runSeoChecks();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const failing = snap.tests
      .filter((t) => !t.passed)
      .map((t) => ({ name: t.name, severity: t.severity, message: t.message }));
    const { data, error } = await supabaseAdmin
      .from("seo_scan_runs")
      .insert({
        source: "manual",
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
    if (error) throw new Error(error.message);
    return { ok: true, runId: data!.id };
  });
