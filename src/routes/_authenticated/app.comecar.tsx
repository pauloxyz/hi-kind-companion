import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  CheckCircle2, Circle, ArrowRight, Sparkles, FileText, Video, Send,
  Shield, Globe2, Zap,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/comecar")({
  component: OnboardingPage,
});

const STEPS = [
  { key: "profile", label: "Perfil", desc: "Quem é você" },
  { key: "experience", label: "Experiência", desc: "Onde já trabalhou" },
  { key: "video", label: "Vídeo / mídia", desc: "Apresente-se" },
  { key: "first-apply", label: "Primeira vaga", desc: "Aplique agora" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function OnboardingPage() {
  const navigate = useNavigate();
  // step = -1 → welcome / intro screen. 0..3 → real steps.
  const [step, setStep] = useState<number>(-1);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string>("");

  const [profile, setProfile] = useState({
    full_name: "", phone: "", country: "Brazil",
    has_prior_h2_experience: false, languages: ["pt"] as string[],
  });
  const [completed, setCompleted] = useState<Record<StepKey, boolean>>({
    profile: false, experience: false, video: false, "first-apply": false,
  });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      const email = u.user.email ?? "";
      setFirstName(email.split("@")[0].split(/[._-]/)[0] || "");

      const [{ data: p }, { data: exps }, { data: video }, { data: media }, { data: apps }] = await Promise.all([
        supabase.from("my_profile").select("*").maybeSingle(),
        supabase.from("resume_experiences").select("id").limit(1),
        supabase.from("intro_video").select("id").eq("is_active", true).limit(1).maybeSingle(),
        supabase.from("work_media").select("id").limit(1),
        supabase.from("applications").select("id").limit(1),
      ]);

      if (p) setProfile({
        full_name: p.full_name ?? "", phone: p.phone ?? "", country: p.country ?? "Brazil",
        has_prior_h2_experience: !!p.has_prior_h2_experience, languages: p.languages ?? ["pt"],
      });
      const done = {
        profile: !!(p?.full_name && p?.phone),
        experience: (exps?.length ?? 0) > 0,
        video: !!video || (media?.length ?? 0) > 0,
        "first-apply": (apps?.length ?? 0) > 0,
      };
      setCompleted(done);
      // If user already has all 4 done, mark onboarding complete and send to dashboard
      if (p?.onboarding_completed_at && Object.values(done).every(Boolean)) {
        navigate({ to: "/app", replace: true });
        return;
      }
      // Returning user with something already done: skip welcome, go to first pending step
      const hasAny = Object.values(done).some(Boolean);
      if (hasAny) {
        const firstIncomplete = STEPS.findIndex((s) => !done[s.key]);
        setStep(firstIncomplete === -1 ? 3 : firstIncomplete);
      } else {
        setStep(-1); // brand new → welcome
      }
      setLoading(false);
    })();
  }, [navigate]);

  const saveProfile = async () => {
    if (!userId) return;
    if (!profile.full_name.trim() || !profile.phone.trim()) {
      toast.error("Preencha nome e telefone para continuar");
      return;
    }
    const { error } = await supabase.from("my_profile").upsert(
      { owner_id: userId, ...profile, updated_at: new Date().toISOString() },
      { onConflict: "owner_id" },
    );
    if (error) { toast.error(error.message); return; }
    setCompleted({ ...completed, profile: true });
    setStep(1);
  };

  const finish = async () => {
    if (!userId) return;
    await supabase.from("my_profile").upsert(
      { owner_id: userId, onboarding_completed_at: new Date().toISOString() },
      { onConflict: "owner_id" },
    );
    toast.success("Tudo pronto! Bem-vindo ao VaiPraLá 🇧🇷→🇺🇸");
    navigate({ to: "/app", replace: true });
  };

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>;

  // ---------- WELCOME SCREEN ----------
  if (step === -1) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-3 py-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" /> Bem-vindo{firstName ? `, ${firstName}` : ""}!
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Sua jornada para trabalhar legalmente nos EUA começa aqui 🇺🇸
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            O VaiPraLá conecta você a vagas H-2A reais (visto de trabalho agrícola sazonal), escreve sua
            carta de apresentação em inglês com IA e envia direto do seu Gmail para o empregador.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <FeatureCard icon={Globe2} title="Vagas oficiais"
            desc="Importadas direto do Departamento do Trabalho dos EUA (DOL). Sem intermediários, sem fraude." />
          <FeatureCard icon={Zap} title="Carta com IA em inglês"
            desc="Não precisa falar inglês. A IA escreve uma carta profissional baseada na sua experiência." />
          <FeatureCard icon={Shield} title="Anti-fraude embutido"
            desc="Avisamos se a vaga tem sinais suspeitos. Nunca pague para conseguir uma H-2A." />
        </div>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg">Como vai funcionar agora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Stepline n={1} icon={Sparkles} title="Conte quem você é" desc="Nome, contato, país (1 minuto)." />
            <Stepline n={2} icon={FileText} title="Liste sua experiência" desc="Roça, café, gado, máquinas — vale tudo. Mesmo informal." />
            <Stepline n={3} icon={Video} title="Grave um vídeo curto (opcional)" desc="Candidatos com vídeo recebem até 3x mais respostas." />
            <Stepline n={4} icon={Send} title="Aplique na sua primeira vaga" desc="Você escolhe a vaga, a IA escreve, o Gmail envia." />
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button size="lg" className="flex-1" onClick={() => setStep(0)}>
            Vamos começar <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="ghost" onClick={finish}>
            Já conheço, ir direto ao app
          </Button>
        </div>
        <p className="text-xs text-center text-muted-foreground">
          Leva uns 5 minutos. Você pode pausar e voltar a qualquer momento — seu progresso fica salvo.
        </p>
      </div>
    );
  }

  // ---------- STEP-BY-STEP ----------
  const completedCount = Object.values(completed).filter(Boolean).length;
  const progressPct = (completedCount / STEPS.length) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-3">
        <PageHeader
          title="Vamos preparar seu perfil 🌽"
          description="4 passos rápidos. Quanto mais completo seu perfil, maior a chance de o empregador responder."
        />
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Passo {step + 1} de {STEPS.length}: {STEPS[step].label}</span>
            <span>{completedCount}/{STEPS.length} completo</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(i)}
            className={`text-left rounded-lg border p-3 transition-colors ${
              i === step ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {completed[s.key] ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs font-semibold truncate">{s.label}</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{s.desc}</div>
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Quem é você?</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Nome completo (como no passaporte)</Label>
              <Input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} placeholder="João da Silva" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>WhatsApp (+55...)</Label>
                <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+55 11 90000-0000" />
              </div>
              <div className="space-y-1">
                <Label>País</Label>
                <Input value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Já participei de programa H-2 antes</Label>
                <p className="text-xs text-muted-foreground">Conta muito para o empregador.</p>
              </div>
              <Switch checked={profile.has_prior_h2_experience} onCheckedChange={(v) => setProfile({ ...profile, has_prior_h2_experience: v })} />
            </div>
            <Button onClick={saveProfile} className="w-full">Salvar e continuar <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Cadastre sua experiência</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Adicione pelo menos 1 experiência (mesmo informal — café, frutas, criação de gado, máquinas).
              Isso aparece na sua carta de candidatura.
            </p>
            <div className="flex gap-2">
              <Link to="/app/curriculo" className="flex-1">
                <Button variant="outline" className="w-full">Abrir currículo →</Button>
              </Link>
              <Button onClick={() => { setCompleted({ ...completed, experience: true }); setStep(2); }}>
                Já fiz, próximo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Apresente-se em vídeo (opcional, mas recomendado)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Candidatos com vídeo recebem <strong>3x mais respostas</strong>. 90 segundos em inglês simples bastam.
              Você também pode subir fotos do trabalho.
            </p>
            <p className="text-xs text-muted-foreground">
              💡 Na aba <strong>Mídia</strong>, marque suas melhores fotos com ⭐ — só as destacadas aparecem no link enviado ao empregador.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/app/video"><Button variant="outline">Gravar vídeo</Button></Link>
              <Link to="/app/midia"><Button variant="outline">Subir fotos</Button></Link>
              <Button onClick={() => { setCompleted({ ...completed, video: true }); setStep(3); }}>Pular por enquanto</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Sua primeira candidatura 🚀</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tudo pronto! Vá para vagas, escolha uma que combine com você, e a IA escreve a carta em inglês automaticamente.
              Depois é só revisar e enviar.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/app/vagas" className="flex-1">
                <Button className="w-full">Ver vagas disponíveis <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </Link>
              <Button variant="outline" onClick={finish}>Concluir onboarding</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: typeof Sparkles; title: string; desc: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-1.5">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
    </div>
  );
}

function Stepline({ n, icon: Icon, title, desc }: { n: number; icon: typeof Sparkles; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
        {n}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {title}
        </div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
