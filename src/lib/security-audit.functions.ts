/**
 * Server-side security event logger.
 *
 * - `logSecurityEvent` is callable from PUBLIC contexts (signup HIBP blocks
 *   happen before authentication). It writes through the anon Supabase
 *   client and is constrained by the RLS policy
 *   `"anon insert pre-auth security events"`.
 *
 * - `logPiiAccess` is auth-required. Call it from any server function that
 *   reads PII columns (employer_address, recruitment_email/phone,
 *   recruitment_contact_name, raw_feed_data, birth_date, etc.) so an admin
 *   can audit who looked at what and when.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AnonEvent = "hibp_block" | "weak_password_block" | "auth_failure";
type AccountEvent =
  | "password_changed"
  | "password_change_failed"
  | "email_change_requested"
  | "email_change_failed"
  | "account_deletion_requested"
  | "settings_viewed";

function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function clientHints() {
  const req = getRequest();
  const headers = req?.headers;
  const ua = headers?.get("user-agent") ?? null;
  const fwd = headers?.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || headers?.get("x-real-ip") || null;
  return { ip, ua };
}

export const logSecurityEvent = createServerFn({ method: "POST" })
  .inputValidator((input: { event_type: AnonEvent; email?: string; metadata?: Record<string, unknown> }) => {
    if (!input || typeof input !== "object") throw new Error("invalid payload");
    if (!["hibp_block", "weak_password_block", "auth_failure"].includes(input.event_type)) {
      throw new Error("invalid event_type");
    }
    if (input.email && input.email.length > 320) throw new Error("email too long");
    return input;
  })
  .handler(async ({ data }) => {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { ip, ua } = clientHints();
    const { error } = await supabase.from("security_audit_log").insert({
      event_type: data.event_type,
      email_hash: data.email ? hashEmail(data.email) : null,
      ip_address: ip,
      user_agent: ua,
      metadata: (data.metadata ?? {}) as never,
    });
    if (error) {
      // swallow — auditing must never break the user flow
      console.error("[security_audit_log]", error.message);
      return { ok: false };
    }
    return { ok: true };
  });

export const logPiiAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { resource: string; metadata?: Record<string, unknown> }) => {
    if (!input?.resource || input.resource.length > 200) throw new Error("invalid resource");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { ip, ua } = clientHints();
    const { error } = await context.supabase.from("security_audit_log").insert({
      event_type: "pii_access",
      user_id: context.userId,
      ip_address: ip,
      user_agent: ua,
      resource: data.resource,
      metadata: (data.metadata ?? {}) as never,
    });
    if (error) {
      console.error("[security_audit_log:pii]", error.message);
      return { ok: false };
    }
    return { ok: true };
  });

/**
 * Authenticated logger for user-initiated account actions (password change,
 * email change request, deletion request, settings viewed). Writes under the
 * RLS policy `users insert own security events`.
 */
export const logAccountEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event_type: AccountEvent; metadata?: Record<string, unknown> }) => {
    const allowed: AccountEvent[] = [
      "password_changed",
      "password_change_failed",
      "email_change_requested",
      "email_change_failed",
      "account_deletion_requested",
      "settings_viewed",
    ];
    if (!input || !allowed.includes(input.event_type)) throw new Error("invalid event_type");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { ip, ua } = clientHints();
    const { error } = await context.supabase.from("security_audit_log").insert({
      event_type: data.event_type,
      user_id: context.userId,
      ip_address: ip,
      user_agent: ua,
      metadata: (data.metadata ?? {}) as never,
    });
    if (error) {
      console.error("[security_audit_log:account]", error.message);
      return { ok: false };
    }
    return { ok: true };
  });
