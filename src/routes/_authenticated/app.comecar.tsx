import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { track } from "@/lib/telemetry";
import { logOnboardingEvent } from "@/lib/onboarding-events.functions";

/** Mirror every funnel `track()` to the server (auditable, survives nav-away). */
function mirror(event: string, step?: number, label?: string, props?: Record<string, unknown>) {
  track(event, { step, label, ...(props ?? {}) });
  // fire-and-forget; never block the UI on the network
  void logOnboardingEvent({
    data: {
      event,
      step_index: typeof step === "number" ? step : null,
      step_label: label ?? null,
      props: props ?? {},
    },
  }).catch(() => {
    /* offline / nav-away: client track() still fired */
  });
}
import { ProfilePreview } from "@/components/ProfilePreview";
import {
  ArrowRight, ArrowLeft, Sparkles, Tractor, HeartPulse, Send,
  Copy, Check, MessageCircle, ClipboardList, PartyPopper,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/comecar")({
  component: OnboardingPage,
});

/* -------- model -------- */

const FIELD_OPTIONS = [
  { key: "plantio", label: "Plantio" },
  { key: "colheita", label: "Colheita" },
  { key: "maquinas", label: "Operação de máquinas" },
  { key: "irrigacao", label: "Irrigação" },
  { key: "outros", label: "Outros" },
] as const;

const PHYSICAL_OPTIONS = [
  { key: "lift", label: "Posso levantar peso" },
  { key: "weather", label: "Trabalho bem no calor / frio" },
  { key: "long_hours", label: "Aguento longas jornadas" },
] as const;

const LABEL_FOR_FIELD: Record<string, string> = {
  plantio: "Plantio",
  colheita: "Colheita",
  maquinas: "Máquinas",
  irrigacao: "Irrigação",
  outros: "Outros",
};

type FormState = {
  full_name: string;
  age: string;        // string só pra controlar o input
  city: string;
  state: string;
  phone: string;
  field_experience: string[];
  physical_conditions: string[];
  public_slug: string | null;
};

const EMPTY: FormState = {
  full_name: "", age: "", city: "", state: "", phone: "",
  field_experience: [], physical_conditions: [], public_slug: null,
};

/* -------- screen config -------- */

const TOTAL_STEPS = 6;
const STEP_LABELS = [
  "Boas-vindas",
  "Como funciona",
  "Dados básicos",
  "Experiência no campo",
  "Condições físicas",
  "Tudo pronto",
];

/* -------- helpers: mask + validation -------- */

/** Formata como WhatsApp BR: "+55 (11) 90000-0000" preservando dígitos. */
function formatPhoneBR(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 13); // até 13 dígitos (55 + DDD + 9)
  let body = digits;
  let cc = "";
  if (body.startsWith("55") && body.length > 10) {
    cc = "+55 ";
    body = body.slice(2);
  } else if (input.trim().startsWith("+")) {
    // mantém DDI digitado pelo usuário
    cc = `+${digits.slice(0, 2)} `;
    body = digits.slice(2);
  }
  if (body.length === 0) return cc.trim();
  if (body.length <= 2) return `${cc}(${body}`;
  if (body.length <= 6) return `${cc}(${body.slice(0, 2)}) ${body.slice(2)}`;
  if (body.length <= 10)
    return `${cc}(${body.slice(0, 2)}) ${body.slice(2, body.length - 4)}-${body.slice(-4)}`;
  // celular 11 dígitos
  return `${cc}(${body.slice(0, 2)}) ${body.slice(2, 7)}-${body.slice(7, 11)}`;
}

function phoneDigits(input: string): string {
  return input.replace(/\D/g, "");
}

function validatePhone(input: string): string | null {
  const d = phoneDigits(input);
  if (d.length === 0) return "Informe seu WhatsApp.";
  if (d.length < 10) return "Número curto demais. Use DDD + número.";
  if (d.length > 13) return "Número longo demais.";
  return null;
}

