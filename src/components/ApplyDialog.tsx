import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, Sparkles, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { generateCoverLetter, recordApplication } from "@/lib/applications.functions";
import { sendApplicationEmail } from "@/lib/gmail.functions";
import { detectFraud } from "@/lib/score";
import type { Database } from "@/integrations/supabase/types";

type Job = Database["public"]["Tables"]["jobs"]["Row"];

interface Props {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

export function ApplyDialog({ job, open, onOpenChange, onSent }: Props) {
  const [letter, setLetter] = useState("");
  const [subject, setSubject] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachedMediaIds, setAttachedMediaIds] = useState<string[]>([]);
  const [attachedVideoId, setAttachedVideoId] = useState<string | null>(null);
  const gen = useServerFn(generateCoverLetter);
  const record = useServerFn(recordApplication);
  const sendEmail = useServerFn(sendApplicationEmail);

  const fraud = job ? detectFraud(job.job_title, job.employer_name, job.employer_address) : { isSuspicious: false, reasons: [] };

  // Pre-fill subject when the job changes
  useEffect(() => {
    if (job && open) {
      const title = job.job_title ?? "H-2A position";
      setSubject(`H-2A Application — ${title}`);
    }
  }, [job, open]);

  async function handleGenerate() {
    if (!job) return;
    setGenerating(true);
    try {
      const r = await gen({ data: { jobId: job.id } });
      setLetter(r.text);
      setAttachedMediaIds(r.attachedMediaIds ?? []);
      setAttachedVideoId(r.attachedVideoId ?? null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao gerar carta"); }
    finally { setGenerating(false); }
  }

  async function handleSend() {
    if (!job || !letter.trim()) return;
    setSending(true);
    try {
      let gmailThreadId: string | null = null;
      let gmailMessageId: string | null = null;
      if (job.recruitment_email) {
        const sent = await sendEmail({
          data: {
            jobId: job.id,
            to: job.recruitment_email,
            subject: subject.trim() || `Application for ${job.job_title ?? "H-2A position"}`,
            body: letter,
          },
        });
        gmailThreadId = sent.threadId ?? null;
        gmailMessageId = sent.gmailMessageId ?? null;
        toast.success("Email enviado pelo seu Gmail");
      } else {
        toast.message("Sem email do empregador — só registrando candidatura");
      }
      await record({ data: { jobId: job.id, coverLetterEn: letter, contactMethod: "email", attachedMediaIds, attachedVideoId, gmailThreadId, gmailMessageId } });
      toast.success("Candidatura registrada. Follow-up em 2 dias.");
      onOpenChange(false);
      setLetter(""); setSubject(""); setAttachedMediaIds([]); setAttachedVideoId(null);
      onSent?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao enviar"); }
    finally { setSending(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Candidatar — {job?.job_title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {job?.employer_name} · {job?.worksite_city}, {job?.worksite_state}
            {job?.recruitment_email && (<> {" · "}<span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{job.recruitment_email}</span></>)}
          </div>
          {fraud.isSuspicious && (
            <div className="rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm">
              <div className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <div><div className="font-semibold text-destructive">Possível fraude detectada</div>
                  <div className="text-xs">Termos suspeitos: {fraud.reasons.join(", ")}</div>
                  <div className="text-xs mt-1">Nunca pague taxas para conseguir uma vaga H-2A.</div></div></div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {letter ? "Regerar carta (EN)" : "Gerar carta com IA (EN)"}
          </Button>
          {(attachedMediaIds.length > 0 || attachedVideoId) && (
            <div className="text-xs text-muted-foreground">
              📎 Anexado automaticamente: {attachedVideoId ? "vídeo de apresentação" : ""}{attachedVideoId && attachedMediaIds.length ? " + " : ""}{attachedMediaIds.length ? `${attachedMediaIds.length} mídia(s) em destaque` : ""}
            </div>
          )}
          {job?.recruitment_email && (
            <div className="space-y-1">
              <Label htmlFor="email-subject" className="text-xs">Assunto do email (em inglês)</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="H-2A Application — Job Title"
                className="text-sm"
              />
            </div>
          )}
          <Textarea value={letter} onChange={(e) => setLetter(e.target.value)} placeholder="Sua carta em inglês aparecerá aqui…" className="min-h-[280px] font-mono text-sm" />
          {!job?.recruitment_email && (<p className="text-xs text-yellow-600">⚠️ Sem e-mail. Use telefone ({job?.recruitment_phone ?? "—"}) ou site.</p>)}
          {job?.recruitment_email && (
            <p className="text-xs text-muted-foreground">
              📧 Será enviado pelo seu Gmail conectado. Resposta do empregador chega na sua caixa de entrada normal.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!letter.trim() || sending}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {job?.recruitment_email ? "Enviar pelo Gmail" : "Registrar candidatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
