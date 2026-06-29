import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { generateVideoScript, normalizeYouTubeUrl } from "@/lib/video-script.functions";
import { toast } from "sonner";
import { Loader2, Sparkles, Copy, Save, Download, Youtube, Check, AlertCircle } from "lucide-react";
import { pdf, Document, Page as PdfPage, Text, View, StyleSheet } from "@react-pdf/renderer";

export const Route = createFileRoute("/_authenticated/app/video")({ component: Page });

const scriptStyles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 11, color: "#111" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 12, color: "#1a3a6e", textAlign: "center" },
  twoCol: { flexDirection: "row", gap: 14 },
  col: { flex: 1 },
  colHeader: {
    backgroundColor: "#1a3a6e",
    color: "#fff",
    padding: 6,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  scriptText: { fontSize: 13, lineHeight: 1.7, textAlign: "justify" },
  footer: { fontSize: 9, color: "#666", marginTop: 20, textAlign: "center", fontStyle: "italic" },
});

function ScriptPdf({ pt, en, name }: { pt: string; en: string; name: string }) {
  return (
    <Document>
      <PdfPage size="LETTER" style={scriptStyles.page}>
        <Text style={scriptStyles.title}>Roteiro do vídeo de apresentação — {name}</Text>
        <View style={scriptStyles.twoCol}>
          <View style={scriptStyles.col}>
            <Text style={scriptStyles.colHeader}>Português (treine primeiro)</Text>
            <Text style={scriptStyles.scriptText}>{pt}</Text>
          </View>
          <View style={scriptStyles.col}>
            <Text style={scriptStyles.colHeader}>English (grave esta)</Text>
            <Text style={scriptStyles.scriptText}>{en}</Text>
          </View>
        </View>
        <Text style={scriptStyles.footer}>
          Grave horizontal, boa iluminação, olhe para a câmera. ~45-60 segundos.
        </Text>
      </PdfPage>
    </Document>
  );
}

function Page() {
  const genFn = useServerFn(generateVideoScript);

  const [scriptPt, setScriptPt] = useState("");
  const [scriptEn, setScriptEn] = useState("");
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
        .select("full_name, youtube_video_url, video_script_pt, video_script_en")
        .maybeSingle();
      if (prof) {
        setName(prof.full_name ?? "");
        setScriptPt(prof.video_script_pt ?? "");
        setScriptEn(prof.video_script_en ?? "");
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
      const { pt, en } = await genFn();
      setScriptPt(pt);
      setScriptEn(en);
      toast.success("Roteiro gerado e salvo ✓");
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
      const blob = await pdf(<ScriptPdf pt={scriptPt} en={scriptEn} name={name || "Candidato"} />).toBlob();
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
          Empregadores H-2A confiam mais em quem mostra a cara. Você grava um vídeo curto em inglês, sobe no YouTube e cola o link aqui — vai junto em todo email de candidatura.
        </p>
      </div>

      {/* PASSO 1 — Script personalizado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            1. Gerar seu roteiro (personalizado por IA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            A IA lê seu currículo (experiências, cultivos, máquinas) e monta um roteiro de ~50 segundos <strong>em PT-BR e EN</strong>, citando o que <em>você</em> realmente fez. Treine em português, grave em inglês.
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
                    <span className="text-xs font-medium text-muted-foreground">🇧🇷 Português (treine)</span>
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
              <Button onClick={handleExportPdf} disabled={exporting} variant="outline" size="sm">
                {exporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-2" />}
                Baixar roteiro em PDF (PT + EN)
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* PASSO 2 — Como gravar e subir */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Gravar e subir no YouTube</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Use o roteiro acima — treine 2-3 vezes em voz alta antes.</li>
            <li><strong>Grave com o celular na horizontal</strong>, em boa luz (natural de dia funciona). Fundo neutro: parede, campo, ou seu local de trabalho. <strong>~60-90 segundos.</strong></li>
            <li>Vá em <a href="https://youtube.com/upload" target="_blank" rel="noopener noreferrer" className="text-primary underline">youtube.com/upload</a>, suba o vídeo e marque visibilidade como <strong>"Não listado"</strong> (só quem tem o link vê).</li>
            <li>Copie o link do vídeo e cole no campo abaixo.</li>
          </ol>
        </CardContent>
      </Card>

      {/* PASSO 3 — Link do YouTube */}
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
