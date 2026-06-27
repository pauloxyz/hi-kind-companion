import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, Sparkles, Send } from "lucide-react";
import { toast } from "sonner";
import { generateCoverLetter, recordApplication } from "@/lib/applications.functions";
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
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const gen = useServerFn(generateCoverLetter);
  const record = useServerFn(recordApplication);

  async function handleGenerate() {
    if (!job) return;
    setGenerating(true);
    try {
      const { text } = await gen({ data: { jobId: job.id } });
      setLetter(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar carta");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!job || !letter.trim()) return;
    setSending(true);
    try {
      await record({ data: { jobId: job.id, coverLetterEn: letter, contactMethod: "email" } });
      const subject = encodeURIComponent(`Application for ${job.job_title ?? "H-2A position"} (Case ${job.external_case_number ?? ""})`);
      const body = encodeURIComponent(letter);
      if (job.recruitment_email) {
        window.location.href = `mailto:${job.recruitment_email}?subject=${subject}&body=${body}`;
      }
      toast.success("Candidatura registrada. Follow-up em 2 dias.");
      onOpenChange(false);
      setLetter("");
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Candidatar — {job?.job_title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {job?.employer_name} · {job?.worksite_city}, {job?.worksite_state}
            {job?.recruitment_email && (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {job.recruitment_email}
                </span>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {letter ? "Regerar carta (EN)" : "Gerar carta com IA (EN)"}
          </Button>
          <Textarea
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            placeholder="Sua carta de apresentação em inglês aparecerá aqui…"
            className="min-h-[260px] font-mono text-sm"
          />
          {!job?.recruitment_email && (
            <p className="text-xs text-yellow-600">
              ⚠️ Esta vaga não tem e-mail. Considere usar o telefone ({job?.recruitment_phone ?? "—"}) ou site.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={!letter.trim() || sending}>
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
  );
}
