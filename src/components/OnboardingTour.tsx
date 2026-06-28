import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, Sparkles, FileText, Briefcase, Send } from "lucide-react";

const TOUR_KEY = "vaiprala_tour_done_v1";

const STEPS = [
  {
    icon: Sparkles,
    title: "Bem-vindo ao VaiPraLá 👋",
    body: "Em 3 passos você está pronto para se candidatar a vagas H-2A reais nos EUA. Vamos te mostrar o caminho.",
    cta: { label: "Começar", to: "/app/comecar" },
  },
  {
    icon: FileText,
    title: "1. Monte seu perfil e currículo",
    body: "Preencha seus dados, adicione suas experiências, grave um vídeo curto em inglês e envie fotos do seu trabalho. Quanto mais completo, melhor.",
    cta: { label: "Abrir perfil", to: "/app/perfil" },
  },
  {
    icon: Briefcase,
    title: "2. Encontre vagas reais",
    body: "Vagas oficiais do Departamento do Trabalho dos EUA, com salário, datas e empregador. Filtre por estado, cultura ou salário.",
    cta: { label: "Ver vagas", to: "/app/vagas" },
  },
  {
    icon: Send,
    title: "3. Candidate-se com 1 clique",
    body: "Geramos sua carta em inglês com IA, anexamos seu vídeo e fotos, e enviamos pelo seu Gmail. Você acompanha cada resposta aqui.",
    cta: { label: "Entendi, vamos lá", to: null as string | null },
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = window.localStorage.getItem(TOUR_KEY);
    if (!done) setOpen(true);
  }, []);

  const close = () => {
    if (typeof window !== "undefined") window.localStorage.setItem(TOUR_KEY, "1");
    setOpen(false);
  };

  if (!open) return null;
  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-card border shadow-2xl">
        <div className="flex items-start justify-between p-5 pb-2">
          <div className="flex items-center gap-2 text-primary">
            <Icon className="size-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Passo {step + 1} de {STEPS.length}
            </span>
          </div>
          <button
            onClick={close}
            aria-label="Fechar tour"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 pb-5">
          <h2 className="text-xl font-bold tracking-tight">{s.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
          <div className="mt-4 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-4">
          <button
            onClick={close}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Pular tour
          </button>
          <div className="flex gap-2">
            {s.cta.to ? (
              <Link to={s.cta.to} onClick={close}>
                <Button variant="outline" size="sm">{s.cta.label}</Button>
              </Link>
            ) : null}
            {isLast ? (
              <Button size="sm" onClick={close}>Concluir</Button>
            ) : (
              <Button size="sm" onClick={() => setStep((n) => n + 1)}>
                Próximo <ChevronRight className="ml-1 size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
