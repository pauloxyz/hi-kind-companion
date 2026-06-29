import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Mail, Sparkles, Send, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  generateFollowUp,
  markFollowUpSent,
  markResponded,
} from "@/lib/followups.functions";

export const Route = createFileRoute("/_authenticated/app/followups")({ component: Page });

type Pending = {
  id: string;
  sent_at: string | null;
  follow_up_due_at: string | null;
  cover_letter_en: string | null;
  jobs: {
    job_title: string | null;
    employer_name: string | null;
    worksite_city: string | null;
    worksite_state: string | null;
    recruitment_email: string | null;
    external_case_number: string | null;
  } | null;
};

function Page() {
  const [rows, setRows] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Pending | null>(null);
  const [letter, setLetter] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const genFn = useServerFn(generateFollowUp);
  const sentFn = useServerFn(markFollowUpSent);
  const respondFn = useServerFn(markResponded);

  async function load() {
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("applications")
      .select(
        "id,sent_at,follow_up_due_at,cover_letter_en,jobs(job_title,employer_name,worksite_city,worksite_state,recruitment_email,external_case_number)",
      )
      .is("follow_up_sent_at", null)
      .is("responded_at", null)
      .lte("follow_up_due_at", nowIso)
      .order("follow_up_due_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data as Pending[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function openDialog(p: Pending) {
    setActive(p);
    setLetter("");
    setGenerating(true);
    try {
      const { text } = await genFn({ data: { applicationId: p.id } });
      setLetter(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!active || !letter.trim()) return;
    setSending(true);
    try {
      await sentFn({ data: { applicationId: active.id } });
      const subject = encodeURIComponent(
        `Following up — ${active.jobs?.job_title ?? "H-2A position"} (Case ${active.jobs?.external_case_number ?? ""})`,
      );
      const body = encodeURIComponent(letter);
      if (active.jobs?.recruitment_email) {
        window.location.href = `mailto:${active.jobs.recruitment_email}?subject=${subject}&body=${body}`;
      }
      toast.success("Follow-up registrado.");
      setActive(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSending(false);
    }
  }

  async function handleMarkResponded(id: string) {
    try {
      await respondFn({ data: { applicationId: id } });
      toast.success("Marcado como respondido.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Follow-ups</h1>
      <p className="text-sm text-muted-foreground">
        Empregadores que receberam sua candidatura há ≥ 2 dias e ainda não responderam. Um lembrete educado costuma dobrar a taxa de resposta.
      </p>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="grid gap-2">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-4 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{r.jobs?.job_title ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.jobs?.employer_name} · {r.jobs?.worksite_city}, {r.jobs?.worksite_state}
                  </div>
                </div>
                <Badge className="bg-warning">Devido</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Enviado em {r.sent_at ? new Date(r.sent_at).toLocaleDateString("pt-BR") : "—"}
                {r.jobs?.recruitment_email && (
                  <>
                    {" · "}
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {r.jobs.recruitment_email}
                    </span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => openDialog(r)} disabled={!r.jobs?.recruitment_email}>
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Gerar e enviar follow-up
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleMarkResponded(r.id)}>
                  <Check className="mr-2 h-3.5 w-3.5" />
                  Marcar como respondido
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && rows.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              Nenhum follow-up devido agora. ✅
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Follow-up — {active?.jobs?.job_title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {active?.jobs?.employer_name} · {active?.jobs?.recruitment_email}
            </div>
            {generating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando follow-up…
              </div>
            ) : (
              <Textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                className="min-h-[220px] font-mono text-sm"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActive(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSend} disabled={!letter.trim() || sending || generating}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Abrir e-mail e registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
