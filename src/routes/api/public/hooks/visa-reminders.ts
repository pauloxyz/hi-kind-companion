/**
 * Cron-driven visa checklist reminder dispatcher.
 *
 * Triggered by pg_cron hourly. Finds visa_checklist_items where
 *   - is_completed = false
 *   - due_at falls within the day that is 14, 7 or 1 calendar days ahead
 *     (America/Sao_Paulo)
 * Renders the "visa-reminder" template and enqueues into transactional_emails.
 * Dedups by writing a pending email_send_log row keyed on a stable idempotency key.
 *
 * Authenticated by the Supabase publishable key in the `apikey` header (canonical
 * pattern for /api/public/* cron endpoints).
 */
import * as React from "react";
import { render } from "react-email";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { TEMPLATES } from "@/lib/email-templates/registry";

const REMINDER_OFFSETS = [14, 7, 1] as const;
const SENDER_DOMAIN = "notify.vplusa.com";
const FROM_DOMAIN = "vplusa.com";
const SITE_NAME = "V+ USA";

type ReminderRow = {
  id: string;
  owner_id: string;
  step_key: string;
  step_label: string;
  due_at: string;
};

const buildKey = (itemId: string, days: number) => `visa-reminder:${itemId}:${days}`;
const formatPtBr = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso.slice(0, 10);
  }
};

export const Route = createFileRoute("/api/public/hooks/visa-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let dryRun = false;
        try {
          const raw = await request.text();
          if (raw) {
            const body = JSON.parse(raw) as { dry_run?: boolean };
            dryRun = body?.dry_run === true;
          }
        } catch { /* tolerate empty/invalid body */ }

        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
          return new Response(JSON.stringify({ error: "server_not_configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const entry = TEMPLATES["visa-reminder"];
        if (!entry) {
          return new Response(JSON.stringify({ error: "template_missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const origin = new URL(request.url).origin;
        const summary: { offset: number; matched: number; enqueued: number; skipped: number }[] = [];

        for (const days of REMINDER_OFFSETS) {
          // Compute São Paulo (BRT, UTC-3, no DST) day-window for target date.
          const now = new Date();
          const spOffsetMs = -3 * 60 * 60 * 1000;
          const todaySp = new Date(now.getTime() + spOffsetMs);
          todaySp.setUTCHours(0, 0, 0, 0);
          const start = new Date(todaySp.getTime() + days * 86400000 - spOffsetMs);
          const end = new Date(start.getTime() + 86400000);

          const { data: items, error } = await admin
            .from("visa_checklist_items")
            .select("id,owner_id,step_key,step_label,due_at")
            .eq("is_completed", false)
            .gte("due_at", start.toISOString())
            .lt("due_at", end.toISOString())
            .returns<ReminderRow[]>();

          if (error) {
            console.error("visa-reminders query failed", { days, error: error.message });
            summary.push({ offset: days, matched: 0, enqueued: 0, skipped: 0 });
            continue;
          }

          let enqueued = 0;
          let skipped = 0;

          for (const it of items ?? []) {
            const idemKey = buildKey(it.id, days);

            // Dedup
            const { data: prior } = await admin
              .from("email_send_log")
              .select("id")
              .eq("message_id", idemKey)
              .limit(1)
              .maybeSingle();
            if (prior) { skipped += 1; continue; }

            // Suppression check
            const { data: userRes } = await admin.auth.admin.getUserById(it.owner_id);
            const email = userRes?.user?.email?.toLowerCase();
            if (!email) { skipped += 1; continue; }
            const { data: suppressed } = await admin
              .from("suppressed_emails")
              .select("email")
              .eq("email", email)
              .maybeSingle();
            if (suppressed) { skipped += 1; continue; }

            const { data: profile } = await admin
              .from("my_profile")
              .select("full_name")
              .eq("owner_id", it.owner_id)
              .maybeSingle();

            const templateData = {
              recipientName: profile?.full_name?.split(" ")[0] ?? null,
              stepLabel: it.step_label,
              daysUntil: days,
              dueDate: formatPtBr(it.due_at),
              checklistUrl: `${origin}/app/visto`,
            };

            // Render template -> HTML
            const html = await render(React.createElement(entry.component, templateData));
            const plainText = await render(
              React.createElement(entry.component, templateData),
              { plainText: true },
            );
            const subject = typeof entry.subject === "function"
              ? entry.subject(templateData as Record<string, unknown>)
              : entry.subject;

            await admin.from("email_send_log").insert({
              message_id: idemKey,
              template_name: "visa-reminder",
              recipient_email: email,
              status: "pending",
              metadata: { item_id: it.id, days, step_key: it.step_key } as never,
            });

            const { error: enqErr } = await admin.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                message_id: idemKey,
                to: email,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject,
                html,
                text: plainText,
                purpose: "transactional",
                label: "visa-reminder",
                idempotency_key: idemKey,
                queued_at: new Date().toISOString(),
              } as never,
            });

            if (enqErr) {
              console.error("enqueue_email failed", { idemKey, err: enqErr.message });
              await admin.from("email_send_log").insert({
                message_id: idemKey,
                template_name: "visa-reminder",
                recipient_email: email,
                status: "failed",
                error_message: enqErr.message,
              });
              skipped += 1;
              continue;
            }
            enqueued += 1;
          }

          summary.push({ offset: days, matched: items?.length ?? 0, enqueued, skipped });
        }

        return new Response(JSON.stringify({ ok: true, summary }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
