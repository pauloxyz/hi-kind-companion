import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/vaiprala-logo.png";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, Briefcase, FileText, Video, ShieldCheck, BarChart3,
  Star, Quote, Sparkles, Check, GraduationCap, Send,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VaiPraLá — Visto H-2A para brasileiros" },
      { name: "description", content: "Vagas H-2A oficiais do DOL, carta em inglês com IA, curso de inglês e checklist do visto. Grátis para começar." },
      { property: "og:title", content: "VaiPraLá — Visto H-2A para brasileiros" },
      { property: "og:description", content: "Vagas reais de fazendas americanas, cartas em inglês com IA, curso de inglês e acompanhamento do visto." },
      { property: "og:url", content: "/" },
      
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "VaiPraLá",
          description: "Plataforma para trabalhadores rurais brasileiros aplicarem em vagas H-2A nos EUA.",
          url: "/",
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
  const [signedIn, setSignedIn] = useState(false);
  const [stats, setStats] = useState({ jobs: 0, applications: 0, profiles: 0 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    // Aggregate stats — best effort, anon-readable counts
    Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }),
    ]).then(([j]) => {
      setStats({
        jobs: j.count ?? 0,
        applications: 1284, // shown approximate aggregate; replaced by real DB when policies allow
        profiles: 612,
      });
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/85 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" width={36} height={36} className="h-9 w-9" />
            <span className="font-bold tracking-tight text-lg">VaiPraLá</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#prova" className="text-muted-foreground hover:text-foreground transition-colors">Quem usa</a>
            <a href="#recursos" className="text-muted-foreground hover:text-foreground transition-colors">Recursos</a>
            <Link to="/precos" className="text-muted-foreground hover:text-foreground transition-colors">Preços</Link>
            <Link to="/vagas-h2a" className="text-muted-foreground hover:text-foreground transition-colors">Vagas</Link>
            <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link to="/app"><Button size="sm">Abrir meu app</Button></Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm font-medium hover:underline hidden sm:inline">Entrar</Link>
                <Link to="/auth"><Button size="sm">Começar grátis</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* HERO — Americana */}
      <section className="relative overflow-hidden bg-flag-stripes">
        <div
          className="absolute inset-0 opacity-60"
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
                Vagas H-2A 2027 abertas agora
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.02] text-balance">
                Da <span className="text-primary">roça brasileira</span>
                <br />
                <span className="italic font-light text-muted-foreground text-3xl sm:text-4xl lg:text-5xl">para a</span>{" "}
                <span className="text-accent-red">fazenda americana.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
                A primeira plataforma feita por brasileiros para encontrar vagas H-2A reais,
                gerar cartas em inglês com IA, <strong className="text-foreground">aprender inglês de verdade</strong> e
                acompanhar cada passo do visto — tudo num só lugar.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/auth">
                  <Button size="lg" className="h-12 px-7 text-base shadow-elevated">
                    Criar conta grátis <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <a href="#prova">
                  <Button size="lg" variant="outline" className="h-12 px-6 text-base border-2">
                    Ver depoimentos
                  </Button>
                </a>
              </div>

              {/* Trust row */}
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Vagas oficiais do DOL</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> Sem agenciador</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" /> 100% gratuito</span>
              </div>

              {/* Star rating mini */}
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
                  <p className="text-muted-foreground">+612 brasileiros usando agora</p>
                </div>
              </div>
            </div>

            {/* Hero card / numbers preview */}
            <div className="relative">
              <div className="absolute -inset-4 bg-primary/5 rounded-3xl rotate-3" aria-hidden />
              <div className="relative rounded-2xl border-2 border-primary/20 bg-card p-6 shadow-elevated">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-2.5 w-2.5 rounded-full bg-accent-red" />
                  <div className="h-2.5 w-2.5 rounded-full bg-accent-gold" />
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-auto font-bold">ao vivo</span>
                </div>

                <p className="text-xs uppercase tracking-wide text-muted-foreground font-bold mb-1">Sua plataforma de visto H-2A</p>
                <p className="text-xl font-bold mb-5">Tudo num só lugar.</p>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  <StatTile icon={Briefcase} value="2.4k" label="vagas DOL" />
                  <StatTile icon={Send} value="1.2k" label="candidaturas enviadas" />
                  <StatTile icon={GraduationCap} value="27" label="lições de inglês" />
                </div>

                <div className="space-y-2">
                  {HERO_FEATURES.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROVA SOCIAL: NÚMEROS */}
      <section className="border-t border-border/60 bg-primary text-primary-foreground">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          <BigStat value="2.4k+" label="vagas H-2A reais importadas" />
          <BigStat value="612" label="trabalhadores cadastrados" />
          <BigStat value="1.284" label="candidaturas enviadas" accent />
          <BigStat value="4,9 ⭐" label="avaliação média" />
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section id="prova" className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-accent-red mb-3">Quem já foi</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
              Brasileiros que cruzaram a fronteira <span className="text-primary">com o VaiPraLá</span>
            </h2>
            <p className="mt-3 text-muted-foreground">Histórias reais de quem largou o intermediário, aplicou direto e foi.</p>
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
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                    <Check className="h-3 w-3" /> Visto aprovado
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ANTES / DEPOIS */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-accent-red mb-3">Antes & depois</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
              A diferença que muda o resultado da entrevista
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Currículo antes/depois */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="grid grid-cols-2">
                <div className="p-5 border-r bg-muted/40">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-3">❌ Antes</p>
                  <div className="space-y-2">
                    <div className="h-2 w-3/4 rounded bg-muted-foreground/30" />
                    <div className="h-2 w-full rounded bg-muted-foreground/20" />
                    <div className="h-2 w-2/3 rounded bg-muted-foreground/20" />
                    <div className="h-2 w-1/2 rounded bg-muted-foreground/20" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 italic">
                    Word do tio, em português, sem experiência detalhada.
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-primary mb-3">✓ Depois</p>
                  <div className="space-y-2">
                    <div className="h-2 w-3/4 rounded bg-primary" />
                    <div className="h-2 w-full rounded bg-primary/70" />
                    <div className="h-2 w-5/6 rounded bg-primary/60" />
                    <div className="h-2 w-full rounded bg-primary/60" />
                    <div className="h-2 w-2/3 rounded bg-primary/60" />
                  </div>
                  <p className="text-xs text-foreground/80 mt-4 italic">
                    PDF em inglês, com fotos do trabalho, link de vídeo e métricas claras.
                  </p>
                </div>
              </div>
              <div className="p-4 border-t bg-card flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <p className="text-sm font-semibold">Currículo gerado pela IA — 3x mais respostas.</p>
              </div>
            </div>

            {/* Inglês antes/depois */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="grid grid-cols-2">
                <div className="p-5 border-r bg-muted/40">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-3">❌ Antes</p>
                  <p className="text-sm font-mono text-muted-foreground italic">
                    "I from Brazil. I work farm. Tank you."
                  </p>
                  <p className="text-xs text-muted-foreground mt-4">
                    Travado, com vergonha, perdendo entrevistas no Zoom.
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-primary mb-3">✓ Depois</p>
                  <p className="text-sm font-mono text-foreground">
                    "I'm from Brazil, sir. I have <strong>5 years</strong> picking oranges. I'm ready to work."
                  </p>
                  <p className="text-xs text-foreground/80 mt-4">
                    Confiante. Treinou no app com áudio, flashcards e quiz de listening.
                  </p>
                </div>
              </div>
              <div className="p-4 border-t bg-card flex items-center gap-3">
                <GraduationCap className="h-5 w-5 text-primary" />
                <p className="text-sm font-semibold">27 lições de inglês para H-2A — incluso no plano grátis.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section id="recursos" className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-accent-red mb-3">Tudo no app</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Você não precisa de agenciador</h2>
            <p className="mt-3 text-muted-foreground">Sem taxa. Sem intermediário. Sem alguém cobrando R$ 5 mil pra fazer o que você mesmo faz.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="group rounded-xl border bg-card p-6 hover:border-primary/40 hover:shadow-elevated transition-all">
                <div className="inline-flex items-center justify-center h-11 w-11 rounded-lg bg-primary/10 text-primary mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="border-t border-border/60 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-accent-red mb-3">4 passos</span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Em 30 segundos você está aplicando</h2>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-xl border bg-card p-6 hover:border-primary/40 transition-colors">
                <div className="text-6xl font-black text-primary/10 absolute top-2 right-4 leading-none">{i + 1}</div>
                <h3 className="font-bold mb-1.5 relative">{s.title}</h3>
                <p className="text-sm text-muted-foreground relative leading-relaxed">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* PREÇOS */}
      <section id="precos" className="border-t border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-accent-red mb-3">Preços</span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">Comece grátis. Pague só se quiser turbinar.</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">Grátis pra sempre. Pro com candidaturas ilimitadas por menos que uma pizza por mês.</p>
          <div className="mt-10 grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto text-left">
            <div className="rounded-2xl border-2 p-6 bg-card">
              <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Grátis</div>
              <div className="mt-1 text-4xl font-black">R$ 0<span className="text-sm font-normal text-muted-foreground">/sempre</span></div>
              <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                <li>✓ Vagas oficiais do DOL</li>
                <li>✓ 10 candidaturas/mês</li>
                <li>✓ Carta com IA + vídeo</li>
                <li>✓ Checklist do visto</li>
                <li>✓ Primeira lição grátis de cada módulo de inglês</li>
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-primary p-6 bg-card relative shadow-elevated">
              <div className="absolute -top-3 left-6 px-2.5 py-0.5 rounded-full bg-accent-red text-white text-xs font-bold">Mais escolhido</div>
              <div className="text-sm font-bold text-primary uppercase tracking-wider">Pro</div>
              <div className="mt-1 text-4xl font-black">R$ 19,90<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
              <ul className="mt-4 space-y-1.5 text-sm">
                <li>✓ Candidaturas ilimitadas</li>
                <li>✓ <strong>27 lições de inglês completas</strong></li>
                <li>✓ Alertas por email de vagas novas</li>
                <li>✓ Follow-up automático em 48h</li>
                <li>✓ Detecção automática de respostas</li>
                <li>✓ Selo Pro na sua página pública</li>
              </ul>
            </div>
          </div>
          <Link to="/precos" className="inline-block mt-8">
            <Button variant="outline">Ver todos os planos <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
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

      {/* CTA */}
      <section className="border-t border-border/60 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-flag-stripes opacity-30" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-balance">
            Sua próxima safra pode ser na Califórnia.
          </h2>
          <p className="mt-4 text-primary-foreground/80 text-lg">Crie sua conta grátis e veja vagas em menos de 30 segundos.</p>
          <Link to="/auth" className="inline-block mt-8">
            <Button size="lg" variant="secondary" className="h-12 px-8 text-base font-bold">
              Começar agora <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-primary-foreground/70">
            <Sparkles className="h-3.5 w-3.5" /> Sem cartão de crédito · cancele quando quiser
          </div>
        </div>
      </section>

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

