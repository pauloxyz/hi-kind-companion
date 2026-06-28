import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Volume2, Loader2, CheckCircle2, XCircle, Send, Sparkles, Lock,
  Target, MessagesSquare, BookOpen, AudioLines, AlertTriangle, Globe2, Clock,
} from "lucide-react";
import { speakText, tutorChat, markLessonComplete } from "@/lib/english.functions";
import { toast } from "sonner";

type Phrase = { en: string; pt: string; phonetic?: string; note?: string };
type DialogueLine = { speaker: string; en: string; pt: string };
type Mistake = { wrong: string; right: string; explanation_pt: string };
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
        .select("id, title_pt, level")
        .eq("slug", moduleSlug)
        .maybeSingle();
      if (!mod) return null;
      const { data } = await supabase
        .from("english_lessons")
        .select("id, slug, title_pt, title_en, intro_pt, goal_pt, phrases, dialogue, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, is_free, estimated_minutes, module_id")
        .eq("module_id", mod.id)
        .eq("slug", lessonSlug)
        .maybeSingle();
      return data ? { ...data, module_title: mod.title_pt, module_level: mod.level } : null;
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

  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onSpeak = async (text: string, key: string) => {
    try {
      setPlayingKey(key);
      const { audio } = await speak({ data: { text } });
      const a = new Audio(`data:audio/mpeg;base64,${audio}`);
      audioRef.current?.pause();
      audioRef.current = a;
      a.onended = () => setPlayingKey(null);
      a.onerror = () => setPlayingKey(null);
      await a.play();
    } catch (e) {
      setPlayingKey(null);
      toast.error(e instanceof Error ? e.message : "Erro ao tocar áudio");
    }
  };

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

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
              Desbloqueie todas as lições, quizzes, áudio nativo e o tutor IA por menos que uma pizza por mês.
            </p>
            <Button onClick={() => navigate({ to: "/precos" })}>Ver planos</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const phrases = (lesson.phrases ?? []) as Phrase[];
  const dialogue = (lesson.dialogue ?? []) as DialogueLine[];
  const mistakes = (lesson.common_mistakes ?? []) as Mistake[];
  const quiz = (lesson.quiz ?? []) as QuizItem[];

  const score = submitted ? quiz.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0) : 0;

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
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge variant="outline" className="text-[10px] uppercase">{lesson.module_level}</Badge>
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> ~{lesson.estimated_minutes} min
          </span>
        </div>
        <h1 className="text-2xl font-bold">{lesson.title_pt}</h1>
        <p className="text-sm text-muted-foreground italic">{lesson.title_en}</p>
        {lesson.intro_pt && <p className="text-muted-foreground mt-3">{lesson.intro_pt}</p>}
      </div>

      {/* Objetivo */}
      {lesson.goal_pt && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4">
            <Target className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Ao final desta lição você vai conseguir:</p>
              <p className="text-sm text-muted-foreground mt-0.5">{lesson.goal_pt}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chunks com pronúncia */}
      {phrases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" /> Chunks essenciais
            </CardTitle>
            <p className="text-xs text-muted-foreground">Toque pra ouvir a pronúncia nativa. A escrita em itálico é a pronúncia em "português".</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {phrases.map((p, i) => {
              const key = `phrase-${i}`;
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="shrink-0 h-9 w-9 text-primary"
                    onClick={() => onSpeak(p.en, key)}
                    disabled={playingKey !== null}
                    aria-label="Ouvir pronúncia"
                  >
                    {playingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{p.en}</p>
                    {p.phonetic && <p className="text-xs text-primary/80 italic mt-0.5">/{p.phonetic}/</p>}
                    <p className="text-sm text-muted-foreground mt-1">{p.pt}</p>
                    {p.note && <p className="text-xs text-muted-foreground/80 mt-1 italic">{p.note}</p>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Diálogo */}
      {dialogue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessagesSquare className="h-4 w-4 text-primary" /> Diálogo real
            </CardTitle>
            <p className="text-xs text-muted-foreground">Veja os chunks em uso. Cada fala tem áudio.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {dialogue.map((line, i) => {
              const key = `dialogue-${i}`;
              const isYou = /voc[êe]|you/i.test(line.speaker);
              return (
                <div key={i} className={`flex gap-2 ${isYou ? "flex-row-reverse" : ""}`}>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="shrink-0 h-8 w-8 text-primary self-start mt-1"
                    onClick={() => onSpeak(line.en, key)}
                    disabled={playingKey !== null}
                    aria-label="Ouvir fala"
                  >
                    {playingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </Button>
                  <div className={`flex-1 rounded-lg p-3 text-sm ${isYou ? "bg-primary/10" : "bg-muted"}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{line.speaker}</p>
                    <p className="font-medium">{line.en}</p>
                    <p className="text-muted-foreground text-xs mt-1">{line.pt}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Dica de gramática */}
      {lesson.grammar_tip && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" /> Dica de gramática em contexto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{lesson.grammar_tip}</p>
          </CardContent>
        </Card>
      )}

      {/* Dica de pronúncia */}
      {lesson.pronunciation_tip && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AudioLines className="h-4 w-4 text-blue-500" /> Dica de pronúncia americana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{lesson.pronunciation_tip}</p>
          </CardContent>
        </Card>
      )}

      {/* Armadilhas */}
      {mistakes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Armadilhas comuns do brasileiro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mistakes.map((m, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-start gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <span className="line-through text-muted-foreground">{m.wrong}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <span className="font-medium">{m.right}</span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">{m.explanation_pt}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Nota cultural */}
      {lesson.cultural_note && (
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <Globe2 className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm mb-1">Nota cultural</p>
              <p className="text-sm text-muted-foreground">{lesson.cultural_note}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quiz */}
      {quiz.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teste seu entendimento</CardTitle>
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
                        key={oi} type="button" disabled={submitted}
                        onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                        className={`flex items-center gap-2 text-left text-sm rounded-md border px-3 py-2 transition-colors ${
                          isCorrect ? "border-green-600 bg-green-50 dark:bg-green-950/30"
                            : isWrong ? "border-red-600 bg-red-50 dark:bg-red-950/30"
                              : selected ? "border-primary bg-primary/5" : "hover:bg-accent"
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

      {/* Coach Sam */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Pratique com o Coach Sam (IA)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Escreva em inglês (ou em português) sobre o tema desta lição. O Coach responde em inglês simples + tradução e corrige você em português.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {chatMessages.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Ex: "Hi, I''m Paulo. Nice to meet you."</p>
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
          <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} className="flex gap-2">
            <Input
              value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type in English (or Portuguese)..." disabled={chatLoading}
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
