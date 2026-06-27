import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n";
import { computeScore } from "@/lib/score";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const { t, lang } = useI18n();

  const stats = useQuery({
    queryKey: ["dash-stats"],
    queryFn: async () => {
      const [apps, resumes, exps, media, video] = await Promise.all([
        supabase.from("applications").select("status,follow_up_sent_at"),
        supabase.from("resumes").select("summary_pt,summary_en,availability_start,availability_end").limit(1).maybeSingle(),
        supabase.from("resume_experiences").select("id"),
        supabase.from("work_media").select("category"),
        supabase.from("intro_video").select("id").eq("is_active", true).limit(1).maybeSingle(),
      ]);
      const list = apps.data ?? [];
      const total = list.length;
      const responded = list.filter((a) => ["responded", "hired"].includes(a.status ?? "")).length;
      const hired = list.filter((a) => a.status === "hired").length;
      const followups = list.filter((a) => !!a.follow_up_sent_at).length;
      const mediaByCategory = { agriculture: 0, machinery: 0, animals: 0, general: 0 };
      for (const m of media.data ?? []) {
        const c = m.category as keyof typeof mediaByCategory | null;
        if (c && c in mediaByCategory) mediaByCategory[c]++;
      }
      const score = computeScore({
        hasResumeSummaryPt: !!resumes.data?.summary_pt,
        hasResumeSummaryEn: !!resumes.data?.summary_en,
        hasAvailabilityDates: !!resumes.data?.availability_start && !!resumes.data?.availability_end,
        experiencesCount: exps.data?.length ?? 0,
        mediaByCategory,
        hasActiveIntroVideo: !!video.data,
      });
      return { total, responded, hired, followups, score };
    },
  });

  const rate = stats.data?.total ? Math.round((stats.data.responded / stats.data.total) * 100) : 0;
  const suggestions = lang === "pt" ? stats.data?.score.suggestions_pt : stats.data?.score.suggestions_en;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("dashboard")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("quality_score")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold text-primary">{stats.data?.score.total ?? 0}%</div>
            <Progress value={stats.data?.score.total ?? 0} className="flex-1" />
          </div>
          {suggestions && suggestions.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {suggestions.map((s) => <li key={s}>• {s}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("total_sent")} value={stats.data?.total ?? 0} />
        <StatCard label={t("response_rate")} value={`${rate}%`} />
        <StatCard label={t("followups_sent")} value={stats.data?.followups ?? 0} />
        <StatCard label={t("hired")} value={stats.data?.hired ?? 0} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
