import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUptimeSummary } from "@/lib/uptime.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, AlertCircle } from "lucide-react";

export function UptimePanel() {
  const fetchUptime = useServerFn(getUptimeSummary);
  const q = useQuery({
    queryKey: ["uptime-summary"],
    queryFn: () => fetchUptime(),
    refetchInterval: 60_000,
  });

  const data = q.data;
  const ok = data?.last_check?.status === "ok";
  const pct = data?.uptime_24h_pct ?? 100;
  const avg = data?.avg_latency_24h_ms;
  const last = data?.last_check;
  const lastAt = last ? new Date(last.checked_at).toLocaleString("pt-BR") : "—";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4" aria-hidden="true" />
          Status do sistema (últimas 24h)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">Sem permissão ou falha ao carregar.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status atual</p>
              <div className="flex items-center gap-2">
                {ok ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                ) : (
                  <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
                )}
                <Badge variant={ok ? "secondary" : "destructive"}>
                  {ok ? "Operacional" : last?.status ?? "Sem dados"}
                </Badge>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Uptime 24h</p>
              <p className="text-2xl font-semibold">{pct.toFixed(2)}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Latência média</p>
              <p className="text-2xl font-semibold">{avg !== null && avg !== undefined ? `${avg} ms` : "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Última verificação</p>
              <p className="text-sm">{lastAt}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
