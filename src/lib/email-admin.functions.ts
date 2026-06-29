/**
 * Admin tools for the /app/admin/emails dashboard:
 *  - list recent email_send_log entries (deduped by message_id)
 *  - dry-run the visa reminder dispatcher (returns counts without enqueuing)
 *  - manually invoke the visa reminder dispatcher
 *
 * The actual "send a test email" flow uses sendTransactionalEmail() from the
 * client with the caller's own JWT — no admin server fn needed for that.
 */
import * as React from "react";
import { render } from "react-email";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";
import { TEMPLATES } from "@/lib/email-templates/registry";

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
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
  .inputValidator((input: { dryRun?: boolean } | undefined) => ({
    dryRun: input?.dryRun ?? true,
  }))
  .handler(async ({ data, context }) => {
    await assertAdminWithAudit(context as never, "emails.dispatch.fn");
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error("server_not_configured");
    const apikey = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const origin = process.env.PUBLIC_APP_ORIGIN
      ?? "https://project--bfc1be60-9598-46b5-b328-4a163d63ef93.lovable.app";
    const res = await fetch(`${origin}/api/public/hooks/visa-reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ dry_run: data.dryRun }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`dispatch falhou (${res.status}): ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      return { ok: true, raw: text };
    }
  });

export type VisaReminderPreview = {
  days: number;
  subject: string;
  html: string;
};

export const renderVisaReminderPreviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recipientName?: string; stepLabel?: string; dueDate?: string } | undefined) => ({
    recipientName: input?.recipientName ?? "João",
    stepLabel: input?.stepLabel ?? "Entrevista no consulado",
    dueDate: input?.dueDate ?? null,
  }))
  .handler(async ({ data, context }): Promise<VisaReminderPreview[]> => {
    await assertAdminWithAudit(context as never, "emails.preview.fn");
    const entry = TEMPLATES["visa-reminder"];
    if (!entry) throw new Error("template_missing");
    const results: VisaReminderPreview[] = [];
    for (const days of [14, 7, 1]) {
      const dueDate =
        data.dueDate ??
        new Date(Date.now() + days * 86400000).toLocaleDateString("pt-BR");
      const templateData = {
        recipientName: data.recipientName,
        stepLabel: data.stepLabel,
        daysUntil: days,
        dueDate,
        checklistUrl: "https://vplusa.com/app/visto",
      };
      const html = await render(React.createElement(entry.component, templateData));
      const subject =
        typeof entry.subject === "function"
          ? entry.subject(templateData as Record<string, unknown>)
          : entry.subject;
      results.push({ days, subject, html });
    }
    return results;
  });
