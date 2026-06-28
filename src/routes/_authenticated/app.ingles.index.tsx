import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Briefcase, Plane, Tractor, BookOpen, Lock, CheckCircle2 } from "lucide-react";

const ICONS: Record<string, typeof BookOpen> = {
  Sparkles, Briefcase, Plane, Tractor, BookOpen,
};

export const Route = createFileRoute("/_authenticated/app/ingles/")({
  component: InglesIndex,
});

function InglesIndex() {
  const { data: modules } = useQuery({
    queryKey: ["english-modules"],
    queryFn: async () => {
      const { data } = await supabase
        .from("english_modules")
        .select("id, slug, title_pt, title_en, description_pt, icon, sort_order, english_lessons(id, is_free)")
        .order("sort_order");
      return data ?? [];
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["english-progress"],
    queryFn: async () => {
      const { data } = await supabase.from("english_progress").select("lesson_id");
      return new Set((data ?? []).map((r) => r.lesson_id));
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inglês para o H-2A</h1>
        <p className="text-muted-foreground mt-1">
          Aprenda o inglês essencial para a entrevista, aeroporto e trabalho no campo. Ouça a pronúncia, faça quizzes e pratique com o tutor IA.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(modules ?? []).map((m) => {
          const Icon = ICONS[m.icon] ?? BookOpen;
          const lessons = (m.english_lessons ?? []) as Array<{ id: string; is_free: boolean }>;
          const total = lessons.length;
          const done = lessons.filter((l) => progress?.has(l.id)).length;
          return (
            <Link
              key={m.id}
              to="/app/ingles/$module"
              params={{ module: m.slug }}
              className="block"
            >
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">{m.title_pt}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{m.description_pt}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary">{total} lições</Badge>
                    {done > 0 && (
                      <Badge className="bg-green-600 hover:bg-green-600 text-white">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> {done}/{total}
                      </Badge>
                    )}
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Pro libera tudo
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
