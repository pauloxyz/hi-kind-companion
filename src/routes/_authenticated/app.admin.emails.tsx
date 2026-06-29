import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, Bell, RefreshCw, Eye, ShieldAlert, Target, Filter, X, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  listEmailLog,
  listEmailLogTemplates,
  listOpenVisaItems,
  triggerVisaReminderDispatch,
  type DispatchSummary,
  type LogRow,
  type OpenVisaItem,
} from "@/lib/email-admin.functions";
import { detectEmailEnv, envLabel, envBadgeClass } from "@/lib/email/env";

export const Route = createFileRoute("/_authenticated/app/admin/emails")({
  component: Page,
  head: () => ({ meta: [{ title: "E-mails (admin) — V+ USA" }, { name: "robots", content: "noindex" }] }),
});

const TEMPLATES = [
  { value: "visa-reminder", label: "Lembrete do checklist H-2A" },
] as const;

const STATUS_OPTIONS = [
  "sent", "pending", "suppressed", "failed", "bounced", "complained", "dlq",
] as const;

const ALL = "__all__";

const toIsoStart = (date: string) => (date ? new Date(`${date}T00:00:00`).toISOString() : null);
const toIsoEnd = (date: string) => (date ? new Date(`${date}T23:59:59.999`).toISOString() : null);

