/**
 * Shared admin-gate server function.
 * Used by route `beforeLoad` to block non-admins before page render
 * AND to centralize denial auditing via `assertAdminWithAudit`.
 *
 * Defense in depth: every admin server fn ALSO calls `assertAdminWithAudit`
 * with its own resource label, so disabling this gate in the client cannot
 * bypass the actual data fns.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";

export const requireAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { route?: string } | undefined) => ({
    route: input?.route?.slice(0, 200) ?? "admin",
  }))
  .handler(async ({ data, context }) => {
    await assertAdminWithAudit(context as never, `route:${data.route}`);
    return { ok: true as const };
  });
