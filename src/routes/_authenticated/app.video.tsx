import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { generateVideoScript, normalizeYouTubeUrl, type ScriptBlock } from "@/lib/video-script.functions";
import { toast } from "sonner";
import { Loader2, Sparkles, Copy, Save, Download, Youtube, Check, AlertCircle, Volume2 } from "lucide-react";
import { pdf, Document, Page as PdfPage, Text, View, StyleSheet } from "@react-pdf/renderer";
import { PdfBrandedFooter, PdfLogo } from "@/components/PdfLogo";

export const Route = createFileRoute("/_authenticated/app/video")({ component: Page });

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 11, color: "#111" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4, color: "#1a3a6e", textAlign: "center" },
  subtitle: { fontSize: 10, color: "#555", textAlign: "center", marginBottom: 14 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#fff",
    backgroundColor: "#1a3a6e",
    padding: 6,
    marginTop: 14,
    marginBottom: 8,
    textAlign: "center",
  },
  ptBlock: { fontSize: 12, lineHeight: 1.6, textAlign: "justify", marginBottom: 6 },
  blockRow: {
    borderBottom: "1px solid #e2d8c4",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  blockHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  blockNum: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#fff",
    backgroundColor: "#1a3a6e",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  blockEn: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#111", flexShrink: 1 },
  blockLabel: { fontSize: 8, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  blockPhonetic: { fontSize: 12, color: "#0a5d2e", fontFamily: "Helvetica-Oblique", marginBottom: 2 },
  blockPt: { fontSize: 10, color: "#555" },
  tip: {
    fontSize: 9,
    color: "#555",
    backgroundColor: "#fef6e4",
    padding: 8,
    marginBottom: 10,
    borderRadius: 3,
  },
  footer: { fontSize: 9, color: "#666", marginTop: 16, textAlign: "center", fontStyle: "italic" },
});

function ScriptPdf({ pt, en, blocks, name }: { pt: string; en: string; blocks: ScriptBlock[]; name: string }) {
  return (
    <Document>
      {/* Página 1 — visão geral */}
      <PdfPage size="LETTER" style={s.page} wrap>
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <PdfLogo />
        </View>
        <Text style={s.title}>Roteiro do vídeo — {name}</Text>
        <Text style={s.subtitle}>
          Treine bloco por bloco. Leia a pronúncia "abrasileirada" em voz alta, não tente ler o inglês escrito.
        </Text>

        <View style={s.tip}>
          <Text>
            DICA: o inglês não se lê como se escreve. Use a coluna verde (pronúncia) para falar. Repita cada bloco
            5 vezes antes de passar pro próximo. Quando souber 3 blocos seguidos sem olhar, junte-os.
          </Text>
        </View>

        <Text style={s.sectionTitle}>Roteiro completo em português (entenda primeiro)</Text>
        <Text style={s.ptBlock}>{pt}</Text>

        <Text style={s.sectionTitle}>Roteiro completo em inglês (texto corrido)</Text>
        <Text style={s.ptBlock}>{en}</Text>

        <Text style={s.footer}>Vire a página para ver os blocos com pronúncia →</Text>
        <PdfBrandedFooter />
      </PdfPage>

      {/* Página 2+ — blocos com pronúncia */}
      <PdfPage size="LETTER" style={s.page} wrap>
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <PdfLogo />
        </View>
        <Text style={s.title}>Blocos de treino — leia a pronúncia em voz alta</Text>
        <Text style={s.subtitle}>
          Cada bloco é uma frase curta. Cubra a coluna do inglês com o dedo e treine só pela pronúncia.
        </Text>

        {blocks.map((b, i) => (
          <View key={i} style={s.blockRow} wrap={false}>
            <View style={s.blockHeader}>
              <Text style={s.blockNum}>{String(i + 1).padStart(2, "0")}</Text>
              <Text style={s.blockEn}>{b.en}</Text>
            </View>
            <Text style={s.blockLabel}>Como falar (leia em voz alta)</Text>
            <Text style={s.blockPhonetic}>{b.phonetic}</Text>
            <Text style={s.blockLabel}>Significado</Text>
            <Text style={s.blockPt}>{b.pt}</Text>
          </View>
        ))}

        <Text style={s.footer}>
          Grave horizontal, boa luz, olhe para a câmera. ~60 segundos. Você consegue.
        </Text>
        <PdfBrandedFooter />
      </PdfPage>
    </Document>
  );
}

