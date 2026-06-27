import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/vaiprala-logo.png";
import { Button } from "@/components/ui/button";
import { ArrowRight, Briefcase, FileText, Video, ShieldCheck, BarChart3, Globe2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VaiPraLá — Da roça brasileira para a fazenda americana | Visto H-2A" },
      { name: "description", content: "Plataforma gratuita que conecta trabalhadores rurais brasileiros a vagas H-2A reais nos Estados Unidos. Vagas DOL ao vivo, carta em inglês com IA, vídeo de apresentação e checklist do visto." },
      { property: "og:title", content: "VaiPraLá — Visto H-2A para brasileiros" },
      { property: "og:description", content: "Vagas reais de fazendas americanas, cartas em inglês com IA, vídeo de apresentação e acompanhamento do visto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" width={36} height={36} className="h-9 w-9" />
            <span className="font-bold tracking-tight">VaiPraLá</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#como-funciona" className="text-muted-foreground hover:text-foreground">Como funciona</a>
            <a href="#recursos" className="text-muted-foreground hover:text-foreground">Recursos</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground">FAQ</a>
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

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          aria-hidden
          style={{
            background:
              "radial-gradient(900px 500px at 10% 10%, #00923f33, transparent), radial-gradient(900px 500px at 90% 30%, #3c3b6e33, transparent), radial-gradient(700px 400px at 50% 90%, #ffdf0022, transparent)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-24 sm:pt-24 sm:pb-32 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            Vagas H-2A 2027 abertas agora
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
            Da <span className="text-[#009c3b]">roça brasileira</span><br />
            <span className="italic font-light text-muted-foreground">para a</span>{" "}
            <span className="text-[#b22234]">fazenda americana.</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground">
            A primeira plataforma feita por brasileiros para encontrar vagas H-2A reais,
            gerar cartas em inglês com IA e acompanhar cada passo do visto — tudo num só lugar, gratuito.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="h-12 px-6 text-base">
                Criar conta grátis <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#como-funciona">
              <Button size="lg" variant="outline" className="h-12 px-6 text-base">Como funciona</Button>
            </a>
          </div>
          <div className="mt-10 flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>✓ Vagas oficiais do Departamento do Trabalho dos EUA</span>
            <span>✓ Cartas em inglês com IA</span>
            <span>✓ 100% gratuito</span>
          </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section id="recursos" className="border-t bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Tudo que você precisa para conquistar a vaga</h2>
            <p className="mt-3 text-muted-foreground">Sem agenciador. Sem taxa. Sem intermediário cobrando para fazer o que você mesmo consegue.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-6 hover:shadow-md transition-shadow">
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="border-t">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Em 4 passos você está aplicando</h2>
          </div>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-xl border bg-card p-6">
                <div className="text-6xl font-bold text-primary/15 absolute top-2 right-4">{i + 1}</div>
                <h3 className="font-semibold mb-1 relative">{s.title}</h3>
                <p className="text-sm text-muted-foreground relative">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-10">Perguntas frequentes</h2>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-lg border bg-card p-4">
                <summary className="cursor-pointer font-medium list-none flex items-center justify-between">
                  {f.q}
                  <span className="text-muted-foreground group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">Sua próxima safra pode ser na Califórnia.</h2>
          <p className="mt-4 text-muted-foreground">Crie sua conta gratuita e veja vagas em menos de 30 segundos.</p>
          <Link to="/auth" className="inline-block mt-8">
            <Button size="lg" className="h-12 px-8 text-base">Começar agora <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" width={28} height={28} className="h-7 w-7 opacity-80" />
            <span>© {new Date().getFullYear()} VaiPraLá</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-6 rounded-full bg-[#009c3b]" />
            <span className="inline-block h-1.5 w-6 rounded-full bg-[#ffdf00]" />
            <span className="inline-block h-1.5 w-6 rounded-full bg-white border" />
            <span className="inline-block h-1.5 w-6 rounded-full bg-[#b22234]" />
            <span className="inline-block h-1.5 w-6 rounded-full bg-[#3c3b6e]" />
          </div>
          <div>Feito por brasileiros, para brasileiros.</div>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  { icon: Briefcase, title: "Vagas DOL ao vivo", desc: "Importação diária de vagas H-2A oficiais do Departamento do Trabalho dos EUA, com match score baseado no seu perfil." },
  { icon: FileText, title: "Carta em inglês com IA", desc: "Geramos uma cover letter humilde e direta em inglês para cada vaga, em segundos." },
  { icon: Video, title: "Vídeo de apresentação", desc: "Grave 90 segundos pelo navegador. Empregadores respondem 3x mais quando há vídeo." },
  { icon: ShieldCheck, title: "Detector de fraude", desc: "Alertamos vagas suspeitas que pedem 'taxa' ou 'depósito' — golpe comum no setor." },
  { icon: BarChart3, title: "Acompanhamento total", desc: "Veja suas candidaturas, follow-ups vencendo, taxa de resposta e checklist do visto num só painel." },
  { icon: Globe2, title: "Página pública /v/voce", desc: "Um link único para enviar ao empregador, com vídeo, fotos e experiência — visualizações registradas." },
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
  { q: "Preciso falar inglês?", a: "Quanto mais melhor, mas a interface é em português e geramos suas cartas em inglês automaticamente. O nível de inglês exigido depende da vaga." },
  { q: "Vocês garantem o visto?", a: "Não. Quem aprova o visto é o consulado americano. Nós te damos as ferramentas para chegar bem preparado: vagas reais, candidatura organizada e checklist do processo." },
  { q: "Como me protejo de golpe?", a: "Nunca pague 'taxa de aplicação', 'depósito de segurança' ou 'reserva de vaga'. Empregador legítimo de H-2A NUNCA cobra do trabalhador. Nosso sistema alerta vagas suspeitas automaticamente." },
];