function validateAge(input: string): string | null {
  if (!input.trim()) return "Informe sua idade.";
  const n = Number(input);
  if (!Number.isFinite(n)) return "Idade inválida.";
  if (n < 16) return "Mínimo de 16 anos.";
  if (n > 80) return "Idade acima do limite.";
  return null;
}

function validateCity(input: string): string | null {
  if (input.trim().length < 2) return "Informe sua cidade.";
  return null;
}

function validateState(input: string): string | null {
  const v = input.trim().toUpperCase();
  if (v.length === 0) return "Informe o estado (UF).";
  if (!/^[A-Z]{2}$/.test(v)) return "UF com 2 letras. Ex: MG, SP, BA.";
  return null;
}

function validateName(input: string): string | null {
  if (input.trim().length < 2) return "Informe seu nome completo.";
  if (!input.trim().includes(" ")) return "Coloque nome e sobrenome.";
  return null;
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  /* hidrata estado a partir do banco */
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);

      const { data: p } = await supabase
        .from("my_profile")
        .select("*")
        .maybeSingle();

      if (p) {
        if (p.onboarding_completed_at) {
          navigate({ to: "/app/perfil", replace: true });
          return;
        }
        const birth = (p.birth_date ?? "") as string;
        const age = birth
          ? String(Math.max(0, new Date().getFullYear() - new Date(birth).getFullYear()))
          : "";
        setForm({
          full_name: p.full_name ?? "",
          age,
          city: (p as unknown as { city?: string }).city ?? "",
          state: (p as unknown as { state?: string }).state ?? "",
          phone: p.phone ? formatPhoneBR(p.phone) : "",
          field_experience:
            ((p as unknown as { field_experience?: string[] }).field_experience) ?? [],
          physical_conditions:
            ((p as unknown as { physical_conditions?: string[] }).physical_conditions) ?? [],
          public_slug: p.public_slug ?? null,
        });
        const saved = (p as unknown as { onboarding_step?: number }).onboarding_step ?? 0;
        setStep(Math.min(Math.max(saved, 0), TOTAL_STEPS - 1));
      }
      setLoading(false);
      mirror("onboarding_started", 0, STEP_LABELS[0]);
    })();
  }, [navigate]);

  /* persiste a tela atual */
  const persist = async (patch: Partial<FormState>, nextStep: number) => {
    if (!userId) return false;
    setSaving(true);
    try {
      const merged = { ...form, ...patch };
      const birthYear = merged.age ? new Date().getFullYear() - Number(merged.age) : null;
      const birth_date =
        birthYear && Number.isFinite(birthYear) ? `${birthYear}-01-01` : null;

      const isCompletion = nextStep >= TOTAL_STEPS - 1;
      const payload: Record<string, unknown> = {
        owner_id: userId,
        full_name: merged.full_name || null,
        phone: merged.phone ? phoneDigits(merged.phone) : null,
        city: merged.city || null,
        state: merged.state ? merged.state.toUpperCase() : null,
        field_experience: merged.field_experience,
        physical_conditions: merged.physical_conditions,
        onboarding_step: nextStep,
        updated_at: new Date().toISOString(),
      };
      if (birth_date) payload.birth_date = birth_date;
      if (isCompletion) {
        payload.onboarding_completed_at = new Date().toISOString();
        payload.public_page_enabled = true;
      }

      const { error } = await supabase
        .from("my_profile")
        .upsert(payload as never, { onConflict: "owner_id" });
      if (error) throw error;
      setForm(merged);
      setStep(nextStep);
      mirror("onboarding_step_advanced", nextStep, STEP_LABELS[nextStep], { from: step });
      if (isCompletion) {
        mirror("onboarding_completed", nextStep, STEP_LABELS[nextStep], {
          has_experience: merged.field_experience.length > 0,
          has_physical: merged.physical_conditions.length > 0,
        });
      }
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goStep = (next: number) => {
    track("onboarding_step_advanced", { from: step, to: next, label: STEP_LABELS[next] });
    setStep(next);
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-0">
      <ProgressBar step={step} />
      <div className="mt-6">
        {step === 0 && <Step0Welcome onNext={() => goStep(1)} />}
        {step === 1 && (
          <Step1HowItWorks onBack={() => goStep(0)} onNext={() => goStep(2)} />
        )}
        {step === 2 && (
          <Step2Basics
            form={form}
            saving={saving}
            onBack={() => goStep(1)}
            onSubmit={(patch) => persist(patch, 3)}
          />
        )}
        {step === 3 && (
          <Step3Experience
            value={form.field_experience}
            saving={saving}
            onBack={() => goStep(2)}
            onSubmit={(field_experience) => persist({ field_experience }, 4)}
          />
        )}
        {step === 4 && (
          <Step4Physical
            value={form.physical_conditions}
            saving={saving}
            onBack={() => goStep(3)}
            onSubmit={(physical_conditions) => persist({ physical_conditions }, 5)}
          />
        )}
        {step === 5 && <Step5Done form={form} />}
      </div>
    </div>
  );
}

/* -------- progress bar -------- */

function ProgressBar({ step }: { step: number }) {
  const pct = ((step + 1) / TOTAL_STEPS) * 100;
  return (
    <div className="pt-2 space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          Passo {step + 1} de {TOTAL_STEPS}
        </span>
        <span className="font-semibold text-foreground">{STEP_LABELS[step]}</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

/* -------- step 0: posicionamento -------- */

function Step0Welcome({ onNext }: { onNext: () => void }) {
  return (
    <Card>
      <CardContent className="p-8 sm:p-10 text-center space-y-6">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 text-primary mx-auto">
          <Sparkles className="h-7 w-7" />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
            Você quer trabalhar no <span className="text-primary">agro dos EUA</span>?
          </h1>
          <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
            Em menos de 2 minutos seu perfil estará pronto pra ser visto por
            recrutadores do programa H-2A.
          </p>
        </div>
        <Button size="lg" className="w-full sm:w-auto h-12 px-8" onClick={onNext}>
          Sim, continuar <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------- step 1: explicação -------- */

function Step1HowItWorks({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  const blocks = [
    { icon: ClipboardList, t: "Conte sua experiência", d: "Marca o que já fez no campo — sem texto longo." },
    { icon: HeartPulse, t: "Diga o que aguenta", d: "Peso, calor, longas jornadas. Ajuda o recrutador a achar a vaga certa." },
    { icon: Send, t: "Envia pro recrutador", d: "Você recebe um link e manda direto no WhatsApp." },
  ];
  return (
    <Card>
      <CardContent className="p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Como vai funcionar</h2>
          <p className="text-sm text-muted-foreground">
            Você vai criar um perfil profissional e enviar para recrutadores. Direto e sem complicação.
          </p>
        </div>
        <div className="space-y-3">
          {blocks.map((b) => (
            <div
              key={b.t}
              className="flex items-start gap-3 rounded-lg border bg-card p-4"
            >
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary shrink-0">
                <b.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">{b.t}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{b.d}</p>
              </div>
            </div>
          ))}
        </div>
        <NavButtons onBack={onBack} onNext={onNext} nextLabel="Começar" />
      </CardContent>
    </Card>
  );
}

/* -------- step 2: dados básicos -------- */

type Step2Errors = Partial<Record<"full_name" | "age" | "city" | "state" | "phone", string>>;

function Step2Basics({
  form,
  saving,
  onBack,
  onSubmit,
}: {
  form: FormState;
  saving: boolean;
  onBack: () => void;
  onSubmit: (patch: Partial<FormState>) => Promise<boolean>;
}) {
  const [local, setLocal] = useState({
    full_name: form.full_name,
    age: form.age,
    city: form.city,
    state: form.state,
    phone: form.phone,
  });
  const [errors, setErrors] = useState<Step2Errors>({});
  const [touched, setTouched] = useState<Record<keyof Step2Errors, boolean>>({
    full_name: false, age: false, city: false, state: false, phone: false,
  });

  const computeErrors = (v: typeof local): Step2Errors => ({
    full_name: validateName(v.full_name) ?? undefined,
    age: validateAge(v.age) ?? undefined,
    city: validateCity(v.city) ?? undefined,
    state: validateState(v.state) ?? undefined,
    phone: validatePhone(v.phone) ?? undefined,
  });

  const liveErrors = computeErrors(local);
  const hasAny = Object.values(liveErrors).some(Boolean);

  const update = <K extends keyof typeof local>(key: K, value: string) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    if (touched[key]) {
      setErrors(computeErrors(next));
    }
  };

  const blur = (key: keyof Step2Errors) => {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors(computeErrors(local));
  };

  const submit = async () => {
    setTouched({ full_name: true, age: true, city: true, state: true, phone: true });
    const errs = computeErrors(local);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      toast.error("Corrija os campos destacados para continuar.");
      return;
    }
    await onSubmit({
      ...local,
      phone: phoneDigits(local.phone),
      state: local.state.toUpperCase(),
    });
  };

  return (
    <Card>
      <CardContent className="p-6 sm:p-8 space-y-5">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Seus dados básicos</h2>
          <p className="text-sm text-muted-foreground">
            Só o essencial pra o recrutador entrar em contato.
          </p>
        </div>

        <div className="space-y-3">
          <Field id="full_name" label="Nome completo" error={errors.full_name}>
            <Input
              id="full_name"
              value={local.full_name}
              onChange={(e) => update("full_name", e.target.value)}
              onBlur={() => blur("full_name")}
              placeholder="João da Silva"
              autoComplete="name"
              aria-invalid={!!errors.full_name}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="age" label="Idade" error={errors.age}>
              <Input
                id="age"
                type="number"
                inputMode="numeric"
                min={16}
                max={80}
                value={local.age}
                onChange={(e) => update("age", e.target.value)}
                onBlur={() => blur("age")}
                placeholder="32"
                aria-invalid={!!errors.age}
              />
            </Field>
            <Field id="phone" label="WhatsApp" error={errors.phone} hint="Com DDD. Ex: (11) 90000-0000">
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                value={local.phone}
                onChange={(e) => update("phone", formatPhoneBR(e.target.value))}
                onBlur={() => blur("phone")}
                placeholder="(11) 90000-0000"
                autoComplete="tel"
                aria-invalid={!!errors.phone}
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-[1fr_120px] gap-3">
            <Field id="city" label="Cidade" error={errors.city}>
              <Input
                id="city"
                value={local.city}
                onChange={(e) => update("city", e.target.value)}
                onBlur={() => blur("city")}
                placeholder="Patos de Minas"
                autoComplete="address-level2"
                aria-invalid={!!errors.city}
              />
            </Field>
            <Field id="state" label="Estado (UF)" error={errors.state}>
              <Input
                id="state"
                value={local.state}
                onChange={(e) => update("state", e.target.value.toUpperCase().slice(0, 2))}
                onBlur={() => blur("state")}
                placeholder="MG"
                maxLength={2}
                autoComplete="address-level1"
                aria-invalid={!!errors.state}
              />
            </Field>
          </div>
        </div>

        <NavButtons
          onBack={onBack}
          onNext={submit}
          nextLabel="Continuar"
          nextDisabled={hasAny || saving}
          saving={saving}
        />
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------- step 3: experiência -------- */

function Step3Experience({
  value,
  saving,
  onBack,
  onSubmit,
}: {
  value: string[];
  saving: boolean;
  onBack: () => void;
  onSubmit: (selection: string[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string[]>(value);

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  return (
    <Card>
      <CardContent className="p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary shrink-0">
            <Tractor className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Sua experiência no campo</h2>
            <p className="text-sm text-muted-foreground">
              Marque tudo que você já fez. Pode marcar mais de um.
            </p>
          </div>
        </div>

        <CheckCardGrid
          options={FIELD_OPTIONS as unknown as ReadonlyArray<{ key: string; label: string }>}
          selected={selected}
          onToggle={toggle}
        />

        <NavButtons
          onBack={onBack}
          onNext={() => onSubmit(selected)}
          nextLabel={selected.length === 0 ? "Pular" : "Continuar"}
          nextDisabled={saving}
          saving={saving}
        />
      </CardContent>
    </Card>
  );
}

/* -------- step 4: condições físicas -------- */

function Step4Physical({
  value,
  saving,
  onBack,
  onSubmit,
}: {
  value: string[];
  saving: boolean;
  onBack: () => void;
  onSubmit: (selection: string[]) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string[]>(value);

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  return (
    <Card>
      <CardContent className="p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-accent-red/10 text-accent-red shrink-0">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Condições físicas</h2>
            <p className="text-sm text-muted-foreground">
              O H-2A pede resistência física. Marque o que você tolera bem — isso aumenta muito a taxa de match.
            </p>
          </div>
        </div>

        <CheckCardGrid
          options={PHYSICAL_OPTIONS as unknown as ReadonlyArray<{ key: string; label: string }>}
          selected={selected}
          onToggle={toggle}
          columns={1}
        />

        <NavButtons
          onBack={onBack}
          onNext={() => onSubmit(selected)}
          nextLabel="Finalizar perfil"
          nextDisabled={saving}
          saving={saving}
        />
      </CardContent>
    </Card>
  );
}

/* -------- step 5: pronto + envio + confirmação -------- */

function Step5Done({ form }: { form: FormState }) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  const tags = useMemo(
    () => form.field_experience.map((k) => LABEL_FOR_FIELD[k] ?? k),
    [form.field_experience],
  );
  const initials = useMemo(() => {
    const parts = form.full_name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase() || "??";
  }, [form.full_name]);
  const firstName = form.full_name.split(" ")[0] || form.full_name;
  const ageStr = form.age ? `, ${form.age}` : "";
  const loc = [form.city, form.state].filter(Boolean).join(" / ");

  const publicUrl =
    typeof window !== "undefined" && form.public_slug
      ? `${window.location.origin}/v/${form.public_slug}`
      : null;

  // Mensagem gerada automaticamente com os dados do perfil
  const waMessage = useMemo(() => {
    if (!publicUrl) return "";
    const lines = [
      `Olá! Meu nome é ${firstName}${form.age ? `, ${form.age} anos` : ""}.`,
      loc ? `Sou de ${loc} e tenho interesse em vagas H-2A no agro dos EUA.` : "Tenho interesse em vagas H-2A no agro dos EUA.",
    ];
    if (tags.length > 0) {
      lines.push(`Experiência: ${tags.join(", ")}.`);
    }
    lines.push("", `Meu perfil completo: ${publicUrl}`);
    return lines.join("\n");
  }, [publicUrl, firstName, form.age, loc, tags]);

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Link copiado!");
      track("onboarding_link_copied");
    } catch {
      toast.error("Não consegui copiar — selecione e copie manualmente.");
    }
  };

  const handleSendWhatsApp = () => {
    track("onboarding_whatsapp_send_clicked", { has_url: !!publicUrl });
    setSent(true);
  };

  // ---------- Tela de confirmação pós envio ----------
  if (sent && publicUrl) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6 sm:p-8 text-center space-y-3">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-success/15 text-success mx-auto">
              <PartyPopper className="h-7 w-7" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              WhatsApp aberto ✅
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Sua mensagem foi gerada com o link do seu perfil. Envie para os recrutadores
              que você conhece — quanto mais, melhor.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Próximos passos
              </p>
              <h3 className="text-lg font-bold">Quer mandar pra mais alguém?</h3>
            </div>

            <Button variant="outline" className="w-full h-11" onClick={copyLink}>
              {copied ? (
                <><Check className="mr-2 h-4 w-4" /> Copiado!</>
              ) : (
                <><Copy className="mr-2 h-4 w-4" /> Copiar link do perfil</>
              )}
            </Button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(waMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              onClick={() => track("onboarding_whatsapp_send_again_clicked")}
            >
              <Button className="w-full h-11 bg-[#25D366] hover:bg-[#1ebe5a] text-white">
                <MessageCircle className="mr-2 h-4 w-4" /> Enviar para outro contato
              </Button>
            </a>

            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground break-all font-mono">
              {publicUrl}
            </div>

            <div className="pt-3 border-t flex flex-wrap gap-2">
              <Link to="/app/perfil" onClick={() => track("onboarding_edit_profile_clicked")}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Voltar e editar meu perfil
                </Button>
              </Link>
              <Link to="/app">
                <Button variant="ghost" size="sm">
                  Ir para o painel <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Tela "pronto" inicial ----------
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 sm:p-8 text-center space-y-3">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-success/15 text-success mx-auto">
            <Check className="h-7 w-7" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Seu perfil está pronto ✅
          </h2>
          <p className="text-muted-foreground">
            Agora é hora de enviar para os recrutadores que estão contratando.
          </p>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 items-start">
        <ProfilePreview
          initials={initials}
          name={`${firstName}${ageStr}`}
          location={loc || "—"}
          tags={tags}
          showVideo={false}
          statusText={
            <>
              <strong>Pronto pra enviar.</strong>{" "}
              <span className="text-muted-foreground">
                Compartilhe o link no WhatsApp.
              </span>
            </>
          }
        />

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Envio
              </p>
              <h3 className="text-lg font-bold">Mande seu perfil agora</h3>
            </div>

            {publicUrl ? (
              <>
                <div className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-line text-muted-foreground">
                  {waMessage}
                </div>

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(waMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  onClick={handleSendWhatsApp}
                >
                  <Button className="w-full h-12 bg-[#25D366] hover:bg-[#1ebe5a] text-white">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Enviar via WhatsApp
                  </Button>
                </a>

                <Button variant="outline" className="w-full h-11" onClick={copyLink}>
                  {copied ? (
                    <><Check className="mr-2 h-4 w-4" /> Copiado!</>
                  ) : (
                    <><Copy className="mr-2 h-4 w-4" /> Copiar link do perfil</>
                  )}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Preciso configurar o link público antes de enviar.{" "}
                <Link to="/app/perfil" className="text-primary font-semibold underline">
                  Definir agora
                </Link>
              </p>
            )}

            <div className="pt-3 border-t flex flex-wrap gap-2">
              <Link to="/app/perfil">
                <Button variant="ghost" size="sm">
                  Melhorar perfil
                </Button>
              </Link>
              <Link to="/app">
                <Button variant="ghost" size="sm">
                  Ir para o painel <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* -------- shared bits -------- */

function CheckCardGrid({
  options,
  selected,
  onToggle,
  columns = 2,
}: {
  options: ReadonlyArray<{ key: string; label: string }>;
  selected: string[];
  onToggle: (key: string) => void;
  columns?: 1 | 2;
}) {
  return (
    <div
      className={
        columns === 1 ? "grid gap-2" : "grid grid-cols-1 sm:grid-cols-2 gap-2"
      }
    >
      {options.map((opt) => {
        const on = selected.includes(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onToggle(opt.key)}
            aria-pressed={on}
            className={`group relative text-left rounded-lg border-2 p-4 transition-all ${
              on
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/40"
            }`}
          >
            <span
              className={`absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30"
              }`}
              aria-hidden
            >
              {on && <Check className="h-3 w-3" />}
            </span>
            <p className="font-semibold pr-7 text-sm">{opt.label}</p>
          </button>
        );
      })}
    </div>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  saving,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  saving?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {onBack && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={saving}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
        </Button>
      )}
      <div className="flex-1" />
      <Button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="h-11 px-6"
      >
        {saving ? "Salvando…" : nextLabel}
        {!saving && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
    </div>
  );
}
