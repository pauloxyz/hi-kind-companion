/**
 * Client helper for posting to /lovable/email/transactional/send with the
 * current Supabase user's JWT. Used by the in-app test/admin send tools.
 */
import { supabase } from "@/integrations/supabase/client";

export async function sendTransactionalEmail(input: {
  templateName: string;
  recipientEmail: string;
  idempotencyKey?: string;
  templateData?: Record<string, unknown>;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Não autenticado");

  const res = await fetch("/lovable/email/transactional/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 300) || `Falha ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; messageId?: string }>;
}
