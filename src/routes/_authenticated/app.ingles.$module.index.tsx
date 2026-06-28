import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Lock, CheckCircle2, ChevronRight, Clock } from "lucide-react";

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
      const { data } = await supabase.from("english_progress").select("lesson_id");
      return new Set((data ?? []).map((r) => r.lesson_id));
    },
  });

  if (!mod) return <div className="text-muted-foreground">Carregando...</div>;
  const lessons = ((mod.english_lessons ?? []) as Array<{
    id: string; slug: string; title_pt: string; intro_pt: string; sort_order: number; is_free: boolean;
  }>).slice().sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      <Link to="/app/ingles" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{mod.title_pt}</h1>
        <p className="text-muted-foreground mt-1">{mod.description_pt}</p>
      </div>

      <div className="space-y-3">
        {lessons.map((l, i) => {
          const locked = !l.is_free && !isPro;
          const done = progress?.has(l.id);
          return (
            <Link
              key={l.id}
              to="/app/ingles/$module/$lesson"
              params={{ module: slug, lesson: l.slug }}
              className="block"
            >
              <Card className={locked ? "opacity-70" : "hover:shadow-md transition-shadow"}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{l.title_pt}</h3>
                      {l.is_free ? (
                        <Badge variant="outline" className="text-[10px]">Grátis</Badge>
                      ) : (
                        <Badge className="text-[10px] bg-primary/15 text-primary hover:bg-primary/15">Pro</Badge>
                      )}
                      {done && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{l.intro_pt}</p>
                  </div>
                  {locked ? <Lock className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
