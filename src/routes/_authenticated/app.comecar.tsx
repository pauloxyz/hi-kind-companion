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
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";

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
  const [step, setStep] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Step 1 form
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
      const [{ data: p }, { data: exps }, { data: video }, { data: apps }] = await Promise.all([
        supabase.from("my_profile").select("*").maybeSingle(),
        supabase.from("resume_experiences").select("id").limit(1),
        supabase.from("intro_video").select("id").eq("is_active", true).limit(1).maybeSingle(),
        supabase.from("work_media").select("id").limit(1),
      ]);
      if (p?.onboarding_completed_at) {
        navigate({ to: "/app", replace: true });
        return;
      }
      if (p) setProfile({
        full_name: p.full_name ?? "", phone: p.phone ?? "", country: p.country ?? "Brazil",
        has_prior_h2_experience: !!p.has_prior_h2_experience, languages: p.languages ?? ["pt"],
      });
      const done = {
        profile: !!(p?.full_name && p?.phone),
        experience: (exps?.length ?? 0) > 0,
        video: !!video || (apps?.length ?? 0) > 0,
        "first-apply": false,
      };
      setCompleted(done);
      // Start at first incomplete step
      const firstIncomplete = STEPS.findIndex((s) => !done[s.key]);
      setStep(firstIncomplete === -1 ? 0 : firstIncomplete);
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
    toast.success("Onboarding completo! Bem-vindo ao VaiPraLá 🇧🇷→🇺🇸");
    navigate({ to: "/app", replace: true });
  };

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>;

  const completedCount = Object.values(completed).filter(Boolean).length;
  const progressPct = (completedCount / STEPS.length) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Vamos começar! 🌽</h1>
        <p className="text-sm text-muted-foreground">
          4 passos rápidos para você estar pronto para aplicar nas vagas H-2A.
        </p>
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Passo {step + 1} de {STEPS.length}: {STEPS[step].label}</span>
            <span>{completedCount}/{STEPS.length} completo</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
      </div>

      {/* Step pills */}
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

      {/* Step content */}
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
              <Label>Já participei de programa H-2 antes</Label>
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
              Você também pode subir fotos de trabalho.
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
