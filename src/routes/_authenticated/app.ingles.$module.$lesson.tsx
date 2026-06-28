import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft, Volume2, Loader2, CheckCircle2, XCircle, Send, Sparkles, Lock,
  Target, MessagesSquare, BookOpen, AudioLines, AlertTriangle, Globe2, Clock,
  Flame, RotateCcw, Trophy, ChevronRight, Brain, GraduationCap, Eye, EyeOff,
  Check, X, Headphones, Play,
} from "lucide-react";
import {
  speakText, tutorChat, submitMasteryQuiz, reviewFlashcard, updateStudyStep,
} from "@/lib/english.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Phrase = { en: string; pt: string; phonetic?: string; note?: string };
type DialogueLine = { speaker: string; en: string; pt: string };
type Mistake = { wrong: string; right: string; explanation_pt: string };
type QuizItem = { q: string; options: string[]; correct: number };
type Flashcard = { front: string; back: string; hint?: string; example?: string };
type ListeningMc = { type: "mc"; audio_text: string; question_pt: string; options: string[]; correct: number };
type ListeningFill = { type: "fill"; audio_text: string; prompt_pt: string; template: string; answer: string };
type ListeningItem = ListeningMc | ListeningFill;
type ChatMsg = { role: "user" | "assistant"; content: string };

