import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  ExternalLink,
  Briefcase,
  FileCheck2,
  Stamp,
  CheckCircle2,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/visto")({
  component: VistoPage,
});

/**
 * Source of truth for the visa checklist UI.
 * Each step matches a `step_key` seeded by the `handle_new_user` trigger.
 * `help` is shown as muted microcopy under the title; `link` is rendered as a
 * one-click "Abrir" CTA pointing to the canonical official source.
 */
type StepMeta = {
  key: string;
  help: string;
  link?: { href: string; label: string };
};

const STEP_META: Record<string, StepMeta> = {
  // Fase 1 — Pré-candidatura
  employer_dol_certified: {
    key: "employer_dol_certified",
    help:
      "Confirme que o empregador tem a Labor Certification (ETA-9142A) aprovada pelo DOL. Sem ela, o empregador não pode patrocinar legalmente.",
    link: {
      href: "https://flag.dol.gov/case-disclosure/h-2a",
      label: "Consultar DOL H-2A",
    },
  },
  hired_by_employer: {
    key: "hired_by_employer",
    help:
      "Você precisa receber e assinar o Job Order em português. O Wilberforce Act exige que o trabalhador entenda o contrato no próprio idioma.",
  },
  // Fase 2 — Documentos pessoais
  passport_valid_6mo: {
    key: "passport_valid_6mo",
    help:
      "O passaporte tem que ter validade por pelo menos 6 meses após a data prevista de retorno aos EUA. Se faltar, renove primeiro.",
    link: {
      href: "https://www.gov.br/pf/pt-br/assuntos/passaporte",
      label: "Renovar passaporte (PF)",
    },
  },
  photo_5x5_white: {
    key: "photo_5x5_white",
    help:
      "Foto recente, 5×5 cm, fundo branco, sem óculos. Tirada nos últimos 6 meses. Você vai precisar dela para o DS-160 e o CASV.",
    link: {
      href: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html",
      label: "Requisitos oficiais",
    },
  },
  i129_filed: {
    key: "i129_filed",
    help:
      "O empregador peticiona a I-129 no USCIS e, quando aprovada, recebe o I-797 (Notice of Action). Peça uma cópia digital ao recrutador — você vai apresentar na entrevista.",
    link: {
      href: "https://www.uscis.gov/i-129",
      label: "USCIS · I-129",
    },
  },
  // Fase 3 — Consulado
  ds160: {
    key: "ds160",
    help:
      "Preencha o DS-160 em inglês no CEAC. Salve o número de confirmação e imprima a página com o código de barras.",
    link: { href: "https://ceac.state.gov/genniv/", label: "Abrir CEAC/DS-160" },
  },
  mrv_paid: {
    key: "mrv_paid",
    help:
      "Pague a taxa MRV (US$ 190) gerando o boleto no portal CGI Federal. Guarde o comprovante — sem ele você não agenda CASV/entrevista.",
    link: {
      href: "https://www.usvisascheduling.com/pt-BR/",
      label: "Pagar MRV (CGI Federal)",
    },
  },
  casv_scheduled: {
    key: "casv_scheduled",
    help:
      "Agende a coleta de biometria no Centro de Atendimento ao Solicitante de Visto (CASV). Acontece antes da entrevista no consulado.",
    link: {
      href: "https://www.usvisascheduling.com/pt-BR/",
      label: "Agendar CASV",
    },
  },
  interview_scheduled: {
    key: "interview_scheduled",
    help:
      "Após o CASV, agende a entrevista no consulado mais próximo (Rio, SP, Recife, Brasília ou Porto Alegre).",
    link: {
      href: "https://www.usvisascheduling.com/pt-BR/",
      label: "Agendar entrevista",
    },
  },
  interview_done: {
    key: "interview_done",
    help:
      "Leve passaporte, DS-160 (com código de barras), foto, comprovante MRV, I-797 e carta do empregador. Treine respostas em inglês na seção Inglês do app.",
  },
  visa_issued: {
    key: "visa_issued",
    help:
      "O oficial consular comunica a decisão na hora. Se aprovado, o passaporte fica retido para o visto ser impresso.",
  },
  passport_delivered: {
    key: "passport_delivered",
    help:
      "Acompanhe o status pelo portal CGI. O passaporte chega em 5–10 dias úteis na agência dos Correios escolhida ou no CASV.",
    link: {
      href: "https://www.usvisascheduling.com/pt-BR/",
      label: "Rastrear passaporte",
    },
  },
};

