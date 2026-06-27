import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listEmployers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: emps }, { data: apps }] = await Promise.all([
      supabase.from("employers").select("*").order("updated_at", { ascending: false }),
      supabase.from("applications").select("employer_id,status,responded_at").eq("owner_id", userId),
    ]);
    const counts = new Map<string, { apps: number; responded: number }>();
    for (const a of apps ?? []) {
      if (!a.employer_id) continue;
      const c = counts.get(a.employer_id) ?? { apps: 0, responded: 0 };
      c.apps++;
      if (a.responded_at) c.responded++;
      counts.set(a.employer_id, c);
    }
    return (emps ?? []).map((e) => ({ ...e, _apps: counts.get(e.id)?.apps ?? 0, _responded: counts.get(e.id)?.responded ?? 0 }));
  });

export const updateEmployer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; notes?: string; is_flagged_suspicious?: boolean; flagged_reason?: string }) => input)
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("employers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
