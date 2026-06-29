/**
 * Admin tools for the /app/admin/emails dashboard:
 *  - list recent email_send_log entries (deduped by message_id)
 *  - dry-run the visa reminder dispatcher (returns counts without enqueuing)
 *  - manually invoke the visa reminder dispatcher
 *
 * The actual "send a test email" flow uses sendTransactionalEmail() from the
 * client with the caller's own JWT — no admin server fn needed for that.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";

export type LogRow = {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
};

export const listEmailLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number; template?: string | null }) => ({
    limit: Math.min(Math.max(input?.limit ?? 50, 1), 200),
    template: input?.template ?? null,
  }))
  .handler(async ({ data, context }) => {
    await assertAdminWithAudit(context as never, "emails.fn");
    let q = context.supabase
      .from("email_send_log")
      .select("id,message_id,template_name,recipient_email,status,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.template) q = q.eq("template_name", data.template);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Dedupe by message_id, keep latest
    const seen = new Set<string>();
    const deduped: LogRow[] = [];
    for (const r of (rows ?? []) as LogRow[]) {
      const k = r.message_id ?? r.id;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(r);
    }
    return deduped;
  });

export const triggerVisaReminderDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminWithAudit(context as never, "emails.dispatch.fn");
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error("server_not_configured");
    // Resolve the public origin from headers won't work here — derive from project URL env.
    // We accept that dev origin must call via the cron-style endpoint with apikey.
    const apikey = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const origin = process.env.PUBLIC_APP_ORIGIN
      ?? "https://project--bfc1be60-9598-46b5-b328-4a163d63ef93.lovable.app";
    const res = await fetch(`${origin}/api/public/hooks/visa-reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: "{}",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`dispatch falhou (${res.status}): ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      return { ok: true, raw: text };
    }
  });
