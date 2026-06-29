import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Calendar,
  Paperclip,
  Trash2,
  History,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/visto/historico")({
  component: HistoryPage,
});

type Row = {
  id: string;
  item_id: string;
  step_key: string;
  step_label: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_META: Record<
  string,
  { icon: typeof CheckCircle2; label: string; tone: string }
> = {
  completed: { icon: CheckCircle2, label: "Etapa concluída", tone: "text-success" },
  reopened: { icon: RotateCcw, label: "Etapa reaberta", tone: "text-muted-foreground" },
  event_at_set: { icon: Calendar, label: "Data de realização definida", tone: "text-primary" },
  event_at_cleared: { icon: Calendar, label: "Data de realização removida", tone: "text-muted-foreground" },
  due_at_set: { icon: Calendar, label: "Prazo/agendamento definido", tone: "text-warning" },
  due_at_cleared: { icon: Calendar, label: "Prazo removido", tone: "text-muted-foreground" },
  attachment_added: { icon: Paperclip, label: "Evidência anexada", tone: "text-primary" },
  attachment_removed: { icon: Trash2, label: "Evidência removida", tone: "text-destructive" },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function describe(action: string, details: Record<string, unknown> | null) {
  if (!details) return null;
  if (action === "event_at_set" || action === "due_at_set") {
    return `${fmtDate(details.from as string)} → ${fmtDate(details.to as string)}`;
  }
  if (action === "attachment_added" || action === "attachment_removed") {
    return (details.file_name as string) ?? null;
  }
  return null;
}

function HistoryPage() {
  const q = useQuery({
    queryKey: ["visa-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visa_checklist_history")
        .select("id,item_id,step_key,step_label,action,details,created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = q.data ?? [];

  // Group by date label
  const groups = rows.reduce<Record<string, Row[]>>((acc, r) => {
    const key = new Date(r.created_at).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="min-h-11 -ml-2">
          <Link to="/app/visto" aria-label="Voltar para o checklist">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Checklist
          </Link>
        </Button>
      </div>

      <header className="rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-card to-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
          <History className="h-3.5 w-3.5" aria-hidden />
          Histórico de alterações
        </div>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
          Tudo o que mudou no seu checklist
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cada vez que você marca uma etapa, ajusta uma data ou envia/remove uma evidência,
          o registro aparece aqui em ordem cronológica.
        </p>
      </header>

      {q.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando histórico…</p>
      )}

      {!q.isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma alteração registrada ainda. Conforme você usar o checklist, as mudanças
            aparecerão aqui.
          </CardContent>
        </Card>
      )}

      {Object.entries(groups).map(([date, items]) => (
        <section key={date} aria-labelledby={`group-${date}`} className="space-y-2">
          <h2
            id={`group-${date}`}
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {date}
          </h2>
          <Card>
            <CardContent className="p-0 divide-y">
              {items.map((r) => {
                const meta = ACTION_META[r.action] ?? {
                  icon: History,
                  label: r.action,
                  tone: "text-muted-foreground",
                };
                const Icon = meta.icon;
                const detail = describe(r.action, r.details);
                return (
                  <div key={r.id} className="flex items-start gap-3 p-4">
                    <div
                      className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted ${meta.tone}`}
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <div className="font-medium text-sm">{meta.label}</div>
                        <time
                          className="text-xs text-muted-foreground tabular-nums"
                          dateTime={r.created_at}
                        >
                          {new Date(r.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <div className="text-sm text-muted-foreground">{r.step_label}</div>
                      {detail && (
                        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                          {detail}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
