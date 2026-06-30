import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import {
  generateVideoScript,
  generateYoutubeMeta,
  normalizeYouTubeUrl,
  deriveFallbackBlocks,
  buildSrt,
  type ScriptBlock,
  type YoutubeMeta,
} from "@/lib/video-script.functions";
import { speakText } from "@/lib/english.functions";
import { toast } from "sonner";
import {
  Loader2, Sparkles, Copy, Save, Download, Youtube, Check, AlertCircle,
  Volume2, Play, Pause, SkipForward, RotateCcw, FileText, Tag, Settings2,
} from "lucide-react";
import { pdf, Document, Page as PdfPage, Text, View, StyleSheet, Image as PdfImage } from "@react-pdf/renderer";
import { PdfBrandedFooter, PdfLogo } from "@/components/PdfLogo";
import QRCode from "qrcode";

export const Route = createFileRoute("/_authenticated/app/video")({ component: Page });

// ---------------- PDF ----------------

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 11, color: "#111" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4, color: "#1a3a6e", textAlign: "center" },
  subtitle: { fontSize: 10, color: "#555", textAlign: "center", marginBottom: 14 },
  sectionTitle: {
    fontSize: 12, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: "#1a3a6e",
    padding: 6, marginTop: 14, marginBottom: 8, textAlign: "center",
  },
  ptBlock: { fontSize: 12, lineHeight: 1.6, textAlign: "justify", marginBottom: 6 },
  blockRow: { borderBottom: "1px solid #e2d8c4", paddingVertical: 8, paddingHorizontal: 4 },
  blockHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  blockNum: {
    fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: "#1a3a6e",
    paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8, marginRight: 8,
  },
  blockEn: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#111", flexShrink: 1 },
  blockLabel: { fontSize: 8, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  blockPhonetic: { fontSize: 12, color: "#0a5d2e", fontFamily: "Helvetica-Oblique", marginBottom: 2 },
  blockPt: { fontSize: 10, color: "#555" },
  blockIntonation: { fontSize: 10, color: "#7a4a00", fontFamily: "Helvetica-Oblique" },
  tip: {
    fontSize: 9, color: "#555", backgroundColor: "#fef6e4",
    padding: 8, marginBottom: 10, borderRadius: 3,
  },
  qrBox: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, padding: 10,
    backgroundColor: "#f5ede0", borderRadius: 4,
  },
  qrImg: { width: 90, height: 90 },
  qrText: { fontSize: 10, color: "#1a3a6e", flexShrink: 1, lineHeight: 1.4 },
  footer: { fontSize: 9, color: "#666", marginTop: 16, textAlign: "center", fontStyle: "italic" },
});

