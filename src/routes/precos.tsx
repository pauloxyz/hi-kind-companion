import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X, ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/vaiprala-logo.png";

export const Route = createFileRoute("/precos")({
  head: () => ({
    meta: [
      { title: "Preços — VaiPraLá | Grátis para começar, Pro a partir de R$ 19,90" },
      { name: "description", content: "Comece grátis. Plano Pro com candidaturas ilimitadas, alertas de novas vagas e follow-up automático a partir de R$ 19,90/mês." },
      { property: "og:title", content: "Planos VaiPraLá — a partir de R$ 19,90/mês" },
      { property: "og:description", content: "Acelere sua chance de conseguir uma vaga H-2A. Plano grátis disponível." },
      { property: "og:url", content: "/precos" },
    ],
    links: [{ rel: "canonical", href: "/precos" }],
  }),
  component: PricingPage,
});

type Plan = {
  name: string;
  price: string;
  priceNote: string;
  highlight?: boolean;
  cta: string;
  features: Array<{ ok: boolean; text: string }>;
  badge?: string;
  priceId?: string;
};

const PLANS: Plan[] = [
  {
    name: "Grátis",
    price: "R$ 0",
    priceNote: "para sempre",
    cta: "Começar grátis",
    features: [
      { ok: true, text: "Acesso a todas as vagas H-2A oficiais (DOL)" },
      { ok: true, text: "Até 10 candidaturas por mês" },
      { ok: true, text: "1 alerta de vaga salvo" },
      { ok: true, text: "Carta em inglês com IA" },
      { ok: true, text: "Vídeo de apresentação + página pública" },
      { ok: true, text: "Checklist do visto H-2A" },
      { ok: false, text: "Follow-up automático por email" },
      { ok: false, text: "Alertas ilimitados" },
      { ok: false, text: "Detecção automática de respostas" },
    ],
  },
  {
    name: "Pro",
    price: "R$ 19,90",
    priceNote: "por mês · cancele quando quiser",
    highlight: true,
    badge: "Mais escolhido",
    cta: "Assinar Pro",
    priceId: "pro_monthly",
    features: [
      { ok: true, text: "Tudo do Grátis, sem limites" },
      { ok: true, text: "Candidaturas ilimitadas" },
      { ok: true, text: "Alertas ilimitados (email quando sair vaga nova)" },
      { ok: true, text: "Follow-up automático em 48h" },
      { ok: true, text: "Detecção automática de respostas no Gmail" },
      { ok: true, text: "Selo Pro na página pública (mais credibilidade)" },
      { ok: true, text: "Suporte prioritário em PT" },
      { ok: true, text: "Sem anúncios" },
    ],
  },
  {
    name: "Anual",
    price: "R$ 14,90",
    priceNote: "por mês · pago anual (R$ 178,80)",
    cta: "Economizar 25%",
    priceId: "pro_yearly",
    features: [
      { ok: true, text: "Tudo do Pro" },
      { ok: true, text: "Economia de R$ 60/ano" },
      { ok: true, text: "Acesso antecipado a novidades" },
      { ok: true, text: "Garantia de 7 dias" },
    ],
  },
];

function PricingPage() {
  const { openCheckout, closeCheckout, isOpen, checkoutElement } = useStripeCheckout();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? undefined });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email ?? undefined } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubscribe = (priceId: string) => {
    if (!user) {
      window.location.href = `/auth?redirect=/precos`;
      return;
    }
    openCheckout({
      priceId,
      customerEmail: user.email,
      userId: user.id,
      returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <PaymentTestModeBanner />
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" width={32} height={32} className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/auth"><Button size="sm">Começar grátis</Button></Link>
        </div>
      </header>


      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          Preço justo. <span className="text-[#009c3b]">Sem agenciador.</span>
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-muted-foreground text-lg">
          Comece grátis. Quando quiser acelerar, o Pro custa menos que uma pizza por mês.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-3 text-left">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                p.highlight ? "border-primary shadow-lg shadow-primary/10 bg-card" : "bg-card"
              }`}
            >
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  <Sparkles className="h-3 w-3" /> {p.badge}
                </div>
              )}
              <h2 className="text-xl font-bold">{p.name}</h2>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{p.price}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{p.priceNote}</p>
              {p.priceId ? (
                <Button
                  className="mt-5 w-full"
                  variant={p.highlight ? "default" : "outline"}
                  onClick={() => handleSubscribe(p.priceId!)}
                >
                  {p.cta} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Link to="/auth" className="mt-5">
                  <Button className="w-full" variant={p.highlight ? "default" : "outline"}>
                    {p.cta} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              )}
              <ul className="mt-6 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-2">
                    {f.ok ? (
                      <Check className="h-4 w-4 text-[#009c3b] mt-0.5 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />
                    )}
                    <span className={f.ok ? "" : "text-muted-foreground/70"}>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 max-w-2xl mx-auto text-left space-y-4">
          <h3 className="text-2xl font-bold text-center mb-6">Perguntas sobre o pagamento</h3>
          {[
            { q: "Posso usar de graça pra sempre?", a: "Sim! O plano grátis é permanente. Você só precisa do Pro se quiser candidaturas ilimitadas e automação." },
            { q: "Como pago?", a: "Cartão de crédito brasileiro ou internacional. Cobrado em reais." },
            { q: "Posso cancelar quando quiser?", a: "Sim, sem multa. Você continua com os benefícios até o fim do período pago." },
            { q: "Tem reembolso?", a: "Sim, 7 dias de garantia no plano anual." },
          ].map((f) => (
            <details key={f.q} className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
