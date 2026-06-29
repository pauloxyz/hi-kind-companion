import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";

export type SpikeAlertStatus = {
  configured: boolean;
  enabled: boolean;
  webhook_url: string | null;
  updated_at: string | null;
  email_to: string | null;
  slack_channel_configured: boolean;
};

export const getSpikeAlertStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SpikeAlertStatus> => {
    await assertAdminWithAudit(context as never, "security_admin.spike_alert_status");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("private_spike_alert_config" as never)
      .select("webhook_url, enabled, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    const row = data as { webhook_url: string; enabled: boolean; updated_at: string } | null;
    return {
      configured: !!row?.webhook_url,
      enabled: !!row?.enabled,
      webhook_url: row?.webhook_url ?? null,
      updated_at: row?.updated_at ?? null,
      email_to: process.env.SPIKE_ALERT_EMAIL_TO ?? null,
      slack_channel_configured: !!process.env.SPIKE_ALERT_SLACK_CHANNEL,
    };
  });

export const bootstrapSpikeAlertConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ base_url: z.string().url().max(300), enabled: z.boolean().default(true) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SpikeAlertStatus> => {
    await assertAdminWithAudit(context as never, "security_admin.spike_alert_bootstrap");
    const secret = process.env.SPIKE_ALERT_WEBHOOK_SECRET;
    if (!secret) throw new Error("SPIKE_ALERT_WEBHOOK_SECRET is not configured");
    const url = `${data.base_url.replace(/\/$/, "")}/api/public/hooks/spike-alert`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("private_spike_alert_config" as never)
      .upsert(
        {
          id: true,
          webhook_url: url,
          shared_secret: secret,
          enabled: data.enabled,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        } as never,
        { onConflict: "id" },
      );
    if (error) throw error;
    return {
      configured: true,
      enabled: data.enabled,
      webhook_url: url,
      updated_at: new Date().toISOString(),
      email_to: process.env.SPIKE_ALERT_EMAIL_TO ?? null,
      slack_channel_configured: !!process.env.SPIKE_ALERT_SLACK_CHANNEL,
    };
  });

export const sendSpikeAlertTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; inserted_id: string }> => {
    await assertAdminWithAudit(context as never, "security_admin.spike_alert_test");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("security_audit_log")
      .insert({
        event_type: "admin_access_denied_spike",
        severity: "high",
        user_id: context.userId,
        resource: "spike-alert-test",
        metadata: {
          dimension: "test",
          hits_in_window: 0,
          threshold: 0,
          window_minutes: 0,
          source: "manual_test",
        },
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, inserted_id: (data as { id: string }).id };
  });
