import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requireAdminAccess } from "@/lib/admin-guard.functions";
import {
  exportStripeWebhookEvents,
  getStripeWebhookEventStats,
  listReprocessLog,
  listStripeWebhookEvents,
  listStripeWebhookEventTypes,
  reprocessStripeWebhookEvent,
  reprocessStripeWebhookEventsBatch,
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
  Activity, AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Check,
  ChevronDown, ChevronLeft, ChevronRight, Circle, Clock, Copy, Download, FileJson,
  RefreshCw, RotateCcw, Search, X, XCircle,
} from "lucide-react";
import { toast } from "sonner";

type EnvFilter = "all" | "sandbox" | "live";
type StatusFilter = "all" | "processed" | "ignored" | "error";
type SortCol = "received_at" | "processed_at" | "event_type" | "status";
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const Route = createFileRoute("/_authenticated/admin/stripe-events")({
  beforeLoad: async () => {
    try {
      await requireAdminAccess({ data: { route: "admin/stripe-events" } });
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminStripeEventsPage,
});

function AdminStripeEventsPage() {
  const list = useServerFn(listStripeWebhookEvents);
  const listTypes = useServerFn(listStripeWebhookEventTypes);
  const exportFn = useServerFn(exportStripeWebhookEvents);
  const statsFn = useServerFn(getStripeWebhookEventStats);
  const reprocessFn = useServerFn(reprocessStripeWebhookEvent);
  const reprocessBatchFn = useServerFn(reprocessStripeWebhookEventsBatch);
  const qc = useQueryClient();

  const [environment, setEnvironment] = useState<EnvFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>(""); // debounced
  const [errorMessageInput, setErrorMessageInput] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>(""); // debounced
  const [sortBy, setSortBy] = useState<SortCol>("received_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchReprocessResult | null>(null);
  const [tab, setTab] = useState<"events" | "reprocess-log">("events");

  // Debounce das buscas (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => {
    const t = setTimeout(() => setErrorMessage(errorMessageInput.trim()), 300);
    return () => clearTimeout(t);
  }, [errorMessageInput]);

  useEffect(() => {
    setPage(0);
  }, [environment, status, eventType, search, errorMessage, pageSize]);

  const filterPayload = {
    environment,
    status,
    eventType: eventType === "all" ? undefined : eventType,
    search: search || undefined,
    errorMessage: errorMessage || undefined,
  };

  const typesQuery = useQuery({
    queryKey: ["admin", "stripe-events", "types"],
    queryFn: () => listTypes() as Promise<string[]>,
  });

  const statsQuery = useQuery({
    queryKey: ["admin", "stripe-events", "stats", environment, status, eventType, search, errorMessage],
    queryFn: () => statsFn({ data: filterPayload }) as Promise<StripeWebhookEventStats>,
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const eventsQuery = useQuery({
    queryKey: ["admin", "stripe-events", environment, status, eventType, search, errorMessage, sortBy, sortDir, page, pageSize],
    queryFn: () =>
      list({
        data: { ...filterPayload, sortBy, sortDir, limit: pageSize, offset: page * pageSize },
      }) as Promise<StripeWebhookEventsPage>,
    refetchInterval: autoRefresh ? 5000 : false,
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
        {(batchMut.isPending || batchSummary) && (
          <BatchProgressPanel
            pending={batchMut.isPending}
            summary={batchSummary}
            onDismiss={() => setBatchSummary(null)}
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
            <ReprocessLogPanel />
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
  pending, summary, onDismiss,
}: {
  pending: boolean;
  summary: BatchReprocessResult | null;
  onDismiss: () => void;
}) {
  const attempted = summary?.attempted ?? 0;
  const succeeded = summary?.succeeded ?? 0;
  const failed = summary?.failed ?? 0;
  const progress = pending ? 0 : attempted === 0 ? 100 : Math.round((succeeded + failed) / attempted * 100);
  const errors = (summary?.results ?? []).filter((r) => !r.ok).slice(0, 5);

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
                ? "Isto pode levar alguns segundos por evento."
                : attempted === 0
                  ? "Nenhum evento com status=error nos filtros atuais."
                  : `Tentativas: ${attempted} · Sucesso: ${succeeded} · Falhas: ${failed}`}
            </CardDescription>
          </div>
          {!pending && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss} aria-label="Fechar">
              <X className="h-4 w-4" />
            </Button>
          )}
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

function ReprocessLogPanel() {
  const listLog = useServerFn(listReprocessLog);

  const [stripeEventId, setStripeEventId] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [outcome, setOutcome] = useState<"all" | "success" | "error">("all");
  const [since, setSince] = useState<string>("");
  const [until, setUntil] = useState<string>("");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(0);

  useEffect(() => {
    setPage(0);
  }, [stripeEventId, actorUserId, outcome, since, until, pageSize]);

  const toIso = (v: string): string | undefined => {
    if (!v) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  };

  const query = useQuery({
    queryKey: ["admin", "stripe-reprocess-log", stripeEventId, actorUserId, outcome, since, until, page, pageSize],
    queryFn: () =>
      listLog({
        data: {
          stripe_event_id: stripeEventId.trim() || undefined,
          actor_user_id: actorUserId.trim() || undefined,
          outcome,
          since: toIso(since),
          until: toIso(until),
          limit: pageSize,
          offset: page * pageSize,
        },
      }) as Promise<ReprocessLogPage>,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Log de Reprocessamento</CardTitle>
            <CardDescription>
              Auditoria de replays manuais em stripe_webhook_reprocess_log.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">stripe_event_id contém</span>
            <Input value={stripeEventId} onChange={(e) => setStripeEventId(e.target.value)} placeholder="evt_…" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Usuário (uuid)</span>
            <Input value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} placeholder="uuid do admin" />
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
                <TableHead>Quando</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Ambiente</TableHead>
                <TableHead>stripe_event_id</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead className="text-right">Duração</TableHead>
                <TableHead>Mensagem</TableHead>
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
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.stripe_event_id}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.actor_user_id ? r.actor_user_id.slice(0, 8) + "…" : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {r.duration_ms != null ? `${r.duration_ms} ms` : "—"}
                  </TableCell>
                  <TableCell className={r.outcome === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    <span className="line-clamp-2" title={r.message ?? undefined}>{r.message ?? "—"}</span>
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
    </Card>
  );
}
