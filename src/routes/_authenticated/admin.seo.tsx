import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  RefreshCw,
  Activity,
  AlertOctagon,
  CheckCircle2,
  Map as MapIcon,
  Clock,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  listSeoRuns,
  triggerManualSeoScan,
  type SeoScanRun,
} from "@/lib/seo-runs.functions";

export const Route = createFileRoute("/_authenticated/admin/seo")({
  head: () => ({
    meta: [
      { title: "SEO scans — VaiPraLá Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminSeoDashboard,
  errorComponent: ({ error }) => (
    <div className="container mx-auto max-w-3xl py-12">
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            {error.message === "Forbidden"
              ? "Você precisa de papel 'admin' para ver este painel."
              : error.message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/app">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  ),
  notFoundComponent: () => <div>Não encontrado.</div>,
});

const chartConfig = {
  critical: { label: "Crítico", color: "hsl(var(--destructive))" },
  high: { label: "Alto", color: "hsl(25 95% 53%)" },
  medium: { label: "Médio", color: "hsl(45 93% 47%)" },
  low: { label: "Baixo", color: "hsl(217 91% 60%)" },
  pass_rate: { label: "% testes verdes", color: "hsl(142 76% 36%)" },
  routes_total: { label: "Rotas totais", color: "hsl(var(--muted-foreground))" },
  routes_in_sitemap: { label: "No sitemap", color: "hsl(217 91% 60%)" },
} satisfies ChartConfig;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "agora mesmo";
  if (m < 60) return `${m} min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h atrás`;
  const d = Math.floor(h / 24);
  return `${d} dia${d > 1 ? "s" : ""} atrás`;
}

function AdminSeoDashboard() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSeoRuns);
  const triggerFn = useServerFn(triggerManualSeoScan);

  const runsQuery = useQuery({
    queryKey: ["admin", "seo-runs"],
    queryFn: () => listFn({ data: { limit: 90 } }),
  });

  const triggerMut = useMutation({
    mutationFn: () => triggerFn({}),
    onSuccess: () => {
      toast.success("Scan executado");
      queryClient.invalidateQueries({ queryKey: ["admin", "seo-runs"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao rodar scan"),
  });

  const runs = runsQuery.data ?? [];
  const latest = runs[0];

  const chartData = useMemo(() => {
    // Oldest → newest for chronological charts
    return [...runs].reverse().map((r) => ({
      key: r.id,
      label: formatDate(r.created_at),
      critical: r.critical_count,
      high: r.high_count,
      medium: r.medium_count,
      low: r.low_count,
      pass_rate: r.tests_total > 0
        ? Math.round((r.tests_passed / r.tests_total) * 1000) / 10
        : 0,
      routes_total: r.routes_total,
      routes_in_sitemap: r.routes_in_sitemap,
    }));
  }, [runs]);

  const isLoading = runsQuery.isLoading;
  const error = runsQuery.error as Error | null;

  if (error) throw error; // surfaces in errorComponent

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/app" className="hover:underline">
              <ArrowLeft className="inline h-3 w-3" /> app
            </Link>
            <span>/</span>
            <span>admin</span>
            <span>/</span>
            <span>seo</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Painel SEO
          </h1>
          <p className="text-sm text-muted-foreground">
            Histórico de scans, tendência de findings e cobertura do sitemap.
          </p>
        </div>
        <Button
          onClick={() => triggerMut.mutate()}
          disabled={triggerMut.isPending}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${triggerMut.isPending ? "animate-spin" : ""}`}
          />
          Rodar scan agora
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          title="Último scan"
          value={latest ? relativeFrom(latest.created_at) : "—"}
          sub={
            latest
              ? `${latest.source === "cron" ? "automático" : "manual"} • ${formatDate(latest.created_at)}`
              : "nenhum scan registrado"
          }
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          title="Testes passando"
          value={
            latest
              ? `${latest.tests_passed}/${latest.tests_total}`
              : "—"
          }
          sub={
            latest && latest.tests_total > 0
              ? `${Math.round((latest.tests_passed / latest.tests_total) * 100)}% verde`
              : "sem dados"
          }
        />
        <KpiCard
          icon={<AlertOctagon className="h-4 w-4" />}
          title="Findings críticos"
          value={latest ? String(latest.critical_count) : "—"}
          sub={
            latest
              ? `+ ${latest.high_count} altos • ${latest.medium_count} médios • ${latest.low_count} baixos`
              : "—"
          }
          tone={latest && latest.critical_count > 0 ? "danger" : "ok"}
        />
        <KpiCard
          icon={<MapIcon className="h-4 w-4" />}
          title="Cobertura sitemap"
          value={
            latest
              ? `${latest.routes_in_sitemap}/${latest.routes_total}`
              : "—"
          }
          sub={
            latest && latest.routes_total > 0
              ? `${Math.round((latest.routes_in_sitemap / latest.routes_total) * 100)}% das rotas`
              : "—"
          }
        />
      </div>

      {/* Empty state */}
      {!isLoading && runs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nenhum scan ainda</CardTitle>
            <CardDescription>
              Clique em <strong>Rodar scan agora</strong> para registrar a
              primeira execução, ou aguarde o job diário das 03:00 UTC.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* Severity trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" /> Findings por severidade
              </CardTitle>
              <CardDescription>
                Cada ponto representa um scan. Valores são contagens absolutas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="critical" stroke="var(--color-critical)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="high" stroke="var(--color-high)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="medium" stroke="var(--color-medium)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="low" stroke="var(--color-low)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Pass rate */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Taxa de testes passando (%)</CardTitle>
                <CardDescription>Suíte SEO interna ao longo do tempo.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[240px] w-full">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} fontSize={11} />
                    <YAxis domain={[0, 100]} fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="pass_rate"
                      stroke="var(--color-pass_rate)"
                      fill="var(--color-pass_rate)"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cobertura do sitemap</CardTitle>
                <CardDescription>Rotas declaradas vs presentes no sitemap.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[240px] w-full">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="routes_total" fill="var(--color-routes_total)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="routes_in_sitemap" fill="var(--color-routes_in_sitemap)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* History table */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
              <CardDescription>Últimas {Math.min(runs.length, 20)} execuções.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Testes</TableHead>
                    <TableHead className="text-right">Crít.</TableHead>
                    <TableHead className="text-right">Alto</TableHead>
                    <TableHead className="text-right">Médio</TableHead>
                    <TableHead className="text-right">Baixo</TableHead>
                    <TableHead className="text-right">Sitemap</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.slice(0, 20).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(r.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.source === "cron" ? "secondary" : "outline"}>
                          {r.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.tests_passed}/{r.tests_total}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.critical_count > 0 ? (
                          <Badge variant="destructive">{r.critical_count}</Badge>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.high_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.medium_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.low_count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.routes_in_sitemap}/{r.routes_total}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {r.duration_ms} ms
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Latest failing checks */}
          {latest && latest.details?.failing && latest.details.failing.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Checks falhando no último scan</CardTitle>
                <CardDescription>
                  {latest.details.failing.length} item(ns) precisa(m) de atenção.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {latest.details.failing.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge
                        variant={
                          f.severity === "critical" || f.severity === "high"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {f.severity}
                      </Badge>
                      <div>
                        <div className="font-medium">{f.name}</div>
                        {f.message ? (
                          <div className="text-xs text-muted-foreground">{f.message}</div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  title,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub: string;
  tone?: "ok" | "danger";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          {icon}
          {title}
        </CardDescription>
        <CardTitle
          className={
            tone === "danger"
              ? "text-2xl text-destructive"
              : "text-2xl"
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
