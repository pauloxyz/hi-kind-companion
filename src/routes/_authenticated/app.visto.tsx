import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// `@react-pdf/renderer` is dynamic-imported in the export handler — see line ~320.
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Briefcase,
  FileCheck2,
  Stamp,
  CheckCircle2,
  Info,
  Paperclip,
  Upload,
  Trash2,
  Bell,
  Calendar as CalendarIcon,
  Loader2,
  AlertTriangle,
  Download,
  History,
} from "lucide-react";
import { toast } from "sonner";
import type { VisaPdfData } from "@/components/VisaChecklistPdf";
import { VisaAttachmentViewer, type ViewerAttachment } from "@/components/VisaAttachmentViewer";
import { PageHeader } from "@/components/page-header";
import {
  CONTRACT_GATE_BLOCKED_MESSAGE,
  canCompleteStep,
  isContractGatedStep,
} from "@/lib/h2a-journey-gate";

export const Route = createFileRoute("/_authenticated/app/visto")({
  component: VistoPage,
});

/* ---------------------------------------------------------------- */
/* Step metadata                                                     */
/* ---------------------------------------------------------------- */

type StepMeta = {
  help: string;
  link?: { href: string; label: string };
  eventLabel?: string;
  dueLabel?: string;
  /**
   * Whether this step has a tangible artifact worth attaching as evidence.
   * Steps without a real document (e.g. "contrato assinado", "entrevista
   * realizada", "passaporte entregue") intentionally hide the upload UI.
   */
  hasAttachments?: boolean;
};

const STEP_META: Record<string, StepMeta> = {
  hired_by_employer: {
    help:
      "Você precisa receber e assinar o Job Order em português. O Wilberforce Act exige o contrato no idioma do trabalhador.",
    eventLabel: "Data da assinatura",
  },
  passport_valid_6mo: {
    help:
      "Validade mínima de 6 meses após a data prevista de retorno. Se faltar, renove antes de marcar entrevista.",
    link: { href: "https://www.gov.br/pf/pt-br/assuntos/passaporte", label: "Renovar passaporte (PF)" },
    dueLabel: "Vence em",
    hasAttachments: true,
  },
  photo_5x5_white: {
    help: "Foto recente (≤ 6 meses), 5×5 cm, fundo branco, sem óculos. Servirá para DS-160 e CASV.",
    link: {
      href: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html",
      label: "Requisitos oficiais",
    },
    eventLabel: "Tirada em",
    hasAttachments: true,
  },
  i129_filed: {
    help:
      "Quando a I-129 é aprovada, o USCIS emite o I-797 (Notice of Action). Peça a cópia digital ao recrutador — você apresenta na entrevista.",
    link: { href: "https://www.uscis.gov/i-129", label: "USCIS · I-129" },
    eventLabel: "Data do I-797",
    hasAttachments: true,
  },
  ds160: {
    help: "Preencha em inglês no CEAC. Guarde o número de confirmação e imprima a página com código de barras.",
    link: { href: "https://ceac.state.gov/genniv/", label: "Abrir CEAC/DS-160" },
    eventLabel: "Data de envio",
    hasAttachments: true,
  },
  mrv_paid: {
    help: "Gere o boleto MRV (US$ 190) no portal CGI Federal. Sem comprovante, não agenda CASV/entrevista.",
    link: { href: "https://www.usvisascheduling.com/pt-BR/", label: "Pagar MRV (CGI Federal)" },
    eventLabel: "Data do pagamento",
    hasAttachments: true,
  },
  casv_scheduled: {
    help: "Após o pagamento, agende a biometria no Centro de Atendimento (CASV). Acontece antes da entrevista.",
    link: { href: "https://www.usvisascheduling.com/pt-BR/", label: "Agendar CASV" },
    dueLabel: "Data agendada no CASV",
    hasAttachments: true,
  },
  interview_scheduled: {
    help: "Agende a entrevista no consulado mais próximo (Rio, SP, Recife, Brasília ou Porto Alegre).",
    link: { href: "https://www.usvisascheduling.com/pt-BR/", label: "Agendar entrevista" },
    dueLabel: "Data agendada",
    hasAttachments: true,
  },
  interview_done: {
    help:
      "Leve passaporte, DS-160 (com código), foto, comprovante MRV, I-797 e carta do empregador. Treine inglês na seção Inglês.",
    eventLabel: "Data da entrevista",
  },
  visa_issued: {
    help: "Decisão informada na hora. Aprovado: o passaporte fica retido para o visto ser impresso.",
    eventLabel: "Data da aprovação",
    hasAttachments: true,
  },
  passport_delivered: {
    help: "Acompanhe pelo portal CGI. Chega em 5–10 dias úteis aos Correios ou ao CASV escolhido.",
    link: { href: "https://www.usvisascheduling.com/pt-BR/", label: "Rastrear passaporte" },
    eventLabel: "Data da retirada",
  },
};