/** Group definitions render the 3 phases of the H-2A consular flow. */
const PHASES: Array<{
  id: string;
  title: string;
  subtitle: string;
  icon: typeof Briefcase;
  /** sort_order range that belongs to this phase. */
  range: [number, number];
}> = [
  {
    id: "pre",
    title: "1. Pré-candidatura",
    subtitle: "Antes de qualquer formulário: oferta legítima e contrato em mãos.",
    icon: Briefcase,
    range: [1, 29],
  },
  {
    id: "docs",
    title: "2. Documentos pessoais",
    subtitle: "O que precisa estar pronto antes de abrir o DS-160.",
    icon: FileCheck2,
    range: [30, 59],
  },
  {
    id: "consul",
    title: "3. Processo no consulado",
    subtitle: "Formulários, taxas, biometria, entrevista e retirada do passaporte.",
    icon: Stamp,
    range: [60, 999],
  },
];

type Row = {
  id: string;
  step_key: string;
  step_label: string;
  sort_order: number | null;
  is_completed: boolean | null;
};

function VistoPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["visa-checklist"],
    queryFn: async () => {
      const { data } = await supabase
        .from("visa_checklist_items")
        .select("id,step_key,step_label,sort_order,is_completed")
        .order("sort_order");
      return (data ?? []) as Row[];
    },
  });

  const toggle = async (id: string, current: boolean) => {
    await supabase
      .from("visa_checklist_items")
      .update({
        is_completed: !current,
        completed_at: !current ? new Date().toISOString() : null,
      })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["visa-checklist"] });
  };

  const items = data ?? [];
  const done = items.filter((i) => i.is_completed).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Group rows by phase based on sort_order ranges.
  const grouped = useMemo(() => {
    return PHASES.map((phase) => ({
      ...phase,
      items: items.filter(
        (i) =>
          (i.sort_order ?? 0) >= phase.range[0] &&
          (i.sort_order ?? 0) <= phase.range[1],
      ),
    }));
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Hero header with global progress */}
      <header className="rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-card to-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
          <Stamp className="h-3.5 w-3.5" />
          Jornada do visto H-2A
        </div>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-balance">
          Checklist oficial do visto H-2A
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          12 etapas em 3 fases, na ordem real do fluxo brasileiro — DOL,
          USCIS, CGI Federal e Departamento de Estado. Marque conforme avança;
          o progresso aqui alimenta sua Jornada H-2A no painel.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-primary tabular-nums">{done}</span>
            <span className="text-sm text-muted-foreground">de {total} etapas</span>
          </div>
          <Progress
            value={pct}
            aria-label={`Progresso do checklist do visto: ${pct}%`}
          />
        </div>
      </header>

      {/* Phases */}
      {grouped.map((phase) => {
        const Icon = phase.icon;
        const phaseDone = phase.items.filter((i) => i.is_completed).length;
        const phaseTotal = phase.items.length;
        const complete = phaseTotal > 0 && phaseDone === phaseTotal;
        return (
          <section key={phase.id} aria-labelledby={`phase-${phase.id}`} className="space-y-3">
            <div className="flex items-start gap-3">
              <div
                className={
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl " +
                  (complete
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/10 text-primary")
                }
                aria-hidden
              >
                {complete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id={`phase-${phase.id}`} className="text-lg font-semibold leading-tight">
                  {phase.title}
                </h2>
                <p className="text-sm text-muted-foreground">{phase.subtitle}</p>
              </div>
              <span className="self-center text-xs font-medium text-muted-foreground tabular-nums">
                {phaseDone}/{phaseTotal}
              </span>
            </div>

            <Card>
              <CardContent className="p-0 divide-y">
                {phase.items.map((it) => {
                  const meta = STEP_META[it.step_key];
                  const checked = !!it.is_completed;
                  return (
                    <div
                      key={it.id}
                      className={
                        "group flex items-start gap-3 p-4 transition-colors " +
                        (checked ? "bg-primary/[0.03]" : "hover:bg-muted/40")
                      }
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(it.id, checked)}
                        aria-label={`Marcar etapa: ${it.step_label}`}
                        className="mt-0.5 h-5 w-5"
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={
                            "font-medium leading-snug " +
                            (checked
                              ? "line-through text-muted-foreground"
                              : "text-foreground")
                          }
                        >
                          {it.step_label}
                        </div>
                        {meta?.help && (
                          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground leading-relaxed">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                            <span>{meta.help}</span>
                          </p>
                        )}
                      </div>
                      {meta?.link && (
                        <a
                          href={meta.link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted hover:text-primary"
                        >
                          {meta.link.label}
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      )}
                    </div>
                  );
                })}
                {phase.items.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">
                    Nenhuma etapa nesta fase ainda.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        );
      })}

      {/* Trustworthy footer */}
      <footer className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
        Fontes oficiais: U.S. Department of State (travel.state.gov), USCIS
        (uscis.gov/i-129), U.S. Department of Labor (flag.dol.gov), CGI Federal
        (usvisascheduling.com) e Wilberforce Pamphlet. Este checklist é apoio
        informativo; sempre confirme valores e prazos com o consulado.
      </footer>
    </div>
  );
}
