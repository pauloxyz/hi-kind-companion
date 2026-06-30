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
  Volume2, Play, Pause, SkipForward, RotateCcw, FileText, Tag, Settings2, ChevronDown,
} from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { VideoScriptPdf } from "@/components/VideoScriptPdf";
import { AiErrorBanner, type AiErrorInfo } from "@/components/AiErrorBanner";
import { track } from "@/lib/telemetry";
import QRCode from "qrcode";

export const Route = createFileRoute("/_authenticated/app/video")({ component: Page });

const TTS_CACHE_KEY = "video-tts-cache-v1";
const META_CACHE_KEY = "video-ytmeta-cache-v1";

function loadTtsCache(): Map<number, string> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = sessionStorage.getItem(TTS_CACHE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
  } catch { return new Map(); }
}
function saveTtsCache(cache: Map<number, string>) {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, string> = {};
    cache.forEach((v, k) => { obj[String(k)] = v; });
    sessionStorage.setItem(TTS_CACHE_KEY, JSON.stringify(obj));
  } catch { /* quota — ignore */ }
}




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

  const [ytMeta, setYtMeta] = useState<YoutubeMeta | null>(null);
  const [genMeta, setGenMeta] = useState(false);

  const [aiError, setAiError] = useState<AiErrorInfo | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    if (!aiError || aiError.retryAt <= Date.now()) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowTs(now);
      if (now >= aiError.retryAt) window.clearInterval(id);
    }, 500);
    return () => window.clearInterval(id);
  }, [aiError]);


  const [secondsPerBlock, setSecondsPerBlock] = useState(4);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const audioCacheRef = useRef<Map<number, string>>(new Map());
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const playAllStopRef = useRef(false);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    audioCacheRef.current = loadTtsCache();
    try {
      const m = sessionStorage.getItem(META_CACHE_KEY);
      if (m) setYtMeta(JSON.parse(m) as YoutubeMeta);
    } catch { /* ignore */ }
    void (async () => {
      const { data: prof } = await supabase
        .from("my_profile")
        .select("full_name, youtube_video_url, video_script_pt, video_script_en, video_script_blocks, video_youtube_meta")
        .maybeSingle();
      if (prof) {
        setName(prof.full_name ?? "");
        setScriptPt(prof.video_script_pt ?? "");
        setScriptEn(prof.video_script_en ?? "");
        const stored = prof.video_script_blocks;
        if (Array.isArray(stored) && stored.length > 0) setBlocks(stored as unknown as ScriptBlock[]);
        setYoutubeUrl(prof.youtube_video_url ?? "");
        if (prof.youtube_video_url) setNormalizedUrl(normalizeYouTubeUrl(prof.youtube_video_url));
        // Persisted meta (server) wins over sessionStorage cache
        const savedMeta = prof.video_youtube_meta as YoutubeMeta | null;
        if (savedMeta && typeof savedMeta === "object" && "title" in savedMeta) {
          setYtMeta(savedMeta);
          try { sessionStorage.setItem(META_CACHE_KEY, JSON.stringify(savedMeta)); } catch { /* ignore */ }
        }
      }
    })();
  }, []);

  useEffect(() => {
    setNormalizedUrl(youtubeUrl.trim() ? normalizeYouTubeUrl(youtubeUrl) : null);
  }, [youtubeUrl]);

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
      saveTtsCache(audioCacheRef.current);
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
      await new Promise((r) => setTimeout(r, secondsPerBlock * 1000));
    }
    setPlayingAll(false);
    setActiveIdx(null);
  }

  function handleAiError(action: "script" | "meta", e: unknown, startedAt: number) {
    const latencyMs = Date.now() - startedAt;
    const raw = e instanceof Error ? e.message : String(e);
    const m = raw.match(/^AI_ERR\|(\w+)\|(\d+)\|(.+)$/s);
    if (m) {
      const code = m[1] as AiErrorInfo["code"];
      const retryAfter = parseInt(m[2], 10) || 0;
      const msg = m[3];
      console.warn("[ai-error]", { action, code, retryAfter, msg, latencyMs, at: new Date().toISOString() });
      track("ai_error", { action, code, retryAfter, latencyMs });
      setAiError({ action, code, msg, retryAt: retryAfter > 0 ? Date.now() + retryAfter * 1000 : 0 });
      toast.error(msg);
    } else {
      console.warn("[ai-error]", { action, code: "other", msg: raw, latencyMs, at: new Date().toISOString() });
      track("ai_error", { action, code: "other", latencyMs });
      setAiError({ action, code: "other", msg: raw || "Erro inesperado.", retryAt: 0 });
      toast.error(raw || "Erro");
    }
  }

  async function handleGenerate() {
    const isRetry = aiError?.action === "script";
    if (isRetry) {
      // How long the user actually waited past the unlock (negative if early-fire blocked).
      const waitedPastUnlockMs = aiError?.retryAt ? Date.now() - aiError.retryAt : 0;
      console.info("[ai-retry]", { action: "script", code: aiError?.code, waitedPastUnlockMs });
      track("ai_retry_click", { action: "script", code: aiError?.code, waitedPastUnlockMs });
    }
    const startedAt = Date.now();
    setGenerating(true);
    setAiError((e) => (e?.action === "script" ? null : e));
    try {
      const r = await genFn();
      setScriptPt(r.pt);
      setScriptEn(r.en);
      setBlocks(r.blocks);
      audioCacheRef.current.clear();
      try { sessionStorage.removeItem(TTS_CACHE_KEY); } catch { /* ignore */ }
      // Invalidate cached metadata — script changed
      setYtMeta(null);
      try { sessionStorage.removeItem(META_CACHE_KEY); } catch { /* ignore */ }
      setAiError(null);
      const latencyMs = Date.now() - startedAt;
      track(isRetry ? "ai_retry_success" : "ai_generate_success", { action: "script", latencyMs });
      toast.success("Roteiro + pronúncia gerados ✓");
    } catch (e) {
      if (isRetry) track("ai_retry_failure", { action: "script" });
      handleAiError("script", e, startedAt);
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
        <VideoScriptPdf
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
    const isRetry = aiError?.action === "meta";
    if (isRetry) {
      const waitedPastUnlockMs = aiError?.retryAt ? Date.now() - aiError.retryAt : 0;
      console.info("[ai-retry]", { action: "meta", code: aiError?.code, waitedPastUnlockMs });
      track("ai_retry_click", { action: "meta", code: aiError?.code, waitedPastUnlockMs });
    }
    const startedAt = Date.now();
    setGenMeta(true);
    setAiError((e) => (e?.action === "meta" ? null : e));
    try {
      const r = await ytMetaFn();
      setYtMeta(r);
      try { sessionStorage.setItem(META_CACHE_KEY, JSON.stringify(r)); } catch { /* ignore */ }
      setAiError(null);
      const latencyMs = Date.now() - startedAt;
      track(isRetry ? "ai_retry_success" : "ai_generate_success", { action: "meta", latencyMs });
      toast.success("Conteúdo do YouTube gerado ✓");
    } catch (e) {
      if (isRetry) track("ai_retry_failure", { action: "meta" });
      handleAiError("meta", e, startedAt);
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
          Empregadores H-2A confiam mais em quem mostra a cara. Grave ~60s em inglês, suba como "Não listado" no YouTube e cole o link.
        </p>
      </div>

      {/* PASSO 1 — Gerar roteiro */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            1. Gerar seu roteiro + pronúncia (IA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            A IA lê seu currículo e monta ~50s em PT-BR e EN, com o inglês quebrado em blocos curtos e a pronúncia escrita do jeito que um brasileiro lê (ex.: <em>"Rái, mái nêimi is Djón"</em>).
          </p>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {hasScript ? "Gerar de novo" : "Gerar meu roteiro"}
          </Button>

          <AiErrorBanner
            error={aiError?.action === "script" ? aiError : null}
            secondsLeft={Math.max(0, Math.ceil(((aiError?.retryAt ?? 0) - nowTs) / 1000))}
            onRetry={handleGenerate}
            onDismiss={() => setAiError(null)}
            busy={generating}
          />

          {needsRegenForBlocks && (
            <div className="flex items-start gap-2 text-xs rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-amber-900 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>Seu roteiro foi gerado antes dos blocos. Clique em <strong>"Gerar de novo"</strong> para destravar áudio TTS e página 2 do PDF.</div>
            </div>
          )}

          {hasScript && (
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
          )}
        </CardContent>
      </Card>

      {/* PASSO 2 — Treinar (prática + PDF) */}
      {hasScript && (
        <Card id="practice">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              2. Treinar — ouça, repita e leve no PDF
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleExportPdf} disabled={exporting} variant="outline" size="sm">
                {exporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-2" />}
                Baixar PDF (roteiro + blocos + QR)
              </Button>
              <span className="text-xs text-muted-foreground">PDF não toca áudio — use o modo prática abaixo.</span>
            </div>

            {hasRealBlocks ? (
              <>
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
                      Total: <strong>{totalSec}s</strong> ({blocks.length} blocos × {secondsPerBlock}s)
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
                    <p className="text-[11px] text-muted-foreground">Comece com 5s, baixe pra 3s quando estiver confiante.</p>
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
                          isActive ? "border-primary bg-primary/10 ring-2 ring-primary" : "bg-background",
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
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : isActive ? <SkipForward className="h-3.5 w-3.5" />
                              : <Play className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* PASSO 3 — Gravar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Gravar</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>Celular na horizontal, boa luz, fundo neutro, olhando para a câmera. ~60-90 segundos. Use o modo prática até saber 3 blocos seguidos sem olhar.</p>
        </CardContent>
      </Card>

      {/* PASSO 4 — Conteúdo pro upload (inclui config "Não listado", tutorial em <details>) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            4. Conteúdo pronto pro YouTube (título, descrição, tags, legendas)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            A IA monta título e descrição em inglês com base no seu roteiro, sugere tags, categoria e configurações (incluindo <strong>"Não listado"</strong>). Copie e cole no upload. Baixe também as legendas SRT pra subir no YouTube Studio.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleGenerateMeta} disabled={genMeta || !hasScript} size="sm">
              {genMeta ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-2" />}
              {ytMeta ? "Gerar de novo" : "Gerar título, descrição e tags"}
            </Button>
            <Button onClick={() => handleDownloadSrt("en")} disabled={!hasScript} size="sm" variant="outline">
              <Download className="h-3.5 w-3.5 mr-2" /> Legenda EN (.srt)
            </Button>
            <Button onClick={() => handleDownloadSrt("pt")} disabled={!hasScript} size="sm" variant="outline">
              <Download className="h-3.5 w-3.5 mr-2" /> Legenda PT (.srt)
            </Button>
          </div>

          <AiErrorBanner
            error={aiError?.action === "meta" ? aiError : null}
            secondsLeft={Math.max(0, Math.ceil(((aiError?.retryAt ?? 0) - nowTs) / 1000))}
            onRetry={handleGenerateMeta}
            onDismiss={() => setAiError(null)}
            busy={genMeta}
          />

          {!hasScript && (
            <p className="text-xs text-amber-700 dark:text-amber-400">Gere o roteiro no Passo 1 primeiro.</p>
          )}

          {ytMeta && (
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Título ({ytMeta.title.length} caracteres)</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy(ytMeta.title, "Título")}>
                    <Copy className="h-3 w-3 mr-1" /> Copiar
                  </Button>
                </div>
                <Input value={ytMeta.title} readOnly className="text-sm" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Descrição</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy(ytMeta.description, "Descrição")}>
                    <Copy className="h-3 w-3 mr-1" /> Copiar
                  </Button>
                </div>
                <Textarea value={ytMeta.description} readOnly className="min-h-[140px] text-sm" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Tags ({ytMeta.tags.length})
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copy(ytMeta.tags.join(", "), "Tags")}>
                    <Copy className="h-3 w-3 mr-1" /> Copiar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 rounded-md border p-2 bg-muted/30">
                  {ytMeta.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs font-normal">{t}</Badge>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-3 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Categoria</div>
                  <div className="text-sm font-semibold">{ytMeta.category}</div>
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Settings2 className="h-3 w-3" /> Configurações
                  </div>
                  <ul className="text-xs space-y-1 list-disc pl-4">
                    {ytMeta.settings.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <details className="group rounded-md border bg-muted/20">
            <summary className="cursor-pointer list-none p-3 flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2">
                <Youtube className="h-4 w-4 text-destructive" />
                Passo a passo: como subir no YouTube
              </span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="p-3 pt-0 space-y-3 text-sm">
              <p className="text-muted-foreground text-xs">
                <strong>"Não listado"</strong> esconde o vídeo da busca — só quem tem o link vê. Não escolha "Privado" (empregador não consegue abrir).
              </p>

              <div>
                <p className="font-semibold text-xs mb-1">Pelo celular:</p>
                <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                  <li>App YouTube → <strong>+</strong> → <strong>Enviar vídeo</strong>.</li>
                  <li>Cole o título e a descrição gerados acima.</li>
                  <li>Visibilidade: <strong>"Não listado"</strong> → Enviar.</li>
                  <li>Abra o vídeo → <strong>Compartilhar</strong> → <strong>Copiar link</strong>.</li>
                </ol>
              </div>

              <div>
                <p className="font-semibold text-xs mb-1">Pelo computador:</p>
                <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                  <li>Acesse <a href="https://youtube.com/upload" target="_blank" rel="noopener noreferrer" className="text-primary underline">youtube.com/upload</a>.</li>
                  <li>Arraste o vídeo, cole título/descrição.</li>
                  <li>Visibilidade: <strong>"Não listado"</strong> → Salvar → copie o link <code className="font-mono">youtu.be/...</code>.</li>
                </ol>
              </div>

              {ytMeta && (
                <div>
                  <p className="font-semibold text-xs mb-1">Subir as legendas (SRT):</p>
                  <ol className="list-decimal pl-5 space-y-0.5 text-xs">
                    <li>YouTube Studio → seu vídeo → <strong>Subtítulos</strong>.</li>
                    <li><strong>Adicionar idioma</strong> → Inglês → <strong>Fazer upload</strong> → <em>Com tempo</em> → arquivo EN.</li>
                    <li>Repita para Português (Brasil) com o arquivo PT.</li>
                  </ol>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Não tem conta? Toda conta Google/Gmail já é YouTube. Crie em <a href="https://accounts.google.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary underline">accounts.google.com/signup</a>.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* PASSO 5 — Cole o link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Youtube className="h-4 w-4 text-destructive" />
            5. Cole o link do YouTube
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
              <div className="flex items-center gap-2 text-xs">
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