const PHASES: Array<{
  id: string;
  title: string;
  subtitle: string;
  icon: typeof Briefcase;
  range: [number, number];
}> = [
  { id: "pre", title: "1. Pré-candidatura", subtitle: "Antes de qualquer formulário: oferta legítima e contrato em mãos.", icon: Briefcase, range: [1, 29] },
  { id: "docs", title: "2. Documentos pessoais", subtitle: "O que precisa estar pronto antes de abrir o DS-160.", icon: FileCheck2, range: [30, 59] },
  { id: "consul", title: "3. Processo no consulado", subtitle: "Formulários, taxas, biometria, entrevista e retirada do passaporte.", icon: Stamp, range: [60, 999] },
];

/* ---------------------------------------------------------------- */
/* Types & helpers                                                   */
/* ---------------------------------------------------------------- */

type Item = {
  id: string;
  step_key: string;
  step_label: string;
  sort_order: number | null;
  is_completed: boolean | null;
  event_at: string | null;
  due_at: string | null;
};

type Attachment = {
  id: string;
  item_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function daysFromToday(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/* ---------------------------------------------------------------- */
/* Page                                                              */
/* ---------------------------------------------------------------- */

function VistoPage() {
  const qc = useQueryClient();
  const [liveMessage, setLiveMessage] = useState("");
  const announce = (msg: string) => {
    setLiveMessage("");
    requestAnimationFrame(() => setLiveMessage(msg));
  };

  /** Viewer state (replaces "open in new tab" for attachments). */
  const [viewer, setViewer] = useState<{
    open: boolean;
    list: ViewerAttachment[];
    initialIndex: number;
    stepLabel: string;
  }>({ open: false, list: [], initialIndex: 0, stepLabel: "" });

  const [exporting, setExporting] = useState(false);

  const itemsQ = useQuery({
    queryKey: ["visa-checklist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visa_checklist_items")
        .select("id,step_key,step_label,sort_order,is_completed,event_at,due_at")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const attachmentsQ = useQuery({
    queryKey: ["visa-attachments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visa_checklist_attachments")
        .select("id,item_id,storage_path,file_name,mime_type,size_bytes")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const items = itemsQ.data ?? [];
  const attachments = attachmentsQ.data ?? [];

  const attByItem = useMemo(() => {
    const map = new Map<string, Attachment[]>();
    for (const a of attachments) {
      const list = map.get(a.item_id) ?? [];
      list.push(a);
      map.set(a.item_id, list);
    }
    return map;
  }, [attachments]);

  const done = items.filter((i) => i.is_completed).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Mantém Jornada (sidebar/painel) em sync com o checklist: enquanto o
  // contrato não estiver marcado, bloqueamos a marcação das etapas
  // consulares para que `Fase · DS-160` nunca apareça antes da hora.
  const contractSigned = items.some(
    (i) => i.step_key === "hired_by_employer" && i.is_completed === true,
  );

  const reminders = useMemo(() => {
    return items
      .map((i) => ({ item: i, days: daysFromToday(i.due_at) }))
      .filter((x) => !x.item.is_completed && x.days !== null && x.days <= 14)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  }, [items]);

  const grouped = useMemo(
    () =>
      PHASES.map((phase) => ({
        ...phase,
        items: items.filter(
          (i) => (i.sort_order ?? 0) >= phase.range[0] && (i.sort_order ?? 0) <= phase.range[1],
        ),
      })),
    [items],
  );

  const toggle = async (item: Item) => {
    const next = !item.is_completed;
    if (!canCompleteStep({ stepKey: item.step_key, contractSigned, willComplete: next })) {
      toast.error(CONTRACT_GATE_BLOCKED_MESSAGE);
      announce(CONTRACT_GATE_BLOCKED_MESSAGE);
      return;
    }
    await supabase
      .from("visa_checklist_items")
      .update({ is_completed: next, completed_at: next ? new Date().toISOString() : null })
      .eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["visa-checklist"] });
    qc.invalidateQueries({ queryKey: ["visa-history"] });
    announce(next ? `Etapa concluída: ${item.step_label}.` : `Etapa reaberta: ${item.step_label}.`);
  };

  const updateDate = async (item: Item, field: "event_at" | "due_at", value: string) => {
    const iso = value ? new Date(value + "T12:00:00").toISOString() : null;
    const patch = field === "event_at" ? { event_at: iso } : { due_at: iso };
    await supabase.from("visa_checklist_items").update(patch).eq("id", item.id);
    qc.invalidateQueries({ queryKey: ["visa-checklist"] });
    qc.invalidateQueries({ queryKey: ["visa-history"] });
  };

  const openViewer = (list: Attachment[], index: number, stepLabel: string) => {
    setViewer({
      open: true,
      list: list.map((a) => ({
        id: a.id,
        file_name: a.file_name,
        storage_path: a.storage_path,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
      })),
      initialIndex: index,
      stepLabel,
    });
  };

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const profile = await supabase.from("my_profile").select("full_name").maybeSingle();
      const fullName = profile.data?.full_name ?? null;
      const pdfData: VisaPdfData = {
        fullName,
        generatedAt: new Date().toISOString(),
        done,
        total,
        phases: grouped.map((phase) => ({
          title: phase.title,
          items: phase.items.map((it) => {
            const meta = STEP_META[it.step_key];
            return {
              stepLabel: it.step_label,
              isCompleted: !!it.is_completed,
              eventLabel: meta?.eventLabel ?? null,
              eventAt: it.event_at,
              dueLabel: meta?.dueLabel ?? null,
              dueAt: it.due_at,
              attachments: (attByItem.get(it.id) ?? []).map((a) => a.file_name),
            };
          }),
        })),
      };
      const [{ pdf }, { VisaChecklistPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/VisaChecklistPdf"),
      ]);
      const blob = await pdf(<VisaChecklistPdf data={pdfData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checklist-visto-h2a-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      announce("PDF do checklist gerado.");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar PDF. Tente novamente.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>

      {/* Hero */}
      <header className="rounded-2xl border bg-gradient-to-br from-primary/[0.06] via-card to-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
          <Stamp className="h-3.5 w-3.5" aria-hidden />
          Jornada do visto H-2A
        </div>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-balance">
          Checklist oficial do visto H-2A
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          11 etapas em 3 fases, na ordem real do fluxo brasileiro. Marque conforme avança;
          o progresso aqui alimenta sua Jornada H-2A no painel.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-primary tabular-nums">{done}</span>
            <span className="text-sm text-muted-foreground">de {total} etapas</span>
          </div>
          <Progress value={pct} aria-label={`Progresso do checklist do visto: ${pct}%`} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={exportPdf}
            disabled={exporting || total === 0}
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Gerando…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden /> Exportar PDF
              </>
            )}
          </Button>
          <Button asChild type="button" variant="ghost" size="sm" className="min-h-11">
            <Link to="/app/visto/historico" aria-label="Abrir histórico de alterações">
              <History className="h-4 w-4" aria-hidden /> Histórico
            </Link>
          </Button>
        </div>
      </header>

      {/* Reminders */}
      {reminders.length > 0 && (
        <section
          aria-labelledby="reminders-title"
          className="rounded-xl border border-warning/40 bg-warning/[0.06] p-4"
        >
          <div className="flex items-center gap-2 text-warning">
            <Bell className="h-4 w-4" aria-hidden />
            <h2 id="reminders-title" className="text-sm font-semibold">
              Lembretes próximos
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Você também recebe esses avisos por email quando faltar 14, 7 e 1 dia (ou ao vencer).
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {reminders.map(({ item, days }) => {
              const late = (days ?? 0) < 0;
              return (
                <li key={item.id} className="flex flex-wrap items-baseline gap-x-2">
                  <a
                    href={`#step-${item.id}`}
                    className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {item.step_label}
                  </a>
                  <span className={late ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {late
                      ? `vencido há ${Math.abs(days as number)} dia(s)`
                      : days === 0
                        ? "hoje"
                        : `em ${days} dia(s)`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
                  (complete ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")
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
                  const gateBlocked =
                    !it.is_completed &&
                    !contractSigned &&
                    isContractGatedStep(it.step_key);
                  return (
                    <ChecklistRow
                      key={it.id}
                      item={it}
                      meta={STEP_META[it.step_key]}
                      attachments={attByItem.get(it.id) ?? []}
                      gateBlocked={gateBlocked}
                      onToggle={() => toggle(it)}
                      onDate={(field, value) => updateDate(it, field, value)}
                      announce={announce}
                      refetchAttachments={() => {
                        qc.invalidateQueries({ queryKey: ["visa-attachments"] });
                        qc.invalidateQueries({ queryKey: ["visa-history"] });
                      }}
                      onOpenViewer={(idx, list) => openViewer(list, idx, it.step_label)}
                    />
                  );
                })}
              </CardContent>
            </Card>
          </section>
        );
      })}

      <footer className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
        Fontes oficiais: U.S. Department of State (travel.state.gov), USCIS (uscis.gov/i-129),
        U.S. Department of Labor (flag.dol.gov), CGI Federal (usvisascheduling.com) e Wilberforce
        Pamphlet. Este checklist é apoio informativo; sempre confirme valores e prazos com o
        consulado. Todas as vagas listadas no app já passam por filtro de certificação DOL —
        por isso essa etapa não aparece aqui.
      </footer>

      <VisaAttachmentViewer
        open={viewer.open}
        onOpenChange={(open) => setViewer((v) => ({ ...v, open }))}
        attachments={viewer.list}
        initialIndex={viewer.initialIndex}
        stepLabel={viewer.stepLabel}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Row                                                               */
/* ---------------------------------------------------------------- */

function ChecklistRow({
  item,
  meta,
  attachments,
  gateBlocked,
  onToggle,
  onDate,
  announce,
  refetchAttachments,
  onOpenViewer,
}: {
  item: Item;
  meta?: StepMeta;
  attachments: Attachment[];
  /**
   * true quando esta etapa só faz sentido após o contrato assinado
   * (`hired_by_employer`) e ele ainda não foi marcado. Visualmente
   * a linha fica atenuada e o checkbox desabilitado.
   */
  gateBlocked?: boolean;
  onToggle: () => void;
  onDate: (field: "event_at" | "due_at", value: string) => void;
  announce: (msg: string) => void;
  refetchAttachments: () => void;
  onOpenViewer: (index: number, list: Attachment[]) => void;
}) {
  const checked = !!item.is_completed;
  const dueDays = daysFromToday(item.due_at);
  const isLate = !checked && dueDays !== null && dueDays < 0;
  const isSoon = !checked && dueDays !== null && dueDays >= 0 && dueDays <= 7;
  const blocked = !!gateBlocked;

  return (
    <div
      id={`step-${item.id}`}
      data-gate-blocked={blocked ? "true" : undefined}
      className={
        "group p-4 transition-colors scroll-mt-20 " +
        (checked ? "bg-primary/[0.03]" : "hover:bg-muted/40") +
        (blocked ? " opacity-60" : "")
      }
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:gap-4">
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          disabled={blocked}
          aria-label={`Marcar etapa: ${item.step_label}`}
          aria-describedby={blocked ? `gate-${item.id}` : undefined}
          className="mt-1 h-5 w-5"
        />

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div
              className={
                "font-medium leading-snug " +
                (checked ? "line-through text-muted-foreground" : "text-foreground")
              }
            >
              {item.step_label}
            </div>
            {meta?.link && (
              <a
                href={meta.link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {meta.link.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>

          {blocked && (
            <p
              id={`gate-${item.id}`}
              className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs leading-snug text-warning-foreground"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span>
                Disponível depois que você marcar <strong>“Oferta de trabalho aceita e contrato assinado”</strong> acima.
              </span>
            </p>
          )}


          {meta?.help && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground leading-relaxed">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
              <span>{meta.help}</span>
            </p>
          )}

          {(meta?.eventLabel || meta?.dueLabel) && (
            <div className="grid gap-3 sm:grid-cols-2 pt-1">
              {meta.eventLabel && (
                <DateField
                  id={`event-${item.id}`}
                  label={meta.eventLabel}
                  value={toDateInput(item.event_at)}
                  onChange={(v) => onDate("event_at", v)}
                />
              )}
              {meta.dueLabel && (
                <DateField
                  id={`due-${item.id}`}
                  label={meta.dueLabel}
                  value={toDateInput(item.due_at)}
                  onChange={(v) => onDate("due_at", v)}
                  hint={
                    isLate ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3" aria-hidden /> vencido
                      </span>
                    ) : isSoon ? (
                      <span className="text-warning">
                        em {dueDays} dia(s)
                      </span>
                    ) : null
                  }
                />
              )}
            </div>
          )}

          {meta?.hasAttachments && (
            <Attachments
              itemId={item.id}
              itemLabel={item.step_label}
              attachments={attachments}
              announce={announce}
              onChange={refetchAttachments}
              onOpenViewer={onOpenViewer}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Date field                                                        */
/* ---------------------------------------------------------------- */

function DateField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <CalendarIcon className="h-3 w-3" aria-hidden />
        {label}
        {hint && <span className="ml-1 font-normal">{hint}</span>}
      </span>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full min-h-11 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

/* ---------------------------------------------------------------- */
/* Attachments                                                       */
/* ---------------------------------------------------------------- */

const MAX_FILE_MB = 10;
const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|heic)|application\/pdf)$/i;

function Attachments({
  itemId,
  itemLabel,
  attachments,
  announce,
  onChange,
  onOpenViewer,
}: {
  itemId: string;
  itemLabel: string;
  attachments: Attachment[];
  announce: (msg: string) => void;
  onChange: () => void;
  onOpenViewer: (index: number, list: Attachment[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const userRes = await supabase.auth.getUser();
    const uid = userRes.data.user?.id;
    if (!uid) {
      toast.error("Sessão expirada — entre novamente.");
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          toast.error(`${file.name}: maior que ${MAX_FILE_MB} MB.`);
          continue;
        }
        if (file.type && !ALLOWED_MIME.test(file.type)) {
          toast.error(`${file.name}: formato não permitido (use PDF, JPG, PNG ou WEBP).`);
          continue;
        }
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${uid}/${itemId}/${Date.now()}_${safeName}`;
        const up = await supabase.storage.from("visa-evidence").upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (up.error) {
          toast.error(`Falha ao enviar ${file.name}: ${up.error.message}`);
          continue;
        }
        const ins = await supabase.from("visa_checklist_attachments").insert({
          owner_id: uid,
          item_id: itemId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (ins.error) {
          toast.error(`Falha ao salvar ${file.name}: ${ins.error.message}`);
          await supabase.storage.from("visa-evidence").remove([path]);
          continue;
        }
        announce(`Anexo adicionado em ${itemLabel}: ${file.name}.`);
      }
      onChange();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAttachment = async (a: Attachment) => {
    if (!confirm(`Remover o anexo "${a.file_name}"?`)) return;
    const del = await supabase.from("visa_checklist_attachments").delete().eq("id", a.id);
    if (del.error) {
      toast.error(`Falha ao remover: ${del.error.message}`);
      return;
    }
    await supabase.storage.from("visa-evidence").remove([a.storage_path]);
    announce(`Anexo removido: ${a.file_name}.`);
    onChange();
  };

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Paperclip className="h-3 w-3" aria-hidden />
          Evidências{attachments.length > 0 ? ` (${attachments.length})` : ""}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={`Anexar evidência para: ${itemLabel}`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Enviando…
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" aria-hidden /> Anexar
            </>
          )}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {attachments.length > 0 && (
        <ul className="space-y-1.5">
          {attachments.map((a, idx) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border bg-muted/30 p-2"
            >
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <button
                type="button"
                onClick={() => onOpenViewer(idx, attachments)}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                aria-label={`Visualizar anexo: ${a.file_name}`}
              >
                {a.file_name}
              </button>
              {a.size_bytes ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatBytes(a.size_bytes)}
                </span>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeAttachment(a)}
                aria-label={`Remover anexo: ${a.file_name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
