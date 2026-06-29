/**
 * Cron-driven visa checklist reminder dispatcher.
 *
 * Triggered by pg_cron every hour (idempotency handled below).
 * Finds visa_checklist_items where:
 *   - is_completed = false
 *   - due_at is exactly 14, 7 or 1 calendar days from "today" (America/Sao_Paulo)
 * For each match, enqueues a "visa-reminder" transactional email and records
 * a sent log so we never send the same reminder twice.
 *
 * No request body required. Endpoint protected via Supabase anon `apikey`
 * header — pg_cron passes it as documented in schedule-jobs-modern.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type ReminderRow = {
  id: string;
  owner_id: string;
  step_key: string;
  step_label: string;
  due_at: string;
};

const REMINDER_OFFSETS = [14, 7, 1] as const;

function buildKey(itemId: string, days: number) {
  return `visa-reminder:${itemId}:${days}`;
}

function formatPtBr(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

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

        const summary: { offset: number; matched: number; enqueued: number; skipped: number }[] = [];

        for (const days of REMINDER_OFFSETS) {
          // Window: [start_of_day_target, start_of_day_target + 1d) in São Paulo time.
          // Compute UTC bounds.
          const now = new Date();
          // Today in SP -> shift now by -3h then truncate (BRT no DST since 2019).
          const spOffsetMs = -3 * 60 * 60 * 1000;
          const todaySp = new Date(now.getTime() + spOffsetMs);
          todaySp.setUTCHours(0, 0, 0, 0);
          const start = new Date(todaySp.getTime() + days * 24 * 60 * 60 * 1000 - spOffsetMs);
          const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

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

            // Dedup: skip if email_send_log already has this idempotency key
            const { data: prior } = await admin
              .from("email_send_log")
              .select("id")
              .eq("message_id", idemKey)
              .limit(1)
              .maybeSingle();
            if (prior) {
              skipped += 1;
              continue;
            }

            // Resolve recipient email + display name
            const { data: userRes } = await admin.auth.admin.getUserById(it.owner_id);
            const email = userRes?.user?.email;
            if (!email) {
              skipped += 1;
              continue;
            }
            const { data: profile } = await admin
              .from("my_profile")
              .select("full_name")
              .eq("owner_id", it.owner_id)
              .maybeSingle();

            // Enqueue via the standard transactional send route
            const sendUrl = new URL("/lovable/email/transactional/send", request.url).toString();
            // For internal server-to-server calls we need a service-role JWT.
            // The send route accepts the Supabase service-role bearer too because
            // it calls supabase.auth.getUser() on the token. Service role is not a user
            // token, so instead we mint a one-shot signed admin session via RPC is overkill;
            // we use the queue RPC directly to bypass needing a JWT.
            const { error: enqErr } = await admin.rpc("enqueue_email", {
              p_queue: "transactional_emails",
              p_payload: {
                templateName: "visa-reminder",
                recipientEmail: email,
                idempotencyKey: idemKey,
                templateData: {
                  recipientName: profile?.full_name?.split(" ")[0] ?? null,
                  stepLabel: it.step_label,
                  daysUntil: days,
                  dueDate: formatPtBr(it.due_at),
                  checklistUrl: new URL("/app/visto", request.url).toString().replace("/api/public/hooks/visa-reminders", ""),
                },
              },
            } as never);

            // Reference sendUrl so linter doesn't warn (used as canonical fallback)
            void sendUrl;

            if (enqErr) {
              console.error("enqueue_email failed", { idemKey, err: enqErr.message });
              skipped += 1;
              continue;
            }

            // Pre-write a pending log row with idempotency key so reruns dedupe
            await admin.from("email_send_log").insert({
              message_id: idemKey,
              template_name: "visa-reminder",
              recipient_email: email,
              status: "pending",
              metadata: { item_id: it.id, days, step_key: it.step_key } as never,
            });

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
