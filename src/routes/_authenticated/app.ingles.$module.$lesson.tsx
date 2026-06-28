import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Volume2, Loader2, CheckCircle2, XCircle, Send, Sparkles, Lock } from "lucide-react";
import { speakText, tutorChat, markLessonComplete } from "@/lib/english.functions";
import { toast } from "sonner";

type Phrase = { en: string; pt: string; note?: string };
type QuizItem = { q: string; options: string[]; correct: number };
type ChatMsg = { role: "user" | "assistant"; content: string };

export const Route = createFileRoute("/_authenticated/app/ingles/$module/$lesson")({
  component: LessonPage,
});

function LessonPage() {
  const { module: moduleSlug, lesson: lessonSlug } = useParams({
    from: "/_authenticated/app/ingles/$module/$lesson",
  });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const speak = useServerFn(speakText);
  const chat = useServerFn(tutorChat);
  const complete = useServerFn(markLessonComplete);

  const { data: lesson } = useQuery({
    queryKey: ["english-lesson", moduleSlug, lessonSlug],
    queryFn: async () => {
      const { data: mod } = await supabase
        .from("english_modules")
        .select("id, title_pt")
        .eq("slug", moduleSlug)
        .maybeSingle();
      if (!mod) return null;
      const { data } = await supabase
        .from("english_lessons")
        .select("id, slug, title_pt, title_en, intro_pt, phrases, quiz, is_free, module_id")
        .eq("module_id", mod.id)
        .eq("slug", lessonSlug)
        .maybeSingle();
      return data ? { ...data, module_title: mod.title_pt } : null;
    },
  });

  const { data: isPro } = useQuery({
    queryKey: ["is-pro"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase.rpc("is_pro", { _user_id: user.id });
      return !!data;
    },
  });

  // TTS
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onSpeak = async (text: string, idx: number) => {
    try {
      setPlayingIdx(idx);
      const { audio } = await speak({ data: { text } });
      const a = new Audio(`data:audio/mpeg;base64,${audio}`);
      audioRef.current?.pause();
      audioRef.current = a;
      a.onended = () => setPlayingIdx(null);
      a.onerror = () => setPlayingIdx(null);
      await a.play();
    } catch (e) {
      setPlayingIdx(null);
      toast.error(e instanceof Error ? e.message : "Erro ao tocar áudio");
    }
  };

  // Quiz state
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  if (!lesson) return <div className="text-muted-foreground">Carregando...</div>;

  const locked = !lesson.is_free && !isPro;
  if (locked) {
    return (
      <div className="space-y-4 max-w-xl mx-auto text-center">
        <Link to="/app/ingles/$module" params={{ module: moduleSlug }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Link>
        <Card>
          <CardContent className="p-8 space-y-4">
            <Lock className="h-10 w-10 text-primary mx-auto" />
            <h2 className="text-xl font-bold">Esta lição é exclusiva do Pro</h2>
            <p className="text-sm text-muted-foreground">
              Desbloqueie todas as lições, quizzes e o tutor IA por menos que uma pizza por mês.
            </p>
            <Button onClick={() => navigate({ to: "/precos" })}>Ver planos</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const phrases = (lesson.phrases ?? []) as Phrase[];
  const quiz = (lesson.quiz ?? []) as QuizItem[];

  const score = submitted
    ? quiz.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0)
    : 0;

  const submitQuiz = async () => {
    setSubmitted(true);
    const correct = quiz.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0);
    try {
      await complete({ data: { lessonId: lesson.id, quizCorrect: correct, quizTotal: quiz.length } });
      qc.invalidateQueries({ queryKey: ["english-progress"] });
      toast.success(`Lição concluída! ${correct}/${quiz.length}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const next = [...chatMessages, { role: "user" as const, content: text }];
    setChatMessages(next);
    setChatInput("");
    setChatLoading(true);
    try {
      const { reply } = await chat({ data: { topic: lesson.title_pt, messages: next } });
      setChatMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no chat");
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/app/ingles/$module" params={{ module: moduleSlug }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> {lesson.module_title}
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{lesson.title_pt}</h1>
        <p className="text-sm text-muted-foreground italic">{lesson.title_en}</p>
        {lesson.intro_pt && <p className="text-muted-foreground mt-2">{lesson.intro_pt}</p>}
      </div>

      {/* Phrases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Frases-chave</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {phrases.map((p, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-9 w-9 text-primary"
                onClick={() => onSpeak(p.en, i)}
                disabled={playingIdx !== null}
                aria-label="Ouvir pronúncia"
              >
                {playingIdx === i ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{p.en}</p>
                <p className="text-sm text-muted-foreground">{p.pt}</p>
                {p.note && <p className="text-xs text-muted-foreground/80 mt-1 italic">{p.note}</p>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quiz */}
      {quiz.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quiz</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {quiz.map((q, qi) => (
              <div key={qi} className="space-y-2">
                <p className="font-medium text-sm">{qi + 1}. {q.q}</p>
                <div className="grid gap-1.5">
                  {q.options.map((opt, oi) => {
                    const selected = answers[qi] === oi;
                    const isCorrect = submitted && oi === q.correct;
                    const isWrong = submitted && selected && oi !== q.correct;
                    return (
                      <button
                        key={oi}
                        type="button"
                        disabled={submitted}
                        onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                        className={`flex items-center gap-2 text-left text-sm rounded-md border px-3 py-2 transition-colors ${
                          isCorrect
                            ? "border-green-600 bg-green-50 dark:bg-green-950/30"
                            : isWrong
                              ? "border-red-600 bg-red-50 dark:bg-red-950/30"
                              : selected
                                ? "border-primary bg-primary/5"
                                : "hover:bg-accent"
                        }`}
                      >
                        {isCorrect && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                        {isWrong && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {!submitted ? (
              <Button onClick={submitQuiz} disabled={Object.keys(answers).length < quiz.length}>
                Verificar respostas
              </Button>
            ) : (
              <div className="rounded-md border p-3 bg-muted/30 flex items-center justify-between">
                <p className="font-medium text-sm">Você acertou {score} de {quiz.length}</p>
                <Button size="sm" variant="outline" onClick={() => { setAnswers({}); setSubmitted(false); }}>
                  Refazer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Tutor Chat */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Pratique com o tutor IA
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Escreva em inglês (ou em português) sobre o tema desta lição. O Coach Sam responde em inglês simples + tradução e correções em português.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {chatMessages.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Ex: "Hello, my name is Paulo. I want to work in your farm."</p>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Coach Sam está digitando...
                </div>
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); sendChat(); }}
            className="flex gap-2"
          >
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type in English (or Portuguese)..."
              disabled={chatLoading}
            />
            <Button type="submit" size="icon" disabled={chatLoading || !chatInput.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {!submitted && quiz.length === 0 && (
        <Button onClick={submitQuiz}>Marcar como concluída</Button>
      )}
    </div>
  );
}
