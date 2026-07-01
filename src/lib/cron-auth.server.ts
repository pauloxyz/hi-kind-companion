/**
 * Compartilhado por todos os hooks públicos de cron/webhook.
 *
 * `CRON_SECRET` é um segredo server-only (não `VITE_*`) usado como token
 * bearer para as chamadas de pg_cron / uptime externo. A comparação usa
 * `timingSafeEqual` para não vazar oráculo de timing.
 *
 * Aceita os headers `x-cron-secret` (preferido) e `apikey` (legado, mesmo
 * conteúdo — mantido temporariamente para não quebrar cron jobs em vôo).
 *
 * `logCronCall` grava uma linha em `security_audit_log` para rastreio de
 * abuso. Falhas de log NÃO interrompem o hook — best-effort.
 */
import { timingSafeEqual } from "crypto";

export type CronAuthResult =
  | { ok: true; presented: "x-cron-secret" | "apikey" }
  | { ok: false; reason: "missing_secret_env" | "missing_header" | "mismatch" };

export function verifyCronSecret(request: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, reason: "missing_secret_env" };

  const cronHeader = request.headers.get("x-cron-secret");
  const legacyHeader = request.headers.get("apikey");
  const presentedRaw = cronHeader ?? legacyHeader;
  const presentedFrom: "x-cron-secret" | "apikey" | null = cronHeader
    ? "x-cron-secret"
    : legacyHeader
      ? "apikey"
      : null;

  if (!presentedRaw || !presentedFrom) return { ok: false, reason: "missing_header" };

  const a = Buffer.from(presentedRaw, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  // `timingSafeEqual` exige buffers do mesmo tamanho. Padding com um
  // buffer de tamanho fixo mantém o compare constante-tempo mesmo se o
  // tamanho apresentado divergir do esperado.
  const size = Math.max(a.length, b.length);
  const ap = Buffer.alloc(size);
  const bp = Buffer.alloc(size);
  a.copy(ap);
  b.copy(bp);
  const equal = timingSafeEqual(ap, bp) && a.length === b.length;
  if (!equal) return { ok: false, reason: "mismatch" };
  return { ok: true, presented: presentedFrom };
}

export function unauthorizedCronResponse(reason: CronAuthResult extends { ok: false; reason: infer R } ? R : never): Response {
  // Mesma resposta pública para qualquer motivo de falha — evita distinguir
  // "segredo não configurado" de "segredo errado" para o caller.
  return new Response(JSON.stringify({ error: "unauthorized", reason }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Registra a chamada em `security_audit_log`. Nunca deve derrubar o hook.
 */
export async function logCronCall(params: {
  hook: string;
  request: Request;
  result: CronAuthResult;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const url = new URL(params.request.url);
    const ip =
      params.request.headers.get("cf-connecting-ip") ??
      params.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const ua = params.request.headers.get("user-agent") ?? null;
    await supabaseAdmin.from("security_audit_log").insert({
      event_type: params.result.ok ? "cron_hook_called" : "cron_hook_denied",
      severity: params.result.ok ? "info" : "medium",
      user_id: null,
      resource: `hook:${params.hook}`,
      metadata: {
        hook: params.hook,
        path: url.pathname,
        method: params.request.method,
        ip,
        user_agent: ua?.slice(0, 200) ?? null,
        header: params.result.ok ? params.result.presented : null,
        reason: params.result.ok ? null : params.result.reason,
      } as never,
    });
  } catch (e) {
    console.warn(`[cron-auth] audit log failed for ${params.hook}`, e);
  }
}
