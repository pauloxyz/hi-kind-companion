import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/vaiprala-logo.png";
import { Check, X, ArrowRight } from "lucide-react";

const FAQ = [
  {
    q: "Qual é a diferença entre H-2A e H-2B?",
    a: "O H-2A é um visto temporário americano exclusivo para trabalho rural sazonal (colheita, pecuária, plantio). O H-2B cobre todos os outros serviços temporários não-agrícolas — hotelaria, paisagismo, parques de diversão, processamento de pescado, construção sazonal.",
  },
  {
    q: "Qual paga melhor: H-2A ou H-2B?",
    a: "Depende do estado e da função. O H-2A tem um salário mínimo regional fixado pelo governo americano (AEWR) que costuma ficar entre US$ 14 e US$ 20/hora. O H-2B segue o salário prevalente da região e função — pode pagar mais em hospitalidade de luxo ou menos em paisagismo básico.",
  },
  {
    q: "É mais fácil conseguir H-2A ou H-2B?",
    a: "O H-2A não tem teto anual de vistos, então tem muito mais vagas abertas todo ano. O H-2B é limitado a 66.000 vistos por ano nos EUA inteiros e tem sorteio (lottery) — a chance é bem menor.",
  },
  {
    q: "Posso trocar de H-2A para H-2B no meio do contrato?",
    a: "Não. Cada visto é vinculado a um empregador específico e a um tipo de trabalho. Trabalhar em função diferente da aprovada pode te tornar inelegível para futuros vistos americanos.",
  },
  {
    q: "Preciso de inglês fluente para H-2A ou H-2B?",
    a: "Para H-2A, inglês básico (instruções de fazenda, segurança) costuma bastar. Para H-2B em hotelaria ou turismo, exigem mais — atendimento ao público requer conversação. Em ambos, dominar inglês acelera promoções.",
  },
];