function Page() {
  const env = detectEmailEnv();

  // Send-test form state
  const [email, setEmail] = useState("");
  const [tpl, setTpl] = useState<string>("visa-reminder");
  const [days, setDays] = useState<number>(7);
  const [step, setStep] = useState("Entrevista no consulado");
  const [sending, setSending] = useState(false);

  // Dispatcher / execution mode
  const [dispatching, setDispatching] = useState(false);
  const [dryRun, setDryRun] = useState<boolean>(env !== "production");
  const [lastRun, setLastRun] = useState<{ at: string; data: DispatchSummary } | null>(null);

  // Manual single-item dispatch
  const [openItems, setOpenItems] = useState<OpenVisaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [manualItemId, setManualItemId] = useState<string>("");
  const [manualDays, setManualDays] = useState<string>("auto");
  const [manualBusy, setManualBusy] = useState(false);

  // Log table state + filters
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [templateOptions, setTemplateOptions] = useState<string[]>([]);
  const [fSearch, setFSearch] = useState("");
  const [fTemplate, setFTemplate] = useState<string>(ALL);
  const [fStatus, setFStatus] = useState<string>(ALL);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const listFn = useServerFn(listEmailLog);
  const templatesFn = useServerFn(listEmailLogTemplates);
  const dispatchFn = useServerFn(triggerVisaReminderDispatch);
  const itemsFn = useServerFn(listOpenVisaItems);

  async function refresh() {
    setLoadingLogs(true);
    try {
      const rows = await listFn({
        data: {
          limit: 200,
          template: fTemplate === ALL ? null : fTemplate,
          status: fStatus === ALL ? null : fStatus,
          search: fSearch || null,
          from: toIsoStart(fFrom),
          to: toIsoEnd(fTo),
        },
      });
      setLogs(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar logs");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function reloadOpenItems() {
    setLoadingItems(true);
    try {
      setOpenItems(await itemsFn({ data: { limit: 100 } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar etapas");
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
      try {
        setTemplateOptions(await templatesFn({ data: undefined }));
      } catch { /* non-blocking */ }
      void refresh();
      void reloadOpenItems();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearFilters() {
    setFSearch(""); setFTemplate(ALL); setFStatus(ALL); setFFrom(""); setFTo("");
    setTimeout(() => void refresh(), 0);
  }

  const totals = useMemo(() => {
    const t = { total: logs.length, sent: 0, failed: 0, suppressed: 0, pending: 0 };
    for (const r of logs) {
      if (r.status === "sent") t.sent += 1;
      else if (r.status === "suppressed") t.suppressed += 1;
      else if (r.status === "pending") t.pending += 1;
      else if (r.status && ["failed", "dlq", "bounced", "complained"].includes(r.status)) t.failed += 1;
    }
    return t;
  }, [logs]);

  async function handleSend() {
    if (!email) { toast.error("Informe um e-mail destinatário"); return; }
    if (env === "production" && !dryRun) {
      const ok = window.confirm(`Você está em PRODUÇÃO e o modo de teste está DESLIGADO. Enviar e-mail real para ${email}?`);
      if (!ok) return;
    }
    setSending(true);
    try {
      if (dryRun) {
        toast.success(`Modo teste ligado — nada foi enviado para ${email}.`);
        return;
      }
      const payload = tpl === "visa-reminder"
        ? {
            recipientName: "Teste",
            stepLabel: step,
            daysUntil: days,
            dueDate: new Date(Date.now() + days * 86400000).toLocaleDateString("pt-BR"),
            checklistUrl: `${window.location.origin}/app/visto`,
          }
        : {};
      const res = await sendTransactionalEmail({
        templateName: tpl,
        recipientEmail: email,
        idempotencyKey: `test-${tpl}-${Date.now()}`,
        templateData: payload,
      });
      toast.success(`E-mail enfileirado para ${email}${res.messageId ? ` (${res.messageId.slice(0, 8)}…)` : ""}.`);
      setTimeout(() => void refresh(), 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setSending(false);
    }
  }

  async function handleDispatch() {
    if (env === "production" && !dryRun) {
      const ok = window.confirm("Você está em PRODUÇÃO e o modo de teste está DESLIGADO. Rodar o dispatcher real agora?");
      if (!ok) return;
    }
    setDispatching(true);
    try {
      const res = await dispatchFn({ data: { dryRun } });
      setLastRun({ at: new Date().toISOString(), data: res });
      toast.success(
        res.dry_run
          ? "Dry-run executado — nada foi enfileirado. Veja o resumo abaixo."
          : "Dispatcher executado. Veja o resumo abaixo.",
      );
      setTimeout(() => void refresh(), 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no dispatcher");
    } finally {
      setDispatching(false);
    }
  }

  async function handleManualDispatch() {
    if (!manualItemId) { toast.error("Selecione uma etapa."); return; }
    if (env === "production" && !dryRun) {
      const ok = window.confirm("Disparar lembrete real para essa etapa em PRODUÇÃO?");
      if (!ok) return;
    }
    setManualBusy(true);
    try {
      const res = await dispatchFn({
        data: {
          dryRun,
          itemId: manualItemId,
          days: manualDays === "auto" ? undefined : Number(manualDays),
        },
      });
      setLastRun({ at: new Date().toISOString(), data: res });
      toast.success(res.dry_run ? "Dry-run da etapa concluído." : "Lembrete enfileirado para a etapa.");
      setTimeout(() => void refresh(), 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no envio manual");
    } finally {
      setManualBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">E-mails (admin)</h1>
          <p className="text-sm text-muted-foreground">
            Teste templates e dispare manualmente o lembrete do checklist antes
            de confiar no cron de produção.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={envBadgeClass[env]}>Ambiente: {envLabel[env]}</Badge>
          <Link to="/app/admin/emails/preview">
            <Button variant="outline" size="sm"><Eye className="mr-2 h-4 w-4" /> Preview dos lembretes</Button>
          </Link>
        </div>
      </header>

      <Card className={env === "production" && !dryRun ? "border-destructive" : "border-warning/50"}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className={`h-5 w-5 mt-0.5 ${dryRun ? "text-warning" : "text-destructive"}`} />
            <div>
              <p className="font-semibold text-sm">
                Modo de execução: {dryRun ? "TESTE (dry-run)" : "ENVIO REAL"}
              </p>
              <p className="text-xs text-muted-foreground">
                {dryRun
                  ? "Nada será enviado: o envio teste e o dispatcher só simulam e retornam o resumo."
                  : env === "production"
                    ? "Cuidado — você está em produção. E-mails sairão de verdade para os destinatários."
                    : "E-mails serão enfileirados no ambiente de preview (cron real do Lovable Cloud)."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="dryrun" className="text-sm">Modo teste</Label>
            <Switch id="dryrun" checked={dryRun} onCheckedChange={setDryRun} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Enviar e-mail de teste
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="tpl">Template</Label>
              <Select value={tpl} onValueChange={setTpl}>
                <SelectTrigger id="tpl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Destinatário</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {tpl === "visa-reminder" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="step">Etapa</Label>
                  <Input id="step" value={step} onChange={(e) => setStep(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="days">Dias até vencer</Label>
                  <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                    <SelectTrigger id="days"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="14">14 dias (azul)</SelectItem>
                      <SelectItem value="7">7 dias (laranja)</SelectItem>
                      <SelectItem value="1">1 dia (vermelho — urgente)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <Button onClick={handleSend} disabled={sending} className="w-full">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              {dryRun ? "Simular envio (teste)" : "Enviar de verdade"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" /> Dispatcher do checklist
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Em produção o cron roda a cada hora e enfileira lembretes para
              etapas com prazo em 14, 7 ou 1 dia. Você pode acionar agora para validar.
            </p>
            <Button onClick={handleDispatch} disabled={dispatching} variant="secondary" className="w-full">
              {dispatching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
              {dryRun ? "Rodar dispatcher (dry-run)" : "Rodar dispatcher agora"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Manual single-item card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" /> Disparo manual de uma etapa
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => void reloadOpenItems()} disabled={loadingItems}>
            <RefreshCw className={`h-4 w-4 ${loadingItems ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[2fr_1fr_auto] items-end">
          <div className="space-y-1">
            <Label>Etapa em aberto (com prazo)</Label>
            <Select value={manualItemId} onValueChange={setManualItemId}>
              <SelectTrigger><SelectValue placeholder={openItems.length ? "Selecione uma etapa" : "Nenhuma etapa em aberto"} /></SelectTrigger>
              <SelectContent>
                {openItems.map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    {it.owner_email ?? it.owner_id.slice(0, 6)} · {it.step_label} ·{" "}
                    {it.days_until}d ({new Date(it.due_at).toLocaleDateString("pt-BR")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Forçar variante</Label>
            <Select value={manualDays} onValueChange={setManualDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (pelo prazo)</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="1">1 dia (urgente)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleManualDispatch} disabled={manualBusy || !manualItemId}>
            {manualBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}
            {dryRun ? "Simular esta etapa" : "Disparar esta etapa"}
          </Button>
        </CardContent>
      </Card>

      {/* Last run summary */}
      {lastRun && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Última execução do dispatcher
              <Badge variant={lastRun.data.dry_run ? "secondary" : "destructive"}>
                {lastRun.data.dry_run ? "dry-run" : "envio real"}
              </Badge>
              {lastRun.data.mode && (
                <Badge variant="outline">{lastRun.data.mode === "manual" ? "manual" : "agendado"}</Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {new Date(lastRun.at).toLocaleString("pt-BR")}
            </p>
          </CardHeader>
          <CardContent>
            {lastRun.data.summary.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma etapa correspondeu aos critérios.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {lastRun.data.summary.map((s) => (
                  <div key={s.offset} className="rounded-lg border p-3 space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {s.offset} dia{s.offset === 1 ? "" : "s"} antes
                    </div>
                    <div className="text-2xl font-bold">{s.matched}</div>
                    <div className="text-xs text-muted-foreground">etapas encontradas</div>
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                      <div>
                        <div className="font-semibold text-success">{s.enqueued}</div>
                        <div className="text-muted-foreground">{lastRun.data.dry_run ? "seriam enviados" : "enfileirados"}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-warning">{s.skipped}</div>
                        <div className="text-muted-foreground">suprimidos / duplicados</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters + table */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" /> Envios
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loadingLogs}>
              <RefreshCw className={`h-4 w-4 ${loadingLogs ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="fsearch">Buscar destinatário</Label>
              <Input
                id="fsearch"
                placeholder="email@..."
                value={fSearch}
                onChange={(e) => setFSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void refresh(); }}
              />
            </div>
            <div className="space-y-1">
              <Label>Template</Label>
              <Select value={fTemplate} onValueChange={setFTemplate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {templateOptions.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ffrom">De</Label>
              <Input id="ffrom" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fto">Até</Label>
              <Input id="fto" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
            <div className="md:col-span-5 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void refresh()} disabled={loadingLogs}>
                <Filter className="mr-2 h-4 w-4" /> Aplicar filtros
              </Button>
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" /> Limpar
              </Button>
              <div className="ml-auto flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Total {totals.total}</Badge>
                <Badge className="bg-success text-success-foreground">{totals.sent} enviados</Badge>
                <Badge className="bg-slate-500 text-white">{totals.pending} pendentes</Badge>
                <Badge className="bg-warning text-warning-foreground">{totals.suppressed} suprimidos</Badge>
                <Badge className="bg-destructive text-destructive-foreground">{totals.failed} falhas</Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3">Quando</th>
                  <th className="py-2 pr-3">Template</th>
                  <th className="py-2 pr-3">Destinatário</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Erro</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                    <td className="py-2 pr-3">{r.template_name ?? "—"}</td>
                    <td className="py-2 pr-3">{r.recipient_email ?? "—"}</td>
                    <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                    <td className="py-2 text-xs text-muted-foreground max-w-[260px] truncate" title={r.error_message ?? undefined}>
                      {r.error_message ?? ""}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && !loadingLogs && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum envio com esses filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "—";
  const color =
    s === "sent" ? "bg-success" :
    s === "pending" ? "bg-slate-500" :
    s === "suppressed" ? "bg-warning" :
    s === "bounced" || s === "complained" || s === "dlq" || s === "failed" ? "bg-destructive" :
    "bg-muted text-foreground";
  return <Badge className={color}>{s}</Badge>;
}
