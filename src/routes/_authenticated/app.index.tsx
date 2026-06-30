import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { computeScore } from "@/lib/score";
import { computeJourney, type JourneyStageKey } from "@/lib/h2a-journey";
import {
  ArrowRight, AlertCircle, CheckCircle2, FileText, Send,
  Stamp, Mic, PartyPopper, Sparkles, RefreshCw,
} from "lucide-react";
import { InlineQueryError } from "@/components/query-state";

export const Route = createFileRoute("/_authenticated/app/")({ component: Dashboard });

type PhaseAction = {
  /** Headline microcopy: what to do TODAY. Imperative, concrete. */
  title: string;
  /** One short paragraph: why this, why now. */
  why: string;
  /** Button label. */
  cta: string;
  /** Where the button navigates. */
  to: string;
  /** Icon for the focal CTA card. */
  icon: typeof FileText;
};

function nextActionFor(
  stageKey: JourneyStageKey | "embarque",
  ob: { profile: boolean; experience: boolean; media: boolean; video: boolean; firstApply: boolean },
): PhaseAction {
  // Within "Currículo" we still hop the user across the smallest open
  // sub-step so the single CTA never points at a finished page.
  if (stageKey === "curriculo") {
    if (!ob.profile) {
      return {
        title: "Hoje: preencha seu perfil",
        why: "Empregadores ignoram perfis sem nome e contato. 2 minutos resolve.",
        cta: "Preencher perfil",
        to: "/app/perfil",
        icon: FileText,
      };
    }
    if (!ob.experience) {
      return {
        title: "Hoje: adicione 1 experiência",
        why: "Mesmo que seja meia safra. Sem experiência, sua candidatura cai no fim da pilha.",
        cta: "Adicionar experiência",
        to: "/app/curriculo",
        icon: FileText,
      };
    }
    if (!ob.media) {
      return {
        title: "Hoje: suba 3 fotos do seu trabalho",
        why: "Foto colhendo, dirigindo trator ou no packing house. Empregadores respondem 2× mais.",
        cta: "Subir fotos",
        to: "/app/midia",
        icon: FileText,
      };
    }
    if (!ob.video) {
      return {
        title: "Hoje: grave 90 s de apresentação",
        why: "Em inglês simples: nome, anos de experiência, o que sabe fazer. 3× mais respostas.",
        cta: "Gravar vídeo",
        to: "/app/video",
        icon: Mic,
      };
    }
    return {
      title: "Currículo pronto — revise antes de aplicar",
      why: "Confira o resumo em inglês e a disponibilidade de datas. Depois é só candidatar.",
      cta: "Revisar currículo",
      to: "/app/curriculo",
      icon: FileText,
    };
  }
  if (stageKey === "candidatura") {
    if (!ob.firstApply) {
      return {
        title: "Hoje: envie sua primeira candidatura",
        why: "Filtre por estado e clique em ‘Candidatar’ na vaga que paga melhor. A IA escreve a carta.",
        cta: "Ver vagas H-2A",
        to: "/app/vagas",
        icon: Send,
      };
    }
    return {
      title: "Hoje: candidate em mais 3 vagas",
      why: "Quem aplica em 10+ vagas tem 4× mais chance de fechar. Diversifique estado e cultura.",
      cta: "Buscar mais vagas",
      to: "/app/vagas",
      icon: Send,
    };
  }
  if (stageKey === "ds160") {
    return {
      title: "Hoje: abra o DS-160 no checklist",
      why: "Você tem oferta. Agora é formulário consular: nome no passaporte, foto 5×5 e endereço da fazenda.",
      cta: "Ir para checklist do visto",
      to: "/app/visto",
      icon: Stamp,
    };
  }
  if (stageKey === "entrevista") {
    return {
      title: "Hoje: ensaie a entrevista consular",
      why: "Treine respostas curtas em inglês. Leve I-129 + carta do empregador. Sem decorar, sem improvisar.",
      cta: "Treinar inglês para entrevista",
      to: "/app/ingles",
      icon: Mic,
    };
  }
  if (stageKey === "visto") {
    return {
      title: "Hoje: confirme retirada do passaporte",
      why: "Acompanhe o status no portal CGI Federal e marque ‘Visto emitido’ no checklist.",
      cta: "Marcar visto emitido",
      to: "/app/visto",
      icon: Stamp,
    };
  }
  // "embarque" → tudo pronto
  return {
    title: "Tudo pronto — boa viagem 🇺🇸",
    why: "Salve cópias digitais do contrato, I-129 e passaporte. Você terminou a jornada no app.",
    cta: "Ver guia de embarque",
    to: "/app/visto",
    icon: PartyPopper,
  };
}

