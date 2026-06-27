import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SendInput = z.object({
  jobId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1),
});

function toBase64Url(str: string): string {
  // UTF-8 safe base64url
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmail(opts: {
  to: string;
  subject: string;
  body: string;
  fromName?: string | null;
  replyTo?: string | null;
}): string {
  // Encode subject as UTF-8 to support accents (RFC 2047)
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`;
  const lines = [
    `To: ${opts.to}`,
    opts.fromName ? `From: ${opts.fromName} <me>` : null,
    opts.replyTo ? `Reply-To: ${opts.replyTo}` : null,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.body,
  ].filter(Boolean);
  return toBase64Url(lines.join("\r\n"));
}

export const sendApplicationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !gmailKey) {
      throw new Error("Gmail não está conectado. Reconecte em Configurações.");
    }

    // Pull profile for From name + Reply-To
    const { data: profile } = await supabase
      .from("my_profile")
      .select("full_name, email, phone")
      .eq("owner_id", userId)
      .maybeSingle();

    const fromName = profile?.full_name ?? null;
    const replyTo = profile?.email ?? null;

    // Add a polite signature if we have data
    const signatureLines: string[] = [];
    if (fromName) signatureLines.push("", `Best regards,`, fromName);
    if (profile?.phone) signatureLines.push(`Phone: ${profile.phone}`);
    if (replyTo) signatureLines.push(`Email: ${replyTo}`);

    const fullBody = signatureLines.length
      ? `${data.body.trimEnd()}\n${signatureLines.join("\n")}\n`
      : data.body;

    const raw = buildRawEmail({
      to: data.to,
      subject: data.subject,
      body: fullBody,
      fromName,
      replyTo,
    });

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmailKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new Error("Permissão Gmail insuficiente. Reconecte a conta Gmail.");
      }
      throw new Error(`Falha ao enviar email (${res.status}): ${errText.slice(0, 200)}`);
    }

    const sent = (await res.json()) as { id?: string; threadId?: string };
    return { ok: true, gmailMessageId: sent.id ?? null, threadId: sent.threadId ?? null };
  });
