import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { X, Sparkles, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toastError } from "@/lib/toast-error";
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

/**
 * Sanitiza o input do usuário em um slug seguro para URL `/v/:slug`.
 * Determinística — mesma entrada sempre vira a mesma saída — para que
 * o preview ao vivo e o valor final salvo coincidam.
 */
function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function PerfilPage() {
  const [form, setForm] = useState({
    full_name: "", phone: "", country: "Brazil", birth_date: "",
    has_prior_h2_experience: false, languages: ["pt"] as string[],
    public_slug: "", public_headline: "", public_page_enabled: true,
    youtube_video_url: "",
  });

  const [viewCount, setViewCount] = useState<number | null>(null);
  const [langInput, setLangInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);
  const [generatingHeadline, setGeneratingHeadline] = useState(false);
  const [slugStatus, setSlugStatus] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "available" }
    | { kind: "taken" }
    | { kind: "invalid" }
  >({ kind: "idle" });
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const genHeadline = useServerFn(generateHeadline);

  // ids estáveis para amarrar Label↔Input (a11y: clicar no label foca o
  // campo correto e leitores de tela leem o par como uma unidade).
  const ids = {
    fullName: useId(),
    phone: useId(),
    country: useId(),
    birthDate: useId(),
    langInput: useId(),
    slug: useId(),
    headline: useId(),
    youtube: useId(),
  };


  const handleGenerateHeadline = async () => {
    setGeneratingHeadline(true);
    try {
      const { headline } = await genHeadline();
      setForm((f) => ({ ...f, public_headline: headline }));
      toast.success("Frase gerada — revise e salve");
    } catch (err) {
      toastError(err, { title: "Não foi possível gerar a frase" });
    } finally {
      setGeneratingHeadline(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const userRes = await supabase.auth.getUser();
        setOwnerId(userRes.data.user?.id ?? null);
        const { data, error } = await supabase.from("my_profile").select("*").maybeSingle();
        if (error) throw error;
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
      } catch (err) {
        toastError(err, { title: "Falha ao carregar seu perfil" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Slug preview + colisão. Roda em background quando o usuário digita;
  // não trava o submit (a validação final acontece no save()).
  const previewSlug = useMemo(() => slugify(form.public_slug), [form.public_slug]);

  useEffect(() => {
    if (!previewSlug) {
      setSlugStatus({ kind: "idle" });
      return;
    }
    if (previewSlug.length < 3) {
      setSlugStatus({ kind: "invalid" });
      return;
    }
    setSlugStatus({ kind: "checking" });
    const handle = setTimeout(async () => {
      try {
        let query = supabase
          .from("my_profile")
          .select("owner_id", { count: "exact", head: true })
          .eq("public_slug", previewSlug);
        if (ownerId) query = query.neq("owner_id", ownerId);
        const { count, error } = await query;
        if (error) throw error;
        setSlugStatus({ kind: (count ?? 0) > 0 ? "taken" : "available" });
      } catch {
        // silencioso — falha de rede não deve poluir a UI com toast aqui;
        // o save() ainda valida.
        setSlugStatus({ kind: "idle" });
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [previewSlug, ownerId]);

  const save = async (scope: "profile" | "public") => {
    const setter = scope === "profile" ? setSavingProfile : setSavingPublic;
    if (scope === "profile" ? savingProfile : savingPublic) return;
    setter(true);
    try {
      const userRes = await supabase.auth.getUser();
      const uid = userRes.data.user?.id;
      if (!uid) {
        toastError(new Error("Sessão expirada. Entre novamente."), {
          title: "Entre na sua conta",
        });
        return;
      }
      const slug = slugify(form.public_slug);
      // Colisão final (defesa em profundidade — o usuário pode ter
      // ignorado o aviso ao vivo).
      if (scope === "public" && slug) {
        const { count } = await supabase
          .from("my_profile")
          .select("owner_id", { count: "exact", head: true })
          .eq("public_slug", slug)
          .neq("owner_id", uid);
        if ((count ?? 0) > 0) {
          toastError(new Error("Este link já está em uso. Escolha outro."), {
            title: "Slug indisponível",
          });
          return;
        }
      }
      const { error } = await supabase.from("my_profile").upsert(
        {
          owner_id: uid,
          ...form,
          public_slug: slug || null,
          birth_date: form.birth_date || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      );
      if (error) throw error;
      setForm((f) => ({ ...f, public_slug: slug }));
      toast.success(scope === "profile" ? "Dados pessoais salvos" : "Página pública salva");
    } catch (err) {
      toastError(err, { title: "Falha ao salvar" });
    } finally {
      setter(false);
    }
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

  if (loading) {
    // Mantém o PageHeader (Core rule do projeto) e preserva altura dos
    // dois cards com skeletons — evita layout shift quando os dados
    // chegam.
    return (
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Meu Perfil"
          description="Mantenha seus dados atualizados — eles preenchem o currículo e a candidatura automaticamente."
        />
        <Card aria-busy="true">
          <CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
        <Card aria-busy="true">
          <CardHeader><CardTitle>Página pública de apresentação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const parsedLangs = form.languages.map(parseLang);
  const usedCodes = new Set(parsedLangs.map((l) => l.code));

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Meu Perfil"
        description="Mantenha seus dados atualizados — eles preenchem o currículo e a candidatura automaticamente."
      />
      <Card>
        <CardHeader><CardTitle>Dados pessoais</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={ids.fullName}>Nome completo (igual ao passaporte)</Label>
            <Input
              id={ids.fullName}
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={ids.phone}>Telefone (+55...)</Label>
              <Input
                id={ids.phone}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={ids.country}>País</Label>
              <Input
                id={ids.country}
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={ids.birthDate}>Data de nascimento</Label>
            <Input
              id={ids.birthDate}
              type="date"
              value={form.birth_date ?? ""}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={ids.langInput}>Idiomas e proficiência</Label>
            <p className="text-xs text-muted-foreground">Indique seu nível em cada idioma. Empregadores americanos valorizam honestidade — exagerar pode te eliminar.</p>
            <div className="space-y-2">
              {parsedLangs.map(({ code, level }) => (
                <div key={code} className="flex items-center gap-2 rounded-md border p-2">
                  <Badge variant="secondary" className="min-w-[90px] justify-center">{langDisplayName(code)}</Badge>
                  <Select value={level} onValueChange={(v) => updateLangLevel(code, v)}>
                    <SelectTrigger className="flex-1" aria-label={`Nível de ${langDisplayName(code)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROFICIENCY_LEVELS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeLang(code)}
                    aria-label={`Remover ${langDisplayName(code)}`}
                  >
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
                id={ids.langInput}
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
            <Label htmlFor="has-h2">Já participei de programa H-2 antes</Label>
            <Switch
              id="has-h2"
              checked={form.has_prior_h2_experience}
              onCheckedChange={(v) => setForm({ ...form, has_prior_h2_experience: v })}
            />
          </div>
          <Button onClick={() => save("profile")} disabled={savingProfile}>
            {savingProfile ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden /> Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Página pública de apresentação</CardTitle>
          <p className="text-sm text-muted-foreground">Um link curto e bonito que você envia ao empregador, com vídeo, fotos e experiência. Cada visualização é registrada.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="public-enabled">Página pública ativa</Label>
            <Switch
              id="public-enabled"
              checked={form.public_page_enabled}
              onCheckedChange={(v) => setForm({ ...form, public_page_enabled: v })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={ids.slug}>URL do seu perfil</Label>
            <div className="flex gap-1 items-center">
              <span className="text-sm text-muted-foreground">/v/</span>
              <Input
                id={ids.slug}
                value={form.public_slug}
                onChange={(e) => setForm({ ...form, public_slug: e.target.value })}
                placeholder="seu-nome"
                aria-describedby={`${ids.slug}-status`}
              />
            </div>
            <div id={`${ids.slug}-status`} aria-live="polite" className="min-h-[1.25rem]">
              {previewSlug && previewSlug !== form.public_slug && (
                <p className="text-xs text-muted-foreground">
                  Será salvo como <code className="rounded bg-muted px-1">/v/{previewSlug}</code>
                </p>
              )}
              {slugStatus.kind === "invalid" && (
                <p className="text-xs text-destructive inline-flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" aria-hidden /> Use pelo menos 3 caracteres (letras, números, hífen).
                </p>
              )}
              {slugStatus.kind === "checking" && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Verificando disponibilidade…
                </p>
              )}
              {slugStatus.kind === "available" && (
                <p className="text-xs text-primary inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> Disponível.
                </p>
              )}
              {slugStatus.kind === "taken" && (
                <p className="text-xs text-destructive inline-flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" aria-hidden /> Este link já está em uso.
                </p>
              )}
            </div>
            {previewSlug && form.public_page_enabled && (
              <div className="flex gap-2 mt-2">
                <a href={`/v/${previewSlug}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                  Abrir página →
                </a>
                <button
                  type="button"
                  className="text-sm text-primary underline"
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/v/${previewSlug}`); toast.success("Link copiado"); }}
                >
                  Copiar link
                </button>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={ids.headline}>Frase de apresentação (uma linha em inglês)</Label>
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
              id={ids.headline}
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
          <Button onClick={() => save("public")} disabled={savingPublic || slugStatus.kind === "taken" || slugStatus.kind === "invalid"}>
            {savingPublic ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden /> Salvando…
              </>
            ) : (
              "Salvar página pública"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
