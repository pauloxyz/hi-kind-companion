/**
 * Shared admin-gate server function.
 * Used by route `beforeLoad` to block non-admins before page render.
 * Defense in depth: every admin server fn ALSO calls its own `assertAdmin`,
 * so disabling this gate in the client cannot bypass the actual data fns.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error("role check failed");
    if (!data) throw new Error("Forbidden");
    return { ok: true as const };
  });
