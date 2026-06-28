/**
 * Account-wide session control.
 *
 * - `signOutEverywhere`: revokes ALL refresh tokens for the caller
 *   (current device included), forcing re-login on every browser/app.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const signOutEverywhere = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.signOut(context.userId, "global");
    if (error) throw new Error(error.message);
    await context.supabase.from("security_audit_log").insert({
      event_type: "admin_action",
      user_id: context.userId,
      resource: "session:revoke_all",
      metadata: {} as never,
    });
    return { ok: true };
  });
