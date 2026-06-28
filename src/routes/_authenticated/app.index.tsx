import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { computeScore } from "@/lib/score";
import { ArrowRight, AlertCircle, CheckCircle2, Circle, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/")({ component: Dashboard });

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
      const [apps, resumes, exps, media, video, jobsNew, followsDue, profileRow] = await Promise.all([
        supabase.from("applications").select("status,follow_up_sent_at,follow_up_due_at,responded_at,sent_at"),
        supabase.from("resumes").select("summary_pt,summary_en,availability_type,availability_start,availability_end").limit(1).maybeSingle(),
        supabase.from("resume_experiences").select("id"),
        supabase.from("work_media").select("category,is_featured"),
        supabase.from("intro_video").select("id").eq("is_active", true).limit(1).maybeSingle(),
        supabase.from("jobs").select("id", { count: "exact", head: true }).gte("imported_at", todayIso),
        supabase.from("applications").select("id", { count: "exact", head: true }).is("responded_at", null).is("follow_up_sent_at", null).lte("follow_up_due_at", new Date().toISOString()),
        supabase.from("my_profile").select("full_name,phone,onboarding_completed_at").maybeSingle(),
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
      return { total, responded, hired, followups, sentToday, score,
        newJobsToday: jobsNew.count ?? 0, followupsDue: followsDue.count ?? 0, onboarding };
    },
  });

  const rate = stats.data?.total ? Math.round((stats.data.responded / stats.data.total) * 100) : 0;
  const suggestions = lang === "pt" ? stats.data?.score.suggestions_pt : stats.data?.score.suggestions_en;
  const ob = stats.data?.onboarding;

  // Build next-steps list
  const nextSteps = ob ? [
    { key: "profile", done: ob.profile, label: "Preencher perfil (nome e contato)", to: "/app/perfil" },
    { key: "experience", done: ob.experience, label: "Adicionar pelo menos 1 experiência", to: "/app/curriculo" },
    { key: "media", done: ob.media, label: "Subir fotos do seu trabalho", to: "/app/midia" },
    { key: "featured", done: ob.featured, label: "Marcar ⭐ nas melhores mídias (aparecem no link)", to: "/app/midia" },
    { key: "video", done: ob.video, label: "Gravar vídeo de apresentação (3x mais respostas)", to: "/app/video" },
    { key: "firstApply", done: ob.firstApply, label: "Enviar sua primeira candidatura", to: "/app/vagas" },
  ] : [];
  const doneCount = nextSteps.filter((s) => s.done).length;
  const allDone = nextSteps.length > 0 && doneCount === nextSteps.length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("dashboard")}</h1>

      {(stats.data?.followupsDue ?? 0) > 0 && (
        <Card className="border-orange-500 bg-orange-500/5">
          <CardContent className="pt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <span><strong>{stats.data?.followupsDue}</strong> follow-up(s) devidos hoje</span>
            </div>
            <Button asChild size="sm"><Link to="/app/followups">Ir para follow-ups <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
          </CardContent>
        </Card>
      )}

      {!allDone && nextSteps.length > 0 && (
        <Card className="border-primary/40 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Próximos passos
              </CardTitle>
              <span className="text-xs text-muted-foreground">{doneCount}/{nextSteps.length}</span>
            </div>
            <Progress value={(doneCount / nextSteps.length) * 100} className="h-1.5 mt-2" />
          </CardHeader>
          <CardContent className="space-y-1.5">
            {nextSteps.map((s) => (
              <Link
                key={s.key}
                to={s.to}
                className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  s.done ? "text-muted-foreground line-through" : "hover:bg-accent"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {s.done ? (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{s.label}</span>
                </div>
                {!s.done && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{t("quality_score")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold text-primary">{stats.data?.score.total ?? 0}%</div>
            <Progress value={stats.data?.score.total ?? 0} className="flex-1" />
          </div>
          {suggestions && suggestions.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">{suggestions.map((s) => <li key={s}>• {s}</li>)}</ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </CardContent></Card>
  );
}