function Dashboard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  // First-time users (no profile filled at all) → wizard
  useEffect(() => {
    supabase.from("my_profile").select("onboarding_completed_at,full_name").maybeSingle().then(({ data }) => {
      if (data && !data.onboarding_completed_at && !data.full_name) {
        navigate({ to: "/app/comecar", replace: true });
      }
    });
  }, [navigate]);

  const stats = useQuery({
    queryKey: ["dash-stats"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();
      const [apps, resumes, exps, media, video, jobsNew, followsDue, profileRow, visa] = await Promise.all([
        supabase.from("applications").select("status,follow_up_sent_at,follow_up_due_at,responded_at,sent_at"),
        supabase.from("resumes").select("summary_pt,summary_en,availability_type,availability_start,availability_end").limit(1).maybeSingle(),
        supabase.from("resume_experiences").select("id"),
        supabase.from("work_media").select("category,is_featured"),
        supabase.from("intro_video").select("id").eq("is_active", true).limit(1).maybeSingle(),
        supabase.from("jobs").select("id", { count: "exact", head: true }).gte("imported_at", todayIso),
        supabase.from("applications").select("id", { count: "exact", head: true }).is("responded_at", null).is("follow_up_sent_at", null).lte("follow_up_due_at", new Date().toISOString()),
        supabase.from("my_profile").select("full_name,phone,onboarding_completed_at").maybeSingle(),
        supabase.from("visa_checklist_items").select("step_key,is_completed"),
      ]);
      const list = apps.data ?? [];
      const total = list.length;
      const responded = list.filter((a) => ["responded", "hired"].includes(a.status ?? "") || a.responded_at).length;
      const hired = list.filter((a) => a.status === "hired").length;
      const followups = list.filter((a) => !!a.follow_up_sent_at).length;
      const sentToday = list.filter((a) => a.sent_at && new Date(a.sent_at) >= today).length;
      const mediaByCategory = { agriculture: 0, machinery: 0, animals: 0, general: 0 };
      for (const m of media.data ?? []) {
        const c = m.category as keyof typeof mediaByCategory | null;
        if (c && c in mediaByCategory) mediaByCategory[c]++;
      }
      const featuredMediaCount = (media.data ?? []).filter((m) => m.is_featured).length;
      const score = computeScore({
        hasResumeSummaryPt: !!resumes.data?.summary_pt,
        hasResumeSummaryEn: !!resumes.data?.summary_en,
        hasAvailabilityDates: !!(resumes.data as { availability_type?: string | null } | null)?.availability_type || (!!resumes.data?.availability_start && !!resumes.data?.availability_end),
        experiencesCount: exps.data?.length ?? 0,
        mediaByCategory, hasActiveIntroVideo: !!video.data,
      });
      const onboarding = {
        profile: !!(profileRow.data?.full_name && profileRow.data?.phone),
        experience: (exps.data?.length ?? 0) > 0,
        media: (media.data?.length ?? 0) > 0,
        featured: featuredMediaCount > 0,
        video: !!video.data,
        firstApply: total > 0,
        completed: !!profileRow.data?.onboarding_completed_at,
      };
      const visaSteps: Record<string, boolean> = {};
      for (const r of visa.data ?? []) visaSteps[r.step_key] = !!r.is_completed;
      const journey = computeJourney({
        onboardingDone: onboarding.completed,
        appsCount: total,
        visaSteps,
      });
      return {
        total, responded, hired, followups, sentToday, score,
        newJobsToday: jobsNew.count ?? 0, followupsDue: followsDue.count ?? 0,
        onboarding, journey,
      };
    },
    staleTime: 120_000,
    gcTime: 300_000,
  });

  const rate = stats.data?.total ? Math.round((stats.data.responded / stats.data.total) * 100) : 0;
  const suggestions = lang === "pt" ? stats.data?.score.suggestions_pt : stats.data?.score.suggestions_en;
  const journey = stats.data?.journey;

  // Identify the current phase. When everything is done, fall back to the
  // "embarque" celebration. Use the first not-done stage key when available.
  const currentStageKey: JourneyStageKey | "embarque" = journey
    ? (journey.stages.find((s) => !s.done)?.key ?? "embarque")
    : "curriculo";
  const action = stats.data
    ? nextActionFor(currentStageKey, stats.data.onboarding)
    : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.625rem] font-bold leading-[1.05] tracking-tight text-balance">
          {t("dashboard")}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Acompanhe sua jornada H-2A em um único lugar.
        </p>
      </header>

      {stats.isPending && (
        <div className="space-y-4" aria-busy="true" aria-label="Carregando painel">
          <Card><CardContent className="p-5 sm:p-6 space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-1.5 w-full" />
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-1 w-full" />)}
            </div>
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
            <Skeleton className="h-11 w-40" />
          </CardContent></Card>
          <Card><CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-16" />
              <Skeleton className="h-3 flex-1" />
            </div>
          </CardContent></Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
              </CardContent></Card>
            ))}
          </div>
        </div>
      )}

      {!stats.isPending && stats.error && (
        <InlineQueryError
          error={stats.error}
          title="Não foi possível carregar seu painel."
          onRetry={() => stats.refetch()}
        />
      )}


      {(stats.data?.followupsDue ?? 0) > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="pt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              <span><strong>{stats.data?.followupsDue}</strong> follow-up(s) devidos hoje</span>
            </div>
            <Button asChild size="sm"><Link to="/app/followups">Ir para follow-ups <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
          </CardContent>
        </Card>
      )}

      {/* SINGLE focused CTA: one phase, one verb, one button. */}
      {action && journey && (
        <Card
          className="border-primary/40 bg-gradient-to-br from-primary/[0.04] via-card to-card overflow-hidden"
          aria-labelledby="dashboard-focus-title"
        >
          <CardContent className="p-5 sm:p-6 space-y-5">
            {/* Phase chip + journey progress */}
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                <Sparkles className="h-3 w-3" />
                Fase atual · {journey.currentStage}
              </div>
              <span
                className="text-xs text-muted-foreground"
                aria-label={`Jornada H-2A: ${journey.doneCount} de ${journey.total} fases concluídas`}
              >
                {journey.doneCount}/{journey.total}
              </span>
            </div>

            <Progress
              value={journey.progressPct}
              className="h-1.5"
              aria-label={`Progresso da Jornada H-2A: ${journey.progressPct}%`}
            />

            {/* Compact stage rail — visual only, the label list above is the source of truth. */}
            <ol className="grid grid-cols-5 gap-1.5" aria-hidden>
              {journey.stages.map((s) => (
                <li
                  key={s.key}
                  className={
                    "h-1 rounded-full " +
                    (s.done
                      ? "bg-primary"
                      : s.label === journey.currentStage
                        ? "bg-primary/40"
                        : "bg-muted")
                  }
                />
              ))}
            </ol>

            {/* Focal CTA */}
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:gap-4 items-start pt-2">
              <div className="grid h-11 w-11 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-elevated">
                <action.icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1.5">
                <h2 id="dashboard-focus-title" className="font-display text-xl sm:text-2xl font-semibold leading-[1.15] tracking-tight text-balance">
                  {action.title}
                </h2>
                <p className="text-sm sm:text-[0.95rem] text-muted-foreground leading-relaxed">{action.why}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-11 px-5">
                <Link to={action.to}>
                  {action.cta} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Link
                to="/app/visto"
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                Ver todas as fases da Jornada H-2A
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {t("quality_score")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="font-display text-4xl sm:text-5xl font-bold leading-none tracking-tight text-primary tabular-nums">{stats.data?.score.total ?? 0}%</div>
            <Progress
              value={stats.data?.score.total ?? 0}
              className="flex-1"
              aria-label={`Pontuação de qualidade do perfil: ${stats.data?.score.total ?? 0}%`}
            />
          </div>
          {suggestions && suggestions.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">{suggestions.map((s) => <li key={s}>• {s}</li>)}</ul>
          )}
        </CardContent>
      </Card>

      {stats.data && stats.data.total > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Funil de candidaturas</CardTitle></CardHeader>
          <CardContent>
            <Funnel
              total={stats.data.total}
              responded={stats.data.responded}
              hired={stats.data.hired}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("total_sent")} value={stats.data?.total ?? 0} />
        <StatCard label={t("response_rate")} value={`${rate}%`} />
        <StatCard label={t("followups_sent")} value={stats.data?.followups ?? 0} />
        <StatCard label={t("hired")} value={stats.data?.hired ?? 0} />
        <StatCard label="Enviadas hoje" value={stats.data?.sentToday ?? 0} />
        <StatCard label="Vagas novas hoje" value={stats.data?.newJobsToday ?? 0} />
        <StatCard label="Follow-ups devidos" value={stats.data?.followupsDue ?? 0} />
        <StatCard label="Aguardando resposta" value={(stats.data?.total ?? 0) - (stats.data?.responded ?? 0)} />
      </div>

    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="transition-shadow hover:shadow-soft"><CardContent className="p-4 sm:p-5">
      <div className="text-[11px] sm:text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-2xl sm:text-3xl font-bold leading-none tracking-tight tabular-nums">{value}</div>
    </CardContent></Card>
  );
}

function Funnel({ total, responded, hired }: { total: number; responded: number; hired: number }) {
  const respondedPct = total > 0 ? Math.round((responded / total) * 100) : 0;
  const hiredPct = total > 0 ? Math.round((hired / total) * 100) : 0;
  const Bar = ({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) => (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{count} · {pct}%</span>
      </div>
      <div className="h-7 rounded-md bg-muted overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
  return (
    <div className="space-y-2.5">
      <Bar label="Enviadas" count={total} pct={100} color="bg-primary" />
      <Bar label="Respondidas" count={responded} pct={respondedPct} color="bg-success" />
      <Bar label="Contratadas" count={hired} pct={hiredPct} color="bg-success" />
    </div>
  );
}