function Page() {
  const genFn = useServerFn(generateVideoScript);

  const [scriptPt, setScriptPt] = useState("");
  const [scriptEn, setScriptEn] = useState("");
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [normalizedUrl, setNormalizedUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [exporting, setExporting] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void (async () => {
      const { data: prof } = await supabase
        .from("my_profile")
        .select("full_name, youtube_video_url, video_script_pt, video_script_en, video_script_blocks")
        .maybeSingle();
      if (prof) {
        setName(prof.full_name ?? "");
        setScriptPt(prof.video_script_pt ?? "");
        setScriptEn(prof.video_script_en ?? "");
        const stored = prof.video_script_blocks;
        if (Array.isArray(stored)) setBlocks(stored as unknown as ScriptBlock[]);
        setYoutubeUrl(prof.youtube_video_url ?? "");
        if (prof.youtube_video_url) setNormalizedUrl(normalizeYouTubeUrl(prof.youtube_video_url));
      }
    })();
  }, []);

  useEffect(() => {
    setNormalizedUrl(youtubeUrl.trim() ? normalizeYouTubeUrl(youtubeUrl) : null);
  }, [youtubeUrl]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const r = await genFn();
      setScriptPt(r.pt);
      setScriptEn(r.en);
      setBlocks(r.blocks);
      toast.success("Roteiro + pronúncia gerados ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setGenerating(false);
    }
  }

  function copy(text: string, label: string) {
    if (!text) {
      toast.error("Gere o roteiro primeiro.");
      return;
    }
    void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado ✓`));
  }

  async function handleExportPdf() {
    if (!scriptPt || !scriptEn) {
      toast.error("Gere o roteiro primeiro.");
      return;
    }
    setExporting(true);
    try {
      const blob = await pdf(
        <ScriptPdf pt={scriptPt} en={scriptEn} blocks={blocks} name={name || "Candidato"} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Roteiro_video_${(name || "candidato").replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setExporting(false);
    }
  }

  async function handleSaveUrl() {
    const trimmed = youtubeUrl.trim();
    if (trimmed && !normalizedUrl) {
      toast.error("Link do YouTube inválido. Use o link completo do vídeo.");
      return;
    }
    setSavingUrl(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sem sessão");
      const { error } = await supabase
        .from("my_profile")
        .update({ youtube_video_url: trimmed ? normalizedUrl : null })
        .eq("owner_id", u.user.id);
      if (error) throw error;
      toast.success(trimmed ? "Link salvo ✓" : "Link removido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSavingUrl(false);
    }
  }

  const ytId = normalizedUrl?.split("/").pop();

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Vídeo de Apresentação</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Empregadores H-2A confiam mais em quem mostra a cara. Grave um vídeo curto em inglês, suba no YouTube e cole o link aqui — vai junto em todo email de candidatura.
        </p>
      </div>

      {/* PASSO 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            1. Gerar seu roteiro + pronúncia (personalizado por IA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            A IA lê seu currículo (experiências, cultivos, máquinas) e monta um roteiro de ~50 segundos em PT-BR e EN, e também <strong>quebra o inglês em blocos curtos com a pronúncia escrita do jeito que um brasileiro lê</strong> (ex.: <em>"Rái, mái nêimi is Djón"</em>). Treine bloco a bloco — não tente decorar o texto todo de uma vez.
          </p>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {scriptPt ? "Gerar de novo" : "Gerar meu roteiro"}
          </Button>

          {(scriptPt || scriptEn) && (
            <>
              <div className="grid gap-3 md:grid-cols-2 pt-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">🇧🇷 Português (entenda)</span>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy(scriptPt, "PT")}>
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                  </div>
                  <Textarea value={scriptPt} onChange={(e) => setScriptPt(e.target.value)} className="min-h-[180px] text-sm" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">🇺🇸 English (grave esta)</span>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy(scriptEn, "EN")}>
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                  </div>
                  <Textarea value={scriptEn} onChange={(e) => setScriptEn(e.target.value)} className="min-h-[180px] text-sm" />
                </div>
              </div>

              {blocks.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Volume2 className="h-4 w-4 text-primary" />
                    Blocos de treino — leia a pronúncia em voz alta
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cada bloco é uma frase curta. <strong>Cubra o inglês</strong> e treine pela pronúncia em verde. Quando souber 3 seguidos, junte.
                  </p>
                  <ol className="space-y-2.5">
                    {blocks.map((b, i) => (
                      <li key={i} className="rounded border bg-background p-2.5 text-sm">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="font-semibold">{b.en}</span>
                        </div>
                        <div className="mt-1.5 pl-7">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Como falar</div>
                          <div className="italic text-emerald-700 dark:text-emerald-400">{b.phonetic}</div>
                          <div className="text-xs text-muted-foreground mt-1">{b.pt}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleExportPdf} disabled={exporting} variant="outline" size="sm">
                  {exporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-2" />}
                  Baixar PDF (roteiro + pronúncia bloco a bloco)
                </Button>
                <span className="text-xs text-muted-foreground">
                  O PDF traz cada bloco com a pronúncia "abrasileirada" — leve no celular ou imprima pra treinar.
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* PASSO 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Gravar e subir no YouTube</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Use o roteiro acima — treine bloco por bloco lendo a pronúncia, depois junte tudo.</li>
            <li><strong>Grave com o celular na horizontal</strong>, em boa luz (natural de dia funciona). Fundo neutro. <strong>~60-90 segundos.</strong></li>
            <li>Vá em <a href="https://youtube.com/upload" target="_blank" rel="noopener noreferrer" className="text-primary underline">youtube.com/upload</a>, suba o vídeo e marque como <strong>"Não listado"</strong> (só quem tem o link vê).</li>
            <li>Cole o link no campo abaixo.</li>
          </ol>
        </CardContent>
      </Card>

      {/* PASSO 3 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Youtube className="h-4 w-4 text-destructive" />
            3. Cole o link do YouTube
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://youtu.be/xxxxxxxxxxx ou https://youtube.com/watch?v=xxxx"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
            />
            <Button onClick={handleSaveUrl} disabled={savingUrl}>
              {savingUrl ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </div>

          {youtubeUrl.trim() && !normalizedUrl && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" /> Link não parece um vídeo do YouTube.
            </div>
          )}

          {normalizedUrl && ytId && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-success-foreground">
                <Check className="h-3.5 w-3.5 text-success" />
                <span>Link reconhecido. Aparecerá nos emails como <code className="font-mono">{normalizedUrl}</code></span>
              </div>
              <div className="aspect-video w-full max-w-md rounded overflow-hidden border bg-black">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${ytId}`}
                  title="Preview"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <Badge className="bg-success text-success-foreground">Pronto pra usar nas candidaturas</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
