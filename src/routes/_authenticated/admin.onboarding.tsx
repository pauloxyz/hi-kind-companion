import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requireAdminAccess } from "@/lib/admin-guard.functions";
import { getOnboardingFunnel } from "@/lib/onboarding-events.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Users, CheckCircle2, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/onboarding")({
  beforeLoad: async () => {
    try {
      await requireAdminAccess({ data: { route: "admin/onboarding" } });
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminOnboardingPage,
});

function AdminOnboardingPage() {
  const fetchFunnel = useServerFn(getOnboardingFunnel);
  const q = useQuery({
    queryKey: ["admin", "onboarding-funnel"],
    queryFn: () => fetchFunnel(),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Funil de onboarding"
        description="Métricas agregadas dos eventos do servidor + snapshot atual dos perfis."
      />

      {q.isLoading && (
        <div className="grid sm:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {q.error && (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Erro ao carregar funil. Tente recarregar.
          </CardContent>
        </Card>
      )}

      {q.data && (
        <>
          {/* KPIs */}
          <div className="grid sm:grid-cols-3 gap-4">
            <KpiCard
              icon={Users}
              label="Iniciaram onboarding"
              value={q.data.total_started}
              hint="Usuários únicos com evento onboarding_started"
            />
            <KpiCard
              icon={CheckCircle2}
              label="Concluíram"
              value={q.data.total_completed}
              hint={`${q.data.completion_rate_pct}% de quem iniciou`}
              tone="success"
            />
            <KpiCard
              icon={TrendingDown}
              label="Maior drop-off"
              value={biggestDropLabel(q.data.funnel)}
              hint="Etapa com maior queda relativa entre etapas consecutivas"
              tone="warn"
            />
          </div>

          {/* Funnel by step */}
          <Card>
            <CardHeader>
              <CardTitle>Avanço por etapa</CardTitle>
              <CardDescription>
                Usuários únicos que chegaram em cada etapa (eventos do servidor).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {q.data.funnel.map((row) => {
                  const pct =
                    row.started_users > 0
                      ? Math.round((row.reached_users / row.started_users) * 100)
                      : 0;
                  return (
                    <div key={row.step_index} className="space-y-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-semibold">
                          {row.step_index + 1}. {row.step_label}
                        </span>
                        <span className="text-muted-foreground">
                          <strong className="text-foreground">{row.reached_users}</strong> /{" "}
                          {row.started_users} ({pct}%)
                          {row.drop_rate_pct > 0 && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              drop {row.drop_rate_pct}%
                            </Badge>
                          )}
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Snapshot atual */}
          <Card>
            <CardHeader>
              <CardTitle>Onde estão parados agora</CardTitle>
              <CardDescription>
                Snapshot da coluna <code className="text-xs">my_profile.onboarding_step</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead className="text-right">Usuários</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.current_step_distribution.map((d) => (
                    <TableRow key={d.step}>
                      <TableCell>
                        {d.step + 1}. {stepLabel(d.step)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{d.users}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Eventos recentes */}
          <Card>
            <CardHeader>
              <CardTitle>Eventos recentes</CardTitle>
              <CardDescription>Últimos 50 eventos do servidor.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Usuário</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.recent_events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.event}</TableCell>
                      <TableCell className="text-xs">
                        {e.step_label ?? (e.step_index !== null ? `#${e.step_index}` : "—")}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {e.user_id.slice(0, 8)}…
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function stepLabel(i: number): string {
  return (
    ["Boas-vindas", "Como funciona", "Dados básicos", "Experiência", "Condições físicas", "Tudo pronto"][i] ??
    `Etapa ${i}`
  );
}

function biggestDropLabel(
  funnel: Array<{ step_index: number; step_label: string; reached_users: number }>,
): string {
  let worst = { label: "—", drop: 0 };
  for (let i = 1; i < funnel.length; i++) {
    const prev = funnel[i - 1].reached_users;
    const curr = funnel[i].reached_users;
    if (prev > 0) {
      const drop = prev - curr;
      if (drop > worst.drop) worst = { label: funnel[i].step_label, drop };
    }
  }
  return worst.drop > 0 ? `${worst.label} (-${worst.drop})` : "—";
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "success" | "warn";
}) {
  const toneClass =
    tone === "success"
      ? "text-success bg-success/10"
      : tone === "warn"
      ? "text-accent-red bg-accent-red/10"
      : "text-primary bg-primary/10";
  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-3">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold leading-none">{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
