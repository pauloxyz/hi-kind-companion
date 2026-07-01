import { createFileRoute, getRouteApi, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requireAdminAccess } from "@/lib/admin-guard.functions";
import {
  exportReprocessLog,
  exportStripeWebhookEvents,
  getStripeWebhookEventStats,
  listReprocessLog,
  listStripeWebhookEvents,
  listStripeWebhookEventTypes,
  reprocessFromLogFilteredBatch,
  reprocessStripeWebhookEvent,
  reprocessStripeWebhookEventsBatch,
  reprocessStripeWebhookEventsByIds,
  type BatchReprocessResult,
  type ReprocessLogEntry,
  type ReprocessLogPage,
  type ReprocessResult,
  type StripeWebhookEventRow,
  type StripeWebhookEventStats,
  type StripeWebhookEventsPage,
} from "@/lib/stripe-webhook-events.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Activity, AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Check,
  ChevronDown, ChevronLeft, ChevronRight, Circle, Clock, Copy, Download, ExternalLink,
  FileJson, RefreshCw, RotateCcw, Search, X, XCircle,
} from "lucide-react";
import { toast } from "sonner";

type EnvFilter = "all" | "sandbox" | "live";
type StatusFilter = "all" | "processed" | "ignored" | "error";
type SortCol = "received_at" | "processed_at" | "event_type" | "status";
type SortDir = "asc" | "desc";
type TabId = "events" | "reprocess-log";
type LogOutcome = "all" | "success" | "error";
type LogSortCol = "created_at" | "outcome" | "duration_ms";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const ROUTE_ID = "/_authenticated/admin/stripe-events" as const;

type SearchState = {
  tab: TabId;
  env: EnvFilter; st: StatusFilter; et: string; q: string; em: string;
  sb: SortCol; sd: SortDir; p: number; ps: number;
  l_sid: string; l_uid: string; l_oc: LogOutcome;
  l_since: string; l_until: string;
  l_sb: LogSortCol; l_sd: SortDir; l_p: number; l_ps: number;
};