export const Route = createFileRoute("/guia-h2a-vs-h2b")({
  head: () => ({
    meta: [
      { title: "Visto H-2B vs H-2A: qual escolher? | Guia VaiPraLá" },
      {
        name: "description",
        content:
          "Diferenças entre o visto H-2A (rural) e H-2B (não-agrícola): salário, vagas, sorteio, inglês exigido. Guia atualizado para brasileiros.",
      },
      { property: "og:title", content: "Visto H-2B vs H-2A: guia completo para brasileiros" },
      { property: "og:description", content: "Comparativo claro entre os dois principais vistos de trabalho temporário americano." },
      { property: "og:image", content: "https://www.vaiprala.net/og-default.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://www.vaiprala.net/og-default.jpg" },
      { property: "og:url", content: "/guia-h2a-vs-h2b" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "/guia-h2a-vs-h2b" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Visto H-2B vs H-2A: qual escolher?",
          description:
            "Guia completo comparando os vistos H-2A (rural) e H-2B (não-agrícola) para brasileiros que querem trabalhar legalmente nos EUA.",
          author: { "@type": "Organization", name: "VaiPraLá", url: "/" },
          publisher: {
            "@type": "Organization",
            name: "VaiPraLá",
            logo: { "@type": "ImageObject", url: "/favicon.ico" },
          },
          datePublished: "2026-01-15",
          dateModified: new Date().toISOString().slice(0, 10),
          mainEntityOfPage: { "@type": "WebPage", "@id": "/guia-h2a-vs-h2b" },
          image: ["/favicon.ico"],
          inLanguage: "pt-BR",
          articleSection: "Vistos americanos",
          keywords: ["visto h2a", "visto h2b", "h2a vs h2b", "trabalho EUA", "visto temporário americano"],
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
  component: GuidePage,
});

const COMPARISON: Array<{ feature: string; h2a: string; h2b: string }> = [
  { feature: "Tipo de trabalho", h2a: "Rural sazonal (colheita, plantio, pecuária)", h2b: "Não-agrícola (hotelaria, paisagismo, construção sazonal)" },
  { feature: "Salário mínimo", h2a: "AEWR fixado pelo governo (US$ 14–20/h)", h2b: "Salário prevalente da função na região" },
  { feature: "Limite anual de vistos", h2a: "Sem teto", h2b: "66.000/ano com sorteio" },
  { feature: "Moradia", h2a: "Empregador é obrigado a fornecer grátis", h2b: "Empregador não é obrigado" },
  { feature: "Transporte EUA → trabalho", h2a: "Empregador paga", h2b: "Em geral por conta do trabalhador" },
  { feature: "Inglês exigido", h2a: "Básico", h2b: "Intermediário em funções públicas" },
  { feature: "Duração típica", h2a: "3 a 10 meses (1 safra)", h2b: "Até 9 meses, renovável" },
];

function GuidePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/vagas-h2a" className="text-sm font-medium hover:underline">
            Ver vagas H-2A →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <nav className="text-sm text-muted-foreground mb-4">
          <Link to="/" className="hover:underline">Início</Link>
          <span className="mx-2">/</span>
          <span>Guia H-2A vs H-2B</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Visto H-2B vs H-2A: qual escolher para trabalhar nos EUA?
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Os dois vistos americanos de trabalho temporário mais procurados por brasileiros parecem
          parecidos, mas atendem perfis bem diferentes. Veja a comparação direta e descubra qual
          combina com você.
        </p>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">O que é o visto H-2A?</h2>
          <p>
            O <strong>H-2A</strong> é o visto americano para trabalho <strong>agrícola sazonal</strong>:
            colher laranja na Flórida, plantar batata em Idaho, manejar gado em Montana. É o visto
            historicamente mais acessível a brasileiros do interior, porque não exige inglês fluente
            nem qualificação técnica.
          </p>
          <ul className="space-y-2 ml-1">
            <li className="flex gap-2"><Check className="h-5 w-5 text-success shrink-0" /> Sem limite anual de vistos — milhares de vagas a cada safra.</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-success shrink-0" /> Empregador paga passagem, moradia e transporte da fazenda até o serviço.</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-success shrink-0" /> Salário mínimo regional fixado pelo governo dos EUA (AEWR).</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-success shrink-0" /> Vagas publicadas oficialmente pelo Department of Labor — você pode conferir.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">O que é o visto H-2B?</h2>
          <p>
            O <strong>H-2B</strong> cobre todos os outros serviços temporários <strong>não-agrícolas</strong>:
            hotelaria, paisagismo, parques de diversão, processamento de pescado, construção sazonal,
            limpeza em resorts. É popular nos estados turísticos (Flórida, Carolina do Sul, Maine,
            Colorado).
          </p>
          <ul className="space-y-2 ml-1">
            <li className="flex gap-2"><X className="h-5 w-5 text-destructive shrink-0" /> Limite anual de 66.000 vistos para os EUA inteiros — vai a sorteio.</li>
            <li className="flex gap-2"><X className="h-5 w-5 text-destructive shrink-0" /> Empregador não é obrigado a fornecer moradia gratuita.</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-success shrink-0" /> Pode pagar mais em hotelaria de luxo ou parques temáticos.</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-success shrink-0" /> Pode ser renovado por até 3 anos ininterruptos.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold mb-4">Comparação rápida</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Característica</th>
                  <th className="text-left p-3 font-medium">H-2A (rural)</th>
                  <th className="text-left p-3 font-medium">H-2B (não-agrícola)</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-t">
                    <td className="p-3 font-medium">{row.feature}</td>
                    <td className="p-3 text-muted-foreground">{row.h2a}</td>
                    <td className="p-3 text-muted-foreground">{row.h2b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Qual visto escolher?</h2>
          <p>
            Se você é da roça, já trabalhou com lavoura ou gado, e quer maximizar suas chances de
            aprovação no consulado: o <strong>H-2A</strong> é o caminho. Tem mais vagas, sem sorteio,
            com salário fixo e moradia paga.
          </p>
          <p>
            Antes de aceitar qualquer proposta, confira também o guia de <Link to="/guia-custos-visto-h2a" className="font-medium text-primary hover:underline">custos do visto H-2A, taxa MRV e reciprocidade</Link> para entender o que é sua responsabilidade e o que deve ser pago pelo empregador.
          </p>
          <p>
            Se você já trabalhou em hotel, restaurante, parque ou construção e tem alguma conversação
            em inglês: o <strong>H-2B</strong> pode pagar mais, mas exige paciência com o sorteio
            anual.
          </p>
        </section>

        <section className="mt-12 space-y-6">
          <h2 className="text-2xl font-bold">Perguntas frequentes</h2>
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </section>

        <div className="mt-12 rounded-2xl border bg-primary/5 p-6 sm:p-8 text-center">
          <h3 className="text-xl font-bold">Decidiu pelo H-2A?</h3>
          <p className="mt-2 text-muted-foreground">
            Veja as vagas oficiais H-2A abertas hoje, organizadas por estado.
          </p>
          <Link
            to="/vagas-h2a"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ver vagas H-2A <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
