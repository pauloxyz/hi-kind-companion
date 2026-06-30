/**
 * Admin-only server functions for the security scan history page.
 *
 * Reads from `security_scan_runs` (populated by the daily pg_cron job
 * `security-linter-daily`) and exposes a "run now" action that calls the
 * same SQL linter on demand.
 *
 * Defense in depth: even though the table has admin-only RLS, every fn
 * also calls `assertAdminWithAudit` so a misconfigured client can't even
 * read summary counts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";
import { withServerErrors } from "@/lib/server-error-handler";
import { z } from "zod";

export type SecurityScanFinding = {
  level: "error" | "warn" | string;
  check: string;
  object: string;
  message: string;
};

export type SecurityScanRunRow = {
  id: string;
  scanned_at: string;
  source: string;
  total: number;
  errors: number;
  warnings: number;
  findings: SecurityScanFinding[];
};

export const listSecurityScanRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) =>
    z.object({ limit: z.number().int().min(1).max(100).default(30) }).parse(input ?? {}),
  )
  .handler(
    withServerErrors("security_scans.list", async ({ data, context }) => {
      await assertAdminWithAudit(context as never, "security_scans.list");
      const { data: rows, error } = await context.supabase
        .from("security_scan_runs")
        .select("id,scanned_at,source,total,errors,warnings,findings")
        .order("scanned_at", { ascending: false })
        .limit(data.limit);
      if (error) throw error;
      return (rows ?? []) as SecurityScanRunRow[];
    }),
  );

export const runSecurityLinterNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    withServerErrors("security_scans.run_now", async ({ context }) => {
      await assertAdminWithAudit(context as never, "security_scans.run_now");
      // run_security_linter() roda como SECURITY DEFINER e está revogada
      // de anon/authenticated — só service_role pode chamar. Usamos o admin
      // client para essa chamada (privilegiada e auditada acima).
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.rpc("run_security_linter");
      if (error) throw error;
      return { runId: data as string };
    }),
  );
