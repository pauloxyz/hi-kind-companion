/**
 * Listagem admin dos eventos recebidos pelo webhook do Stripe
 * (tabela public.stripe_webhook_events). Gated por admin + audit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";

const filtersSchema = z.object({
  environment: z.enum(["all", "sandbox", "live"]).default("all"),
  status: z.enum(["all", "processed", "ignored", "error"]).default("all"),
  eventType: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export type StripeWebhookEventRow = {
  id: string;
  stripe_event_id: string;
  event_type: string;
  environment: string;
  status: string;
  error_message: string | null;
  payload_summary: Record<string, unknown> | null;
  received_at: string;
  processed_at: string | null;
};

export const listStripeWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => filtersSchema.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<StripeWebhookEventRow[]> => {
    await assertAdminWithAudit(context as never, "stripe_webhook_events.fn");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("stripe_webhook_events")
      .select(
        "id,stripe_event_id,event_type,environment,status,error_message,payload_summary,received_at,processed_at",
      )
      .order("received_at", { ascending: false })
      .limit(data.limit);

    if (data.environment !== "all") q = q.eq("environment", data.environment);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.eventType) q = q.eq("event_type", data.eventType);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as StripeWebhookEventRow[];
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
