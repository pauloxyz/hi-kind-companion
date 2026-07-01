import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { requireAdminAccess } from "@/lib/admin-guard.functions";
import { getOnboardingFunnel } from "@/lib/onboarding-events.functions";
import { buildFunnelCsv, type CsvLocale } from "@/lib/onboarding-funnel.helpers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Users, CheckCircle2, TrendingDown, Download, Inbox, RefreshCw, AlertCircle } from "lucide-react";

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

/**
 * Encapsula a geração do CSV + trigger de download. Retorna `true` no sucesso
 * e propaga qualquer exceção (blob/URL/DOM) — o caller mostra o erro.
 */
function downloadFunnelCsv(data: Parameters<typeof buildFunnelCsv>[0], locale: CsvLocale) {
  const csv = buildFunnelCsv(data, locale);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `onboarding-funnel-${locale}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function AdminOnboardingPage() {
  const fetchFunnel = useServerFn(getOnboardingFunnel);
  const q = useQuery({
    queryKey: ["admin", "onboarding-funnel"],
    queryFn: () => fetchFunnel(),
    refetchInterval: 60_000,
  });

  const isEmpty =
    !!q.data &&
    q.data.total_started === 0 &&
    q.data.total_completed === 0 &&
    q.data.recent_events.length === 0;

  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingLocale, setExportingLocale] = useState<CsvLocale | null>(null);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Funil de onboarding"
        description="Métricas agregadas dos eventos do servidor + snapshot atual dos perfis."
        actions={
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="funnel-export-group"
            data-loading={q.isLoading ? "true" : "false"}
            data-empty={isEmpty ? "true" : "false"}
          >
            <span className="text-xs text-muted-foreground">Exportar CSV:</span>
            {(["pt", "en", "es"] as const).map((loc) => {
              const disabled = q.isLoading || !q.data || isEmpty;
              return (
                <Button
                  key={loc}
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  aria-disabled={disabled}
                  data-testid={loc === "pt" ? "funnel-export-csv" : `funnel-export-csv-${loc}`}
                  data-locale={loc}
                  data-exporting={exportingLocale === loc ? "true" : "false"}
                  title={
                    q.isLoading
                      ? "Carregando dados do funil…"
                      : isEmpty
                      ? "Nada para exportar — ainda não há eventos de onboarding."
                      : `Baixar funil em ${loc.toUpperCase()}`
                  }
                  onClick={() => {
                    if (disabled || !q.data) return;
                    setExportError(null);
                    setExportingLocale(loc);
                    try {
                      downloadFunnelCsv(q.data, loc);
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      setExportError(
                        `Não foi possível gerar o CSV agora (${msg || "erro desconhecido"}). Tente novamente em instantes.`,
                      );
                    } finally {
                      setExportingLocale(null);
                    }
                  }}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> {loc.toUpperCase()}
                </Button>
              );
            })}
          </div>
        }
      />

      {exportError && (
        <Card data-testid="funnel-export-error">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10 text-destructive shrink-0">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-destructive">{exportError}</p>
              <Button
                variant="ghost"
                size="sm"
                data-testid="funnel-export-error-dismiss"
                onClick={() => setExportError(null)}
              >
                Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}



      {q.isLoading && (
        <div className="grid sm:grid-cols-3 gap-4" data-testid="funnel-loading" aria-busy="true" aria-live="polite">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}


      {q.error && (
        <Card data-testid="funnel-error">
          <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 text-sm">
            <p className="text-destructive flex-1">
              Não foi possível carregar o funil de onboarding agora. Verifique sua conexão
              e tente novamente — os dados são recuperados automaticamente a cada minuto.
            </p>
            <Button variant="outline" size="sm" onClick={() => q.refetch()} data-testid="funnel-error-retry">
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {isEmpty && !q.error && (
        <Card data-testid="funnel-empty">
          <CardContent className="p-6 flex items-start gap-3 text-sm">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
              <Inbox className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Ainda não há dados de onboarding</p>
              <p className="text-muted-foreground">
                Assim que os primeiros usuários iniciarem o fluxo em <code>/app/comecar</code>,
                as métricas por etapa, comparativo PT/EN e trocas de currículo aparecerão aqui.
                A exportação CSV fica disponível quando houver ao menos um evento.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {q.data && !isEmpty && (
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

          {/* Funil por idioma */}
          <Card data-testid="funnel-by-lang">
            <CardHeader>
              <CardTitle>Funil por idioma (PT vs EN)</CardTitle>
              <CardDescription>
                Usuários únicos alcançando cada etapa segmentados pelo último
                idioma escolhido no toggle PT/EN. Ajuda a ver onde as pessoas
                travam <em>depois</em> de alternar para EN.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4 mb-4 text-xs">
                <div className="rounded-md border p-3" data-testid="lang-summary-pt">
                  <p className="font-semibold">PT</p>
                  <p className="text-muted-foreground">
                    Conclusões: <strong className="text-foreground">{q.data.by_lang.pt.completed_users}</strong>{" · "}
                    Toggles → PT: <strong className="text-foreground">{q.data.by_lang.pt.toggles_to}</strong>
                  </p>
                </div>
                <div className="rounded-md border p-3" data-testid="lang-summary-en">
                  <p className="font-semibold">EN</p>
                  <p className="text-muted-foreground">
                    Conclusões: <strong className="text-foreground">{q.data.by_lang.en.completed_users}</strong>{" · "}
                    Toggles → EN: <strong className="text-foreground">{q.data.by_lang.en.toggles_to}</strong>
                  </p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead className="text-right">PT</TableHead>
                    <TableHead className="text-right">EN</TableHead>
                    <TableHead className="text-right">Δ (EN − PT)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.funnel.map((row) => {
                    const pt = q.data.by_lang.pt.reached_by_step[row.step_index] ?? 0;
                    const en = q.data.by_lang.en.reached_by_step[row.step_index] ?? 0;
                    const delta = en - pt;
                    return (
                      <TableRow key={row.step_index}>
                        <TableCell>
                          {row.step_index + 1}. {row.step_label}
                        </TableCell>
                        <TableCell className="text-right font-mono">{pt}</TableCell>
                        <TableCell className="text-right font-mono">{en}</TableCell>
                        <TableCell className="text-right font-mono">
                          {delta > 0 ? `+${delta}` : delta}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Trocas de currículo */}
          <Card data-testid="variant-switches">
            <CardHeader>
              <CardTitle>Trocas de currículo</CardTitle>
              <CardDescription>
                Eventos <code className="text-xs">onboarding_variant_selected</code> e
                <code className="text-xs"> onboarding_variant_activated</code>.
                Ajuda a identificar onde os usuários travam após alternar de variante.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Eventos</p>
                  <p className="text-xl font-bold" data-testid="vs-events">{q.data.variant_switches.total_events}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Usuários</p>
                  <p className="text-xl font-bold" data-testid="vs-users">{q.data.variant_switches.unique_users}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Variantes</p>
                  <p className="text-xl font-bold" data-testid="vs-variants">{q.data.variant_switches.unique_variants}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Concluíram após trocar</p>
                  <p className="text-xl font-bold text-success" data-testid="vs-completed-after">
                    {q.data.variant_switches.completed_after_switch}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Travados após trocar</p>
                  <p className="text-xl font-bold text-accent-red" data-testid="vs-stuck-total">
                    {q.data.variant_switches.stuck_by_step.reduce((s, r) => s + r.users, 0)}
                  </p>
                </div>
              </div>

              {q.data.variant_switches.stuck_by_step.length > 0 && (
                <div data-testid="vs-stuck-table">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    Onde travaram após trocar de variante
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Etapa</TableHead>
                        <TableHead className="text-right">Usuários</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {q.data.variant_switches.stuck_by_step.map((r) => (
                        <TableRow key={r.step}>
                          <TableCell>{r.step + 1}. {stepLabel(r.step)}</TableCell>
                          <TableCell className="text-right font-mono">{r.users}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
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
