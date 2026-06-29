import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdminWithAudit } from "@/lib/admin-guard.shared";

export type UptimeCheck = {
  id: string;
  checked_at: string;
  status: string;
  http_status: number | null;
  latency_ms: number | null;
  error: string | null;
};

export type UptimeSummary = {
  recent: UptimeCheck[];
  uptime_24h_pct: number;
  avg_latency_24h_ms: number | null;
  last_check: UptimeCheck | null;
};

export const getUptimeSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UptimeSummary> => {
    await assertAdminWithAudit(context as never, "uptime.summary");
    const { supabase } = context;



    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabase
      .from("uptime_checks")
      .select("id,checked_at,status,http_status,latency_ms,error")
      .gte("checked_at", since)
      .order("checked_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as UptimeCheck[];
    const total = list.length;
    const okCount = list.filter((r) => r.status === "ok").length;
    const uptime = total === 0 ? 100 : (okCount / total) * 100;
    const latencies = list.map((r) => r.latency_ms).filter((n): n is number => typeof n === "number");
    const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

    return {
      recent: list.slice(0, 50),
      uptime_24h_pct: Math.round(uptime * 100) / 100,
      avg_latency_24h_ms: avg,
      last_check: list[0] ?? null,
    };
  });