function ScriptPdf({
  pt, en, blocks, name, qrDataUrl, secondsPerBlock,
}: {
  pt: string; en: string; blocks: ScriptBlock[]; name: string;
  qrDataUrl: string | null; secondsPerBlock: number;
}) {
  const totalSec = Math.round(blocks.length * secondsPerBlock);
  return (
    <Document>
      <PdfPage size="LETTER" style={s.page} wrap>
        <View style={{ alignItems: "center", marginBottom: 8 }}><PdfLogo /></View>
        <Text style={s.title}>Roteiro do vídeo — {name}</Text>
        <Text style={s.subtitle}>
          Treine bloco por bloco. Leia a pronúncia "abrasileirada" em voz alta — não tente ler o inglês escrito.
        </Text>

        <View style={s.tip}>
          <Text>
            DICA: o inglês não se lê como se escreve. Use a coluna verde (pronúncia) para falar.
            Repita cada bloco 5 vezes antes de passar pro próximo. Quando souber 3 blocos seguidos sem olhar, junte-os.
          </Text>
        </View>

        <Text style={s.sectionTitle}>Roteiro completo em português (entenda primeiro)</Text>
        <Text style={s.ptBlock}>{pt}</Text>

        <Text style={s.sectionTitle}>Roteiro completo em inglês (texto corrido)</Text>
        <Text style={s.ptBlock}>{en}</Text>

        {qrDataUrl && (
          <View style={s.qrBox}>
            <PdfImage src={qrDataUrl} style={s.qrImg} />
            <Text style={s.qrText}>
              Aponte a câmera do celular para este QR code e abra o MODO PRÁTICA — você ouve cada bloco em inglês
              e repete junto. Ritmo configurado: ~{secondsPerBlock}s por bloco (~{totalSec}s total).
            </Text>
          </View>
        )}

        <Text style={s.footer}>Vire a página para ver os blocos com pronúncia →</Text>
        <PdfBrandedFooter />
      </PdfPage>

      <PdfPage size="LETTER" style={s.page} wrap>
        <View style={{ alignItems: "center", marginBottom: 8 }}><PdfLogo /></View>
        <Text style={s.title}>Blocos de treino — leia a pronúncia em voz alta</Text>
        <Text style={s.subtitle}>
          Cubra o inglês com o dedo e treine só pela pronúncia. As notas em laranja indicam o ritmo/entonação.
        </Text>

        {blocks.length === 0 ? (
          <View style={s.tip}><Text>Não foi possível gerar os blocos. Volte ao app e clique em "Gerar de novo".</Text></View>
        ) : (
          blocks.map((b, i) => (
            <View key={i} style={s.blockRow} wrap={false}>
              <View style={s.blockHeader}>
                <Text style={s.blockNum}>{String(i + 1).padStart(2, "0")}</Text>
                <Text style={s.blockEn}>{b.en}</Text>
              </View>
              <Text style={s.blockLabel}>Como falar (leia em voz alta)</Text>
              <Text style={s.blockPhonetic}>{b.phonetic}</Text>
              <Text style={s.blockLabel}>Entonação / ritmo</Text>
              <Text style={s.blockIntonation}>{b.intonation}</Text>
              <Text style={s.blockLabel}>Significado</Text>
              <Text style={s.blockPt}>{b.pt}</Text>
            </View>
          ))
        )}

        <Text style={s.footer}>Grave horizontal, boa luz, olhe para a câmera. ~60 segundos. Você consegue.</Text>
        <PdfBrandedFooter />
      </PdfPage>
    </Document>
  );
}

// ---------------- Page ----------------

