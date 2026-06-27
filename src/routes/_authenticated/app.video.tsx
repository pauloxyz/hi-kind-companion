import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { listIntroVideos, createIntroVideo, setActiveIntroVideo, deleteIntroVideo, getIntroVideoSignedUrl } from "@/lib/intro-video.functions";
import { toast } from "sonner";
import { Loader2, Mic, Square, Trash2, Star, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/video")({ component: Page });

const MAX_SECONDS = 90;
const SCRIPT_EN = `Hi, my name is [your name]. I am [age] years old, from [city, country].
I have worked [N] years in [crop / livestock]. I am healthy, reliable, and used to long days in the sun.
I can start on [date] and I am committed to finishing the full contract.
Thank you for considering me.`;

function VideoPreview({ path }: { path: string }) {
  const sign = useServerFn(getIntroVideoSignedUrl);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { sign({ data: { path } }).then((r) => setUrl(r.url)).catch(() => {}); }, [path]);
  if (!url) return <div className="aspect-video bg-muted animate-pulse rounded" />;
  return <video src={url} controls className="w-full aspect-video rounded bg-black" />;
}

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listIntroVideos);
  const create = useServerFn(createIntroVideo);
  const setActive = useServerFn(setActiveIntroVideo);
  const del = useServerFn(deleteIntroVideo);

  const { data: videos = [] } = useQuery({ queryKey: ["intro_videos"], queryFn: () => list() });

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const liveRef = useRef<HTMLVideoElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
      streamRef.current = stream;
      if (liveRef.current) { liveRef.current.srcObject = stream; liveRef.current.muted = true; await liveRef.current.play().catch(()=>{}); }
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: "video/webm" });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      recRef.current = rec;
      rec.start();
      setRecording(true); setElapsed(0);
      timer.current = setInterval(() => setElapsed((s) => { if (s + 1 >= MAX_SECONDS) { stopRecording(); return s + 1; } return s + 1; }), 1000);
    } catch (e) { toast.error("Não foi possível acessar webcam/microfone: " + (e instanceof Error ? e.message : "")); }
  }

  function stopRecording() {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    setRecording(false);
  }

  async function uploadFile(blob: Blob, ext: string, contentType: string, duration: number | null) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("intro-videos").upload(path, blob, { contentType });
      if (upErr) throw upErr;
      await create({ data: { video_url: path, duration_seconds: duration ?? undefined, language: "en" } });
      qc.invalidateQueries({ queryKey: ["intro_videos"] });
      setRecordedBlob(null); setPreviewUrl(null);
      toast.success("Vídeo salvo e marcado como ativo");
    } catch (e: any) { toast.error(e.message ?? "Erro no upload"); }
    finally { setUploading(false); }
  }

  async function handleSaveRecorded() {
    if (!recordedBlob) return;
    await uploadFile(recordedBlob, "webm", "video/webm", elapsed);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const ext = file.name.split(".").pop() ?? "mp4";
    await uploadFile(file, ext, file.type, null);
    e.target.value = "";
  }

  function discardRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setRecordedBlob(null); setPreviewUrl(null); setElapsed(0);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vídeo de Apresentação</h1>

      <Card>
        <CardHeader><CardTitle>Roteiro sugerido (em inglês)</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded">{SCRIPT_EN}</pre>
          <p className="text-xs text-muted-foreground mt-2">Grave até 90 segundos. Boa iluminação, fundo simples, fale devagar.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Gravar agora</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!previewUrl && (
            <>
              <video ref={liveRef} className="w-full aspect-video rounded bg-black" />
              <div className="flex items-center gap-2">
                {!recording ? (
                  <Button onClick={startRecording}><Mic className="h-4 w-4 mr-1" /> Iniciar gravação</Button>
                ) : (
                  <Button variant="destructive" onClick={stopRecording}><Square className="h-4 w-4 mr-1" /> Parar ({elapsed}s)</Button>
                )}
                <span className="text-xs text-muted-foreground">Máx. {MAX_SECONDS}s</span>
              </div>
            </>
          )}
          {previewUrl && (
            <>
              <video src={previewUrl} controls className="w-full aspect-video rounded bg-black" />
              <div className="flex gap-2">
                <Button onClick={handleSaveRecorded} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  Salvar e ativar
                </Button>
                <Button variant="ghost" onClick={discardRecording}>Descartar</Button>
              </div>
            </>
          )}
          <div className="pt-2 border-t">
            <label className="text-sm text-muted-foreground">Ou envie um vídeo já gravado:</label>
            <input type="file" accept="video/*" onChange={handleFileUpload} disabled={uploading} className="block mt-1 text-sm" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Meus vídeos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum vídeo ainda.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {videos.map((v: any) => (
                <div key={v.id} className="space-y-2">
                  <VideoPreview path={v.video_url} />
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {v.is_active && <Badge className="bg-green-600">Ativo</Badge>}
                      <span className="text-muted-foreground">{v.duration_seconds ? `${v.duration_seconds}s` : ""}</span>
                    </div>
                    <div className="flex gap-1">
                      {!v.is_active && (
                        <Button size="sm" variant="outline" onClick={async () => { await setActive({ data: { id: v.id } }); qc.invalidateQueries({ queryKey: ["intro_videos"] }); }}>
                          <Star className="h-3 w-3 mr-1" /> Ativar
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={async () => {
                        if (!confirm("Apagar?")) return;
                        await del({ data: { id: v.id, storage_path: v.video_url } });
                        qc.invalidateQueries({ queryKey: ["intro_videos"] });
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
