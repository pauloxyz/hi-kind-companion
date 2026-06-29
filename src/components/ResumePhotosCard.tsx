import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, Save, Plus } from "lucide-react";
import { toast } from "sonner";
import { listMedia, getSignedMediaUrl } from "@/lib/media.functions";
import { setResumePhotos } from "@/lib/resume-photos.functions";
import { Link } from "@tanstack/react-router";

const MAX_PHOTOS = 6;

type MediaRow = {
  id: string;
  media_url: string;
  media_type: string | null;
  caption: string | null;
  is_resume_photo?: boolean | null;
  resume_photo_order?: number | null;
};

export function ResumePhotosCard() {
  const listFn = useServerFn(listMedia);
  const signFn = useServerFn(getSignedMediaUrl);
  const saveFn = useServerFn(setResumePhotos);

  const [photos, setPhotos] = useState<MediaRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const all = (await listFn()) as MediaRow[];
        const onlyPhotos = all.filter((m) => m.media_type === "photo");
        setPhotos(onlyPhotos);

        // Pré-seleciona as já marcadas, em ordem
        const preselected = onlyPhotos
          .filter((m) => m.is_resume_photo)
          .sort((a, b) => (a.resume_photo_order ?? 99) - (b.resume_photo_order ?? 99))
          .map((m) => m.id);
        setSelected(preselected);

        // Carrega thumbs
        const entries = await Promise.all(
          onlyPhotos.map(async (m) => {
            try {
              const { url } = await signFn({ data: { path: m.media_url } });
              return [m.id, url] as const;
            } catch {
              return [m.id, ""] as const;
            }
          }),
        );
        setUrls(Object.fromEntries(entries));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar fotos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_PHOTOS) {
        toast.warning(`Máximo de ${MAX_PHOTOS} fotos.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function moveUp(id: string) {
    setSelected((prev) => {
      const i = prev.indexOf(id);
      if (i <= 0) return prev;
      const copy = [...prev];
      [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
      return copy;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveFn({ data: { ids: selected } });
      toast.success("Fotos do currículo atualizadas ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          5. Fotos do currículo
          <Badge variant={selected.length > 0 ? "default" : "secondary"} className="ml-auto">
            {selected.length}/{MAX_PHOTOS}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Anexe até <strong>6 fotos suas trabalhando no campo</strong> (colhendo, operando trator, lidando com gado…). Empregadores americanos H-2A querem <em>ver</em> você em ação — vale mais que palavras. Elas vão dentro do PDF do currículo na <strong>página 2</strong>.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando suas fotos…
          </div>
        ) : photos.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Você ainda não enviou fotos. Adicione suas fotos de trabalho na aba Mídia primeiro.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/midia">
                <Plus className="h-3.5 w-3.5 mr-1" /> Ir para Mídia
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((m) => {
                const order = selected.indexOf(m.id);
                const isPicked = order >= 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={`relative aspect-square overflow-hidden rounded-md border-2 transition ${
                      isPicked ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/40"
                    }`}
                    title={m.caption ?? "Foto"}
                  >
                    {urls[m.id] ? (
                      <img src={urls[m.id]} alt={m.caption ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted animate-pulse" />
                    )}
                    {isPicked && (
                      <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                        {order + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {selected.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-2 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Ordem no PDF (clique ↑ para subir):</p>
                {selected.map((id, i) => {
                  const m = photos.find((p) => p.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2 text-xs">
                      <span className="font-mono w-4 text-muted-foreground">{i + 1}.</span>
                      {urls[id] && <img src={urls[id]} className="h-8 w-8 rounded object-cover" alt="" />}
                      <span className="flex-1 truncate">{m?.caption ?? "(sem legenda)"}</span>
                      {i > 0 && (
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => moveUp(id)}>
                          ↑
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} size="sm" variant="outline">
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Salvar seleção
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
