/**
 * Deterministic + unique filename generator for CSV/JSON exports.
 *
 * Two goals:
 *   1. Determinístico: mesma entrada (clock, filtros, kind, format) sempre
 *      produz o mesmo nome — testável sem mocks pesados.
 *   2. Único no mesmo segundo: se o usuário disparar dois downloads na
 *      mesma milissegundo/segundo, o browser NÃO sobrescreve o arquivo
 *      anterior. Usamos timestamp com milissegundos + contador monotônico
 *      por process/tab.
 *
 * `buildStripeEventsFilename` e `buildReprocessLogFilename` produzem o
 * mesmo prefixo que a UI já usava (mantém compat com E2E existentes),
 * mas agora com sufixo `YYYY-MM-DD-HH-MM-SS-mmm[-N]`.
 */

export type ExportFormat = "csv" | "json";

const _state = { lastMs: 0, counter: 0 };

/**
 * Reset interno — usado apenas por testes para tornar a sequência
 * previsível independente do estado global do processo.
 */
export function __resetFilenameCounterForTests(): void {
  _state.lastMs = 0;
  _state.counter = 0;
}

/**
 * Sufixo único por chamada: `YYYY-MM-DD-HH-MM-SS-mmm` e, se colidir na
 * mesma milissegundo, um `-N` monotônico. Pura em relação a `now`:
 * mesma `now` + mesmo estado interno → mesmo output.
 */
export function nextUniqueTimestampSuffix(now: Date = new Date()): string {
  const ms = now.getTime();
  if (ms === _state.lastMs) {
    _state.counter += 1;
  } else {
    _state.lastMs = ms;
    _state.counter = 0;
  }
  const iso = now.toISOString(); // "2026-07-02T12:34:56.789Z"
  const stamp = iso.slice(0, 23).replace(/[:T.]/g, "-"); // 2026-07-02-12-34-56-789
  return _state.counter === 0 ? stamp : `${stamp}-${_state.counter}`;
}

function sanitizePart(v: string): string {
  return v.replace(/[^a-z0-9_.-]+/gi, "_");
}

export function buildStripeEventsFilename(
  filters: { environment: string; status: string; eventType?: string | null },
  format: ExportFormat,
  now: Date = new Date(),
): string {
  const parts = [
    "stripe-webhook-events",
    filters.environment !== "all" && filters.environment,
    filters.status !== "all" && filters.status,
    filters.eventType && filters.eventType !== "all" && sanitizePart(filters.eventType),
    nextUniqueTimestampSuffix(now),
  ].filter(Boolean) as string[];
  return `${parts.join("_")}.${format}`;
}

export function buildReprocessLogFilename(
  filters: { outcome: string; stripe_event_id?: string | null; actor_user_id?: string | null },
  format: ExportFormat,
  now: Date = new Date(),
): string {
  const parts = [
    "stripe-reprocess-log",
    filters.outcome !== "all" && filters.outcome,
    filters.stripe_event_id && sanitizePart(filters.stripe_event_id),
    filters.actor_user_id && filters.actor_user_id.slice(0, 8),
    nextUniqueTimestampSuffix(now),
  ].filter(Boolean) as string[];
  return `${parts.join("_")}.${format}`;
}

/**
 * RFC 5987 / 6266-safe Content-Disposition value. Sempre inclui `filename`
 * ASCII e `filename*` UTF-8 para browsers modernos.
 */
export function contentDispositionAttachment(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  const utf8 = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8}`;
}

/**
 * Parse do header `Content-Disposition` retornado pelo servidor.
 * Prefere `filename*=UTF-8''...` (RFC 5987) e cai no `filename="..."`.
 */
export function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fallthrough */
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
  if (plain) return (plain[1] ?? plain[2] ?? "").trim() || null;
  return null;
}
