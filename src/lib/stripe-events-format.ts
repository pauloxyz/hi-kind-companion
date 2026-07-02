/**
 * Pure CSV builders shared entre client (fallback/testes) e as server routes
 * de export sob /api/admin/*. Nenhum acesso a browser ou Node — só string
 * ops. Colunas e escapes seguem RFC 4180 (aspas duplas encapsulam quando
 * há vírgula/aspa/quebra de linha; aspas internas viram "").
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type StripeEventBase = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  environment: string;
  status: string;
  error_message: string | null;
  payload_summary: JsonValue;
  received_at: string;
  processed_at: string | null;
};

export const STRIPE_EVENT_CSV_COLUMNS = [
  "received_at",
  "processed_at",
  "environment",
  "event_type",
  "status",
  "stripe_event_id",
  "request_id",
  "trace_id",
  "error_message",
  "payload_summary",
  "id",
] as const;

export type ReprocessLogRow = {
  id: string;
  event_row_id: string | null;
  stripe_event_id: string;
  event_type: string | null;
  environment: string | null;
  actor_user_id: string | null;
  outcome: string;
  message: string | null;
  duration_ms: number | null;
  created_at: string;
};

export const REPROCESS_LOG_CSV_COLUMNS = [
  "created_at",
  "outcome",
  "environment",
  "event_type",
  "stripe_event_id",
  "actor_user_id",
  "duration_ms",
  "message",
  "event_row_id",
  "id",
] as const;

function pickStr(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function stripeEventsToCsv(rows: StripeEventBase[]): string {
  const header = STRIPE_EVENT_CSV_COLUMNS.join(",");
  const lines = rows.map((r) => {
    const enriched: Record<string, unknown> = {
      ...r,
      request_id: pickStr(r.payload_summary, "request_id"),
      trace_id: pickStr(r.payload_summary, "trace_id"),
    };
    return STRIPE_EVENT_CSV_COLUMNS.map((c) => csvEscape(enriched[c])).join(",");
  });
  return [header, ...lines].join("\n");
}

export function reprocessLogToCsv(rows: ReprocessLogRow[]): string {
  const header = REPROCESS_LOG_CSV_COLUMNS.join(",");
  const lines = rows.map((r) =>
    REPROCESS_LOG_CSV_COLUMNS.map((c) => csvEscape((r as unknown as Record<string, unknown>)[c])).join(","),
  );
  return [header, ...lines].join("\n");
}
