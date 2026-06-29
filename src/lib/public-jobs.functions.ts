import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const ListInput = z.object({ state: z.string().min(2).max(2).toUpperCase() });

export const listPublicJobsByState = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: rows } = await supabase
      .from("public_jobs" as unknown as "jobs")
      .select(
        "id, job_title, employer_name, worksite_city, worksite_state, wage_offered, wage_unit, start_date, end_date, total_openings",
      )
      .eq("worksite_state", data.state)
      .order("start_date", { ascending: true })
      .limit(100);
    return { jobs: rows ?? [] };
  });

export const listPublicJobStates = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  // Pull a wide slice and aggregate client-side; SQL distinct isn't needed at this scale.
  const { data } = await supabase
    .from("public_jobs" as unknown as "jobs")
    .select("worksite_state")
    .not("worksite_state", "is", null)
    .limit(5000);
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const s = (r.worksite_state ?? "").toUpperCase();
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return {
    states: Array.from(counts.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),
  };
});

export const listPublicTopEmployers = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data } = await supabase
    .from("public_jobs" as unknown as "jobs")
    .select("employer_name, worksite_state, worksite_city, total_openings, wage_offered")
    .not("employer_name", "is", null)
    .limit(5000);
  const grouped = new Map<string, { name: string; jobs: number; openings: number; states: Set<string>; cities: Set<string>; avgWage: number }>();
  for (const r of data ?? []) {
    const name = (r.employer_name ?? "").trim();
    if (!name) continue;
    const key = name.toUpperCase();
    const cur = grouped.get(key) ?? { name, jobs: 0, openings: 0, states: new Set(), cities: new Set(), avgWage: 0 };
    cur.jobs += 1;
    cur.openings += r.total_openings ?? 0;
    if (r.worksite_state) cur.states.add(r.worksite_state.toUpperCase());
    if (r.worksite_city) cur.cities.add(r.worksite_city);
    if (r.wage_offered) cur.avgWage = (cur.avgWage * (cur.jobs - 1) + Number(r.wage_offered)) / cur.jobs;
    grouped.set(key, cur);
  }
  return {
    employers: Array.from(grouped.values())
      .map((e) => ({
        name: e.name,
        jobs: e.jobs,
        openings: e.openings,
        states: Array.from(e.states),
        cities: Array.from(e.cities).slice(0, 4),
        avgWage: Math.round(e.avgWage * 100) / 100,
      }))
      .sort((a, b) => b.openings - a.openings)
      .slice(0, 100),
  };
});
