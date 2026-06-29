import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireAdminAccess } from "@/lib/admin-guard.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Shield,
  Lock,
  KeyRound,
  Eye,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Check,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { getAuditStats, getDeniedAdminSummary, listAuditEvents, type AuditEvent } from "@/lib/security-admin.functions";
import { ackAlert, listAlertAcks, unackAlert } from "@/lib/security-alerts.functions";
import { listRetentionPolicies, upsertRetentionPolicy, type RetentionPolicy } from "@/lib/security-retention.functions";
import { SecurityAuditPdf } from "@/components/SecurityAuditPdf";
import { UptimePanel } from "@/components/UptimePanel";

const EVENT_TYPES = [
  { v: "", label: "Todos os tipos" },
  { v: "hibp_block", label: "HIBP Block" },
  { v: "weak_password_block", label: "Senha Fraca" },
  { v: "auth_failure", label: "Falha de Auth" },
  { v: "pii_access", label: "Acesso PII" },
  { v: "admin_action", label: "Ação Admin" },
  { v: "settings_viewed", label: "Configurações abertas" },
  { v: "password_changed", label: "Senha alterada" },
  { v: "email_change_requested", label: "Email alterado" },
  { v: "account_deletion_requested", label: "Exclusão de conta" },
  { v: "language_changed", label: "Idioma alterado" },
  { v: "theme_changed", label: "Tema alterado" },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

type SortKey = "created_at" | "event_type" | "ip_address" | "resource";
type SortDir = "asc" | "desc";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function eventsToCsv(rows: AuditEvent[]): string {
  const head = ["created_at", "event_type", "user_id", "ip_address", "resource", "email_hash", "user_agent", "metadata"];
  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push(
      [r.created_at, r.event_type, r.user_id, r.ip_address, r.resource, r.email_hash, r.user_agent, r.metadata]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n");
}

function alertKey(a: { hour: string; ip_address: string | null }): string {
  return `${a.hour}|${a.ip_address ?? ""}`;
}

export const Route = createFileRoute("/_authenticated/app/auditoria")({
  beforeLoad: async () => {
    try {
      await requireAdminAccess();
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  component: AuditPanel,
});

function sevVariant(lvl: string): "default" | "destructive" | "secondary" {
  if (lvl === "high") return "destructive";
  if (lvl === "medium") return "default";
  return "secondary";
}

function AuditPanel() {
  const fetchStats = useServerFn(getAuditStats);
  const fetchEvents = useServerFn(listAuditEvents);
  const fetchAcks = useServerFn(listAlertAcks);
  const ackFn = useServerFn(ackAlert);
  const unackFn = useServerFn(unackAlert);
  const queryClient = useQueryClient();
  const { t: tr } = useI18n();
  const [filter, setFilter] = useState<string>("");
  const [sinceDays, setSinceDays] = useState<number>(30);
  const [search, setSearch] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [hideAcked, setHideAcked] = useState(true);
  const [ackTarget, setAckTarget] = useState<{ hour: string; ip_address: string | null; risk_level: string } | null>(null);
  const [ackNote, setAckNote] = useState("");

  const stats = useQuery({
    queryKey: ["audit-stats"],
    queryFn: () => fetchStats(),
  });
  const events = useQuery({
    queryKey: ["audit-events", filter, sinceDays],
    queryFn: () =>
      fetchEvents({ data: { event_type: filter || undefined, limit: 500, since_days: sinceDays } }),
  });
  const acksQuery = useQuery({
    queryKey: ["audit-alert-acks"],
    queryFn: () => fetchAcks(),
  });
  const acksByKey = useMemo(() => {
    const m: Record<string, { note: string | null; acked_at: string }> = {};
    for (const r of acksQuery.data ?? []) m[r.alert_key] = { note: r.note, acked_at: r.acked_at };
    return m;
  }, [acksQuery.data]);

  const ackMutation = useMutation({
    mutationFn: (input: {
      alert_key: string;
      hour: string;
      ip_address: string | null;
      risk_level: string;
      note?: string;
    }) => ackFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-alert-acks"] });
      queryClient.invalidateQueries({ queryKey: ["audit-events"] });
      toast.success("Alerta tratado");
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao tratar alerta"),
  });
  const unackMutation = useMutation({
    mutationFn: (alert_key: string) => unackFn({ data: { alert_key } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-alert-acks"] });
      toast.success("Alerta reaberto");
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao reabrir"),
  });

  // Reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [filter, sinceDays, search, pageSize, sortKey, sortDir]);

  const filteredEvents = useMemo(() => {
    const all = events.data ?? [];
    const q = search.trim().toLowerCase();
    const matched = !q
      ? all
      : all.filter((e) =>
          [e.event_type, e.ip_address, e.resource, e.email_hash, e.user_id, JSON.stringify(e.metadata)]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        );
    const sorted = [...matched].sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [events.data, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredEvents.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredEvents, currentPage, pageSize],
  );

  if (stats.error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Acesso negado. Apenas administradores podem ver a auditoria.
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleExport = async () => {
    if (!stats.data || !events.data) return;
    setExporting(true);
    try {
      const blob = await pdf(<SecurityAuditPdf stats={stats.data} events={events.data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório PDF gerado");
    } catch (e) {
      toast.error("Falha ao gerar PDF");
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = () => {
    const rows = filteredEvents;
    if (!rows.length) {
      toast.error("Nenhum evento para exportar");
      return;
    }
    const csv = eventsToCsv(rows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-eventos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV gerado (${rows.length} eventos)`);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortHead = ({ k, children }: { k: SortKey; children: React.ReactNode }) => {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead>
        <button
          onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {children}
          <Icon className="size-3" />
        </button>
      </TableHead>
    );
  };

  const t = stats.data?.totals;
  const allAlerts = stats.data?.risk_alerts ?? [];
  const visibleAlerts = hideAcked ? allAlerts.filter((a) => !acksByKey[alertKey(a)]) : allAlerts;
  const highAlerts = visibleAlerts.filter((a) => a.risk_level === "high");
  const ackedHiddenCount = hideAcked
    ? allAlerts.filter((a) => acksByKey[alertKey(a)]).length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="size-6" aria-hidden="true" /> {tr("audit_title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr("audit_window")}: {sinceDays} {tr("audit_days")} · {tr("audit_retention")}: 180 {tr("audit_days")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={!filteredEvents.length}
            aria-label={tr("audit_export_csv")}
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" /> {tr("audit_export_csv")}
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || !stats.data}
            aria-label={tr("audit_export_pdf")}
          >
            <Download className="size-4" aria-hidden="true" />{" "}
            {exporting ? tr("audit_generating") : tr("audit_export_pdf")}
          </Button>
        </div>
      </div>

      {highAlerts.length > 0 && (
        <Card className="border-destructive bg-destructive/5" role="alert">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm">
              <p className="font-semibold text-destructive">
                {highAlerts.length} alerta(s) de risco ALTO não tratado(s) nas últimas 24h
              </p>
              <p className="text-muted-foreground">
                Possível tentativa de força bruta ou ataque automatizado. Investigue e marque como tratado abaixo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <UptimePanel />

      <DeniedAdminCard sinceDays={sinceDays} />


      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={<Lock className="size-4" aria-hidden="true" />} label={tr("audit_kpi_hibp")} value={t?.hibp ?? 0} />
        <Kpi icon={<KeyRound className="size-4" aria-hidden="true" />} label={tr("audit_kpi_weak")} value={t?.weak ?? 0} />
        <Kpi icon={<AlertTriangle className="size-4" aria-hidden="true" />} label={tr("audit_kpi_auth_fail")} value={t?.auth_fail ?? 0} />
        <Kpi icon={<Eye className="size-4" aria-hidden="true" />} label={tr("audit_kpi_pii")} value={t?.pii ?? 0} />
      </div>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">{tr("audit_tab_alerts")}</TabsTrigger>
          <TabsTrigger value="events">{tr("audit_tab_events")}</TabsTrigger>
          <TabsTrigger value="trend">{tr("audit_tab_trend")}</TabsTrigger>
          <TabsTrigger value="retention">{tr("audit_tab_retention")}</TabsTrigger>
        </TabsList>


        <TabsContent value="alerts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">
                IPs com atividade suspeita (24h) · {visibleAlerts.length}
                {ackedHiddenCount > 0 && (
                  <span className="text-muted-foreground font-normal text-xs ml-2">
                    ({ackedHiddenCount} tratado{ackedHiddenCount === 1 ? "" : "s"} oculto{ackedHiddenCount === 1 ? "" : "s"})
                  </span>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setHideAcked((v) => !v)}>
                {hideAcked ? tr("audit_show_acked") : tr("audit_hide_acked")}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="text-right">Eventos</TableHead>
                    <TableHead className="text-right">Falhas Auth</TableHead>
                    <TableHead className="text-right">HIBP</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Tratado por</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleAlerts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        Nenhum alerta {hideAcked && allAlerts.length > 0 ? "pendente" : ""}
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleAlerts.map((a, i) => {
                    const key = alertKey(a);
                    const ack = acksByKey[key];
                    const acked = !!ack;
                    return (
                      <TableRow key={i} className={acked ? "opacity-60" : undefined}>
                        <TableCell>{new Date(a.hour).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="font-mono text-xs">{a.ip_address ?? "—"}</TableCell>
                        <TableCell className="text-right">{a.total_events}</TableCell>
                        <TableCell className="text-right">{a.auth_failures}</TableCell>
                        <TableCell className="text-right">{a.hibp_blocks}</TableCell>
                        <TableCell>
                          <Badge variant={sevVariant(a.risk_level)}>{a.risk_level.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {ack ? (
                            <div className="space-y-0.5">
                              <div className="text-muted-foreground">
                                {new Date(ack.acked_at).toLocaleString("pt-BR")}
                              </div>
                              {ack.note && (
                                <div className="italic max-w-[220px] truncate" title={ack.note}>
                                  "{ack.note}"
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {acked ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={unackMutation.isPending}
                              onClick={() => unackMutation.mutate(key)}
                              aria-label={tr("audit_reopen")}
                            >
                              <RotateCcw className="size-3.5" aria-hidden="true" /> {tr("audit_reopen")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAckTarget({
                                  hour: a.hour,
                                  ip_address: a.ip_address,
                                  risk_level: a.risk_level,
                                });
                                setAckNote("");
                              }}
                              aria-label={tr("audit_acknowledge")}
                            >
                              <Check className="size-3.5" aria-hidden="true" /> {tr("audit_acknowledge")}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  Eventos · {filteredEvents.length}
                  {events.data && filteredEvents.length !== events.data.length && (
                    <span className="text-muted-foreground font-normal"> de {events.data.length}</span>
                  )}
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="text-sm border rounded px-2 py-1 bg-background"
                  >
                    {EVENT_TYPES.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sinceDays}
                    onChange={(e) => setSinceDays(Number(e.target.value))}
                    className="text-sm border rounded px-2 py-1 bg-background"
                  >
                    <option value={1}>Últimas 24h</option>
                    <option value={7}>7 dias</option>
                    <option value={30}>30 dias</option>
                    <option value={90}>90 dias</option>
                    <option value={180}>180 dias</option>
                  </select>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="text-sm border rounded px-2 py-1 bg-background"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}/página
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="relative">
                <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <label htmlFor="audit-search" className="sr-only">{tr("audit_search_placeholder")}</label>
                <Input
                  id="audit-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tr("audit_search_placeholder")}
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead k="created_at">Data</SortHead>
                    <SortHead k="event_type">Tipo</SortHead>
                    <SortHead k="ip_address">IP</SortHead>
                    <SortHead k="resource">Recurso</SortHead>
                    <TableHead>Metadata</TableHead>
                    <TableHead>Email (hash)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((e) => (
                    <TableRow
                      key={e.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelected(e)}
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{e.event_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.ip_address ?? "—"}</TableCell>
                      <TableCell className="text-xs">{e.resource ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono max-w-[260px] truncate" title={JSON.stringify(e.metadata)}>
                        {e.metadata && Object.keys(e.metadata as object).length > 0 ? JSON.stringify(e.metadata) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.email_hash ? e.email_hash.slice(0, 12) + "…" : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {pageRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        Nenhum evento
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredEvents.length)} de{" "}
                    {filteredEvents.length}
                  </span>
                  <Pagination className="mx-0 w-auto">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(Math.max(1, currentPage - 1));
                          }}
                          aria-disabled={currentPage === 1}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {pageRange(currentPage, totalPages).map((p, idx) =>
                        p === "…" ? (
                          <PaginationItem key={`e-${idx}`}>
                            <span className="px-2 text-muted-foreground">…</span>
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={p}>
                            <PaginationLink
                              isActive={p === currentPage}
                              onClick={(e) => {
                                e.preventDefault();
                                setPage(p);
                              }}
                              className="cursor-pointer"
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        ),
                      )}
                      <PaginationItem>
                        <PaginationNext
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(Math.min(totalPages, currentPage + 1));
                          }}
                          aria-disabled={currentPage === totalPages}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tendência diária</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead className="text-right">HIBP</TableHead>
                    <TableHead className="text-right">Senhas fracas</TableHead>
                    <TableHead className="text-right">Falhas auth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stats.data?.hibp_daily ?? []).map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(d.day).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{d.hibp_blocks}</TableCell>
                      <TableCell className="text-right">{d.weak_blocks}</TableCell>
                      <TableCell className="text-right">{d.auth_failures}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retention">
          <RetentionTab />
        </TabsContent>
      </Tabs>

      <EventDetailsDialog event={selected} onClose={() => setSelected(null)} />

      <Dialog open={!!ackTarget} onOpenChange={(o) => !o && setAckTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tratar alerta de risco</DialogTitle>
            <DialogDescription>
              Adicione uma nota opcional descrevendo a investigação ou a ação tomada.
            </DialogDescription>
          </DialogHeader>
          {ackTarget && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1">
                <span className="text-muted-foreground">Hora</span>
                <span>{new Date(ackTarget.hour).toLocaleString("pt-BR")}</span>
                <span className="text-muted-foreground">IP</span>
                <span className="font-mono text-xs">{ackTarget.ip_address ?? "—"}</span>
                <span className="text-muted-foreground">Risco</span>
                <span>
                  <Badge variant={sevVariant(ackTarget.risk_level)}>
                    {ackTarget.risk_level.toUpperCase()}
                  </Badge>
                </span>
              </div>
              <Textarea
                value={ackNote}
                onChange={(e) => setAckNote(e.target.value)}
                placeholder="Ex.: IP bloqueado no firewall; usuário notificado…"
                maxLength={1000}
                rows={4}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAckTarget(null)}>Cancelar</Button>
            <Button
              disabled={ackMutation.isPending || !ackTarget}
              onClick={() => {
                if (!ackTarget) return;
                ackMutation.mutate(
                  {
                    alert_key: alertKey(ackTarget),
                    hour: ackTarget.hour,
                    ip_address: ackTarget.ip_address,
                    risk_level: ackTarget.risk_level,
                    note: ackNote.trim() || undefined,
                  },
                  { onSuccess: () => setAckTarget(null) },
                );
              }}
            >
              Marcar como tratado
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function pageRange(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | "…"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function EventDetailsDialog({ event, onClose }: { event: AuditEvent | null; onClose: () => void }) {
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success("Copiado"),
      () => toast.error("Falha ao copiar"),
    );
  };
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-4" /> Detalhes do evento
          </DialogTitle>
          <DialogDescription>
            {event && new Date(event.created_at).toLocaleString("pt-BR")}
          </DialogDescription>
        </DialogHeader>
        {event && (
          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm">
            <Field label="Tipo">
              <Badge variant="outline">{event.event_type}</Badge>
            </Field>
            <Field label="ID">
              <code className="text-xs">{event.id}</code>
            </Field>
            <Field label="Usuário">
              <code className="text-xs">{event.user_id ?? "—"}</code>
            </Field>
            <Field label="IP">
              <code className="text-xs">{event.ip_address ?? "—"}</code>
            </Field>
            <Field label="Recurso">
              <span className="text-xs">{event.resource ?? "—"}</span>
            </Field>
            <Field label="Email hash">
              <code className="text-xs break-all">{event.email_hash ?? "—"}</code>
            </Field>
            <Field label="User-Agent">
              <span className="text-xs break-all">{event.user_agent ?? "—"}</span>
            </Field>
            <Field label="Metadata">
              <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-64">
                {JSON.stringify(event.metadata ?? {}, null, 2)}
              </pre>
            </Field>
          </div>
        )}
        <DialogFooter>
          {event && (
            <Button variant="outline" onClick={() => copy(JSON.stringify(event, null, 2))}>
              Copiar JSON
            </Button>
          )}
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function RetentionTab() {
  const fetchPolicies = useServerFn(listRetentionPolicies);
  const upsertFn = useServerFn(upsertRetentionPolicy);
  const queryClient = useQueryClient();
  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["security-retention-policies"],
    queryFn: () => fetchPolicies(),
  });

  const mutation = useMutation({
    mutationFn: (input: { event_type: string; retain_days: number }) => upsertFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["security-retention-policies"] });
      toast.success("Política atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [edits, setEdits] = useState<Record<string, number>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Política de retenção por tipo de evento</CardTitle>
        <CardDescription>
          Define quantos dias cada tipo de evento permanece no log antes do purge automático (rodando diariamente às 03:00). Mínimo 7 dias, máximo 3650 (10 anos).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo de evento</TableHead>
                <TableHead className="text-right">Dias de retenção</TableHead>
                <TableHead>Última atualização</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p: RetentionPolicy) => {
                const pending = edits[p.event_type];
                const current = pending ?? p.retain_days;
                const dirty = pending !== undefined && pending !== p.retain_days;
                return (
                  <TableRow key={p.event_type}>
                    <TableCell>
                      <Badge variant="outline">{p.event_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={7}
                        max={3650}
                        value={current}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [p.event_type]: Number(e.target.value) || 0,
                          }))
                        }
                        className="w-24 ml-auto text-right"
                        aria-label={`Dias de retenção para ${p.event_type}`}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.updated_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={dirty ? "default" : "ghost"}
                        disabled={!dirty || mutation.isPending || current < 7 || current > 3650}
                        onClick={() =>
                          mutation.mutate(
                            { event_type: p.event_type, retain_days: current },
                            {
                              onSuccess: () =>
                                setEdits((prev) => {
                                  const n = { ...prev };
                                  delete n[p.event_type];
                                  return n;
                                }),
                            },
                          )
                        }
                      >
                        Salvar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DeniedAdminCard({ sinceDays }: { sinceDays: number }) {
  const fetchDenied = useServerFn(getDeniedAdminSummary);
  const q = useQuery({
    queryKey: ["admin-denied-summary", sinceDays],
    queryFn: () => fetchDenied({ data: { since_days: sinceDays } }),
  });
  const data = q.data;
  const peak = useMemo(() => {
    if (!data?.daily?.length) return 0;
    return data.daily.reduce((m, d) => (d.count > m ? d.count : m), 0);
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" aria-hidden="true" /> Tentativas de acesso admin negadas
        </CardTitle>
        <CardDescription>
          Total nos últimos {sinceDays} dias: <strong>{data?.total ?? 0}</strong>
          {data?.total ? <> · pico diário: <strong>{peak}</strong></> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">Falha ao carregar resumo.</p>
        ) : !data?.total ? (
          <p className="text-sm text-muted-foreground">Nenhuma tentativa negada no período. 🎉</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Por rota / endpoint
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recurso</TableHead>
                    <TableHead className="text-right">Bloqueios</TableHead>
                    <TableHead>Último</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_route.map((r) => (
                    <TableRow key={r.route}>
                      <TableCell className="font-mono text-xs">{r.route}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.last_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Por usuário
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead className="text-right">Bloqueios</TableHead>
                    <TableHead>Último</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_user.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-mono text-xs">{u.user_id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-right">{u.count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.last_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

