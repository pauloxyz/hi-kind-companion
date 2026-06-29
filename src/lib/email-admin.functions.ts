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

export type EmailLogFilters = {
  limit?: number;
  template?: string | null;
  status?: string | null;
  search?: string | null;
  from?: string | null; // ISO date
  to?: string | null;   // ISO date
};

export const listEmailLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: EmailLogFilters | undefined) => ({
    limit: Math.min(Math.max(input?.limit ?? 100, 1), 500),
    template: input?.template?.trim() || null,
    status: input?.status?.trim() || null,
    search: input?.search?.trim() || null,
    from: input?.from || null,
    to: input?.to || null,
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
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.ilike("recipient_email", `%${data.search}%`);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
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

export const listEmailLogTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    await assertAdminWithAudit(context as never, "emails.templates.fn");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_send_log")
      .select("template_name")
      .not("template_name", "is", null)
      .limit(1000);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    for (const r of (data ?? []) as { template_name: string | null }[]) {
      if (r.template_name) set.add(r.template_name);
    }
    return Array.from(set).sort();
  });

export type DispatchSummaryItem = { offset: number; matched: number; enqueued: number; skipped: number };
export type DispatchSummary = { ok: boolean; dry_run: boolean; summary: DispatchSummaryItem[]; mode?: "scheduled" | "manual" };

export const triggerVisaReminderDispatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { dryRun?: boolean; itemId?: string; days?: number } | undefined) => ({
      dryRun: input?.dryRun ?? true,
      itemId: input?.itemId?.trim() || null,
      days: input?.days != null ? Number(input.days) : null,
    }),
  )
  .handler(async ({ data, context }): Promise<DispatchSummary> => {
    await assertAdminWithAudit(context as never, "emails.dispatch.fn");
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error("server_not_configured");
    const apikey = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const origin = process.env.PUBLIC_APP_ORIGIN
      ?? "https://project--bfc1be60-9598-46b5-b328-4a163d63ef93.lovable.app";
    const body: Record<string, unknown> = { dry_run: data.dryRun };
    if (data.itemId) body.item_id = data.itemId;
    if (data.days != null) body.days = data.days;
    const res = await fetch(`${origin}/api/public/hooks/visa-reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`dispatch falhou (${res.status}): ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text) as DispatchSummary;
    } catch {
      return { ok: true, dry_run: data.dryRun, summary: [] };
    }
  });

export type OpenVisaItem = {
  id: string;
  owner_id: string;
  step_key: string;
  step_label: string;
  due_at: string;
  days_until: number;
  owner_email: string | null;
};

export const listOpenVisaItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => ({
    limit: Math.min(Math.max(input?.limit ?? 100, 1), 500),
  }))
  .handler(async ({ data, context }): Promise<OpenVisaItem[]> => {
    await assertAdminWithAudit(context as never, "emails.items.fn");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: items, error } = await supabaseAdmin
      .from("visa_checklist_items")
      .select("id,owner_id,step_key,step_label,due_at")
      .eq("is_completed", false)
      .not("due_at", "is", null)
      .order("due_at", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const out: OpenVisaItem[] = [];
    const now = Date.now();
    for (const it of (items ?? []) as Array<{
      id: string; owner_id: string; step_key: string; step_label: string; due_at: string;
    }>) {
      const due = new Date(it.due_at).getTime();
      const days = Math.max(0, Math.round((due - now) / 86400000));
      let email: string | null = null;
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(it.owner_id);
        email = u?.user?.email ?? null;
      } catch { /* ignore */ }
      out.push({
        id: it.id,
        owner_id: it.owner_id,
        step_key: it.step_key,
        step_label: it.step_label,
        due_at: it.due_at,
        days_until: days,
        owner_email: email,
      });
    }
    return out;
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