const STEPS = [
  { key: "warmup", label: "Aquecimento", icon: Target },
  { key: "vocab", label: "Vocabulário", icon: BookOpen },
  { key: "dialogue", label: "Diálogo", icon: MessagesSquare },
  { key: "listening", label: "Listening", icon: Headphones },
  { key: "flashcards", label: "Flashcards", icon: Brain },
  { key: "mastery", label: "Maestria", icon: Trophy },
] as const;

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
  const submitQuizFn = useServerFn(submitMasteryQuiz);
  const reviewCard = useServerFn(reviewFlashcard);
  const saveStep = useServerFn(updateStudyStep);

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
        .select("id, slug, title_pt, title_en, intro_pt, goal_pt, warmup_pt, phrases, dialogue, flashcards, grammar_tip, pronunciation_tip, common_mistakes, cultural_note, quiz, listening_quiz, is_free, estimated_minutes, mastery_threshold, module_id")
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

  const { data: progress } = useQuery({
    queryKey: ["english-progress-detail", lesson?.id],
    enabled: !!lesson?.id,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !lesson) return null;
      const [{ data: prog }, { data: reviews }] = await Promise.all([
        supabase.from("english_progress").select("*").eq("user_id", user.id).eq("lesson_id", lesson.id).maybeSingle(),
        supabase.from("english_flashcard_reviews").select("card_index, correct_streak, mastered, total_seen").eq("user_id", user.id).eq("lesson_id", lesson.id),
      ]);
      return { prog, reviews: reviews ?? [] };
    },
  });

  const [step, setStep] = useState(0);
  useEffect(() => {
    if (progress?.prog?.current_step != null) setStep(progress.prog.current_step);
  }, [progress?.prog?.current_step]);

  const goToStep = async (n: number) => {
    setStep(n);
    if (lesson) {
      try { await saveStep({ data: { lessonId: lesson.id, step: n } }); } catch {}
      qc.invalidateQueries({ queryKey: ["english-progress-detail", lesson.id] });
    }
  };

  // Audio
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

  if (!lesson) return <div className="text-muted-foreground p-8">Carregando...</div>;

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
              Desbloqueie todas as lições, áudio nativo, flashcards e o tutor IA por menos que uma pizza por mês.
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
  const flashcards = (lesson.flashcards ?? []) as Flashcard[];
  const listening = (lesson.listening_quiz ?? []) as ListeningItem[];
  const threshold = Number(lesson.mastery_threshold ?? 0.9);
  const mastered = !!progress?.prog?.mastered_at;
  const bestScore = Number(progress?.prog?.best_score ?? 0);

  const reviewMap = new Map((progress?.reviews ?? []).map(r => [r.card_index, r]));
  const flashcardsMastered = flashcards.filter((_, i) => reviewMap.get(i)?.mastered).length;
  const allCardsMastered = flashcards.length > 0 && flashcardsMastered === flashcards.length;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24">
      <Link to="/app/ingles/$module" params={{ module: moduleSlug }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> {lesson.module_title}
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge variant="outline" className="text-[10px] uppercase">{lesson.module_level}</Badge>
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> ~{lesson.estimated_minutes} min
          </span>
          {mastered && (
            <Badge className="bg-amber-500 hover:bg-amber-500 text-white gap-1">
              <Trophy className="h-3 w-3" /> Dominada
            </Badge>
          )}
          {bestScore > 0 && !mastered && (
            <Badge variant="outline">Melhor: {Math.round(bestScore * 100)}%</Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold">{lesson.title_pt}</h1>
        <p className="text-sm text-muted-foreground italic">{lesson.title_en}</p>
      </div>

      {/* Stepper */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === step;
              const done = i < step || (i === STEPS.length - 1 && mastered);
              return (
                <button
                  key={s.key}
                  onClick={() => goToStep(i)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 p-2 rounded-md transition-colors",
                    active && "bg-primary/10",
                    !active && "hover:bg-muted",
                  )}
                >
                  <div className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center border-2",
                    active && "border-primary bg-primary text-primary-foreground",
                    done && !active && "border-emerald-500 bg-emerald-500 text-white",
                    !active && !done && "border-muted-foreground/30 text-muted-foreground",
                  )}>
                    {done && !active ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={cn(
                    "text-[10px] text-center leading-tight",
                    active ? "font-semibold" : "text-muted-foreground",
                  )}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
          <Progress value={((step + (mastered ? 1 : 0)) / STEPS.length) * 100} className="h-1 mt-3" />
        </CardContent>
      </Card>

      {/* STEP CONTENT */}
      {step === 0 && (
        <WarmupStep lesson={lesson} onNext={() => goToStep(1)} />
      )}

      {step === 1 && (
        <VocabStep
          phrases={phrases}
          mistakes={mistakes}
          grammar={lesson.grammar_tip}
          pronunciation={lesson.pronunciation_tip}
          cultural={lesson.cultural_note}
          onSpeak={onSpeak}
          playingKey={playingKey}
          onNext={() => goToStep(2)}
          onBack={() => goToStep(0)}
        />
      )}

      {step === 2 && (
        <DialogueStep
          dialogue={dialogue}
          onSpeak={onSpeak}
          playingKey={playingKey}
          onNext={() => goToStep(3)}
          onBack={() => goToStep(1)}
        />
      )}

      {step === 3 && (
        <ListeningStep
          items={listening}
          onSpeak={onSpeak}
          playingKey={playingKey}
          onNext={() => goToStep(4)}
          onBack={() => goToStep(2)}
        />
      )}

      {step === 4 && (
        <FlashcardsStep
          flashcards={flashcards}
          reviewMap={reviewMap}
          onReview={async (idx, correct) => {
            await reviewCard({ data: { lessonId: lesson.id, cardIndex: idx, correct } });
            qc.invalidateQueries({ queryKey: ["english-progress-detail", lesson.id] });
          }}
          onSpeak={onSpeak}
          playingKey={playingKey}
          allMastered={allCardsMastered}
          onNext={() => goToStep(5)}
          onBack={() => goToStep(3)}
        />
      )}

      {step === 5 && (
        <MasteryStep
          quiz={quiz}
          threshold={threshold}
          mastered={mastered}
          bestScore={bestScore}
          attempts={progress?.prog?.attempts ?? 0}
          onSubmit={async (correct, total) => {
            const r = await submitQuizFn({ data: { lessonId: lesson.id, correct, total } });
            qc.invalidateQueries({ queryKey: ["english-progress-detail", lesson.id] });
            qc.invalidateQueries({ queryKey: ["english-progress"] });
            return r;
          }}
          onBack={() => goToStep(4)}
        />
      )}

      <CoachSamFab
        lesson={lesson}
        chat={async (msgs) => {
          const { reply } = await chat({ data: { topic: lesson.title_pt, messages: msgs } });
          return reply;
        }}
      />
    </div>
  );
}

// ============ STEP 0: Warmup ============
function WarmupStep({ lesson, onNext }: { lesson: any; onNext: () => void }) {
  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-5">
          <Target className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Sua meta nesta lição</p>
            <p className="text-sm text-muted-foreground mt-1">{lesson.goal_pt}</p>
          </div>
        </CardContent>
      </Card>

      {lesson.warmup_pt && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" /> Cenário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{lesson.warmup_pt}</p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/40">
        <CardContent className="p-5 space-y-3">
          <p className="text-sm font-medium">Como funciona:</p>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>Você passa por 5 etapas, na ordem.</li>
            <li>Cada flashcard precisa de <strong>2 acertos seguidos</strong> pra ficar verde.</li>
            <li>Pra "dominar" a lição, você precisa de <strong>≥90%</strong> no quiz final.</li>
            <li>Falhou? Volta, revisa, tenta de novo. Quantas vezes precisar.</li>
          </ol>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onNext} size="lg" className="gap-2">
          Começar <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============ STEP 1: Vocabulary ============
function VocabStep({
  phrases, mistakes, grammar, pronunciation, cultural, onSpeak, playingKey, onNext, onBack,
}: {
  phrases: Phrase[]; mistakes: Mistake[]; grammar?: string | null; pronunciation?: string | null; cultural?: string | null;
  onSpeak: (text: string, key: string) => void; playingKey: string | null;
  onNext: () => void; onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" /> Frases essenciais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {phrases.map((p, i) => (
            <div key={i} className="border-l-2 border-primary/30 pl-3 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-semibold">{p.en}</p>
                  {p.phonetic && <p className="text-xs text-orange-600 dark:text-orange-400 italic font-mono">{p.phonetic}</p>}
                  <p className="text-sm text-muted-foreground">{p.pt}</p>
                  {p.note && <p className="text-xs text-muted-foreground mt-1">💡 {p.note}</p>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => onSpeak(p.en, `p${i}`)} disabled={playingKey === `p${i}`}>
                  {playingKey === `p${i}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {grammar && (
        <Card className="bg-blue-500/5 border-blue-500/30">
          <CardContent className="p-4">
            <p className="font-semibold text-sm flex items-center gap-2 mb-1">
              <GraduationCap className="h-4 w-4 text-blue-500" /> Dica de gramática
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">{grammar}</p>
          </CardContent>
        </Card>
      )}

      {pronunciation && (
        <Card className="bg-orange-500/5 border-orange-500/30">
          <CardContent className="p-4">
            <p className="font-semibold text-sm flex items-center gap-2 mb-1">
              <AudioLines className="h-4 w-4 text-orange-500" /> Pronúncia americana
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">{pronunciation}</p>
          </CardContent>
        </Card>
      )}

      {mistakes.length > 0 && (
        <Card className="border-red-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Erros comuns de brasileiro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mistakes.map((m, i) => (
              <div key={i} className="text-sm border-b border-muted last:border-0 pb-2 last:pb-0">
                <p className="text-red-600 dark:text-red-400">{m.wrong}</p>
                <p className="text-emerald-600 dark:text-emerald-400">{m.right}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.explanation_pt}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {cultural && (
        <Card className="bg-purple-500/5 border-purple-500/30">
          <CardContent className="p-4">
            <p className="font-semibold text-sm flex items-center gap-2 mb-1">
              <Globe2 className="h-4 w-4 text-purple-500" /> Cultura americana
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">{cultural}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
        <Button onClick={onNext} size="lg" className="gap-2">Próximo: Diálogo <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ============ STEP 2: Dialogue ============
function DialogueStep({
  dialogue, onSpeak, playingKey, onNext, onBack,
}: {
  dialogue: DialogueLine[]; onSpeak: (text: string, key: string) => void; playingKey: string | null;
  onNext: () => void; onBack: () => void;
}) {
  const [revealedPt, setRevealedPt] = useState<Record<number, boolean>>({});
  const speakers = Array.from(new Set(dialogue.map(d => d.speaker)));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-primary" /> Diálogo realista
          </CardTitle>
          <p className="text-xs text-muted-foreground">Toque no áudio, leia em voz alta, depois revele o português.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {dialogue.map((line, i) => {
            const isYou = speakers.indexOf(line.speaker) === 1;
            return (
              <div key={i} className={cn("flex flex-col gap-1", isYou ? "items-end" : "items-start")}>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-2">{line.speaker}</span>
                <div className={cn(
                  "rounded-2xl px-4 py-2.5 max-w-[85%] flex items-start gap-2",
                  isYou ? "bg-primary text-primary-foreground" : "bg-muted",
                )}>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{line.en}</p>
                    {revealedPt[i] && (
                      <p className={cn("text-xs mt-1", isYou ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {line.pt}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => onSpeak(line.en, `d${i}`)} className="opacity-70 hover:opacity-100">
                      {playingKey === `d${i}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => setRevealedPt(prev => ({ ...prev, [i]: !prev[i] }))} className="opacity-70 hover:opacity-100">
                      {revealedPt[i] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
        <Button onClick={onNext} size="lg" className="gap-2">Próximo: Listening <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ============ STEP 3: Flashcards ============
function FlashcardsStep({
  flashcards, reviewMap, onReview, onSpeak, playingKey, allMastered, onNext, onBack,
}: {
  flashcards: Flashcard[];
  reviewMap: Map<number, { card_index: number; correct_streak: number; mastered: boolean; total_seen: number }>;
  onReview: (idx: number, correct: boolean) => Promise<void>;
  onSpeak: (text: string, key: string) => void; playingKey: string | null;
  allMastered: boolean; onNext: () => void; onBack: () => void;
}) {
  // Pick next card: prioritize non-mastered, then lowest streak
  const queue = flashcards
    .map((c, i) => ({ c, i, review: reviewMap.get(i) }))
    .filter(x => !x.review?.mastered)
    .sort((a, b) => (a.review?.correct_streak ?? -1) - (b.review?.correct_streak ?? -1));

  const current = queue[0];
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const masteredCount = flashcards.filter((_, i) => reviewMap.get(i)?.mastered).length;

  useEffect(() => { setFlipped(false); }, [current?.i]);

  const handle = async (correct: boolean) => {
    if (!current || busy) return;
    setBusy(true);
    try { await onReview(current.i, correct); } finally { setBusy(false); }
  };

  if (!current || allMastered) {
    return (
      <div className="space-y-4">
        <Card className="bg-emerald-500/5 border-emerald-500/30">
          <CardContent className="p-8 text-center space-y-3">
            <Trophy className="h-12 w-12 text-emerald-500 mx-auto" />
            <h3 className="text-xl font-bold">Vocabulário dominado!</h3>
            <p className="text-sm text-muted-foreground">
              Você acertou todos os {flashcards.length} flashcards duas vezes seguidas. Agora vamos para o quiz de maestria.
            </p>
          </CardContent>
        </Card>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
          <Button onClick={onNext} size="lg" className="gap-2">Quiz de Maestria <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Dominados: <strong className="text-foreground">{masteredCount}/{flashcards.length}</strong></span>
        <Badge variant="outline">Streak desta carta: {current.review?.correct_streak ?? 0}/2</Badge>
      </div>
      <Progress value={(masteredCount / flashcards.length) * 100} className="h-2" />

      <Card
        className="min-h-[260px] cursor-pointer hover:shadow-md transition-all"
        onClick={() => setFlipped(f => !f)}
      >
        <CardContent className="p-8 flex flex-col items-center justify-center min-h-[260px] text-center space-y-4">
          {!flipped ? (
            <>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inglês</p>
              <p className="text-3xl font-bold">{current.c.front}</p>
              {current.c.hint && <p className="text-xs text-muted-foreground italic">💡 {current.c.hint}</p>}
              <button
                onClick={(e) => { e.stopPropagation(); onSpeak(current.c.front, `fc${current.i}`); }}
                className="text-primary"
              >
                {playingKey === `fc${current.i}` ? <Loader2 className="h-5 w-5 animate-spin" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <p className="text-xs text-muted-foreground">(toque para ver a tradução)</p>
            </>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Português</p>
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{current.c.back}</p>
              {current.c.example && (
                <p className="text-sm text-muted-foreground italic border-t pt-3 mt-2">"{current.c.example}"</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {flipped && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" className="border-red-500/40 text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => handle(false)} disabled={busy}>
            <X className="h-4 w-4 mr-2" /> Não sabia
          </Button>
          <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handle(true)} disabled={busy}>
            <Check className="h-4 w-4 mr-2" /> Acertei
          </Button>
        </div>
      )}
      {!flipped && (
        <Button variant="ghost" className="w-full" onClick={() => setFlipped(true)}>
          Ver tradução
        </Button>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
        <Button variant="ghost" size="sm" onClick={onNext} disabled={masteredCount < Math.max(1, Math.floor(flashcards.length * 0.5))}>
          Pular para Maestria <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============ STEP 4: Mastery Quiz ============
function MasteryStep({
  quiz, threshold, mastered, bestScore, attempts, onSubmit, onBack,
}: {
  quiz: QuizItem[]; threshold: number; mastered: boolean; bestScore: number; attempts: number;
  onSubmit: (correct: number, total: number) => Promise<{ passed: boolean; score: number; threshold: number; bestScore: number; attempts: number }>;
  onBack: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof onSubmit>> | null>(null);
  const [busy, setBusy] = useState(false);

  const correct = quiz.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0);
  const allAnswered = quiz.every((_, i) => answers[i] != null);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await onSubmit(correct, quiz.length);
      setResult(r);
      setSubmitted(true);
      if (r.passed) toast.success(`🏆 Dominado! ${Math.round(r.score * 100)}%`);
      else toast.error(`${Math.round(r.score * 100)}% — você precisa de ${Math.round(threshold * 100)}% pra dominar.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  const retry = () => { setAnswers({}); setSubmitted(false); setResult(null); };

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Trophy className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Quiz de Maestria — {Math.round(threshold * 100)}% para dominar</p>
            <p className="text-xs text-muted-foreground">{quiz.length} questões. Atentivamente — você só passa de verdade quando estiver afiado.</p>
            {attempts > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Tentativas: {attempts} · Melhor: {Math.round(bestScore * 100)}% {mastered && "· ✅ Dominada"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {quiz.map((q, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-2">
            <p className="font-medium text-sm">{i + 1}. {q.q}</p>
            <div className="space-y-1.5">
              {q.options.map((opt, oi) => {
                const selected = answers[i] === oi;
                const isCorrect = q.correct === oi;
                const showRight = submitted && isCorrect;
                const showWrong = submitted && selected && !isCorrect;
                return (
                  <button
                    key={oi}
                    onClick={() => !submitted && setAnswers(prev => ({ ...prev, [i]: oi }))}
                    disabled={submitted}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md border text-sm transition-colors",
                      !submitted && selected && "border-primary bg-primary/10",
                      !submitted && !selected && "border-border hover:bg-muted",
                      showRight && "border-emerald-500 bg-emerald-500/10",
                      showWrong && "border-red-500 bg-red-500/10",
                      submitted && !showRight && !showWrong && "opacity-60",
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      {showRight && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      {showWrong && <XCircle className="h-4 w-4 text-red-500" />}
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {submitted && result && (
        <Card className={cn(
          "border-2",
          result.passed ? "border-emerald-500 bg-emerald-500/10" : "border-red-500 bg-red-500/10",
        )}>
          <CardContent className="p-5 text-center space-y-2">
            {result.passed ? (
              <>
                <Trophy className="h-10 w-10 text-amber-500 mx-auto" />
                <p className="text-xl font-bold">Dominado! 🏆</p>
                <p className="text-sm">{Math.round(result.score * 100)}% — acima do exigido ({Math.round(threshold * 100)}%)</p>
              </>
            ) : (
              <>
                <RotateCcw className="h-10 w-10 text-red-500 mx-auto" />
                <p className="text-xl font-bold">Ainda não 💪</p>
                <p className="text-sm">{correct}/{quiz.length} ({Math.round(result.score * 100)}%) — você precisa de {Math.round(threshold * 100)}%</p>
                <p className="text-xs text-muted-foreground">Revise os flashcards e tente de novo. Maestria é repetir até acertar.</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between gap-2 sticky bottom-4 bg-background/80 backdrop-blur p-2 rounded-md">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Flashcards</Button>
        {!submitted ? (
          <Button onClick={submit} disabled={!allAnswered || busy} size="lg">
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submeter ({Object.keys(answers).length}/{quiz.length})
          </Button>
        ) : (
          <Button onClick={retry} size="lg" variant={result?.passed ? "outline" : "default"}>
            <RotateCcw className="h-4 w-4 mr-2" /> Tentar de novo
          </Button>
        )}
      </div>
    </div>
  );
}

// ============ STEP 3: Listening ============
function ListeningStep({
  items, onSpeak, playingKey, onNext, onBack,
}: {
  items: ListeningItem[];
  onSpeak: (text: string, key: string) => void;
  playingKey: string | null;
  onNext: () => void;
  onBack: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string | number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  if (!items || items.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="bg-muted/40">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Esta lição ainda não tem exercícios de listening.
          </CardContent>
        </Card>
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
          <Button onClick={onNext} size="lg" className="gap-2">Próximo: Flashcards <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }

  const check = (i: number, item: ListeningItem): boolean | null => {
    const a = answers[i];
    if (a == null || !revealed[i]) return null;
    if (item.type === "mc") return Number(a) === item.correct;
    return String(a).trim().toLowerCase() === item.answer.trim().toLowerCase();
  };

  const correctCount = items.reduce((acc, it, i) => acc + (check(i, it) === true ? 1 : 0), 0);
  const answered = items.every((_, i) => answers[i] != null && revealed[i]);

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Headphones className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Treine seu ouvido</p>
            <p className="text-xs text-muted-foreground">
              {items.length} exercícios: ouça o áudio, escolha ou digite a resposta. Use o áudio quantas vezes precisar.
            </p>
          </div>
        </CardContent>
      </Card>

      {items.map((item, i) => {
        const status = check(i, item);
        return (
          <Card key={i} className={cn(
            "border-2 transition-colors",
            status === true && "border-emerald-500/50 bg-emerald-500/5",
            status === false && "border-red-500/50 bg-red-500/5",
            status === null && "border-border",
          )}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground">{i + 1}.</span> {item.type === "mc" ? item.question_pt : item.prompt_pt}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSpeak(item.audio_text, `ls${i}`)}
                  disabled={playingKey === `ls${i}`}
                  className="gap-1.5 shrink-0"
                >
                  {playingKey === `ls${i}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                  Tocar
                </Button>
              </div>

              {item.type === "mc" ? (
                <div className="space-y-1.5">
                  {item.options.map((opt, oi) => {
                    const selected = answers[i] === oi;
                    const isRight = item.correct === oi;
                    const showRight = revealed[i] && isRight;
                    const showWrong = revealed[i] && selected && !isRight;
                    return (
                      <button
                        key={oi}
                        onClick={() => !revealed[i] && setAnswers(prev => ({ ...prev, [i]: oi }))}
                        disabled={revealed[i]}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md border text-sm transition-colors",
                          !revealed[i] && selected && "border-primary bg-primary/10",
                          !revealed[i] && !selected && "border-border hover:bg-muted",
                          showRight && "border-emerald-500 bg-emerald-500/10",
                          showWrong && "border-red-500 bg-red-500/10",
                          revealed[i] && !showRight && !showWrong && "opacity-60",
                        )}
                      >
                        <span className="inline-flex items-center gap-2">
                          {showRight && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                          {showWrong && <XCircle className="h-4 w-4 text-red-500" />}
                          {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-mono text-sm bg-muted/50 px-3 py-2 rounded-md">
                    {item.template}
                  </p>
                  <Input
                    placeholder="Digite a palavra que ouviu..."
                    value={(answers[i] as string) ?? ""}
                    onChange={e => !revealed[i] && setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                    disabled={revealed[i]}
                    onKeyDown={e => {
                      if (e.key === "Enter" && answers[i] != null && !revealed[i]) {
                        setRevealed(prev => ({ ...prev, [i]: true }));
                      }
                    }}
                  />
                  {revealed[i] && (
                    <p className={cn(
                      "text-xs",
                      status ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                    )}>
                      {status ? `✓ Correto: "${item.answer}"` : `✗ A resposta era: "${item.answer}"`}
                    </p>
                  )}
                </div>
              )}

              {!revealed[i] ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  disabled={answers[i] == null || (item.type === "fill" && !String(answers[i]).trim())}
                  onClick={() => setRevealed(prev => ({ ...prev, [i]: true }))}
                >
                  Verificar
                </Button>
              ) : (
                <p className="text-xs text-center text-muted-foreground">
                  Áudio: <span className="italic">"{item.audio_text}"</span>
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {answered && (
        <Card className={cn(
          "border-2",
          correctCount === items.length ? "border-emerald-500 bg-emerald-500/10" : "border-amber-500 bg-amber-500/10",
        )}>
          <CardContent className="p-4 text-center">
            <p className="font-bold">
              {correctCount}/{items.length} corretos
              {correctCount === items.length && " — orelha americana ativada 🎧"}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
        <Button onClick={onNext} size="lg" className="gap-2">Próximo: Flashcards <ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}


// ============ Floating Coach Sam chat ============
function CoachSamFab({ lesson, chat }: { lesson: any; chat: (msgs: ChatMsg[]) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const t = input.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const reply = await chat(next);
      setMsgs([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no chat");
    } finally { setBusy(false); }
  };

  return (
    <>
      {!open && (
        <Button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 rounded-full h-14 w-14 shadow-lg z-50" size="icon">
          <Sparkles className="h-5 w-5" />
        </Button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 w-[360px] max-w-[calc(100vw-2rem)] h-[500px] bg-background border rounded-lg shadow-2xl flex flex-col z-50">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="font-semibold text-sm">Coach Sam</p>
              <Badge variant="outline" className="text-[10px]">{lesson.title_pt}</Badge>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {msgs.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Pratique em inglês ou pergunte qualquer dúvida sobre a lição. Sam corrige você com carinho.
              </p>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn(
                "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                m.role === "user" ? "bg-primary text-primary-foreground ml-8" : "bg-muted mr-8",
              )}>
                {m.content}
              </div>
            ))}
            {busy && <div className="text-xs text-muted-foreground">Sam está digitando...</div>}
          </div>
          <div className="p-3 border-t flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Try in English..."
              disabled={busy}
            />
            <Button size="icon" onClick={send} disabled={busy || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