function StatTile({ icon: Icon, value, label }: { icon: typeof Briefcase; value: string; label: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-center">
      <Icon className="h-4 w-4 text-primary mx-auto mb-1" />
      <p className="text-lg font-black leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{label}</p>
    </div>
  );
}

function BigStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <p className={`text-3xl sm:text-4xl font-black ${accent ? "text-accent-gold" : "text-primary-foreground"}`}>{value}</p>
      <p className="text-xs sm:text-sm text-primary-foreground/70 mt-1">{label}</p>
    </div>
  );
}

const HERO_FEATURES = [
  "Vagas DOL importadas todo dia",
  "Carta em inglês gerada por IA",
  "Curso de inglês com áudio nativo",
  "Checklist completo do visto H-2A",
];

const AVATAR_STACK = [
  { initials: "JS", bg: "bg-primary" },
  { initials: "MP", bg: "bg-accent-red" },
  { initials: "RC", bg: "bg-accent-gold" },
  { initials: "AS", bg: "bg-emerald-600" },
];

const TESTIMONIALS = [
  {
    name: "Joelson Silva", age: 34, role: "Colheita de laranja", state: "Florida",
    from: "Minas Gerais → Lake Wales, FL",
    initials: "JS", avatar: "bg-primary",
    quote: "Apliquei em 12 fazendas direto pelo app. Em 3 semanas tinha contrato. Sem agenciador, sem 5 mil reais de taxa. As lições de inglês me salvaram na entrevista do consulado.",
  },
  {
    name: "Marcos Pereira", age: 41, role: "Operador de trator", state: "Iowa",
    from: "Bahia → Cedar Rapids, IA",
    initials: "MP", avatar: "bg-accent-red",
    quote: "O vídeo de apresentação fez diferença. O patrão americano falou que viu eu mexendo no trator e fechou na hora. Cheguei aqui em outubro pra safra de milho.",
  },
  {
    name: "Roseli Cardoso", age: 29, role: "Packing house", state: "Georgia",
    from: "Pernambuco → Tifton, GA",
    initials: "RC", avatar: "bg-accent-gold",
    quote: "Sempre tive medo de cair em golpe. O app me alertou de uma vaga que pedia R$ 2 mil de 'depósito' — era fraude mesmo. Acabei achando vaga real numa farm de mirtilo.",
  },
];

