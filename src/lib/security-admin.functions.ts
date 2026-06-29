/**
 * Admin-only audit panel server functions. Caller must have role='admin'.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type AuditEvent = {
  id: string;
  event_type: string;
  user_id: string | null;
  email_hash: string | null;
  ip_address: string | null;
  user_agent: string | null;
  resource: string | null;
  metadata: JsonValue;
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
    await assertAdminWithAudit(context as never, "security_admin.fn");
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
    return (rows ?? []) as AuditEvent[];
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
    await assertAdminWithAudit(context as never, "security_admin.fn");
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

export type DeniedAdminSummary = {
  total: number;
  by_route: Array<{ route: string; count: number; last_at: string }>;
  by_user: Array<{ user_id: string; count: number; last_at: string }>;
  daily: Array<{ day: string; count: number }>;
};

export const getDeniedAdminSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { since_days?: number } | undefined) => ({
    since_days: Math.min(Math.max(input?.since_days ?? 30, 1), 180),
  }))
  .handler(async ({ data, context }): Promise<DeniedAdminSummary> => {
    await assertAdminWithAudit(context as never, "security_admin.denied_summary");
    const since = new Date(Date.now() - data.since_days * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("security_audit_log")
      .select("user_id, resource, created_at")
      .eq("event_type", "admin_access_denied")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    type Row = { user_id: string | null; resource: string | null; created_at: string };
    const list = (rows ?? []) as Row[];

    const routeMap = new Map<string, { count: number; last_at: string }>();
    const userMap = new Map<string, { count: number; last_at: string }>();
    const dayMap = new Map<string, number>();

    for (const r of list) {
      const route = r.resource ?? "(unknown)";
      const user = r.user_id ?? "(anonymous)";
      const day = r.created_at.slice(0, 10);

      const ri = routeMap.get(route);
      if (!ri) routeMap.set(route, { count: 1, last_at: r.created_at });
      else { ri.count++; if (r.created_at > ri.last_at) ri.last_at = r.created_at; }

      const ui = userMap.get(user);
      if (!ui) userMap.set(user, { count: 1, last_at: r.created_at });
      else { ui.count++; if (r.created_at > ui.last_at) ui.last_at = r.created_at; }

      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }

    return {
      total: list.length,
      by_route: [...routeMap.entries()]
        .map(([route, v]) => ({ route, count: v.count, last_at: v.last_at }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      by_user: [...userMap.entries()]
        .map(([user_id, v]) => ({ user_id, count: v.count, last_at: v.last_at }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      daily: [...dayMap.entries()]
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => (a.day < b.day ? -1 : 1)),
    };
  });


export type AdminSpikeConfig = { threshold: number; window_minutes: number; updated_at: string; updated_by: string | null };

export const getAdminSpikeConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSpikeConfig> => {
    await assertAdminWithAudit(context as never, "security_admin.spike_config_read");
    const { data, error } = await context.supabase
      .from("admin_denied_spike_config")
      .select("threshold, window_minutes, updated_at, updated_by")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? { threshold: 10, window_minutes: 60, updated_at: new Date(0).toISOString(), updated_by: null }) as AdminSpikeConfig;
  });

export const updateAdminSpikeConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threshold: number; window_minutes: number }) => {
    const t = Math.floor(Number(input?.threshold));
    const w = Math.floor(Number(input?.window_minutes));
    if (!Number.isFinite(t) || t < 1 || t > 1000) throw new Error("threshold deve estar entre 1 e 1000");
    if (!Number.isFinite(w) || w < 5 || w > 1440) throw new Error("window_minutes deve estar entre 5 e 1440");
    return { threshold: t, window_minutes: w };
  })
  .handler(async ({ data, context }): Promise<AdminSpikeConfig> => {
    await assertAdminWithAudit(context as never, "security_admin.spike_config_write");
    const { data: row, error } = await context.supabase
      .from("admin_denied_spike_config")
      .upsert({
        id: true,
        threshold: data.threshold,
        window_minutes: data.window_minutes,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .select("threshold, window_minutes, updated_at, updated_by")
      .single();
    if (error) throw new Error(error.message);
    return row as AdminSpikeConfig;
  });
