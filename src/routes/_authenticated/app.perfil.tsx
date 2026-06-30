import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { X, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateHeadline } from "@/lib/headline.functions";

export const Route = createFileRoute("/_authenticated/app/perfil")({ component: PerfilPage });

const LANG_OPTIONS = [
  { code: "pt", label: "Português" },
  { code: "en", label: "Inglês" },
  { code: "es", label: "Espanhol" },
];
const PROFICIENCY_LEVELS = [
  { value: "basic", label: "Básico" },
  { value: "intermediate", label: "Intermediário" },
  { value: "advanced", label: "Avançado" },
  { value: "fluent", label: "Fluente" },
  { value: "native", label: "Nativo" },
];

// languages stored as "code:level" (e.g. "en:intermediate"). Legacy "en" → "en:basic".
function parseLang(s: string): { code: string; level: string } {
  const [code, level] = s.split(":");
  return { code: (code || "").toLowerCase(), level: level || "basic" };
}
function formatLang(code: string, level: string) { return `${code}:${level}`; }
function langDisplayName(code: string) {
  return LANG_OPTIONS.find((l) => l.code === code)?.label ?? code.toUpperCase();
}
function levelDisplayName(level: string) {
  return PROFICIENCY_LEVELS.find((l) => l.value === level)?.label ?? level;
}

function PerfilPage() {
  const [form, setForm] = useState({
    full_name: "", phone: "", country: "Brazil", birth_date: "",
    has_prior_h2_experience: false, languages: ["pt"] as string[],
    public_slug: "", public_headline: "", public_page_enabled: true,
  });
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [langInput, setLangInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatingHeadline, setGeneratingHeadline] = useState(false);
  const genHeadline = useServerFn(generateHeadline);

  const handleGenerateHeadline = async () => {
    setGeneratingHeadline(true);
    try {
      const { headline } = await genHeadline();
      setForm((f) => ({ ...f, public_headline: headline }));
      toast.success("Frase gerada — revise e salve");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar");
    } finally {
      setGeneratingHeadline(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("my_profile").select("*").maybeSingle();
      if (data) setForm({
        full_name: data.full_name ?? "",
        phone: data.phone ?? "",
        country: data.country ?? "Brazil",
        birth_date: data.birth_date ?? "",
        has_prior_h2_experience: !!data.has_prior_h2_experience,
        languages: data.languages ?? ["pt"],
        public_slug: data.public_slug ?? "",
        public_headline: data.public_headline ?? "",
        public_page_enabled: data.public_page_enabled ?? true,
      });
      const { count } = await supabase.from("profile_views").select("*", { count: "exact", head: true });
      setViewCount(count ?? 0);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const slug = form.public_slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const { error } = await supabase.from("my_profile").upsert(
      { owner_id: u.user.id, ...form, public_slug: slug || null, birth_date: form.birth_date || null, updated_at: new Date().toISOString() },
      { onConflict: "owner_id" },
    );
    if (error) toast.error(error.message); else { setForm({ ...form, public_slug: slug }); toast.success("Salvo"); }
  };

  function addLang(code: string, level = "basic") {
    const c = code.trim().toLowerCase();
    if (!c) return;
    const existing = form.languages.map(parseLang);
    if (existing.some((l) => l.code === c)) return;
    setForm({ ...form, languages: [...form.languages, formatLang(c, level)] });
    setLangInput("");
  }
  function removeLang(code: string) {
    setForm({ ...form, languages: form.languages.filter((x) => parseLang(x).code !== code) });
  }
  function updateLangLevel(code: string, level: string) {
    setForm({
      ...form,
      languages: form.languages.map((x) => {
        const p = parseLang(x);
        return p.code === code ? formatLang(code, level) : x;
      }),
    });
  }

  if (loading) return <p>Carregando...</p>;

  const parsedLangs = form.languages.map(parseLang);
  const usedCodes = new Set(parsedLangs.map((l) => l.code));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Meu Perfil</h1>
      <Card>
        <CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>Nome completo (igual ao passaporte)</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Telefone (+55...)</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1"><Label>País</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          </div>
          <div className="space-y-1"><Label>Data de nascimento</Label>
            <Input type="date" value={form.birth_date ?? ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>

          <div className="space-y-2">
            <Label>Idiomas e proficiência</Label>
            <p className="text-xs text-muted-foreground">Indique seu nível em cada idioma. Empregadores americanos valorizam honestidade — exagerar pode te eliminar.</p>
            <div className="space-y-2">
              {parsedLangs.map(({ code, level }) => (
                <div key={code} className="flex items-center gap-2 rounded-md border p-2">
                  <Badge variant="secondary" className="min-w-[90px] justify-center">{langDisplayName(code)}</Badge>
                  <Select value={level} onValueChange={(v) => updateLangLevel(code, v)}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROFICIENCY_LEVELS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => removeLang(code)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {parsedLangs.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum idioma adicionado.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center pt-1">
              <Input
                className="flex-1 min-w-[140px]"
                placeholder="Outro idioma (ex: it)"
                value={langInput}
                onChange={(e) => setLangInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLang(langInput); } }}
              />
              <div className="flex flex-wrap gap-1">
                {LANG_OPTIONS.filter((l) => !usedCodes.has(l.code)).map((l) => (
                  <Button key={l.code} size="sm" variant="outline" onClick={() => addLang(l.code)}>
                    + {l.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>


          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Já participei de programa H-2 antes</Label>
            <Switch checked={form.has_prior_h2_experience}
              onCheckedChange={(v) => setForm({ ...form, has_prior_h2_experience: v })} />
          </div>
          <Button onClick={save}>Salvar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Página pública de apresentação</CardTitle>
          <p className="text-sm text-muted-foreground">Um link curto e bonito que você envia ao empregador, com vídeo, fotos e experiência. Cada visualização é registrada.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Página pública ativa</Label>
            <Switch checked={form.public_page_enabled} onCheckedChange={(v) => setForm({ ...form, public_page_enabled: v })} />
          </div>
          <div className="space-y-1">
            <Label>URL do seu perfil</Label>
            <div className="flex gap-1 items-center">
              <span className="text-sm text-muted-foreground">/v/</span>
              <Input value={form.public_slug} onChange={(e) => setForm({ ...form, public_slug: e.target.value })} placeholder="seu-nome" />
            </div>
            {form.public_slug && form.public_page_enabled && (
              <div className="flex gap-2 mt-2">
                <a href={`/v/${form.public_slug}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                  Abrir página →
                </a>
                <button
                  type="button"
                  className="text-sm text-primary underline"
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/v/${form.public_slug}`); toast.success("Link copiado"); }}
                >
                  Copiar link
                </button>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label>Frase de apresentação (uma linha em inglês)</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleGenerateHeadline}
                disabled={generatingHeadline}
              >
                {generatingHeadline ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Gerar com IA
              </Button>
            </div>
            <Input
              value={form.public_headline}
              onChange={(e) => setForm({ ...form, public_headline: e.target.value })}
              placeholder="Hard-working farmhand from Brazil, 3 seasons of strawberry harvest, available March-Nov."
              maxLength={160}
            />
            <p className="text-xs text-muted-foreground">A IA usa seu currículo (experiências, habilidades, resumo) para criar uma frase que chame atenção do empregador. Revise antes de salvar.</p>
          </div>
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <span className="font-semibold">{viewCount ?? "…"}</span> visualização(ões) registrada(s) na sua página.
          </div>
          <Button onClick={save}>Salvar página pública</Button>
        </CardContent>
      </Card>
    </div>
  );
}