function Page() {
  const genFn = useServerFn(generateVideoScript);
  const ttsFn = useServerFn(speakText);
  const ytMetaFn = useServerFn(generateYoutubeMeta);

  const [scriptPt, setScriptPt] = useState("");
  const [scriptEn, setScriptEn] = useState("");
  const [blocks, setBlocks] = useState<ScriptBlock[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [normalizedUrl, setNormalizedUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [exporting, setExporting] = useState(false);

  // YouTube metadata + SRT
  const [ytMeta, setYtMeta] = useState<YoutubeMeta | null>(null);
  const [genMeta, setGenMeta] = useState(false);

  // Practice mode
  const [secondsPerBlock, setSecondsPerBlock] = useState(4);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const audioCacheRef = useRef<Map<number, string>>(new Map()); // idx -> base64 mp3
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const playAllStopRef = useRef(false);

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
        if (Array.isArray(stored) && stored.length > 0) setBlocks(stored as unknown as ScriptBlock[]);
        setYoutubeUrl(prof.youtube_video_url ?? "");
        if (prof.youtube_video_url) setNormalizedUrl(normalizeYouTubeUrl(prof.youtube_video_url));
      }
    })();
  }, []);

  useEffect(() => {
    setNormalizedUrl(youtubeUrl.trim() ? normalizeYouTubeUrl(youtubeUrl) : null);
  }, [youtubeUrl]);

  // Stop playback on unmount
  useEffect(() => () => stopAll(), []);

  function stopAll() {
    playAllStopRef.current = true;
    setPlayingAll(false);
    setActiveIdx(null);
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
  }

  async function ensureAudio(idx: number, text: string): Promise<string> {
    const cached = audioCacheRef.current.get(idx);
    if (cached) return cached;
    setLoadingIdx(idx);
    try {
      const { audio } = await ttsFn({ data: { text } });
      audioCacheRef.current.set(idx, audio);
      return audio;
    } finally {
      setLoadingIdx((cur) => (cur === idx ? null : cur));
    }
  }

  async function playBlock(idx: number): Promise<void> {
    const b = blocks[idx];
    if (!b) return;
    try {
      const audio = await ensureAudio(idx, b.en);
      const audioEl = new Audio(`data:audio/mp3;base64,${audio}`);
      audioElRef.current = audioEl;
      setActiveIdx(idx);
      await new Promise<void>((resolve, reject) => {
        audioEl.onended = () => resolve();
        audioEl.onerror = () => reject(new Error("Erro no áudio"));
        void audioEl.play().catch(reject);
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no áudio");
      throw e;
    }
  }

  async function handlePlayOne(idx: number) {
    stopAll();
    playAllStopRef.current = false;
    try { await playBlock(idx); } catch { /* shown */ }
    setActiveIdx(null);
  }

  async function handlePlayAll() {
    stopAll();
    playAllStopRef.current = false;
    setPlayingAll(true);
    for (let i = 0; i < blocks.length; i++) {
      if (playAllStopRef.current) break;
      try { await playBlock(i); } catch { break; }
      if (playAllStopRef.current) break;
      // Pause between blocks for the user to repeat out loud
      await new Promise((r) => setTimeout(r, secondsPerBlock * 1000));
    }
    setPlayingAll(false);
    setActiveIdx(null);
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const r = await genFn();
      setScriptPt(r.pt);
      setScriptEn(r.en);
      setBlocks(r.blocks);
      audioCacheRef.current.clear();
      toast.success("Roteiro + pronúncia gerados ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setGenerating(false);
    }
  }

  function copy(text: string, label: string) {
    if (!text) { toast.error("Gere o roteiro primeiro."); return; }
    void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado ✓`));
  }

  const hasRealBlocks = blocks.length > 0;
  const hasScript = !!scriptPt && !!scriptEn;
  const needsRegenForBlocks = hasScript && !hasRealBlocks;

  // Blocks used in the PDF: real or fallback (derived from EN)
  const pdfBlocks = useMemo<ScriptBlock[]>(
    () => (hasRealBlocks ? blocks : deriveFallbackBlocks(scriptEn)),
    [hasRealBlocks, blocks, scriptEn],
  );

  async function handleExportPdf() {
    if (!hasScript) { toast.error("Gere o roteiro primeiro."); return; }
    setExporting(true);
    try {
      const practiceUrl = `${window.location.origin}/app/video?mode=practice`;
      const qrDataUrl = await QRCode.toDataURL(practiceUrl, { margin: 1, width: 300 });
      const blob = await pdf(
        <ScriptPdf
          pt={scriptPt} en={scriptEn} blocks={pdfBlocks}
          name={name || "Candidato"} qrDataUrl={qrDataUrl}
          secondsPerBlock={secondsPerBlock}
        />
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
    if (trimmed && !normalizedUrl) { toast.error("Link do YouTube inválido."); return; }
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

  async function handleGenerateMeta() {
    if (!hasScript) { toast.error("Gere o roteiro primeiro."); return; }
    setGenMeta(true);
    try {
      const r = await ytMetaFn();
      setYtMeta(r);
      toast.success("Conteúdo do YouTube gerado ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setGenMeta(false);
    }
  }

  function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadSrt(lang: "en" | "pt") {
    const src = hasRealBlocks ? blocks : deriveFallbackBlocks(scriptEn);
    if (!src.length) { toast.error("Gere o roteiro primeiro."); return; }
    const safeName = (name || "candidato").replace(/\s+/g, "_");
    downloadText(`legenda_${lang}_${safeName}.srt`, buildSrt(src, lang), "application/x-subrip");
    toast.success(`SRT ${lang.toUpperCase()} baixado ✓`);
  }

  const ytId = normalizedUrl?.split("/").pop();
  const totalSec = Math.round(blocks.length * secondsPerBlock);

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Vídeo de Apresentação</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Empregadores H-2A confiam mais em quem mostra a cara. Grave um vídeo curto em inglês, suba no YouTube e cole o link aqui.
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
            A IA lê seu currículo e monta um roteiro de ~50s em PT-BR e EN, com o inglês <strong>quebrado em blocos curtos</strong>, a pronúncia escrita do jeito que um brasileiro lê (ex.: <em>"Rái, mái nêimi is Djón"</em>) e notas de entonação. Treine bloco a bloco com áudio.
          </p>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {hasScript ? "Gerar de novo" : "Gerar meu roteiro"}
          </Button>

          {needsRegenForBlocks && (
            <div className="flex items-start gap-2 text-xs rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-amber-900 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                Seu roteiro foi gerado antes do modo de blocos com pronúncia/áudio existir. Clique em <strong>"Gerar de novo"</strong> para destravar os blocos, áudio TTS e a página 2 do PDF.
              </div>
            </div>
          )}

          {hasScript && (
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

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button onClick={handleExportPdf} disabled={exporting} variant="outline" size="sm">
                  {exporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-2" />}
                  Baixar PDF (roteiro + blocos + QR pro modo prática)
                </Button>
                <span className="text-xs text-muted-foreground">
                  O PDF traz cada bloco com pronúncia e entonação. O áudio fica aqui no app (PDF não toca som).
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* PASSO 2 — Modo Prática */}
      {hasRealBlocks && (
        <Card id="practice">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              2. Modo prática — ouça e repita
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-2">
                  {playingAll ? (
                    <Button size="sm" variant="destructive" onClick={stopAll}>
                      <Pause className="h-3.5 w-3.5 mr-1" /> Parar
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handlePlayAll}>
                      <Play className="h-3.5 w-3.5 mr-1" /> Tocar tudo
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { stopAll(); setActiveIdx(null); }}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Resetar
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Total estimado: <strong>{totalSec}s</strong> ({blocks.length} blocos × {secondsPerBlock}s de repetição)
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-medium">Pausa entre blocos para você repetir</label>
                  <span className="tabular-nums text-muted-foreground">{secondsPerBlock}s</span>
                </div>
                <Slider
                  value={[secondsPerBlock]}
                  min={2} max={8} step={1}
                  onValueChange={(v) => setSecondsPerBlock(v[0] ?? 4)}
                  disabled={playingAll}
                />
                <p className="text-[11px] text-muted-foreground">
                  Comece com 5s para repetir devagar. Vá baixando até 3s quando estiver mais confiante.
                </p>
              </div>
            </div>

            <ol className="space-y-2">
              {blocks.map((b, i) => {
                const isActive = activeIdx === i;
                const isLoading = loadingIdx === i;
                return (
                  <li
                    key={i}
                    className={[
                      "rounded-md border p-3 text-sm transition-colors",
                      isActive
                        ? "border-primary bg-primary/10 ring-2 ring-primary"
                        : "bg-background",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-bold text-primary bg-primary/15 rounded px-1.5 py-0.5 mt-0.5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 space-y-1.5">
                        <div className="font-semibold">{b.en}</div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Como falar</div>
                          <div className="italic text-emerald-700 dark:text-emerald-400">{b.phonetic}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Entonação</div>
                          <div className="text-amber-700 dark:text-amber-400 text-xs italic">{b.intonation}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">{b.pt}</div>
                      </div>
                      <Button
                        size="sm" variant={isActive ? "default" : "outline"}
                        onClick={() => handlePlayOne(i)}
                        disabled={isLoading || playingAll}
                        className="flex-shrink-0"
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isActive ? (
                          <SkipForward className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* PASSO 3 — Gravar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Gravar e subir no YouTube</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Use o modo prática acima até saber 3 blocos seguidos sem olhar.</li>
            <li><strong>Grave com o celular na horizontal</strong>, boa luz, fundo neutro. <strong>~60-90 segundos.</strong></li>
            <li>Suba em <a href="https://youtube.com/upload" target="_blank" rel="noopener noreferrer" className="text-primary underline">youtube.com/upload</a> marcado como <strong>"Não listado"</strong>.</li>
            <li>Cole o link no campo abaixo.</li>
          </ol>
        </CardContent>
      </Card>

      {/* TUTORIAL — Como subir no YouTube */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Youtube className="h-4 w-4 text-destructive" />
            Tutorial: como subir seu vídeo no YouTube (passo a passo)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Não precisa deixar público. O modo <strong>"Não listado"</strong> esconde o vídeo da busca — só quem tem o link consegue ver. É o que recomendamos pra mandar pros empregadores.
          </p>

          <div className="space-y-2">
            <p className="font-semibold">No celular (app YouTube):</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Abra o app <strong>YouTube</strong> e entre com sua conta Google (a mesma do Gmail serve).</li>
              <li>Toque no <strong>+</strong> no centro da barra de baixo → <strong>"Enviar um vídeo"</strong>.</li>
              <li>Escolha o vídeo da galeria. Dá pra cortar começo/fim se precisar.</li>
              <li>Em <strong>Título</strong>, escreva algo como: <em>"My H-2A introduction — [Seu Nome]"</em>.</li>
              <li>Em <strong>Descrição</strong>, cole seu script em inglês (opcional, ajuda o empregador).</li>
              <li>Em <strong>Visibilidade / Privacidade</strong>, escolha <strong>"Não listado"</strong> (Unlisted). <span className="text-muted-foreground">⚠ Não escolha "Privado", senão o empregador não consegue abrir.</span></li>
              <li>Toque em <strong>Enviar</strong> e aguarde o upload terminar.</li>
              <li>Quando terminar, abra o vídeo, toque em <strong>Compartilhar</strong> e <strong>Copiar link</strong>.</li>
              <li>Volte aqui e cole no campo abaixo. ✅</li>
            </ol>
          </div>

          <div className="space-y-2">
            <p className="font-semibold">No computador:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Acesse <a href="https://youtube.com/upload" target="_blank" rel="noopener noreferrer" className="text-primary underline">youtube.com/upload</a> logado na sua conta Google.</li>
              <li>Arraste o arquivo do vídeo pra tela (ou clique em <strong>Selecionar arquivos</strong>).</li>
              <li>Preencha título e descrição → <strong>Próxima</strong> até a tela <strong>Visibilidade</strong>.</li>
              <li>Marque <strong>"Não listado"</strong> → <strong>Salvar</strong>.</li>
              <li>Clique no ícone de compartilhar e copie o link <code className="font-mono text-xs">youtu.be/...</code>.</li>
              <li>Cole no campo abaixo. ✅</li>
            </ol>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
            <p className="font-semibold">Não tem conta no YouTube?</p>
            <p>Toda conta <strong>Google / Gmail</strong> já é uma conta YouTube — basta fazer login. Se não tem Gmail, crie em <a href="https://accounts.google.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary underline">accounts.google.com/signup</a> (leva 2 min).</p>
          </div>
        </CardContent>
      </Card>

      {/* PASSO 4 — Link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Youtube className="h-4 w-4 text-destructive" />
            4. Cole o link do YouTube
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://youtu.be/xxxxxxxxxxx"
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
                  width="100%" height="100%"
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
