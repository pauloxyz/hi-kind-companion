import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Briefcase, Plane, Tractor, BookOpen, Lock, CheckCircle2,
  LifeBuoy, Home, Scale, Mic, Award, Clock,
} from "lucide-react";

const ICONS: Record<string, typeof BookOpen> = {
  Sparkles, Briefcase, Plane, Tractor, BookOpen, LifeBuoy, Home, Scale, Mic, Award,
};

const LEVELS: Array<{ key: "basico" | "intermediario" | "avancado"; title: string; desc: string; accent: string }> = [
  { key: "basico", title: "Básico", desc: "Sobreviver e se comunicar no essencial.", accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  { key: "intermediario", title: "Intermediário", desc: "Trabalhar com confiança nos EUA.", accent: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  { key: "avancado", title: "Avançado", desc: "Negociar, liderar e voltar todo ano.", accent: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30" },
];

export const Route = createFileRoute("/_authenticated/app/ingles/")({
  component: InglesIndex,
});

function InglesIndex() {
  const { data: modules } = useQuery({
    queryKey: ["english-modules"],
    queryFn: async () => {
      const { data } = await supabase
        .from("english_modules")
        .select("id, slug, title_pt, description_pt, icon, sort_order, level, english_lessons(id, is_free)")
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Inglês para o H-2A</h1>
        <p className="text-muted-foreground mt-1">
          Curso completo em 3 níveis. Cada lição traz chunks com pronúncia escrita em português, diálogo real, gramática em contexto, armadilhas e cultura — além de áudio nativo e tutor IA pra praticar.
        </p>
      </div>

      {LEVELS.map((level) => {
        const levelModules = (modules ?? []).filter((m) => m.level === level.key);
        if (!levelModules.length) return null;
        return (
          <section key={level.key} className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={`text-xs font-semibold border ${level.accent}`}>
                {level.title}
              </Badge>
              <p className="text-sm text-muted-foreground">{level.desc}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {levelModules.map((m) => {
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
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                          <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary shrink-0">
                            <Icon className="h-5 w-5" />
                          </div>
                          <CardTitle className="text-base leading-tight">{m.title_pt}</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <p className="text-sm text-muted-foreground line-clamp-2">{m.description_pt}</p>
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <Badge variant="secondary" className="font-normal">
                            <Clock className="h-3 w-3 mr-1" /> {total} lições
                          </Badge>
                          {done > 0 && (
                            <Badge className="bg-green-600 hover:bg-green-600 text-white font-normal">
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
          </section>
        );
      })}
    </div>
  );
}
