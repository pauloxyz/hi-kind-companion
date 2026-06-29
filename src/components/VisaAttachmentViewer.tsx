import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type ViewerAttachment = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
};

/**
 * Accessible attachment viewer with inline preview for images and PDFs and
 * keyboard navigation (← / →) across siblings of the same checklist step.
 */
export function VisaAttachmentViewer({
  open,
  onOpenChange,
  attachments,
  initialIndex,
  stepLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachments: ViewerAttachment[];
  initialIndex: number;
  stepLabel: string;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const current = attachments[index];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !current) return;
      setLoading(true);
      setSignedUrl(null);
      const { data, error } = await supabase.storage
        .from("visa-evidence")
        .createSignedUrl(current.storage_path, 300);
      if (cancelled) return;
      setLoading(false);
      if (error || !data?.signedUrl) {
        setSignedUrl(null);
        return;
      }
      setSignedUrl(data.signedUrl);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, current]);

  // Keyboard nav between attachments
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (attachments.length < 2) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => (i + 1) % attachments.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => (i - 1 + attachments.length) % attachments.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, attachments.length]);

  if (!current) return null;

  const isImage = (current.mime_type ?? "").startsWith("image/");
  const isPdf = (current.mime_type ?? "").includes("pdf") || /\.pdf$/i.test(current.file_name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 gap-0 h-[min(85vh,800px)] flex flex-col"
        data-testid="visa-attachment-viewer"
      >
        <div className="flex items-start gap-3 border-b p-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">{current.file_name}</DialogTitle>
            <DialogDescription className="text-xs">
              {stepLabel} · {index + 1} de {attachments.length}
            </DialogDescription>
          </div>
          {signedUrl && (
            <>
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <a href={signedUrl} target="_blank" rel="noreferrer" aria-label="Abrir em nova aba">
                  <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-11">
                <a href={signedUrl} download={current.file_name} aria-label="Baixar anexo">
                  <Download className="h-4 w-4" aria-hidden /> Baixar
                </a>
              </Button>
            </>
          )}
        </div>

        <div className="relative flex-1 overflow-auto bg-muted/30">
          {loading && (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </div>
          )}
          {!loading && signedUrl && isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrl}
              alt={current.file_name}
              className="mx-auto my-4 max-h-[70vh] object-contain"
            />
          )}
          {!loading && signedUrl && isPdf && (
            <iframe
              src={signedUrl}
              title={current.file_name}
              className="h-full w-full border-0"
            />
          )}
          {!loading && signedUrl && !isImage && !isPdf && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Pré-visualização não disponível para este formato. Use "Abrir" ou "Baixar".
            </div>
          )}
          {!loading && !signedUrl && (
            <div className="p-8 text-center text-sm text-destructive">
              Não foi possível carregar o anexo.
            </div>
          )}
        </div>

        {attachments.length > 1 && (
          <div className="flex items-center justify-between border-t p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setIndex((i) => (i - 1 + attachments.length) % attachments.length)}
              aria-label="Anexo anterior"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
            </Button>
            <div className="text-xs text-muted-foreground tabular-nums">
              {index + 1} / {attachments.length}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setIndex((i) => (i + 1) % attachments.length)}
              aria-label="Próximo anexo"
            >
              Próximo <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}

        <div ref={liveRef} role="status" aria-live="polite" className="sr-only">
          Mostrando anexo {index + 1} de {attachments.length}: {current.file_name}
        </div>
      </DialogContent>
    </Dialog>
  );
}
