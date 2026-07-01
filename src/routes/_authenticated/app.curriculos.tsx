import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyVariants,
  upsertVariant,
  deleteVariant,
  setActiveVariant,
  attachVariantPdf,
  type ProfileVariant,
} from "@/lib/profile-variants.functions";
import { translateToEnglish } from "@/lib/translate.functions";
import { PageHeader } from "@/components/page-header";
import { ProGate } from "@/components/ProGate";
import { usePro } from "@/hooks/usePro";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { Plus, Star, Trash2, Upload, FileText, Pencil, X, Languages } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/curriculos")({
  component: CurriculosPage,
});

function CurriculosPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Meus currículos"
        description="Crie variantes do seu perfil (colheita, packing, máquina) ou anexe PDFs prontos. A versão ativa é a que vai com o link público."
      />
      <ProGate
        feature="multiple_resumes"
        title="Múltiplos currículos"
        description="Variantes do seu perfil + upload de PDFs por vaga. Disponível no plano Pro."
      >
        <CurriculosManager />
      </ProGate>
    </div>
  );
}

function CurriculosManager() {
  const list = useServerFn(listMyVariants);
  const upsert = useServerFn(upsertVariant);
  const remove = useServerFn(deleteVariant);
  const setActive = useServerFn(setActiveVariant);
  const attach = useServerFn(attachVariantPdf);
  const qc = useQueryClient();

  const variantsQ = useQuery({
    queryKey: ["my", "profile-variants"],
    queryFn: () => list(),
  });

  const [editing, setEditing] = useState<ProfileVariant | null>(null);
  const [creating, setCreating] = useState(false);

  type UpsertPayload = {
    id?: string | null;
    name: string;
    label?: string | null;
    job_title_pt?: string | null;
    job_title_en?: string | null;
    summary_pt?: string | null;
    summary_en?: string | null;
    skills: string[];
    highlighted_experience_ids: string[];
    source?: "variant" | "upload";
  };

  const upsertMut = useMutation({
    mutationFn: (v: UpsertPayload) => upsert({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my", "profile-variants"] });
      toast.success("Currículo salvo.");
      setEditing(null);
      setCreating(false);
    },
    onError: (e) => toastError(e),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my", "profile-variants"] });
      toast.success("Currículo removido.");
    },
    onError: (e) => toastError(e),
  });

  const activeMut = useMutation({
    mutationFn: (id: string) => setActive({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my", "profile-variants"] });
      toast.success("Currículo ativo atualizado.");
    },
    onError: (e) => toastError(e),
  });

  const attachMut = useMutation({
    mutationFn: (v: { id: string; pdf_path: string; pdf_filename: string }) =>
      attach({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my", "profile-variants"] });
      toast.success("PDF anexado.");
    },
    onError: (e) => toastError(e),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {variantsQ.data?.length ?? 0} currículo(s)
        </div>
        <div className="flex gap-2">
          <UploadPdfButton
            onUploaded={async ({ name, path, filename }) => {
              // cria variante "upload" e já anexa o PDF
              const res = await upsertMut.mutateAsync({
                name,
                source: "upload",
                skills: [],
                highlighted_experience_ids: [],
              });
              await attachMut.mutateAsync({ id: res.id, pdf_path: path, pdf_filename: filename });
            }}
          />
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova variante
          </Button>
        </div>
      </div>

      {variantsQ.isLoading && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {variantsQ.data && variantsQ.data.length === 0 && !creating && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum currículo ainda. Crie uma variante ou suba um PDF.
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {variantsQ.data?.map((v) => (
          <Card key={v.id} className={v.is_active ? "border-primary" : ""}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold flex items-center gap-2">
                    {v.name}
                    {v.is_active && (
                      <Badge className="bg-primary/15 text-primary border border-primary/30">
                        Ativo
                      </Badge>
                    )}
                  </div>
                  {v.label && <div className="text-xs text-muted-foreground">{v.label}</div>}
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {v.source === "upload" ? "PDF" : "Variante"}
                </Badge>
              </div>

              {v.job_title_pt && (
                <div className="text-sm">{v.job_title_pt}</div>
              )}
              {v.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {v.skills.slice(0, 5).map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">
                      {s}
                    </Badge>
                  ))}
                  {v.skills.length > 5 && (
                    <Badge variant="outline" className="text-xs">
                      +{v.skills.length - 5}
                    </Badge>
                  )}
                </div>
              )}
              {v.pdf_filename && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> {v.pdf_filename}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {!v.is_active && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => activeMut.mutate(v.id)}
                  >
                    <Star className="mr-1.5 h-3.5 w-3.5" /> Tornar ativo
                  </Button>
                )}
                {v.source === "variant" && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm("Remover este currículo?")) removeMut.mutate(v.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(creating || editing) && (
        <VariantForm
          initial={editing}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(v) =>
            upsertMut.mutate({
              ...v,
              id: editing?.id,
              source: "variant",
            })
          }
          saving={upsertMut.isPending}
        />
      )}
    </div>
  );
}

function VariantForm({
  initial,
  onSubmit,
  onCancel,
  saving,
}: {
  initial: ProfileVariant | null;
  onSubmit: (v: {
    name: string;
    label?: string | null;
    job_title_pt?: string | null;
    job_title_en?: string | null;
    summary_pt?: string | null;
    summary_en?: string | null;
    skills: string[];
    highlighted_experience_ids: string[];
  }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [titlePt, setTitlePt] = useState(initial?.job_title_pt ?? "");
  const [titleEn, setTitleEn] = useState(initial?.job_title_en ?? "");
  const [summaryPt, setSummaryPt] = useState(initial?.summary_pt ?? "");
  const [skillsRaw, setSkillsRaw] = useState((initial?.skills ?? []).join(", "));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {initial ? "Editar variante" : "Nova variante"}
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="v-name">Nome interno *</Label>
            <Input
              id="v-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Colheita, Packing..."
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-label">Subtítulo</Label>
            <Input
              id="v-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Pra vagas de colheita de laranja"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-title-pt">Cargo (PT)</Label>
            <Input
              id="v-title-pt"
              value={titlePt}
              onChange={(e) => setTitlePt(e.target.value)}
              placeholder="Trabalhador agrícola"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-title-en">Cargo (EN)</Label>
            <Input
              id="v-title-en"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="Farm Worker"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-sum">Resumo curto (PT)</Label>
          <Textarea
            id="v-sum"
            value={summaryPt}
            onChange={(e) => setSummaryPt(e.target.value)}
            placeholder="2-3 frases focadas na vaga..."
            rows={3}
            maxLength={2000}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-skills">Habilidades (separadas por vírgula)</Label>
          <Input
            id="v-skills"
            value={skillsRaw}
            onChange={(e) => setSkillsRaw(e.target.value)}
            placeholder="Colheita, Tratorista, Irrigação"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            disabled={name.trim().length < 2 || saving}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                label: label.trim() || null,
                job_title_pt: titlePt.trim() || null,
                job_title_en: titleEn.trim() || null,
                summary_pt: summaryPt.trim() || null,
                summary_en: null,
                skills: skillsRaw
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0)
                  .slice(0, 20),
                highlighted_experience_ids: initial?.highlighted_experience_ids ?? [],
              })
            }
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UploadPdfButton({
  onUploaded,
}: {
  onUploaded: (v: { name: string; path: string; filename: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handle = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("PDF maior que 10 MB.");
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Só aceitamos PDF.");
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirou.");
      const path = `${u.user.id}/variants/${crypto.randomUUID()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("resumes")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const name = file.name.replace(/\.pdf$/i, "").slice(0, 60) || "Currículo PDF";
      onUploaded({ name, path, filename: file.name.slice(0, 200) });
    } catch (e) {
      toastError(e);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
        }}
      />
      <Button
        variant="outline"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-1.5 h-4 w-4" /> {uploading ? "Enviando…" : "Subir PDF"}
      </Button>
    </>
  );
}
