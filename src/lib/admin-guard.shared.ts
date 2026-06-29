/**
 * Shared admin-gate used by every privileged server fn.
 *
 * Calls `has_role(uid, 'admin')` via Supabase RPC. On denial:
 *   1. Invokes `record_admin_denial(resource)` (SECURITY DEFINER) which
 *      writes a row to `security_audit_log` with event_type='admin_access_denied'
 *      and user_id=auth.uid(), bypassing user-scope RLS while still pinning
 *      the user identity. Logging never widens user privileges.
 *   2. Throws `Error("Forbidden")` so the caller surfaces a 403.
 *
 * Used from `.functions.ts` files (call site is the resource label, e.g.
 * `seo_runs.fn` or `route:/admin/seo`).
 */
export type AdminGuardCtx = {
  supabase: {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
};

export async function assertAdminWithAudit(
  ctx: AdminGuardCtx,
  resource: string,
): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error("role check failed");
  if (data) return;

  // Best-effort audit log. Never block the 403 on logging failure.
  try {
    await ctx.supabase.rpc("record_admin_denial", { _resource: resource });
  } catch {
    /* swallow */
  }
  throw new Error("Forbidden");
}
