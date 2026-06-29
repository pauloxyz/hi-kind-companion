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
import { Loader2, ArrowLeft, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import {
  renderVisaReminderPreviews,
  type VisaReminderPreview,
} from "@/lib/email-admin.functions";
import { sendTransactionalEmail } from "@/lib/email/send";
import { detectEmailEnv, envLabel, envBadgeClass } from "@/lib/email/env";

export const Route = createFileRoute("/_authenticated/app/admin/emails/preview")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Preview de lembretes — V+ USA" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const TONE: Record<number, string> = {
  14: "bg-sky-600",
  7: "bg-warning",
  1: "bg-destructive",
};

function Page() {
  const env = detectEmailEnv();
  const [recipientName, setRecipientName] = useState("João");
  const [stepLabel, setStepLabel] = useState("Entrevista no consulado");
  const [testRecipient, setTestRecipient] = useState("");
  const [dryRun, setDryRun] = useState(env !== "production");
  const [loading, setLoading] = useState(false);
  const [sendingDays, setSendingDays] = useState<number | null>(null);
  const [previews, setPreviews] = useState<VisaReminderPreview[]>([]);
  const renderFn = useServerFn(renderVisaReminderPreviews);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await renderFn({
        data: { recipientName, stepLabel },
      });
      setPreviews(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao renderizar preview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setTestRecipient(user.email);
      void refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendVariant(days: number) {
    if (!testRecipient) {
      toast.error("Informe o destinatário de teste.");
      return;
    }
    if (dryRun) {
      toast.success(`Modo teste ligado — nada foi enviado para ${testRecipient}.`);
      return;
    }
    if (env === "production") {
      const ok = window.confirm(
        `Enviar preview de ${days} dia(s) de verdade para ${testRecipient}?`,
      );
      if (!ok) return;
    }
    setSendingDays(days);
    try {
      const dueDate = new Date(Date.now() + days * 86400000).toLocaleDateString("pt-BR");
      const res = await sendTransactionalEmail({
        templateName: "visa-reminder",
        recipientEmail: testRecipient,
        idempotencyKey: `preview-${days}-${Date.now()}`,
        templateData: {
          recipientName,
          stepLabel,
          daysUntil: days,
          dueDate,
          checklistUrl: `${window.location.origin}/app/visto`,
        },
      });
      toast.success(`Preview ${days}d enfileirado para ${testRecipient}${res.messageId ? ` (${res.messageId.slice(0, 8)}…)` : ""}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setSendingDays(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link to="/app/admin/emails" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </Link>
          </div>
          <h1 className="text-2xl font-bold mt-1">Preview dos lembretes H-2A</h1>
          <p className="text-sm text-muted-foreground">
            Renderiza as 3 variações (14, 7 e 1 dia) exatamente como sairão na
            caixa de entrada — e envia uma cópia para o destinatário de teste.
          </p>
        </div>
        <Badge className={envBadgeClass[env]}>Ambiente: {envLabel[env]}</Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados de exemplo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="rn">Nome</Label>
            <Input id="rn" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="sl">Etapa</Label>
            <Input id="sl" value={stepLabel} onChange={(e) => setStepLabel(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="dest">Destinatário de teste</Label>
            <Input
              id="dest"
              type="email"
              value={testRecipient}
              placeholder="voce@exemplo.com"
              onChange={(e) => setTestRecipient(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Cada variação que você enviar daqui vai exclusivamente para este e-mail.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 rounded-md border p-2">
              <Label htmlFor="dryrun" className="text-sm">Modo teste</Label>
              <Switch id="dryrun" checked={dryRun} onCheckedChange={setDryRun} />
            </div>
            <Button onClick={() => void refresh()} disabled={loading} variant="secondary">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar preview
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {previews.map((p) => (
          <Card key={p.days} className="overflow-hidden">
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{p.days} dia{p.days === 1 ? "" : "s"} antes</CardTitle>
                <Badge className={TONE[p.days] ?? "bg-muted"}>{p.days}d</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Assunto:</span> {p.subject}
              </p>
              <Button
                size="sm"
                onClick={() => void sendVariant(p.days)}
                disabled={sendingDays !== null}
                className="w-full"
              >
                {sendingDays === p.days ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {dryRun ? "Simular envio para teste" : `Enviar para ${testRecipient || "destinatário"}`}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                title={`Preview ${p.days} dias`}
                srcDoc={p.html}
                sandbox=""
                className="w-full h-[640px] bg-white border-t"
              />
            </CardContent>
          </Card>
        ))}
        {previews.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">Nenhum preview carregado.</p>
        )}
      </div>
    </div>
  );
}
