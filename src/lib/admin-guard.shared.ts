/**
 * Shared admin-gate used by every privileged server fn.
 *
 * Calls `has_role(uid, 'admin')` via Supabase RPC. On denial:
 *   1. Inserts a `admin_access_denied` row in `security_audit_log`
 *      (user_id + resource label) so denied attempts are auditable.
 *   2. Throws `Error("Forbidden")` so the caller surfaces a 403.
 *
 * Used from `.functions.ts` files (call site is the resource label, e.g.
 * `seo_runs.list` or `route:/admin/seo`).
 */
export type AdminGuardCtx = {
  supabase: {
    rpc: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
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
  // Schema: event_type, user_id, resource, metadata (no `severity` column).
  try {
    await ctx.supabase.from("security_audit_log").insert({
      event_type: "admin_access_denied",
      user_id: ctx.userId,
      resource,
      metadata: { reason: "missing_admin_role", severity: "medium" },
    });
  } catch {
    /* swallow */
  }
  throw new Error("Forbidden");
}