function asEnum<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}
function asStr(v: unknown, d = ""): string {
  return typeof v === "string" ? v : d;
}
function asInt(v: unknown, d: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function validateSearchState(raw: Record<string, unknown>): SearchState {
  const s = raw ?? {};
  return {
    tab: asEnum(s.tab, ["events", "reprocess-log"] as const, "events"),
    env: asEnum(s.env, ["all", "sandbox", "live"] as const, "all"),
    st: asEnum(s.st, ["all", "processed", "ignored", "error"] as const, "all"),
    et: asStr(s.et, "all"),
    q: asStr(s.q, ""),
    em: asStr(s.em, ""),
    sb: asEnum(s.sb, ["received_at", "processed_at", "event_type", "status"] as const, "received_at"),
    sd: asEnum(s.sd, ["asc", "desc"] as const, "desc"),
    p: asInt(s.p, 0, 0, 100000),
    ps: asInt(s.ps, 25, 1, 500),
    l_sid: asStr(s.l_sid, ""),
    l_uid: asStr(s.l_uid, ""),
    l_oc: asEnum(s.l_oc, ["all", "success", "error"] as const, "all"),
    l_since: asStr(s.l_since, ""),
    l_until: asStr(s.l_until, ""),
    l_sb: asEnum(s.l_sb, ["created_at", "outcome", "duration_ms"] as const, "created_at"),
    l_sd: asEnum(s.l_sd, ["asc", "desc"] as const, "desc"),
    l_p: asInt(s.l_p, 0, 0, 100000),
    l_ps: asInt(s.l_ps, 25, 1, 200),
  };
}

export const Route = createFileRoute(ROUTE_ID)({
  validateSearch: validateSearchState,
  beforeLoad: async () => {
    try {
      await requireAdminAccess({ data: { route: "admin/stripe-events" } });
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminStripeEventsPage,
});

const routeApi = getRouteApi(ROUTE_ID);


function AdminStripeEventsPage() {
  const list = useServerFn(listStripeWebhookEvents);
  const listTypes = useServerFn(listStripeWebhookEventTypes);
  const exportFn = useServerFn(exportStripeWebhookEvents);
  const statsFn = useServerFn(getStripeWebhookEventStats);
  const reprocessFn = useServerFn(reprocessStripeWebhookEvent);
  const reprocessBatchFn = useServerFn(reprocessStripeWebhookEventsBatch);
  const reprocessByIdsFn = useServerFn(reprocessStripeWebhookEventsByIds);
  const qc = useQueryClient();

  const search = routeApi.useSearch();
  const navigate = useNavigate({ from: ROUTE_ID });

  // Filtros/ordenação/página vivem na URL para compartilhar/voltar sem perder estado.
  const environment = search.env;
  const status = search.st;
  const eventType = search.et;
  const searchQ = search.q;
  const errorMessage = search.em;
  const sortBy = search.sb;
  const sortDir = search.sd;
  const page = search.p;
  const pageSize = search.ps;
  const tab = search.tab;

  const [searchInput, setSearchInput] = useState<string>(searchQ);
  const [errorMessageInput, setErrorMessageInput] = useState<string>(errorMessage);
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchReprocessResult | null>(null);
  const [retryingFailures, setRetryingFailures] = useState<boolean>(false);

  function patchSearch(patch: Partial<SearchState>) {
    navigate({
      to: ROUTE_ID,
      search: (prev: SearchState) => ({ ...prev, ...patch }),
      replace: true,
    });
  }
  function setEnvironment(v: EnvFilter) { patchSearch({ env: v, p: 0 }); }
  function setStatus(v: StatusFilter) { patchSearch({ st: v, p: 0 }); }
  function setEventType(v: string) { patchSearch({ et: v, p: 0 }); }
  function setPageSize(n: number) { patchSearch({ ps: n, p: 0 }); }
  function setPage(updater: number | ((p: number) => number)) {
    const next = typeof updater === "function" ? updater(page) : updater;
    patchSearch({ p: Math.max(0, next) });
  }
  function setTab(v: TabId) { patchSearch({ tab: v }); }
  function setSortBy(v: SortCol) { patchSearch({ sb: v }); }
  function setSortDir(v: SortDir) { patchSearch({ sd: v }); }

  // Debounce busca (300ms) → URL
  useEffect(() => {
    const t = setTimeout(() => {
      const v = searchInput.trim();
      if (v !== searchQ) patchSearch({ q: v, p: 0 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);
  useEffect(() => {
    const t = setTimeout(() => {
      const v = errorMessageInput.trim();
      if (v !== errorMessage) patchSearch({ em: v, p: 0 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorMessageInput]);

  // Sincroniza os inputs quando a URL muda externamente (back/forward, share).
  useEffect(() => { setSearchInput(searchQ); }, [searchQ]);
  useEffect(() => { setErrorMessageInput(errorMessage); }, [errorMessage]);

  const filterPayload = {
    environment,
    status,
    eventType: eventType === "all" ? undefined : eventType,
    search: searchQ || undefined,
    errorMessage: errorMessage || undefined,
  };

  const typesQuery = useQuery({
    queryKey: ["admin", "stripe-events", "types"],
    queryFn: () => listTypes() as Promise<string[]>,
  });

  const eventsBatchPending = false as boolean; // definido abaixo
  const liveRefetch = autoRefresh || retryingFailures;

  const statsQuery = useQuery({
    queryKey: ["admin", "stripe-events", "stats", environment, status, eventType, searchQ, errorMessage],
    queryFn: () => statsFn({ data: filterPayload }) as Promise<StripeWebhookEventStats>,
    refetchInterval: liveRefetch ? 5000 : false,
  });

  const eventsQuery = useQuery({
    queryKey: ["admin", "stripe-events", environment, status, eventType, searchQ, errorMessage, sortBy, sortDir, page, pageSize],
    queryFn: () =>
      list({
        data: { ...filterPayload, sortBy, sortDir, limit: pageSize, offset: page * pageSize },
      }) as Promise<StripeWebhookEventsPage>,
    refetchInterval: liveRefetch ? 5000 : false,
  });

  const reprocessMut = useMutation({
    mutationFn: (id: string) => reprocessFn({ data: { id } }) as Promise<ReprocessResult>,
    onSuccess: async (res) => {
      toast.success(
        `Reprocessado: ${res.message}${res.is_pro === null ? "" : ` · is_pro=${res.is_pro}`}`,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "stripe-events"] }),
        qc.invalidateQueries({ queryKey: ["admin", "stripe-reprocess-log"] }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao reprocessar"),
  });

  const batchMut = useMutation({
    mutationFn: () =>
      reprocessBatchFn({
        data: { ...filterPayload, limit: 100 },
      }) as Promise<BatchReprocessResult>,
    onMutate: () => {
      setBatchSummary(null);
    },
    onSuccess: async (res) => {
      setBatchSummary(res);
      if (res.attempted === 0) {
        toast.info("Nenhum evento com status=error nos filtros atuais.");
      } else if (res.failed === 0) {
        toast.success(`Lote reprocessado: ${res.succeeded}/${res.attempted} OK`);
      } else {
        toast.warning(
          `Lote parcial: ${res.succeeded} OK · ${res.failed} falharam de ${res.attempted}`,
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "stripe-events"] }),
        qc.invalidateQueries({ queryKey: ["admin", "stripe-reprocess-log"] }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no reprocessamento em lote"),
  });

  // Autoatualiza a tabela enquanto o lote roda; requery já é feito no onSuccess.
  const isBatchRunning = batchMut.isPending || retryingFailures;
  useEffect(() => {
    if (!isBatchRunning) return;
    const t = setInterval(() => {
      void eventsQuery.refetch();
      void statsQuery.refetch();
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBatchRunning]);

  async function retryLastBatchFailures() {
    if (!batchSummary) return;
    const failedIds = batchSummary.results.filter((r) => !r.ok).map((r) => r.id);
    if (failedIds.length === 0) {
      toast.info("Não há falhas para reprocessar.");
      return;
    }
    setRetryingFailures(true);
    try {
      const res = (await reprocessByIdsFn({ data: { ids: failedIds } })) as BatchReprocessResult;
      setBatchSummary(res);
      if (res.failed === 0) {
        toast.success(`Falhas reprocessadas: ${res.succeeded}/${res.attempted} OK`);
      } else {
        toast.warning(`Retentativa parcial: ${res.succeeded} OK · ${res.failed} falharam`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "stripe-events"] }),
        qc.invalidateQueries({ queryKey: ["admin", "stripe-reprocess-log"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao retentar as falhas");
    } finally {
      setRetryingFailures(false);
    }
  }
  void eventsBatchPending;


  const rows = eventsQuery.data?.rows ?? [];
  const total = eventsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : page * pageSize + 1;
  const showingTo = Math.min(total, page * pageSize + rows.length);

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  async function handleExport(format: "csv" | "json") {
    setExporting(format);
    try {
      const data = (await exportFn({
        data: { ...filterPayload, sortBy, sortDir },
      })) as StripeWebhookEventRow[];
      const filename = buildExportFilename({ environment, status, eventType }, format);
      if (format === "csv") {
        downloadBlob(new Blob(["\uFEFF" + toCsv(data)], { type: "text/csv;charset=utf-8" }), filename);
      } else {
        downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
      }
      toast.success(`${format.toUpperCase()} exportado (${data.length} registros)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Falha ao exportar ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  }

  const stats = statsQuery.data;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Eventos do Stripe"
          description="Auditoria dos webhooks recebidos em /api/public/payments/webhook, com busca, métricas e reprocessamento."
          actions={
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                Auto-refresh 5s
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { eventsQuery.refetch(); statsQuery.refetch(); }}
                disabled={eventsQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${eventsQuery.isFetching ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => batchMut.mutate()}
                disabled={batchMut.isPending || (stats?.error ?? 0) === 0}
              >
                <RotateCcw className={`mr-2 h-4 w-4 ${batchMut.isPending ? "animate-spin" : ""}`} />
                Reprocessar erros ({stats?.error ?? 0})
              </Button>
              <Button size="sm" onClick={() => handleExport("csv")} disabled={exporting !== null || total === 0}>
                <Download className={`mr-2 h-4 w-4 ${exporting === "csv" ? "animate-pulse" : ""}`} />
                Exportar CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleExport("json")} disabled={exporting !== null || total === 0}>
                <FileJson className={`mr-2 h-4 w-4 ${exporting === "json" ? "animate-pulse" : ""}`} />
                Exportar JSON
              </Button>
            </div>
          }
        />

        {/* Painel de métricas */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            icon={<Activity className="h-4 w-4" />}
            label="Total (filtrado)"
            value={stats?.total ?? 0}
            tone="muted"
          />
          <MetricCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Processed"
            value={stats?.processed ?? 0}
            tone="ok"
          />
          <MetricCard
            icon={<Circle className="h-4 w-4" />}
            label="Ignored"
            value={stats?.ignored ?? 0}
            tone="muted"
          />
          <MetricCard
            icon={<XCircle className="h-4 w-4" />}
            label="Error"
            value={stats?.error ?? 0}
            tone={stats && stats.error > 0 ? "danger" : "ok"}
            hint={
              rows.find((r) => r.status === "error" && r.error_message)?.error_message ?? undefined
            }
          />
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Último recebido</span>
              </div>
              <div className="mt-2 text-sm font-medium">
                {stats?.lastReceivedAt
                  ? new Date(stats.lastReceivedAt).toLocaleString("pt-BR")
                  : "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Painel de progresso do batch reprocess */}
        {(batchMut.isPending || retryingFailures || batchSummary) && (
          <BatchProgressPanel
            pending={batchMut.isPending || retryingFailures}
            summary={batchSummary}
            onDismiss={() => setBatchSummary(null)}
            onRetryFailures={retryLastBatchFailures}
            retryingFailures={retryingFailures}
          />
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="events">Eventos</TabsTrigger>
            <TabsTrigger value="reprocess-log">Log de Reprocessamento</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>
              {total.toLocaleString("pt-BR")} registros no total · página {page + 1} de {totalPages}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar por event_id, customer, subscription, user_id, request_id ou trace_id…"
                  className="pl-9"
                />
              </div>
              <div className="relative">
                <AlertCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={errorMessageInput}
                  onChange={(e) => setErrorMessageInput(e.target.value)}
                  placeholder="Filtrar por texto em error_message…"
                  className="pl-9 pr-9"
                />
                {errorMessageInput && (
                  <button
                    type="button"
                    aria-label="Limpar filtro de erro"
                    onClick={() => setErrorMessageInput("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <FilterSelect
                label="Ambiente" value={environment}
                onChange={(v) => setEnvironment(v as EnvFilter)}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "sandbox", label: "Sandbox" },
                  { value: "live", label: "Live" },
                ]}
              />
              <FilterSelect
                label="Status" value={status}
                onChange={(v) => setStatus(v as StatusFilter)}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "processed", label: "Processado" },
                  { value: "ignored", label: "Ignorado" },
                  { value: "error", label: "Erro" },
                ]}
              />
              <FilterSelect
                label="Tipo de evento" value={eventType} onChange={setEventType}
                options={[
                  { value: "all", label: "Todos" },
                  ...(typesQuery.data ?? []).map((t) => ({ value: t, label: t })),
                ]}
              />
              <FilterSelect
                label="Por página" value={String(pageSize)}
                onChange={(v) => setPageSize(Number(v))}
                options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
              />
            </div>
            {(status === "error" || errorMessage) && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-muted-foreground">Filtros ativos:</span>
                {status === "error" && (
                  <Badge variant="destructive" className="gap-1">
                    status=error
                    <button onClick={() => setStatus("all")} aria-label="remover"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                {eventType !== "all" && status === "error" && (
                  <Badge variant="outline">event_type={eventType}</Badge>
                )}
                {errorMessage && (
                  <Badge variant="outline" className="gap-1">
                    contém “{errorMessage}”
                    <button onClick={() => setErrorMessageInput("")} aria-label="remover"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eventos</CardTitle>
            <CardDescription>Clique numa linha para inspecionar o payload resumido.</CardDescription>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : eventsQuery.isError ? (
              <p className="text-sm text-destructive">Falha ao carregar eventos.</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento encontrado com os filtros atuais.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <SortableHead label="Recebido em" col="received_at" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <SortableHead label="Tipo" col="event_type" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <TableHead>Ambiente</TableHead>
                    <SortableHead label="Status" col="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                    <TableHead>stripe_event_id</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <EventRow
                      key={r.id}
                      row={r}
                      expanded={openId === r.id}
                      onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                      onReprocess={() => reprocessMut.mutate(r.id)}
                      reprocessing={reprocessMut.isPending && reprocessMut.variables === r.id}
                    />
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <div>
                {total === 0
                  ? "0 registros"
                  : `Mostrando ${showingFrom.toLocaleString("pt-BR")}–${showingTo.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || eventsQuery.isFetching}>
                  <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                </Button>
                <span className="tabular-nums">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || eventsQuery.isFetching}>
                  Próxima <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="reprocess-log" className="mt-4">
            <ReprocessLogPanel
              onOpenEventInEvents={(id) => {
                setSearchInput(id);
                patchSearch({ q: id, st: "all", et: "all", p: 0, tab: "events" });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

function MetricCard({
  icon, label, value, tone, hint,
}: { icon: React.ReactNode; label: string; value: number; tone: "ok" | "danger" | "muted"; hint?: string }) {
  const cls =
    tone === "danger" ? "border-destructive/40 bg-destructive/5"
    : tone === "ok" ? "border-emerald-500/30 bg-emerald-500/5"
    : "";
  return (
    <Card className={cls}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}<span>{label}</span>
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums">{value.toLocaleString("pt-BR")}</div>
        {hint && (
          <p className="mt-2 line-clamp-2 text-xs text-destructive" title={hint}>
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function SortableHead({
  label, col, sortBy, sortDir, onSort,
}: {
  label: string; col: SortCol; sortBy: SortCol; sortDir: SortDir; onSort: (c: SortCol) => void;
}) {
  const active = sortBy === col;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "text-foreground" : "text-muted-foreground/60"}`} />
      </button>
    </TableHead>
  );
}

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "processed") return "default";
  if (s === "error") return "destructive";
  if (s === "ignored") return "secondary";
  return "outline";
}

/** Extrai o request id (top-level do evento Stripe) do payload_summary. */
function extractRequestId(summary: unknown): string | null {
  if (!summary || typeof summary !== "object") return null;
  const s = summary as Record<string, unknown>;
  if (typeof s.request_id === "string" && s.request_id.length > 0) return s.request_id;
  const req = s.request;
  if (req && typeof req === "object") {
    const id = (req as Record<string, unknown>).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

/** Extrai o trace id (alias do request p/ correlação de logs). */
function extractTraceId(summary: unknown): string | null {
  if (!summary || typeof summary !== "object") return null;
  const s = summary as Record<string, unknown>;
  if (typeof s.trace_id === "string" && s.trace_id.length > 0) return s.trace_id;
  return null;
}

function CopyButton({
  value, label, icon,
}: { value: string; label: string; icon?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              toast.success(`${label} copiado`);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error("Não foi possível copiar");
            }
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : (icon ?? <Copy className="h-3.5 w-3.5" />)}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copiar {label}</TooltipContent>
    </Tooltip>
  );
}

function EventRow({
  row, expanded, onToggle, onReprocess, reprocessing,
}: {
  row: StripeWebhookEventRow;
  expanded: boolean;
  onToggle: () => void;
  onReprocess: () => void;
  reprocessing: boolean;
}) {
  const jsonText = useMemo(() => JSON.stringify(row.payload_summary ?? {}, null, 2), [row.payload_summary]);
  const requestId = useMemo(() => extractRequestId(row.payload_summary), [row.payload_summary]);
  const traceId = useMemo(() => extractTraceId(row.payload_summary), [row.payload_summary]);
  const [copiedPayload, setCopiedPayload] = useState(false);

  async function copyPayload(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopiedPayload(true);
      toast.success("Payload copiado");
      setTimeout(() => setCopiedPayload(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  const isError = row.status === "error";

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
        <TableCell className="whitespace-nowrap text-sm">
          {new Date(row.received_at).toLocaleString("pt-BR")}
        </TableCell>
        <TableCell className="font-mono text-xs">{row.event_type}</TableCell>
        <TableCell>
          <Badge variant={row.environment === "live" ? "default" : "outline"}>
            {row.environment}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1">
            <Badge variant={statusVariant(row.status)} className="w-fit">{row.status}</Badge>
            {isError && row.error_message && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex max-w-[280px] items-center gap-1 truncate text-xs text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{row.error_message}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">{row.error_message}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">{row.stripe_event_id}</TableCell>
        <TableCell className="text-right">
          <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <CopyButton value={row.stripe_event_id} label="event_id" />
            {requestId && <CopyButton value={requestId} label="request_id" />}
            {traceId && traceId !== requestId && <CopyButton value={traceId} label="trace_id" />}
            {isError && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={reprocessing}
                    onClick={onReprocess}
                  >
                    <RotateCcw className={`mr-1 h-3.5 w-3.5 ${reprocessing ? "animate-spin" : ""}`} />
                    Reprocessar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Replay best-effort a partir do payload_summary</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30">
            {row.error_message && (
              <p className="mb-2 flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span><span className="font-medium">Erro:</span> {row.error_message}</span>
              </p>
            )}
            {(requestId || traceId) && (
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {requestId && (<span>request_id: <code className="font-mono">{requestId}</code></span>)}
                {traceId && (<span>trace_id: <code className="font-mono">{traceId}</code></span>)}
              </div>
            )}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">payload_summary</span>
              <Button size="sm" variant="outline" onClick={copyPayload}>
                {copiedPayload ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                {copiedPayload ? "Copiado" : "Copiar JSON"}
              </Button>
            </div>
            <pre className="max-h-96 overflow-auto rounded border bg-background p-3 text-xs leading-relaxed">
              {jsonText}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ------------------------- Export helpers -------------------------

type CsvRow = StripeWebhookEventRow & {
  request_id: string | null;
  trace_id: string | null;
};

const CSV_COLUMNS: (keyof CsvRow)[] = [
  "received_at", "processed_at", "environment", "event_type", "status",
  "stripe_event_id", "request_id", "trace_id", "error_message",
  "payload_summary", "id",
];

function pickStr(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function enrichRow(r: StripeWebhookEventRow): CsvRow {
  return {
    ...r,
    request_id: pickStr(r.payload_summary, "request_id"),
    trace_id: pickStr(r.payload_summary, "trace_id"),
  };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: StripeWebhookEventRow[]): string {
  const enriched = rows.map(enrichRow);
  const header = CSV_COLUMNS.join(",");
  const lines = enriched.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(","));
  return [header, ...lines].join("\n");
}

function buildExportFilename(
  filters: { environment: string; status: string; eventType: string },
  format: "csv" | "json",
): string {
  const parts = [
    "stripe-webhook-events",
    filters.environment !== "all" && filters.environment,
    filters.status !== "all" && filters.status,
    filters.eventType !== "all" && filters.eventType.replace(/[^a-z0-9_.-]+/gi, "_"),
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"),
  ].filter(Boolean);
  return `${parts.join("_")}.${format}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ------------------------- Batch progress panel -------------------------

function BatchProgressPanel({
  pending, summary, onDismiss, onRetryFailures, retryingFailures,
}: {
  pending: boolean;
  summary: BatchReprocessResult | null;
  onDismiss: () => void;
  onRetryFailures?: () => void | Promise<void>;
  retryingFailures?: boolean;
}) {
  const attempted = summary?.attempted ?? 0;
  const succeeded = summary?.succeeded ?? 0;
  const failed = summary?.failed ?? 0;
  const progress = pending ? 0 : attempted === 0 ? 100 : Math.round((succeeded + failed) / attempted * 100);
  const errors = (summary?.results ?? []).filter((r) => !r.ok).slice(0, 5);
  const canRetryFailures = !pending && failed > 0 && !!onRetryFailures;

  return (
    <Card className={pending ? "border-primary/40" : failed > 0 ? "border-destructive/40" : "border-emerald-500/40"}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {pending ? "Reprocessando em lote…" : "Resultado do reprocessamento"}
            </CardTitle>
            <CardDescription>
              {pending
                ? "Isto pode levar alguns segundos por evento. A tabela atualiza automaticamente."
                : attempted === 0
                  ? "Nenhum evento com status=error nos filtros atuais."
                  : `Tentativas: ${attempted} · Sucesso: ${succeeded} · Falhas: ${failed}`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {canRetryFailures && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRetryFailures?.()}
                disabled={retryingFailures}
                title="Reprocessar somente as falhas do último batch"
              >
                <RotateCcw className={`mr-2 h-3.5 w-3.5 ${retryingFailures ? "animate-spin" : ""}`} />
                Retentar falhas ({failed})
              </Button>
            )}
            {!pending && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss} aria-label="Fechar">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pending ? undefined : progress} className={pending ? "animate-pulse" : ""} />
        <div className="flex flex-wrap gap-3 text-xs">
          <Badge variant="outline" className="gap-1"><Activity className="h-3 w-3" /> Tentativas: {attempted}</Badge>
          <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Sucesso: {succeeded}</Badge>
          <Badge variant={failed > 0 ? "destructive" : "secondary"} className="gap-1">
            <XCircle className="h-3 w-3" /> Falhas: {failed}
          </Badge>
        </div>
        {errors.length > 0 && (
          <div className="rounded border bg-muted/30 p-2 text-xs">
            <p className="mb-1 font-medium text-destructive">Primeiras falhas:</p>
            <ul className="space-y-1">
              {errors.map((e) => (
                <li key={e.id} className="truncate">
                  <code className="font-mono text-muted-foreground">{e.stripe_event_id}</code>
                  {" — "}<span className="text-destructive">{e.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ------------------------- Reprocess-log panel -------------------------

const REPROCESS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const REPROCESS_LOG_DEFAULTS = {
  stripeEventId: "",
  actorUserId: "",
  outcome: "all" as "all" | "success" | "error",
  since: "",
  until: "",
  pageSize: 25,
};

type ReprocessLogSortCol = "created_at" | "outcome" | "duration_ms";

function ReprocessLogPanel({
  onOpenEventInEvents,
}: { onOpenEventInEvents: (stripeEventId: string) => void }) {
  const listLog = useServerFn(listReprocessLog);
  const exportLog = useServerFn(exportReprocessLog);
  const reprocessFn = useServerFn(reprocessStripeWebhookEvent);
  const reprocessLogBatchFn = useServerFn(reprocessFromLogFilteredBatch);
  const reprocessByIdsFn = useServerFn(reprocessStripeWebhookEventsByIds);
  const qc = useQueryClient();

  const search = routeApi.useSearch();
  const navigate = useNavigate({ from: ROUTE_ID });

  function patchLogSearch(patch: Partial<SearchState>) {
    navigate({
      to: ROUTE_ID,
      search: (prev: SearchState) => ({ ...prev, ...patch }),
      replace: true,
    });
  }

  const stripeEventId = search.l_sid;
  const actorUserId = search.l_uid;
  const outcome = search.l_oc;
  const since = search.l_since;
  const until = search.l_until;
  const sortBy = search.l_sb;
  const sortDir = search.l_sd;
  const pageSize = search.l_ps;
  const page = search.l_p;

  // Inputs de texto continuam controlados localmente para não spam-atualizar a URL
  const [sidInput, setSidInput] = useState<string>(stripeEventId);
  const [uidInput, setUidInput] = useState<string>(actorUserId);
  useEffect(() => { setSidInput(stripeEventId); }, [stripeEventId]);
  useEffect(() => { setUidInput(actorUserId); }, [actorUserId]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (sidInput !== stripeEventId) patchLogSearch({ l_sid: sidInput, l_p: 0 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidInput]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (uidInput !== actorUserId) patchLogSearch({ l_uid: uidInput, l_p: 0 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uidInput]);

  const setOutcome = (v: LogOutcome) => patchLogSearch({ l_oc: v, l_p: 0 });
  const setSince = (v: string) => patchLogSearch({ l_since: v, l_p: 0 });
  const setUntil = (v: string) => patchLogSearch({ l_until: v, l_p: 0 });
  const setPageSize = (n: number) => patchLogSearch({ l_ps: n, l_p: 0 });
  const setPage = (updater: number | ((p: number) => number)) => {
    const next = typeof updater === "function" ? updater(page) : updater;
    patchLogSearch({ l_p: Math.max(0, next) });
  };

  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<ReprocessLogEntry | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<null | "all" | "errors">(null);
  const [batchSummary, setBatchSummary] = useState<BatchReprocessResult | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [retryingFailures, setRetryingFailures] = useState(false);
  const [batchLimit, setBatchLimit] = useState<number>(50);
  const BATCH_LIMIT_OPTIONS = [50, 100, 500];

  const toIso = (v: string): string | undefined => {
    if (!v) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  };

  const filterPayload = {
    stripe_event_id: stripeEventId.trim() || undefined,
    actor_user_id: actorUserId.trim() || undefined,
    outcome,
    since: toIso(since),
    until: toIso(until),
  };

  const query = useQuery({
    queryKey: ["admin", "stripe-reprocess-log", stripeEventId, actorUserId, outcome, since, until, sortBy, sortDir, page, pageSize],
    queryFn: () =>
      listLog({
        data: { ...filterPayload, sortBy, sortDir, limit: pageSize, offset: page * pageSize },
      }) as Promise<ReprocessLogPage>,
    refetchInterval: (batchPending || retryingFailures) ? 3000 : false,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const filtersDirty =
    stripeEventId !== "" || actorUserId !== "" || outcome !== "all" ||
    since !== "" || until !== "";

  function resetFilters() {
    patchLogSearch({
      l_sid: "", l_uid: "", l_oc: "all", l_since: "", l_until: "",
      l_ps: 25, l_p: 0,
    });
    setSidInput("");
    setUidInput("");
    toast.success("Filtros restaurados");
  }

  function toggleSort(col: LogSortCol) {
    if (sortBy === col) patchLogSearch({ l_sd: sortDir === "asc" ? "desc" : "asc", l_p: 0 });
    else patchLogSearch({ l_sb: col, l_sd: "desc", l_p: 0 });
  }
  // Alias para manter o resto do arquivo funcionando.
  type ReprocessLogSortCol = LogSortCol;


  async function handleExport(format: "csv" | "json") {
    setExporting(format);
    try {
      const data = (await exportLog({ data: filterPayload })) as ReprocessLogEntry[];
      const filename = buildReprocessLogFilename(
        { outcome, stripe_event_id: stripeEventId, actor_user_id: actorUserId },
        format,
      );
      if (format === "csv") {
        downloadBlob(
          new Blob(["\uFEFF" + reprocessLogToCsv(data)], { type: "text/csv;charset=utf-8" }),
          filename,
        );
      } else {
        downloadBlob(
          new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
          filename,
        );
      }
      toast.success(`${format.toUpperCase()} exportado (${data.length} registros)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Falha ao exportar ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  }

  async function runReprocessRow(row: ReprocessLogEntry) {
    setReprocessingId(row.id);
    try {
      const res = (await reprocessFn({ data: { id: row.event_row_id } })) as ReprocessResult;
      toast.success(
        `Reprocessado ${row.stripe_event_id}: ${res.message}${res.is_pro === null ? "" : ` · is_pro=${res.is_pro}`}`,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "stripe-events"] }),
        query.refetch(),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reprocessar");
    } finally {
      setReprocessingId(null);
    }
  }

  async function runBatchFromLog(scope: "all" | "errors") {
    setBatchPending(true);
    setBatchSummary(null);
    try {
      const payload = scope === "errors"
        ? { ...filterPayload, outcome: "error" as const }
        : filterPayload;
      const res = (await reprocessLogBatchFn({
        data: { ...payload, limit: batchLimit },
      })) as BatchReprocessResult;
      setBatchSummary(res);
      if (res.attempted === 0) {
        toast.info("Nenhum evento encontrado para os filtros do log.");
      } else if (res.failed === 0) {
        toast.success(`Lote reprocessado: ${res.succeeded}/${res.attempted} OK`);
      } else {
        toast.warning(`Lote parcial: ${res.succeeded} OK · ${res.failed} falharam de ${res.attempted}`);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "stripe-events"] }),
        query.refetch(),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no reprocessamento em lote");
    } finally {
      setBatchPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Log de Reprocessamento</CardTitle>
            <CardDescription>
              Auditoria de replays manuais em stripe_webhook_reprocess_log.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={resetFilters} disabled={!filtersDirty || batchPending}>
              <X className="mr-2 h-4 w-4" />
              Limpar filtros
            </Button>
            <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching || batchPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Lote:</span>
              <Select
                value={String(batchLimit)}
                onValueChange={(v) => setBatchLimit(Number(v))}
                disabled={batchPending}
              >
                <SelectTrigger className="h-8 w-[84px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BATCH_LIMIT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmBatch("all")}
              disabled={batchPending || total === 0}
            >
              <RotateCcw className={`mr-2 h-4 w-4 ${batchPending ? "animate-spin" : ""}`} />
              Reprocessar filtrados
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmBatch("errors")}
              disabled={batchPending}
              title="Reprocessar apenas eventos com outcome=error dentro dos filtros ativos"
            >
              <AlertCircle className={`mr-2 h-4 w-4 ${batchPending ? "animate-spin" : ""}`} />
              Reprocessar só erros
            </Button>
            <Button size="sm" onClick={() => handleExport("csv")} disabled={exporting !== null || total === 0 || batchPending}>
              <Download className={`mr-2 h-4 w-4 ${exporting === "csv" ? "animate-pulse" : ""}`} />
              Exportar CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleExport("json")} disabled={exporting !== null || total === 0 || batchPending}>
              <FileJson className={`mr-2 h-4 w-4 ${exporting === "json" ? "animate-pulse" : ""}`} />
              Exportar JSON
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">stripe_event_id contém</span>
            <Input value={sidInput} onChange={(e) => setSidInput(e.target.value)} placeholder="evt_…" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Usuário (uuid)</span>
            <Input value={uidInput} onChange={(e) => setUidInput(e.target.value)} placeholder="uuid do admin" />
          </label>
          <FilterSelect
            label="Resultado" value={outcome} onChange={(v) => setOutcome(v as typeof outcome)}
            options={[
              { value: "all", label: "Todos" },
              { value: "success", label: "Sucesso" },
              { value: "error", label: "Erro" },
            ]}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">De</span>
            <Input type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Até</span>
            <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <FilterSelect
            label="Por página" value={String(pageSize)}
            onChange={(v) => setPageSize(Number(v))}
            options={REPROCESS_PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>

        {(batchPending || batchSummary) && (
          <BatchProgressPanel
            pending={batchPending}
            summary={batchSummary}
            onDismiss={() => setBatchSummary(null)}
          />
        )}

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">Falha ao carregar log.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum registro com os filtros atuais.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <ReprocessLogSortableHead label="Quando" col="created_at" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <ReprocessLogSortableHead label="Resultado" col="outcome" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <TableHead>Evento</TableHead>
                <TableHead>Ambiente</TableHead>
                <TableHead>stripe_event_id</TableHead>
                <TableHead>Usuário</TableHead>
                <ReprocessLogSortableHead label="Duração" col="duration_ms" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} className="text-right" />
                <TableHead>Mensagem</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.outcome === "success" ? "default" : "destructive"}>
                      {r.outcome}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.event_type}</TableCell>
                  <TableCell>
                    <Badge variant={r.environment === "live" ? "default" : "outline"}>{r.environment}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => onOpenEventInEvents(r.stripe_event_id)}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      title="Abrir na aba Eventos com filtro aplicado"
                    >
                      {r.stripe_event_id}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.actor_user_id ? r.actor_user_id.slice(0, 8) + "…" : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {r.duration_ms != null ? `${r.duration_ms} ms` : "—"}
                  </TableCell>
                  <TableCell className={r.outcome === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    <span className="line-clamp-2" title={r.message ?? undefined}>{r.message ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <CopyButton value={r.stripe_event_id} label="stripe_event_id" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={reprocessingId === r.id || batchPending}
                            onClick={() => setConfirmRow(r)}
                          >
                            <RotateCcw className={`mr-1 h-3.5 w-3.5 ${reprocessingId === r.id ? "animate-spin" : ""}`} />
                            Reprocessar
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Replay best-effort deste stripe_event_id</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <div>{total.toLocaleString("pt-BR")} registro(s)</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || query.isFetching}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
            </Button>
            <span className="tabular-nums">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || query.isFetching}>
              Próxima <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Confirmação: reprocessar 1 linha */}
      <AlertDialog open={confirmRow !== null} onOpenChange={(o) => { if (!o) setConfirmRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprocessar este evento?</AlertDialogTitle>
            <AlertDialogDescription>
              O replay é best-effort a partir de <code className="font-mono">payload_summary</code>.
              Uma nova entrada de auditoria será gravada.
              {confirmRow && (
                <span className="mt-2 block font-mono text-xs">
                  {confirmRow.stripe_event_id} · {confirmRow.event_type}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const row = confirmRow;
                setConfirmRow(null);
                if (row) void runReprocessRow(row);
              }}
            >
              Reprocessar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação: reprocessar em lote */}
      <AlertDialog open={confirmBatch !== null} onOpenChange={(o) => { if (!o) setConfirmBatch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBatch === "errors"
                ? "Reprocessar somente erros filtrados?"
                : "Reprocessar filtrados em lote?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBatch === "errors" ? (
                <>
                  Serão reprocessados até <strong>{batchLimit}</strong> eventos distintos com{" "}
                  <code className="font-mono">outcome=error</code> dentro dos filtros ativos do log
                  (stripe_event_id, usuário, intervalo). Cada replay é best-effort e gera auditoria.
                </>
              ) : (
                <>
                  Serão reprocessados até <strong>{Math.min(batchLimit, total)}</strong> de{" "}
                  <strong>{total.toLocaleString("pt-BR")}</strong> registro(s) correspondentes aos filtros
                  atuais do log (stripe_event_id, usuário, resultado, intervalo). Cada replay é best-effort
                  e gera auditoria.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const scope = confirmBatch ?? "all";
                setConfirmBatch(null);
                void runBatchFromLog(scope);
              }}
            >
              {confirmBatch === "errors" ? "Reprocessar erros" : "Reprocessar em lote"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ReprocessLogSortableHead({
  label, col, sortBy, sortDir, onSort, className,
}: {
  label: string;
  col: ReprocessLogSortCol;
  sortBy: ReprocessLogSortCol;
  sortDir: SortDir;
  onSort: (c: ReprocessLogSortCol) => void;
  className?: string;
}) {
  const active = sortBy === col;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "text-foreground" : "text-muted-foreground/60"}`} />
      </button>
    </TableHead>
  );
}

const REPROCESS_LOG_CSV_COLUMNS: (keyof ReprocessLogEntry)[] = [
  "created_at", "outcome", "environment", "event_type",
  "stripe_event_id", "actor_user_id", "duration_ms", "message",
  "event_row_id", "id",
];

function reprocessLogToCsv(rows: ReprocessLogEntry[]): string {
  const header = REPROCESS_LOG_CSV_COLUMNS.join(",");
  const lines = rows.map((r) => REPROCESS_LOG_CSV_COLUMNS.map((c) => csvEscape(r[c])).join(","));
  return [header, ...lines].join("\n");
}


function buildReprocessLogFilename(
  filters: { outcome: string; stripe_event_id: string; actor_user_id: string },
  format: "csv" | "json",
): string {
  const parts = [
    "stripe-reprocess-log",
    filters.outcome !== "all" && filters.outcome,
    filters.stripe_event_id && filters.stripe_event_id.replace(/[^a-z0-9_.-]+/gi, "_"),
    filters.actor_user_id && filters.actor_user_id.slice(0, 8),
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"),
  ].filter(Boolean);
  return `${parts.join("_")}.${format}`;
}
