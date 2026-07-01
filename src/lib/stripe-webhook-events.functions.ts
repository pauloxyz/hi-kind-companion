/**
 * Server fns admin para a tabela public.stripe_webhook_events:
 *  - list          → paginação, ordenação e filtros (env / status / event_type / busca)
 *  - export        → todos os registros filtrados (max 10k) para CSV
 *  - stats         → contagens por status + último received_at, respeitando filtros
 *  - types         → lista de event_type distintos p/ filtro
 *  - reprocess     → replay best-effort de eventos com status=error
 *
 * Busca cobre stripe_event_id + os campos que gravamos em payload_summary
 * (object_id, customer, subscription, user_id). Sanitiza para não quebrar
 * o parser do PostgREST em `.or()`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";

const sortColumns = ["received_at", "processed_at", "event_type", "status"] as const;

const baseFilters = z.object({
  environment: z.enum(["all", "sandbox", "live"]).default("all"),
  status: z.enum(["all", "processed", "ignored", "error"]).default("all"),
  eventType: z.string().trim().max(120).optional(),
  search: z.string().trim().max(200).optional(),
});

const listSchema = baseFilters.extend({
  sortBy: z.enum(sortColumns).default("received_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(500).default(25),
  offset: z.number().int().min(0).default(0),
});

const exportSchema = baseFilters.extend({
  sortBy: z.enum(sortColumns).default("received_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
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

export type StripeWebhookEventStats = {
  total: number;
  processed: number;
  ignored: number;
  error: number;
  lastReceivedAt: string | null;
};

// PostgREST usa `.or('col.op.value,col.op.value')` — vírgula/parêntese quebram o parser.
// IDs típicos (evt_, cus_, sub_, cs_, uuid) contêm só letras/números/`_`/`-`/`:`.
function sanitizeSearch(raw: string): string {
  return raw.replace(/[^\w:-]/g, "").slice(0, 100);
}

type SupabaseFilterable = {
  eq: (col: string, val: string) => SupabaseFilterable;
  or: (expr: string) => SupabaseFilterable;
};

function applyFilters<T extends SupabaseFilterable>(
  q: T,
  data: z.infer<typeof baseFilters>,
): T {
  let out = q;
  if (data.environment !== "all") out = out.eq("environment", data.environment) as T;
  if (data.status !== "all") out = out.eq("status", data.status) as T;
  if (data.eventType) out = out.eq("event_type", data.eventType) as T;
  if (data.search) {
    const s = sanitizeSearch(data.search);
    if (s.length > 0) {
      out = out.or(
        [
          `stripe_event_id.ilike.%${s}%`,
          `payload_summary->>object_id.ilike.%${s}%`,
          `payload_summary->>customer.ilike.%${s}%`,
          `payload_summary->>subscription.ilike.%${s}%`,
          `payload_summary->>user_id.ilike.%${s}%`,
        ].join(","),
      ) as T;
    }
  }
  return out;
}

export const listStripeWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listSchema.parse(raw ?? {}))
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

export const exportStripeWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => exportSchema.parse(raw ?? {}))
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

    const { data: rows, error } = await applyFilters(base, data);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as StripeWebhookEventRow[];
  });

export const getStripeWebhookEventStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => baseFilters.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<StripeWebhookEventStats> => {
    await assertAdminWithAudit(context as never, "stripe_webhook_events.stats.fn");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const countFor = async (status?: "processed" | "ignored" | "error") => {
      const q = supabaseAdmin
        .from("stripe_webhook_events")
        .select("id", { count: "exact", head: true });
      const withFilters = applyFilters(q, { ...data, status: status ?? data.status });
      const { count, error } = await withFilters;
      if (error) throw new Error(error.message);
      return count ?? 0;
    };

    const latestQ = applyFilters(
      supabaseAdmin
        .from("stripe_webhook_events")
        .select("received_at")
        .order("received_at", { ascending: false })
        .limit(1),
      data,
    );

    const [total, processed, ignored, errCount, latest] = await Promise.all([
      countFor(),
      countFor("processed"),
      countFor("ignored"),
      countFor("error"),
      latestQ,
    ]);
    if (latest.error) throw new Error(latest.error.message);

    return {
      total,
      processed,
      ignored,
      error: errCount,
      lastReceivedAt: (latest.data?.[0] as { received_at?: string } | undefined)?.received_at ?? null,
    };
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

/**
 * Reprocessa um evento com status=error usando o que temos em payload_summary.
 * Não temos o payload bruto do Stripe (só a projeção), então o replay é
 * best-effort: apenas os tipos onde payload_summary tem dado suficiente.
 * Para os demais, retorna erro pedindo pra reenviar o evento pelo Stripe.
 */
export type ReprocessResult = {
  ok: boolean;
  message: string;
  is_pro?: boolean | null;
};

type Summary = {
  object_id?: string | null;
  customer?: string | null;
  subscription?: string | null;
  user_id?: string | null;
  status?: string | null;
  mode?: string | null;
  amount_total?: number | null;
};

export const reprocessStripeWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<ReprocessResult> => {
    await assertAdminWithAudit(context as never, "stripe_webhook_events.reprocess.fn");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: readErr } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("id,event_type,environment,status,payload_summary,stripe_event_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Evento não encontrado");
    if (row.status !== "error") {
      return { ok: false, message: `Só reprocessa eventos com status=error (atual: ${row.status})` };
    }

    const summary = (row.payload_summary ?? {}) as Summary;
    const env = row.environment as "sandbox" | "live";
    let replayNote: string | null = null;

    try {
      if (row.event_type === "checkout.session.completed") {
        if (summary.mode !== "payment") {
          throw new Error("Reprocesso automático suportado apenas para mode=payment");
        }
        if (!summary.user_id || !summary.object_id) {
          throw new Error("payload_summary sem user_id/object_id — reenvie o evento pelo Stripe");
        }
        const { error } = await supabaseAdmin.from("subscriptions").upsert(
          {
            user_id: summary.user_id,
            stripe_checkout_session_id: summary.object_id,
            stripe_customer_id: summary.customer ?? null,
            plan: "one_time",
            status: "active",
            current_period_end: null,
            amount_cents: typeof summary.amount_total === "number" ? summary.amount_total : null,
            currency: "brl",
            environment: env,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_checkout_session_id" },
        );
        if (error) throw new Error(`upsert falhou: ${error.message}`);
        replayNote = "checkout.session.completed replay OK";
      } else if (row.event_type === "customer.subscription.deleted") {
        if (!summary.subscription) throw new Error("payload_summary sem subscription id");
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", summary.subscription)
          .eq("environment", env);
        if (error) throw new Error(`update falhou: ${error.message}`);
        replayNote = "subscription cancelada";
      } else {
        throw new Error(
          `Replay automático não suportado para ${row.event_type}. Use "Send test webhook" no Stripe Dashboard.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("stripe_webhook_events")
        .update({ error_message: `reprocess: ${msg}`, processed_at: new Date().toISOString() })
        .eq("id", row.id);
      throw new Error(msg);
    }

    const { error: upErr } = await supabaseAdmin
      .from("stripe_webhook_events")
      .update({
        status: "processed",
        error_message: replayNote ? `reprocess: ${replayNote}` : null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (upErr) throw new Error(upErr.message);

    let isPro: boolean | null = null;
    if (summary.user_id) {
      const { data: rpc } = await supabaseAdmin.rpc("is_pro", { _user_id: summary.user_id });
      isPro = typeof rpc === "boolean" ? rpc : null;
    }

    return { ok: true, message: replayNote ?? "reprocessado", is_pro: isPro };
  });
