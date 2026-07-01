/**
 * Listagem admin dos eventos recebidos pelo webhook do Stripe
 * (tabela public.stripe_webhook_events). Gated por admin + audit.
 *
 * Suporta filtros (environment/status/event_type), ordenação por received_at
 * ou processed_at, paginação (limit/offset) e retorna o total para exibir
 * na UI e permitir CSV export.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";

const sortColumns = ["received_at", "processed_at", "event_type", "status"] as const;

const filtersSchema = z.object({
  environment: z.enum(["all", "sandbox", "live"]).default("all"),
  status: z.enum(["all", "processed", "ignored", "error"]).default("all"),
  eventType: z.string().trim().max(120).optional(),
  sortBy: z.enum(sortColumns).default("received_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(500).default(25),
  offset: z.number().int().min(0).default(0),
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type StripeWebhookEventRow = {
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

export type StripeWebhookEventsPage = {
  rows: StripeWebhookEventRow[];
  total: number;
};

function applyFilters<T extends { eq: (col: string, val: string) => T }>(
  q: T,
  data: z.infer<typeof filtersSchema>,
): T {
  let out = q;
  if (data.environment !== "all") out = out.eq("environment", data.environment);
  if (data.status !== "all") out = out.eq("status", data.status);
  if (data.eventType) out = out.eq("event_type", data.eventType);
  return out;
}

export const listStripeWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => filtersSchema.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<StripeWebhookEventsPage> => {
    await assertAdminWithAudit(context as never, "stripe_webhook_events.fn");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const from = data.offset;
    const to = data.offset + data.limit - 1;

    const base = supabaseAdmin
      .from("stripe_webhook_events")
      .select(
        "id,stripe_event_id,event_type,environment,status,error_message,payload_summary,received_at,processed_at",
        { count: "exact" },
      )
      .order(data.sortBy, { ascending: data.sortDir === "asc" })
      .range(from, to);

    const { data: rows, error, count } = await applyFilters(base, data);
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []) as unknown as StripeWebhookEventRow[],
      total: count ?? 0,
    };
  });

/**
 * Retorna TODOS os registros que casam com o filtro para gerar CSV.
 * Limitado a 10k para não estourar memória.
 */
export const exportStripeWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    filtersSchema
      .pick({ environment: true, status: true, eventType: true, sortBy: true, sortDir: true })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }): Promise<StripeWebhookEventRow[]> => {
    await assertAdminWithAudit(context as never, "stripe_webhook_events.export.fn");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const base = supabaseAdmin
      .from("stripe_webhook_events")
      .select(
        "id,stripe_event_id,event_type,environment,status,error_message,payload_summary,received_at,processed_at",
      )
      .order(data.sortBy, { ascending: data.sortDir === "asc" })
      .limit(10000);

    const filters = { ...data, limit: 10000, offset: 0 } as z.infer<typeof filtersSchema>;
    const { data: rows, error } = await applyFilters(base, filters);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as StripeWebhookEventRow[];
  });

export const listStripeWebhookEventTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    await assertAdminWithAudit(context as never, "stripe_webhook_events.types.fn");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("event_type")
      .order("event_type", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return Array.from(new Set((data ?? []).map((r) => r.event_type))).sort();
  });
