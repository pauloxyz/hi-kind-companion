import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Lock, CheckCircle2, ChevronRight, Clock, Trophy } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/app/ingles/$module/")({
  component: ModulePage,
});

function ModulePage() {
  const { module: slug } = useParams({ from: "/_authenticated/app/ingles/$module/" });

  const { data: mod } = useQuery({
    queryKey: ["english-module", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("english_modules")
        .select("id, slug, title_pt, description_pt, level, english_lessons(id, slug, title_pt, intro_pt, goal_pt, sort_order, is_free, estimated_minutes)")
        .eq("slug", slug)
        .maybeSingle();
      return data;
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
    queryKey: ["english-progress"],
    queryFn: async () => {
      const { data } = await supabase.from("english_progress").select("lesson_id, mastered_at, best_score");
      const map = new Map<string, { mastered: boolean; bestScore: number }>();
      (data ?? []).forEach((r) => map.set(r.lesson_id, { mastered: !!r.mastered_at, bestScore: Number(r.best_score ?? 0) }));
      return map;
    },
  });

  if (!mod) return <div className="text-muted-foreground">Carregando...</div>;
  const lessons = ((mod.english_lessons ?? []) as Array<{
    id: string; slug: string; title_pt: string; intro_pt: string; goal_pt: string;
    sort_order: number; is_free: boolean; estimated_minutes: number;
  }>).slice().sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      <Link to="/app/ingles" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <div>
      <PageHeader
        eyebrow={<Badge variant="outline" className="text-[10px] uppercase">{mod.level}</Badge>}
        title={mod.title_pt}
        description={mod.description_pt}
      />

      <div className="space-y-3">
        {lessons.map((l, i) => {
          const locked = !l.is_free && !isPro;
          const prog = progress?.get(l.id);
          const mastered = !!prog?.mastered;
          const attempted = !!prog;
          return (
            <Link
              key={l.id}
              to="/app/ingles/$module/$lesson"
              params={{ module: slug, lesson: l.slug }}
              className="block"
            >
              <Card className={locked ? "opacity-70" : "hover:shadow-md transition-shadow"}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className={`inline-flex items-center justify-center h-9 w-9 rounded-full font-semibold text-sm shrink-0 ${mastered ? "bg-warning text-warning-foreground" : "bg-primary/10 text-primary"}`}>
                    {mastered ? <Trophy className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{l.title_pt}</h3>
                      {l.is_free ? (
                        <Badge variant="outline" className="text-[10px]">Grátis</Badge>
                      ) : (
                        <Badge className="text-[10px] bg-primary/15 text-primary hover:bg-primary/15">Pro</Badge>
                      )}
                      {mastered && <Badge className="text-[10px] bg-warning hover:bg-warning text-warning-foreground gap-1"><Trophy className="h-3 w-3" /> Dominada</Badge>}
                      {attempted && !mastered && <Badge variant="outline" className="text-[10px]">{Math.round((prog?.bestScore ?? 0) * 100)}%</Badge>}
                    </div>
                    {l.goal_pt && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{l.goal_pt}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> ~{l.estimated_minutes} min</span>
                    </div>
                  </div>
                  {locked ? <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
