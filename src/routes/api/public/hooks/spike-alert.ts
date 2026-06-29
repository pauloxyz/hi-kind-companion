import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

type SpikePayload = {
  id: string;
  event_type: string;
  severity: string | null;
  user_id: string | null;
  resource: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmail(payload: SpikePayload) {
  const md = (payload.metadata ?? {}) as Record<string, unknown>;
  const dim = String(md.dimension ?? "—");
  const hits = String(md.hits_in_window ?? "—");
  const thr = String(md.threshold ?? "—");
  const win = String(md.window_minutes ?? "—");
  const subject = `[ALERTA] admin_access_denied_spike · ${dim} · ${hits}/${thr} em ${win}min`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px">
      <h2 style="color:#b91c1c;margin:0 0 8px">Pico de acessos admin negados detectado</h2>
      <p style="margin:0 0 12px;color:#475569">Severidade: <strong>${escapeHtml(String(payload.severity ?? "high"))}</strong></p>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 8px;color:#64748b">Dimensão</td><td><strong>${escapeHtml(dim)}</strong></td></tr>
        <tr><td style="padding:4px 8px;color:#64748b">Hits / Limite</td><td><strong>${escapeHtml(hits)}</strong> / ${escapeHtml(thr)}</td></tr>
        <tr><td style="padding:4px 8px;color:#64748b">Janela</td><td>${escapeHtml(win)} minutos</td></tr>
        <tr><td style="padding:4px 8px;color:#64748b">Recurso</td><td><code>${escapeHtml(payload.resource ?? "—")}</code></td></tr>
        <tr><td style="padding:4px 8px;color:#64748b">User ID</td><td><code>${escapeHtml(payload.user_id ?? "—")}</code></td></tr>
        <tr><td style="padding:4px 8px;color:#64748b">Quando</td><td>${escapeHtml(payload.created_at)}</td></tr>
        <tr><td style="padding:4px 8px;color:#64748b">Event ID</td><td><code>${escapeHtml(payload.id)}</code></td></tr>
      </table>
      <p style="margin-top:16px;font-size:12px;color:#94a3b8">Auditoria: /app/auditoria · filtro <code>event_type=admin_access_denied_spike</code></p>
    </div>`;
  return { subject, html };
}

function buildSlackMessage(payload: SpikePayload): { text: string; blocks: unknown[] } {
  const md = (payload.metadata ?? {}) as Record<string, unknown>;
  const dim = String(md.dimension ?? "—");
  const hits = String(md.hits_in_window ?? "—");
  const thr = String(md.threshold ?? "—");
  const win = String(md.window_minutes ?? "—");
  const text = `:rotating_light: admin_access_denied_spike — ${dim} ${hits}/${thr} em ${win}min`;
  return {
    text,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🚨 Pico de acessos admin negados" } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Dimensão:*\n${dim}` },
          { type: "mrkdwn", text: `*Hits / Limite:*\n${hits} / ${thr}` },
          { type: "mrkdwn", text: `*Janela:*\n${win} min` },
          { type: "mrkdwn", text: `*Severidade:*\n${payload.severity ?? "high"}` },
          { type: "mrkdwn", text: `*Recurso:*\n\`${payload.resource ?? "—"}\`` },
          { type: "mrkdwn", text: `*User ID:*\n\`${payload.user_id ?? "—"}\`` },
        ],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Event ID: \`${payload.id}\` · ${payload.created_at}` }],
      },
    ],
  };
}

function b64url(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendEmailViaGmail(subject: string, html: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  const to = process.env.SPIKE_ALERT_EMAIL_TO;
  const from = process.env.SPIKE_ALERT_EMAIL_FROM ?? to;
  if (!lovableKey || !gmailKey || !to || !from) {
    return { ok: false, status: 0, error: "email_not_configured" };
  }
  const rfc2822 = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");
  const raw = b64url(rfc2822);
  const res = await fetch(
    "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
      },
      body: JSON.stringify({ raw }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: body.slice(0, 300) };
  }
  return { ok: true, status: res.status };
}

async function postToSlack(payload: SpikePayload): Promise<{ ok: boolean; status: number; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const slackKey = process.env.SLACK_API_KEY;
  const channel = process.env.SPIKE_ALERT_SLACK_CHANNEL;
  if (!lovableKey || !slackKey || !channel) {
    return { ok: false, status: 0, error: "slack_not_configured" };
  }
  const msg = buildSlackMessage(payload);
  const res = await fetch("https://connector-gateway.lovable.dev/slack/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": slackKey,
    },
    body: JSON.stringify({ channel, text: msg.text, blocks: msg.blocks }),
  });
  const body = await res.text().catch(() => "");
  let parsed: { ok?: boolean; error?: string } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    /* non-JSON */
  }
  if (!res.ok || parsed.ok === false) {
    return { ok: false, status: res.status, error: parsed.error ?? body.slice(0, 300) };
  }
  return { ok: true, status: res.status };
}

export const Route = createFileRoute("/api/public/hooks/spike-alert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SPIKE_ALERT_WEBHOOK_SECRET;
        if (!secret) {
          return new Response(JSON.stringify({ error: "webhook_secret_not_configured" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
        const signature = request.headers.get("x-spike-signature") ?? "";
        const rawBody = await request.text();
        const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
        const sig = Buffer.from(signature, "utf-8");
        const exp = Buffer.from(expected, "utf-8");
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response(JSON.stringify({ error: "invalid_signature" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let payload: SpikePayload;
        try {
          payload = JSON.parse(rawBody) as SpikePayload;
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (payload.event_type !== "admin_access_denied_spike") {
          return new Response(JSON.stringify({ error: "unsupported_event_type" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { subject, html } = buildEmail(payload);
        const [emailRes, slackRes] = await Promise.all([sendEmailViaGmail(subject, html), postToSlack(payload)]);

        // Log delivery outcome (best-effort).
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("security_audit_log").insert({
            event_type: "admin_access_denied_spike_notified",
            severity: emailRes.ok || slackRes.ok ? "info" : "high",
            user_id: payload.user_id,
            resource: payload.resource,
            metadata: {
              source_event_id: payload.id,
              email: { ok: emailRes.ok, status: emailRes.status, error: emailRes.error ?? null },
              slack: { ok: slackRes.ok, status: slackRes.status, error: slackRes.error ?? null },
            },
          } as never);
        } catch {
          /* swallow logging errors */
        }

        return new Response(
          JSON.stringify({ ok: true, email: emailRes.ok, slack: slackRes.ok }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