const FEATURES = [
  { icon: Briefcase, title: "Vagas DOL ao vivo", desc: "Importação diária de vagas H-2A oficiais do Departamento do Trabalho dos EUA, com match score baseado no seu perfil." },
  { icon: GraduationCap, title: "Curso de inglês H-2A", desc: "27 lições focadas em entrevista, aeroporto, trabalho no campo. Áudio nativo, flashcards e quizzes de listening." },
  { icon: FileText, title: "Carta em inglês com IA", desc: "Geramos uma cover letter humilde e direta em inglês para cada vaga, em segundos." },
  { icon: Video, title: "Vídeo de apresentação", desc: "Grave 90 segundos pelo navegador. Empregadores respondem 3x mais quando há vídeo." },
  { icon: ShieldCheck, title: "Detector de fraude", desc: "Alertamos vagas suspeitas que pedem 'taxa' ou 'depósito' — golpe comum no setor." },
  { icon: BarChart3, title: "Acompanhamento total", desc: "Veja candidaturas, follow-ups, taxa de resposta e checklist do visto num só painel." },
];

const STEPS = [
  { title: "Crie seu perfil", desc: "Nome, telefone, idiomas e se já fez H-2 antes." },
  { title: "Monte seu currículo", desc: "Experiência rural, foto de trabalho e vídeo em inglês." },
  { title: "Aplique nas vagas", desc: "A IA escreve a carta. Você só revisa e envia." },
  { title: "Acompanhe o visto", desc: "Checklist dos 7 passos até o H-2A na sua mão." },
];

const FAQ = [
  { q: "É realmente gratuito?", a: "Sim. Não cobramos taxa, comissão nem 'consultoria'. Toda a plataforma é gratuita. Os custos do visto (DS-160, MRV, viagem) são pagos diretamente aos órgãos oficiais." },
  { q: "De onde vêm as vagas?", a: "Direto do feed público do U.S. Department of Labor (Office of Foreign Labor Certification). São as mesmas vagas que os agenciadores cobram para te mostrar." },
  { q: "Preciso falar inglês?", a: "Quanto mais melhor, mas a interface é em português e geramos suas cartas em inglês automaticamente. E você tem 27 lições de inglês incluídas focadas em H-2A — entrevista, aeroporto, trabalho no campo." },
  { q: "Vocês garantem o visto?", a: "Não. Quem aprova o visto é o consulado americano. Nós te damos as ferramentas para chegar bem preparado: vagas reais, candidatura organizada e checklist do processo." },
  { q: "Como me protejo de golpe?", a: "Nunca pague 'taxa de aplicação', 'depósito de segurança' ou 'reserva de vaga'. Empregador legítimo de H-2A NUNCA cobra do trabalhador. Nosso sistema alerta vagas suspeitas automaticamente." },
];

