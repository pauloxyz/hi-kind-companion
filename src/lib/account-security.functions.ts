/**
 * Sensitive account actions guarded by password re-authentication.
 *
 * Both functions verify the caller's password server-side via
 * signInWithPassword (publishable client, no persisted session) before
 * performing the privileged operation through the admin client.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "./errors";
import { withServerErrors } from "./server-error-handler";

async function verifyPassword(email: string, password: string): Promise<boolean> {
  const client = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return false;
  // best-effort: revoke the just-issued session immediately
  await client.auth.signOut().catch(() => {});
  return true;
}

async function logAccount(
  ctx: { supabase: any; userId: string },
  event_type: string,
  metadata: Record<string, unknown> = {},
) {
  await ctx.supabase
    .from("security_audit_log")
    .insert({ event_type, user_id: ctx.userId, metadata: metadata as never });
}

export const deleteOwnAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) => {
    if (!input?.password || input.password.length < 6) {
      throw new AppError("Informe sua senha atual para confirmar.", {
        kind: "validation",
        code: "account.delete.password_required",
      });
    }
    return input;
  })
  .handler(withServerErrors("account.delete", async ({ data, context }) => {
    const email = (context.claims as { email?: string })?.email;
    if (!email) {
      throw new AppError("Não foi possível identificar seu e-mail. Saia e entre novamente.", {
        kind: "unauthorized",
        code: "account.delete.missing_email",
      });
    }
    const { enforceRateLimit } = await import("./rate-limit.server");
    // 3 attempts / 15 min per user
    await enforceRateLimit(`reauth_delete:${context.userId}`, 3, 900);
    const ok = await verifyPassword(email, data.password);
    if (!ok) {
      await logAccount(context, "reauth_failed", { action: "delete_account" });
      throw new AppError("Senha incorreta. Verifique e tente novamente.", {
        kind: "unauthorized",
        code: "account.delete.bad_password",
      });
    }
    await logAccount(context, "account_deleted");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) {
      throw new AppError("Não conseguimos excluir sua conta agora. Tente novamente em instantes.", {
        kind: "upstream",
        code: "account.delete.admin_failed",
        cause: error,
      });
    }
    return { ok: true };
  }));

export const changeEmailWithReauth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string; new_email: string }) => {
    if (!input?.password) {
      throw new AppError("Informe sua senha atual para confirmar.", {
        kind: "validation",
        code: "account.email.password_required",
      });
    }
    if (!input?.new_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.new_email)) {
      throw new AppError("Informe um e-mail válido.", {
        kind: "validation",
        code: "account.email.invalid",
      });
    }
    return input;
  })
  .handler(withServerErrors("account.change_email", async ({ data, context }) => {
    const email = (context.claims as { email?: string })?.email;
    if (!email) {
      throw new AppError("Não foi possível identificar seu e-mail. Saia e entre novamente.", {
        kind: "unauthorized",
        code: "account.email.missing_email",
      });
    }
    if (email.toLowerCase() === data.new_email.toLowerCase()) {
      throw new AppError("O novo e-mail é igual ao atual.", {
        kind: "validation",
        code: "account.email.same",
      });
    }
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit(`reauth_email:${context.userId}`, 5, 900);
    const ok = await verifyPassword(email, data.password);
    if (!ok) {
      await logAccount(context, "reauth_failed", { action: "change_email" });
      throw new AppError("Senha incorreta. Verifique e tente novamente.", {
        kind: "unauthorized",
        code: "account.email.bad_password",
      });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // updateUserById with email triggers Supabase to send the confirmation
    // mail to the new address; the change applies once the user confirms.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      email: data.new_email,
    });
    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
        throw new AppError("Esse e-mail já está em uso por outra conta.", {
          kind: "conflict",
          code: "account.email.in_use",
          cause: error,
        });
      }
      throw new AppError("Não conseguimos atualizar seu e-mail agora. Tente novamente em instantes.", {
        kind: "upstream",
        code: "account.email.admin_failed",
        cause: error,
      });
    }
    await logAccount(context, "email_change_requested", { to_domain: data.new_email.split("@")[1] });
    return { ok: true };
  }));
