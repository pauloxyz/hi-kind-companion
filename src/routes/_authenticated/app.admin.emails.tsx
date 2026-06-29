import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Loader2, Mail, Bell, RefreshCw, Eye, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { sendTransactionalEmail } from "@/lib/email/send";
import { listEmailLog, triggerVisaReminderDispatch, type LogRow } from "@/lib/email-admin.functions";
import { detectEmailEnv, envLabel, envBadgeClass } from "@/lib/email/env";

export const Route = createFileRoute("/_authenticated/app/admin/emails")({
  component: Page,
  head: () => ({ meta: [{ title: "E-mails (admin) — V+ USA" }, { name: "robots", content: "noindex" }] }),
});

const TEMPLATES = [
  { value: "visa-reminder", label: "Lembrete do checklist H-2A" },
] as const;

function Page() {
  const env = detectEmailEnv();
  const [email, setEmail] = useState("");
  const [tpl, setTpl] = useState<string>("visa-reminder");
  const [days, setDays] = useState<number>(7);
  const [step, setStep] = useState("Entrevista no consulado");
  const [sending, setSending] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dryRun, setDryRun] = useState<boolean>(env !== "production");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const listFn = useServerFn(listEmailLog);
  const dispatchFn = useServerFn(triggerVisaReminderDispatch);

  async function refresh() {
    setLoadingLogs(true);
    try {
      const rows = await listFn({ data: { limit: 50, template: null } });
      setLogs(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar logs");
    } finally {
      setLoadingLogs(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
      void refresh();
    })();
  }, []);

  async function handleSend() {
    if (!email) {
      toast.error("Informe um e-mail destinatário");
      return;
    }
    setSending(true);
    try {
      const payload =
        tpl === "visa-reminder"
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
      toast.success(`E-mail enfileirado${res.messageId ? ` (${res.messageId.slice(0, 8)}…)` : ""}.`);
      setTimeout(() => void refresh(), 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setSending(false);
    }
  }

  async function handleDispatch() {
    setDispatching(true);
    try {
      const res = await dispatchFn({ data: undefined });
      toast.success("Dispatcher executado. Veja os logs.");
      console.log("visa-reminders dispatch", res);
      setTimeout(() => void refresh(), 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no dispatcher");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">E-mails (admin)</h1>
        <p className="text-sm text-muted-foreground">
          Teste templates e dispare manualmente o lembrete do checklist antes
          de confiar no cron de produção.
        </p>
      </header>

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
              Enviar teste
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
              etapas com prazo em 14, 7 ou 1 dia. Você pode acionar agora para
              validar.
            </p>
            <Button onClick={handleDispatch} disabled={dispatching} variant="secondary" className="w-full">
              {dispatching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
              Rodar dispatcher agora
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Últimos envios</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loadingLogs}>
            <RefreshCw className={`h-4 w-4 ${loadingLogs ? "animate-spin" : ""}`} />
          </Button>
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
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum envio ainda.</td></tr>
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
    s === "sent" ? "bg-emerald-600" :
    s === "pending" ? "bg-slate-500" :
    s === "suppressed" ? "bg-amber-500" :
    s === "bounced" || s === "complained" || s === "dlq" || s === "failed" ? "bg-destructive" :
    "bg-muted text-foreground";
  return <Badge className={color}>{s}</Badge>;
}
