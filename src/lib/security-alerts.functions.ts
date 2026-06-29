/**
 * Admin-only persistence for risk-alert acknowledgements.
 * Replaces the previous localStorage-based "tratado" state.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role check failed");
  if (!data) throw new Error("Forbidden");
}

export type AlertAck = {
  id: string;
  alert_key: string;
  hour: string;
  ip_address: string | null;
  risk_level: string;
  note: string | null;
  acked_by: string;
  acked_at: string;
};

export const listAlertAcks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminWithAudit(context as never, "security_alerts.fn");
    const { data, error } = await context.supabase
      .from("security_alert_acks")
      .select("*")
      .order("acked_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as AlertAck[];
  });

export const ackAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    alert_key: string;
    hour: string;
    ip_address: string | null;
    risk_level: string;
    note?: string;
  }) => {
    if (!input?.alert_key || input.alert_key.length > 200) throw new Error("invalid alert_key");
    if (!input.hour) throw new Error("hour required");
    if (!["low", "medium", "high"].includes(input.risk_level)) throw new Error("invalid risk_level");
    if (input.note && input.note.length > 1000) throw new Error("note too long");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdminWithAudit(context as never, "security_alerts.fn");
    const { error } = await context.supabase
      .from("security_alert_acks")
      .upsert(
        {
          alert_key: data.alert_key,
          hour: data.hour,
          ip_address: data.ip_address,
          risk_level: data.risk_level,
          note: data.note ?? null,
          acked_by: context.userId,
          acked_at: new Date().toISOString(),
        },
        { onConflict: "alert_key" },
      );
    if (error) throw new Error(error.message);
    // audit trail
    await context.supabase.from("security_audit_log").insert({
      event_type: "alert_acked",
      user_id: context.userId,
      resource: data.alert_key,
      metadata: { ip: data.ip_address, risk_level: data.risk_level } as never,
    });
    return { ok: true };
  });

export const unackAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { alert_key: string }) => {
    if (!input?.alert_key) throw new Error("alert_key required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdminWithAudit(context as never, "security_alerts.fn");
    const { error } = await context.supabase
      .from("security_alert_acks")
      .delete()
      .eq("alert_key", data.alert_key);
    if (error) throw new Error(error.message);
    await context.supabase.from("security_audit_log").insert({
      event_type: "alert_unacked",
      user_id: context.userId,
      resource: data.alert_key,
      metadata: {} as never,
    });
    return { ok: true };
  });
