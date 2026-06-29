import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listMedia, createMedia, updateMedia, deleteMedia, getSignedMediaUrl } from "@/lib/media.functions";
import { Star, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/midia")({ component: Page });

const CATEGORIES = [
  { value: "agriculture", label: "Agricultura" },
  { value: "machinery", label: "Máquinas" },
  { value: "animals", label: "Animais" },
  { value: "general", label: "Geral" },
] as const;

type MediaRow = {
  id: string;
  owner_id: string;
  media_type: string | null;
  media_url: string;
  category: string | null;
  caption: string | null;
  is_featured: boolean | null;
  uploaded_at: string | null;
};

function MediaThumb({ path, caption }: { path: string; caption?: string }) {
  const sign = useServerFn(getSignedMediaUrl);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    sign({ data: { path } })
      .then((r) => { if (active) setUrl(r.url); })
      .catch(() => {});
    return () => { active = false; };
  }, [path]);
  if (!url) return <div className="aspect-video bg-muted animate-pulse rounded" />;
  if (path.match(/\.(mp4|mov|webm)$/i)) {
    return <video src={url} className="aspect-video w-full rounded object-cover" controls aria-label={caption || "Vídeo de trabalho"} />;
  }
  return <img src={url} className="aspect-video w-full rounded object-cover" alt={caption || "Foto de trabalho"} />;
}

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listMedia);
  const create = useServerFn(createMedia);
  const update = useServerFn(updateMedia);
  const remove = useServerFn(deleteMedia);
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>("general");
  const [filter, setFilter] = useState<string>("all");
  const [uploading, setUploading] = useState(false);

  const { data: items = [] } = useQuery({ queryKey: ["work_media"], queryFn: () => list() });

  const upMut = useMutation({
    mutationFn: async (vars: { id: string; patch: { caption?: string; is_featured?: boolean; category?: string } }) =>
      update({ data: { id: vars.id, ...vars.patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work_media"] }),
  });
  const delMut = useMutation({
    mutationFn: async (vars: { id: string; path: string }) =>
      remove({ data: { id: vars.id, storage_path: vars.path } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work_media"] }),
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    let ok = 0;
    let fail = 0;
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const userId = u.user.id;

      await Promise.all(
        files.map(async (file) => {
          try {
            const ext = file.name.split(".").pop() ?? "bin";
            const path = `${userId}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage.from("work-media").upload(path, file, {
              contentType: file.type,
            });
            if (upErr) throw upErr;
            const media_type = file.type.startsWith("video") ? "video" : "photo";
            await create({ data: { media_type, media_url: path, category: category as any } });
            ok++;
          } catch (err) {
            fail++;
            console.error("upload failed", file.name, err);
          }
        }),
      );

      qc.invalidateQueries({ queryKey: ["work_media"] });
      if (ok > 0) toast.success(`${ok} mídia(s) enviada(s)`);
      if (fail > 0) toast.error(`${fail} falha(s) no upload`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const filtered = filter === "all" ? items : items.filter((i: MediaRow) => i.category === filter);
  const featuredCount = items.filter((i: MediaRow) => i.is_featured).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Mídia de Trabalho</h1>
        <Badge variant="secondary">{featuredCount} em destaque</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle>Enviar foto ou vídeo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={handleFile} disabled={uploading} className="max-w-xs" />
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <p className="text-xs text-muted-foreground">
            <Upload className="h-3 w-3 inline mr-1" />
            Marque suas melhores fotos como destaque — elas serão anexadas nas candidaturas.
          </p>
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
            <div className="flex items-start gap-2">
              <Star className="h-4 w-4 fill-warning text-warning mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Como aparecer no link enviado ao empregador</div>
                <p className="mt-1 text-muted-foreground">
                  Clique na ⭐ das fotos/vídeos que você quer mostrar no seu perfil público (o link <code>/v/seu-slug</code> enviado no email). Só as mídias marcadas como destaque aparecem lá. Se nenhuma for marcada, mostramos as mais recentes automaticamente.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Todas</Button>
        {CATEGORIES.map((c) => (
          <Button key={c.value} size="sm" variant={filter === c.value ? "default" : "outline"} onClick={() => setFilter(c.value)}>
            {c.label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma mídia ainda.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m: MediaRow) => (
            <Card key={m.id}>
              <CardContent className="p-3 space-y-2">
                <MediaThumb path={m.media_url} caption={m.caption ?? undefined} />
                <div className="flex items-center justify-between gap-2">
                  <Select
                    value={m.category ?? "general"}
                    onValueChange={(v) => upMut.mutate({ id: m.id, patch: { category: v } })}
                  >
                    <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1">
                    <Button
                      size="icon" variant="ghost"
                      onClick={() => upMut.mutate({ id: m.id, patch: { is_featured: !m.is_featured } })}
                      title="Destaque"
                    >
                      <Star className={`h-4 w-4 ${m.is_featured ? "fill-warning text-warning" : ""}`} />
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      onClick={() => { if (confirm("Apagar?")) delMut.mutate({ id: m.id, path: m.media_url }); }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <Input
                  placeholder="Legenda (opcional, em inglês)"
                  defaultValue={m.caption ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (m.caption ?? "")) {
                      upMut.mutate({ id: m.id, patch: { caption: e.target.value } });
                    }
                  }}
                  className="text-sm"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
