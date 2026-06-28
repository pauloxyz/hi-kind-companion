/**
 * Admin-only audit panel server functions. Caller must have role='admin'.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role check failed");
  if (!data) throw new Error("Forbidden");
}

export type AuditEvent = {
  id: string;
  event_type: string;
  user_id: string | null;
  email_hash: string | null;
  ip_address: string | null;
  user_agent: string | null;
  resource: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export const listAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { event_type?: string; limit?: number; since_days?: number }) => ({
      event_type: input?.event_type,
      limit: Math.min(Math.max(input?.limit ?? 100, 1), 500),
      since_days: Math.min(Math.max(input?.since_days ?? 30, 1), 180),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const since = new Date(Date.now() - data.since_days * 86400_000).toISOString();
    let q = context.supabase
      .from("security_audit_log")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.event_type) q = q.eq("event_type", data.event_type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows as AuditEvent[];
  });

export type AuditStats = {
  hibp_daily: Array<{ day: string; hibp_blocks: number; weak_blocks: number; auth_failures: number }>;
  risk_alerts: Array<{
    hour: string;
    ip_address: string | null;
    hibp_blocks: number;
    weak_blocks: number;
    auth_failures: number;
    total_events: number;
    risk_level: "low" | "medium" | "high";
  }>;
  totals: { hibp: number; weak: number; pii: number; auth_fail: number };
};

export const getAuditStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [hibp, alerts, all] = await Promise.all([
      context.supabase.from("security_hibp_daily").select("*").limit(30),
      context.supabase.from("security_risk_alerts").select("*").limit(100),
      context.supabase
        .from("security_audit_log")
        .select("event_type")
        .gte("created_at", since30),
    ]);
    if (hibp.error) throw new Error(hibp.error.message);
    if (alerts.error) throw new Error(alerts.error.message);
    if (all.error) throw new Error(all.error.message);
    const totals = { hibp: 0, weak: 0, pii: 0, auth_fail: 0 };
    for (const r of (all.data ?? []) as Array<{ event_type: string }>) {
      if (r.event_type === "hibp_block") totals.hibp++;
      else if (r.event_type === "weak_password_block") totals.weak++;
      else if (r.event_type === "pii_access") totals.pii++;
      else if (r.event_type === "auth_failure") totals.auth_fail++;
    }
    return { hibp_daily: hibp.data ?? [], risk_alerts: alerts.data ?? [], totals } as AuditStats;
  });
