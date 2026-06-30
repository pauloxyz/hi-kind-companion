import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/vaiprala-logo.png";
import { absUrl } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { ProfilePreview } from "@/components/ProfilePreview";
import {
  ArrowRight, FileText, Video, Send, ShieldCheck, Sparkles,
  Check, Quote, Star, ClipboardList, CalendarClock,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vagas H-2A nos EUA: crie seu perfil e conecte com recrutadores | VaiPraLá" },
      { name: "description", content: "Monte um perfil profissional, grave um vídeo de apresentação e envie direto para recrutadores e produtores do programa H-2A. Sem taxa, sem promessas irreais." },
      { property: "og:title", content: "VaiPraLá — Sua oportunidade no agro dos EUA começa com um perfil forte" },
      { property: "og:description", content: "Conecte-se com recrutadores e produtores do programa H-2A de forma simples, direta e profissional." },
      { property: "og:image", content: "https://www.vaiprala.net/og-default.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://www.vaiprala.net/og-default.jpg" },
      { property: "og:url", content: absUrl("/") },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: absUrl("/") }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "VaiPraLá",
          description: "Plataforma para trabalhadores rurais brasileiros criarem perfil e se conectarem com recrutadores do programa H-2A.",
          url: absUrl("/"),
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        navigate({ to: "/app", replace: true });
        return;
      }
      setSignedIn(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        navigate({ to: "/app", replace: true });
      }
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [navigate]);

  return (
    <div className="min-h-dvh bg-background text-foreground" data-testid="landing-page">
      {/* NAV */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/85 border-b border-border/60" data-testid="landing-header">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" width={36} height={36} className="h-9 w-9" />
            <span className="font-bold tracking-tight text-lg">VaiPraLá</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#por-que" className="text-muted-foreground hover:text-foreground transition-colors">Por que usar</a>
            <a href="#como-funciona" className="text-muted-foreground hover:text-foreground transition-colors">Como funciona</a>
            <Link to="/vagas-h2a" className="text-muted-foreground hover:text-foreground transition-colors">Vagas</Link>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link to="/app"><Button size="sm">Abrir meu app</Button></Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm font-medium hover:underline hidden sm:inline">Entrar</Link>
                <Link to="/auth" search={{ mode: "signup" } as never}><Button size="sm">Criar perfil grátis</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main">
      {/* HERO */}
      <section className="relative overflow-hidden" data-testid="landing-hero">
        <div
          className="absolute inset-0 opacity-70"
          aria-hidden
          style={{
            background:
              "radial-gradient(900px 500px at 12% 8%, oklch(0.32 0.13 264 / 0.18), transparent), radial-gradient(800px 480px at 92% 25%, oklch(0.58 0.22 27 / 0.10), transparent), radial-gradient(720px 420px at 50% 100%, oklch(0.74 0.15 75 / 0.18), transparent)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent-red/30 bg-accent-red/10 text-accent-red text-xs font-bold mb-6">
                <span className="inline-block w-2 h-2 rounded-full bg-accent-red animate-pulse" />
                Temporada H-2A aberta — produtores selecionando agora
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] text-balance">
                Sua oportunidade no <span className="text-primary">agro dos EUA</span> começa com um perfil forte.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
                Conecte-se com recrutadores e produtores do programa H-2A de forma{" "}
                <strong className="text-foreground">simples, direta e profissional</strong>.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/auth">
                  <Button size="lg" className="h-12 px-7 text-base shadow-elevated">
                    Criar meu perfil gratuito <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <a href="#como-funciona">
                  <Button size="lg" variant="outline" className="h-12 px-6 text-base border-2">
                    Como funciona
                  </Button>
                </a>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Sem taxa por vaga</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Sem agenciador</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Focado no H-2A</span>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex -space-x-2">
                  {AVATAR_STACK.map((a, i) => (
                    <div key={i} className={`h-8 w-8 rounded-full ${a.bg} flex items-center justify-center text-white text-[11px] font-bold border-2 border-background`}>
                      {a.initials}
                    </div>
                  ))}
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-0.5">
                    {[0,1,2,3,4].map(i => <Star key={i} className="h-3.5 w-3.5 fill-accent-gold text-accent-gold" />)}
                    <span className="ml-1.5 font-semibold text-foreground">4,9</span>
                  </div>
                  <p className="text-muted-foreground">Brasileiros já com perfil ativo no app</p>
                </div>
              </div>
            </div>

            {/* Hero right: phone-style profile preview */}
            <ProfilePreview />
          </div>
        </div>
      </section>

      {/* SEM COMPLICAÇÃO */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
            Sem complicação. <span className="text-muted-foreground">Sem promessas irreais.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Monte seu currículo em minutos, grave um vídeo de apresentação e envie seu perfil
            diretamente para recrutadores e produtores que buscam trabalhadores para o H-2A.
          </p>
        </div>
      </section>

      {/* POR QUE USAR */}
      <section id="por-que" className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-accent-red mb-3">Por que usar</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Tudo que você precisa pra ser visto</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {REASONS.map((r) => (
              <div key={r.title} className="group rounded-xl border bg-card p-6 hover:border-primary/40 hover:shadow-elevated transition-all">
                <div className="inline-flex items-center justify-center h-11 w-11 rounded-lg bg-primary/10 text-primary mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <r.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold mb-1.5">{r.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEGURANÇA */}
      <section className="border-t border-border/60 bg-primary text-primary-foreground">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
          <div className="text-center mb-10">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-accent-gold mb-3">Segurança e transparência</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Você no controle do processo</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {TRUST.map((t) => (
              <div key={t.title} className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-6">
                <ShieldCheck className="h-6 w-6 text-accent-gold mb-3" />
                <h3 className="font-bold mb-1">{t.title}</h3>
                <p className="text-sm text-primary-foreground/80 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-accent-red mb-3">Como funciona</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Em 4 passos você está enviando seu perfil</h2>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-xl border bg-card p-6 hover:border-primary/40 transition-colors">
                <div className="text-6xl font-black text-primary/10 absolute top-2 right-4 leading-none">{i + 1}</div>
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary mb-3 relative">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold mb-1.5 relative">{s.title}</h3>
                <p className="text-sm text-muted-foreground relative leading-relaxed">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-accent-red mb-3">Quem já foi</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
              Brasileiros que se conectaram <span className="text-primary">direto com o produtor</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t) => (
              <article key={t.name} className="relative rounded-2xl border bg-card p-6 hover:shadow-elevated transition-shadow">
                <Quote className="absolute top-4 right-4 h-8 w-8 text-primary/10" />
                <div className="flex items-center gap-3 mb-4">
                  <div className={`h-12 w-12 rounded-full ${t.avatar} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                    {t.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight truncate">{t.name}, {t.age}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.role} · {t.state}</p>
                  </div>
                </div>
                <div className="flex gap-0.5 mb-3">
                  {[0,1,2,3,4].map(i => <Star key={i} className="h-3.5 w-3.5 fill-accent-gold text-accent-gold" />)}
                </div>
                <p className="text-sm leading-relaxed text-foreground/85">"{t.quote}"</p>
                <div className="mt-4 pt-4 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{t.from}</span>
                  <span className="inline-flex items-center gap-1 text-success font-semibold">
                    <Check className="h-3 w-3" /> Contratado
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TEMPORADA */}
      <section className="border-t border-border/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
          <div className="rounded-2xl border-2 border-accent-red/30 bg-accent-red/5 p-8 sm:p-10 flex flex-col sm:flex-row items-start gap-6">
            <div className="inline-flex items-center justify-center h-14 w-14 shrink-0 rounded-2xl bg-accent-red text-white">
              <CalendarClock className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">A temporada já começou</h2>
              <p className="mt-2 text-muted-foreground leading-relaxed">
                Produtores iniciam a seleção com antecedência.{" "}
                <strong className="text-foreground">Quem se posiciona primeiro, sai na frente.</strong>
              </p>
              <Link to="/auth" className="inline-block mt-5">
                <Button className="h-11 px-6">
                  Criar meu perfil agora <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border/60 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-10">Perguntas frequentes</h2>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border bg-card p-4 hover:border-primary/30 transition-colors">
                <summary className="cursor-pointer font-semibold list-none flex items-center justify-between">
                  {f.q}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="border-t border-border/60 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-flag-stripes opacity-30" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-balance">
            Dê o próximo passo
          </h2>
          <p className="mt-4 text-primary-foreground/85 text-lg max-w-xl mx-auto">
            Crie seu perfil agora e aumente suas chances de ser visto por quem está contratando.
          </p>
          <Link to="/auth" className="inline-block mt-8">
            <Button size="lg" variant="secondary" className="h-12 px-8 text-base font-bold">
              Criar meu perfil gratuito <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-primary-foreground/70">
            <Sparkles className="h-3.5 w-3.5" /> Grátis · sem cartão de crédito
          </div>
        </div>
      </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-border/60 bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" width={28} height={28} className="h-7 w-7 opacity-80" />
            <span>© {new Date().getFullYear()} VaiPraLá</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-6 rounded-full bg-[#009c3b]" />
            <span className="inline-block h-1.5 w-6 rounded-full bg-[#ffdf00]" />
            <span className="inline-block h-1.5 w-6 rounded-full bg-foreground/10 border" />
            <span className="inline-block h-1.5 w-6 rounded-full bg-accent-red" />
            <span className="inline-block h-1.5 w-6 rounded-full bg-primary" />
          </div>
          <div>Feito por brasileiros, para brasileiros.</div>
        </div>
      </footer>
    </div>
  );
}


const AVATAR_STACK = [
  { initials: "JS", bg: "bg-primary" },
  { initials: "MP", bg: "bg-accent-red" },
  { initials: "RC", bg: "bg-accent-gold" },
  { initials: "AS", bg: "bg-success" },
];

const REASONS = [
  {
    icon: ClipboardList,
    title: "Currículo profissional em minutos",
    desc: "Se apresente de forma clara e organizada, mesmo sem experiência prévia com currículo.",
  },
  {
    icon: Video,
    title: "Vídeo de apresentação",
    desc: "Mostre quem você é na prática e aumente suas chances de ser escolhido.",
  },
  {
    icon: Send,
    title: "Envio direto para recrutadores",
    desc: "Seu perfil chega até quem realmente está contratando para o H-2A.",
  },
];

const TRUST = [
  { title: "Não cobramos por vagas", desc: "Sem taxa, sem comissão, sem 'reserva de vaga'. Empregador legítimo do H-2A nunca cobra do trabalhador." },
  { title: "Conexão com oportunidades reais", desc: "Você fala direto com quem contrata — sem agenciador no meio do caminho." },
  { title: "Plataforma focada no H-2A", desc: "Feita para o programa de trabalho agrícola dos EUA. Sem distração, sem promessa de visto." },
];

const STEPS = [
  { icon: ClipboardList, title: "Crie seu perfil", desc: "Em poucos minutos, com nome, contato e localização." },
  { icon: FileText, title: "Adicione experiências no campo", desc: "Plantio, colheita, máquinas, irrigação — marque o que sabe." },
  { icon: Video, title: "Grave um vídeo simples", desc: "Até 1 minuto, direto pelo celular, falando quem você é." },
  { icon: Send, title: "Envie para recrutadores", desc: "Link compartilhável e envio via WhatsApp em um toque." },
];

const TESTIMONIALS = [
  {
    name: "Joelson Silva", age: 34, role: "Colheita de laranja", state: "Florida",
    from: "Minas Gerais → Lake Wales, FL",
    initials: "JS", avatar: "bg-primary",
    quote: "Montei meu perfil numa tarde, gravei o vídeo e mandei pro WhatsApp de um produtor. Em duas semanas tinha resposta.",
  },
  {
    name: "Marcos Pereira", age: 41, role: "Operador de trator", state: "Iowa",
    from: "Bahia → Cedar Rapids, IA",
    initials: "MP", avatar: "bg-accent-red",
    quote: "O vídeo fez diferença. O patrão viu eu mexendo no trator no celular e me chamou. Sem agenciador, sem taxa.",
  },
  {
    name: "Roseli Cardoso", age: 29, role: "Packing house", state: "Georgia",
    from: "Pernambuco → Tifton, GA",
    initials: "RC", avatar: "bg-accent-gold",
    quote: "O que me convenceu foi não ter cobrança escondida. Mandei meu perfil pra três fazendas e uma respondeu em dois dias.",
  },
];

const FAQ = [
  { q: "É realmente gratuito?", a: "Sim. Você cria seu perfil, grava o vídeo e envia para recrutadores sem pagar nada. Não cobramos taxa de vaga nem comissão." },
  { q: "Vocês garantem contratação ou visto?", a: "Não. Quem contrata é o produtor e quem aprova o visto é o consulado. A gente te dá a ferramenta para se apresentar profissionalmente e chegar até quem está contratando." },
  { q: "Como meu perfil chega no recrutador?", a: "Você recebe um link da sua página de apresentação e pode enviar direto no WhatsApp do recrutador, com uma mensagem pronta. Também pode copiar o link e compartilhar onde quiser." },
  { q: "Preciso falar inglês?", a: "Não para criar o perfil — tudo é em português. Falar inglês ajuda na entrevista com o produtor, e o app tem material de apoio para te preparar." },
  { q: "Como me protejo de golpe?", a: "Nunca pague 'taxa de aplicação', 'depósito de segurança' ou 'reserva de vaga'. Empregador legítimo de H-2A NUNCA cobra do trabalhador." },
];
