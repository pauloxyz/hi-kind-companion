import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requireAdminAccess } from "@/lib/admin-guard.functions";
import {
  exportStripeWebhookEvents,
  getStripeWebhookEventStats,
  listStripeWebhookEvents,
  listStripeWebhookEventTypes,
  reprocessStripeWebhookEvent,
  reprocessStripeWebhookEventsBatch,
  type StripeWebhookEventRow,
  type StripeWebhookEventStats,
  type StripeWebhookEventsPage,
  type ReprocessResult,
  type BatchReprocessResult,
} from "@/lib/stripe-webhook-events.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  ChevronDown, ChevronLeft, ChevronRight, Circle, Clock, Copy, Download, RefreshCw,
  RotateCcw, Search, XCircle,
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
  const [sortBy, setSortBy] = useState<SortCol>("received_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  // Debounce da busca (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [environment, status, eventType, search, pageSize]);

  const filterPayload = { environment, status, eventType: eventType === "all" ? undefined : eventType, search: search || undefined };

  const typesQuery = useQuery({
    queryKey: ["admin", "stripe-events", "types"],
    queryFn: () => listTypes() as Promise<string[]>,
  });

  const statsQuery = useQuery({
    queryKey: ["admin", "stripe-events", "stats", environment, status, eventType, search],
    queryFn: () => statsFn({ data: filterPayload }) as Promise<StripeWebhookEventStats>,
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const eventsQuery = useQuery({
    queryKey: ["admin", "stripe-events", environment, status, eventType, search, sortBy, sortDir, page, pageSize],
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
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao reprocessar"),
  });

  const batchMut = useMutation({
    mutationFn: () =>
      reprocessBatchFn({
        data: { ...filterPayload, limit: 100 },
      }) as Promise<BatchReprocessResult>,
    onSuccess: async (res) => {
      if (res.attempted === 0) {
        toast.info("Nenhum evento com status=error nos filtros atuais.");
      } else if (res.failed === 0) {
        toast.success(`Lote reprocessado: ${res.succeeded}/${res.attempted} OK`);
      } else {
        toast.warning(
          `Lote parcial: ${res.succeeded} OK · ${res.failed} falharam de ${res.attempted}`,
        );
      }
      await qc.invalidateQueries({ queryKey: ["admin", "stripe-events"] });
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

  async function handleExport() {
    setExporting(true);
    try {
      const data = (await exportFn({
        data: { ...filterPayload, sortBy, sortDir },
      })) as StripeWebhookEventRow[];
      downloadCsv(data, buildCsvFilename({ environment, status, eventType }));
      toast.success(`CSV exportado (${data.length} registros)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar CSV");
    } finally {
      setExporting(false);
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
              <Button size="sm" onClick={handleExport} disabled={exporting || total === 0}>
                <Download className={`mr-2 h-4 w-4 ${exporting ? "animate-pulse" : ""}`} />
                Exportar CSV
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

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>
              {total.toLocaleString("pt-BR")} registros no total · página {page + 1} de {totalPages}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por event_id, customer, subscription, user_id ou object_id…"
                className="pl-9"
              />
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
      </div>
    </TooltipProvider>
  );
}

function MetricCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "ok" | "danger" | "muted" }) {
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

/** Extrai um request/trace id do payload_summary se existir em chaves comuns. */
function extractRequestId(summary: unknown): string | null {
  if (!summary || typeof summary !== "object") return null;
  const s = summary as Record<string, unknown>;
  const direct = s.request_id ?? s.trace_id;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const req = s.request;
  if (req && typeof req === "object") {
    const id = (req as Record<string, unknown>).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
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
        <TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">{row.stripe_event_id}</TableCell>
        <TableCell className="text-right">
          <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <CopyButton value={row.stripe_event_id} label="event_id" />
            {requestId && <CopyButton value={requestId} label="request_id" />}
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
            {requestId && (
              <p className="mb-2 text-xs text-muted-foreground">
                request_id: <code className="font-mono">{requestId}</code>
              </p>
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

// ------------------------- CSV helpers -------------------------

const CSV_COLUMNS: (keyof StripeWebhookEventRow)[] = [
  "received_at", "processed_at", "environment", "event_type", "status",
  "stripe_event_id", "error_message", "payload_summary", "id",
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: StripeWebhookEventRow[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(","));
  return [header, ...lines].join("\n");
}

function buildCsvFilename(filters: { environment: string; status: string; eventType: string }): string {
  const parts = [
    "stripe-webhook-events",
    filters.environment !== "all" && filters.environment,
    filters.status !== "all" && filters.status,
    filters.eventType !== "all" && filters.eventType.replace(/[^a-z0-9_.-]+/gi, "_"),
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"),
  ].filter(Boolean);
  return `${parts.join("_")}.csv`;
}

function downloadCsv(rows: StripeWebhookEventRow[], filename: string) {
  const blob = new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
