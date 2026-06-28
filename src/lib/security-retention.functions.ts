/**
 * Admin-only CRUD for security_retention_policy.
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

export type RetentionPolicy = {
  event_type: string;
  retain_days: number;
  updated_at: string;
  updated_by: string | null;
};

export const listRetentionPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("security_retention_policy")
      .select("*")
      .order("event_type");
    if (error) throw new Error(error.message);
    return (data ?? []) as RetentionPolicy[];
  });

export const upsertRetentionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event_type: string; retain_days: number }) => {
    if (!input?.event_type) throw new Error("event_type required");
    if (!Number.isInteger(input.retain_days) || input.retain_days < 7 || input.retain_days > 3650) {
      throw new Error("retain_days must be between 7 and 3650");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("security_retention_policy")
      .upsert(
        {
          event_type: data.event_type,
          retain_days: data.retain_days,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        },
        { onConflict: "event_type" },
      );
    if (error) throw new Error(error.message);
    await context.supabase.from("security_audit_log").insert({
      event_type: "admin_action",
      user_id: context.userId,
      resource: `retention:${data.event_type}`,
      metadata: { retain_days: data.retain_days } as never,
    });
    return { ok: true };
  });
