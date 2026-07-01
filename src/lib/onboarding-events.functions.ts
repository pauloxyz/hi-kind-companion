/**
 * Server-side mirror of client telemetry for the onboarding funnel.
 *
 * - `logOnboardingEvent` writes one row per `track()` call, RLS-scoped to the
 *   caller. Used to survive tab-close / nav-away and feed the admin funnel.
 * - `getOnboardingFunnel` aggregates events + my_profile snapshot. Admin only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";
import { z } from "zod";

/* ----------------------- write (any signed-in user) ----------------------- */

const LogInput = z.object({
  event: z.string().min(1).max(80),
  step_index: z.number().int().min(0).max(20).nullish(),
  step_label: z.string().max(120).nullish(),
  props: z.record(z.unknown()).optional(),
});

export const logOnboardingEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LogInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("onboarding_events").insert({
      user_id: context.userId,
      event: data.event,
      step_index: data.step_index ?? null,
      step_label: data.step_label ?? null,
      props: data.props ?? {},
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ----------------------------- read (admin) ------------------------------- */

export type FunnelRow = {
  step_index: number;
  step_label: string;
  started_users: number;
  reached_users: number;
  drop_rate_pct: number;
};

export type FunnelSnapshot = {
  total_started: number;
  total_completed: number;
  completion_rate_pct: number;
  current_step_distribution: Array<{ step: number; users: number }>;
  funnel: FunnelRow[];
  by_lang: {
    pt: { reached_by_step: number[]; completed_users: number; toggles_to: number };
    en: { reached_by_step: number[]; completed_users: number; toggles_to: number };
  };
  variant_switches: {
    total_events: number;
    unique_users: number;
    unique_variants: number;
    completed_after_switch: number;
    stuck_by_step: Array<{ step: number; users: number }>;
  };
  recent_events: Array<{
    id: string;
    user_id: string;
    event: string;
    step_index: number | null;
    step_label: string | null;
    created_at: string;
  }>;
};

const STEP_LABELS = [
  "Boas-vindas",
  "Como funciona",
  "Dados básicos",
  "Experiência",
  "Condições físicas",
  "Tudo pronto",
];

export const getOnboardingFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FunnelSnapshot> => {
    await assertAdminWithAudit(context as never, "admin/onboarding");

    // 1) unique users that hit each step (from events, robust to nav-away)
    //    We also pull `props` so we can slice the funnel by lang (PT/EN) and
    //    count variant switches / lang toggles.
    const { data: events, error: evErr } = await context.supabase
      .from("onboarding_events")
      .select("user_id,event,step_index,props,created_at")
      .in("event", [
        "onboarding_started",
        "onboarding_step_advanced",
        "onboarding_completed",
        "onboarding_lang_toggled",
        "onboarding_variant_selected",
        "onboarding_variant_activated",
      ])
      .order("created_at", { ascending: false })
      .limit(20000);
    if (evErr) throw new Error(evErr.message);

    const usersByStep = new Map<number, Set<string>>();
    const started = new Set<string>();
    const completed = new Set<string>();
    /** last known language for a user, derived from the most recent lang toggle. */
    const userLang = new Map<string, "pt" | "en">();
    const stepsByLang = { pt: new Map<number, Set<string>>(), en: new Map<number, Set<string>>() };
    const completedByLang = { pt: new Set<string>(), en: new Set<string>() };
    const togglesTo = { pt: 0, en: 0 };
    const variantUsers = new Set<string>();
    const variantIds = new Set<string>();
    let variantEvents = 0;

    // Events came back DESC; iterate ASC so "last known lang" for a user is
    // really the latest toggle that preceded their subsequent step events.
    const asc = [...(events ?? [])].reverse();
    for (const e of asc) {
      const uid = (e as { user_id: string }).user_id;
      const evt = (e as { event: string }).event;
      const props = ((e as { props?: Record<string, unknown> | null }).props ?? {}) as Record<string, unknown>;

      if (evt === "onboarding_lang_toggled") {
        const to = (props.to === "en" ? "en" : "pt") as "pt" | "en";
        userLang.set(uid, to);
        togglesTo[to] += 1;
        continue;
      }
      if (evt === "onboarding_variant_selected" || evt === "onboarding_variant_activated") {
        variantEvents += 1;
        variantUsers.add(uid);
        const vid = typeof props.variant_id === "string" ? props.variant_id : null;
        if (vid) variantIds.add(vid);
        continue;
      }
      if (evt === "onboarding_started") started.add(uid);
      if (evt === "onboarding_completed") {
        completed.add(uid);
        const lang = userLang.get(uid) ?? "pt";
        completedByLang[lang].add(uid);
      }
      const idx =
        typeof (e as { step_index?: number | null }).step_index === "number"
          ? (e as { step_index: number }).step_index
          : null;
      if (idx !== null && idx >= 0 && idx < STEP_LABELS.length) {
        if (!usersByStep.has(idx)) usersByStep.set(idx, new Set());
        usersByStep.get(idx)!.add(uid);
        const lang = userLang.get(uid) ?? "pt";
        if (!stepsByLang[lang].has(idx)) stepsByLang[lang].set(idx, new Set());
        stepsByLang[lang].get(idx)!.add(uid);
      }
    }

    const totalStarted = started.size || usersByStep.get(0)?.size || 0;
    const funnel: FunnelRow[] = STEP_LABELS.map((label, i) => {
      const reached = usersByStep.get(i)?.size ?? 0;
      const drop =
        totalStarted > 0
          ? Math.max(0, Math.round(((totalStarted - reached) / totalStarted) * 1000) / 10)
          : 0;
      return {
        step_index: i,
        step_label: label,
        started_users: totalStarted,
        reached_users: reached,
        drop_rate_pct: drop,
      };
    });

    const reachedByLang = (lang: "pt" | "en") =>
      STEP_LABELS.map((_, i) => stepsByLang[lang].get(i)?.size ?? 0);

    // 2) current snapshot from my_profile (where each user is parked right now)
    const { data: snap, error: snapErr } = await context.supabase
      .from("my_profile")
      .select("owner_id,onboarding_step,onboarding_completed_at");
    if (snapErr) throw new Error(snapErr.message);

    const dist = new Map<number, number>();
    let snapCompleted = 0;
    for (const row of snap ?? []) {
      const r = row as { onboarding_step?: number | null; onboarding_completed_at?: string | null };
      if (r.onboarding_completed_at) snapCompleted += 1;
      const s = typeof r.onboarding_step === "number" ? r.onboarding_step : 0;
      dist.set(s, (dist.get(s) ?? 0) + 1);
    }

    const totalCompleted = Math.max(completed.size, snapCompleted);
    const completionRate =
      totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 1000) / 10 : 0;

    // 3) recent events for the activity feed
    const { data: recent, error: recErr } = await context.supabase
      .from("onboarding_events")
      .select("id,user_id,event,step_index,step_label,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (recErr) throw new Error(recErr.message);

    return {
      total_started: totalStarted,
      total_completed: totalCompleted,
      completion_rate_pct: completionRate,
      current_step_distribution: Array.from(dist.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([step, users]) => ({ step, users })),
      funnel,
      by_lang: {
        pt: {
          reached_by_step: reachedByLang("pt"),
          completed_users: completedByLang.pt.size,
          toggles_to: togglesTo.pt,
        },
        en: {
          reached_by_step: reachedByLang("en"),
          completed_users: completedByLang.en.size,
          toggles_to: togglesTo.en,
        },
      },
      variant_switches: {
        total_events: variantEvents,
        unique_users: variantUsers.size,
        unique_variants: variantIds.size,
      },
      recent_events: (recent ?? []) as FunnelSnapshot["recent_events"],
    };
  });
