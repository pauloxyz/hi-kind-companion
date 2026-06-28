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
      .from("jobs")
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
    .from("jobs")
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
