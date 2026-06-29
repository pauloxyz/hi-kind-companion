import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/vaiprala-logo.png";
import { Check, ArrowRight } from "lucide-react";

const FAQ = [
  {
    q: "O que é o visto H-2B?",
    a: "O H-2B é o visto americano de trabalho temporário não-agrícola: hotelaria, paisagismo, construção sazonal, parques de diversão, processamento de pescado, limpeza em resorts. É emitido para brasileiros contratados por empregadores americanos para suprir demanda sazonal ou pontual.",
  },
  {
    q: "Como funciona o sorteio (lottery) do H-2B?",
    a: "O governo americano emite 66.000 vistos H-2B por ano fiscal, divididos em duas metades (33.000 cada semestre). Quando a demanda excede a oferta, o USCIS faz um sorteio aleatório entre as petições recebidas no período de abertura. Em anos recentes houve liberação de vistos suplementares, mas não é garantia.",
  },
  {
    q: "Quanto paga o visto H-2B?",
    a: "O salário segue o prevailing wage da função na região do trabalho — definido pelo Department of Labor. Em hotelaria de luxo, parques temáticos e construção pode pagar entre US$ 15 e US$ 25/h. Em paisagismo básico costuma ficar perto do mínimo regional.",
  },
  {
    q: "Quais empregos mais comuns no H-2B para brasileiros?",
    a: "Camareira/housekeeper, garçom, cozinheiro auxiliar, paisagista, jardineiro, operador de equipamento, construção sazonal, atendente de parque, processamento de frutos do mar, limpeza em resorts e cruzeiros costeiros.",
  },
  {
    q: "Preciso de inglês para o H-2B?",
    a: "Para funções de fundo (cozinha, paisagismo, limpeza) inglês básico costuma bastar. Para atendimento ao público (recepção, garçom, parques) os empregadores exigem conversação intermediária. Quanto melhor o inglês, melhor a função e o salário.",
  },
  {
    q: "Posso levar família com H-2B?",
    a: "Sim. Cônjuge e filhos menores de 21 anos podem solicitar visto H-4 como dependentes. O H-4 permite acompanhar o titular nos EUA, mas não permite trabalhar.",
  },
  {
    q: "Quanto dura o visto H-2B?",
    a: "A validade inicial costuma ser de até 9 meses, alinhada à temporada do empregador. Pode ser renovado por períodos adicionais, somando até 3 anos consecutivos. Depois, é preciso passar 3 meses fora dos EUA antes de pedir um novo.",
  },
  {
    q: "Qual a diferença entre H-2A e H-2B?",
    a: "H-2A é exclusivo para trabalho rural (colheita, pecuária, plantio) e não tem teto anual. H-2B cobre todos os outros serviços temporários (hotelaria, construção, paisagismo) e tem o sorteio de 66.000 vistos por ano.",
  },
];

export const Route = createFileRoute("/guia-visto-h2b")({
  head: () => ({
    meta: [
      { title: "Visto H-2B para brasileiros: o guia definitivo | VaiPraLá" },
      {
        name: "description",
        content:
          "Visto H-2B nos EUA: como funciona o sorteio, salários, funções (hotelaria, paisagismo, construção), inglês exigido e como conseguir. Guia atualizado 2026.",
      },
      { name: "keywords", content: "visto h2b, h2b, h-2b, visto h-2b, trabalho temporário EUA, hotelaria EUA, paisagismo EUA" },
      { property: "og:title", content: "Visto H-2B: guia completo para brasileiros que querem trabalhar nos EUA" },
      { property: "og:description", content: "Como funciona o H-2B: sorteio, salário, funções, inglês e família. Explicado para brasileiros." },
      { property: "og:url", content: "/guia-visto-h2b" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "/guia-visto-h2b" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Visto H-2B para brasileiros: o guia definitivo",
          description:
            "Guia completo do visto H-2B nos EUA para brasileiros: sorteio anual, salários, funções, inglês exigido e família.",
          author: { "@type": "Organization", name: "VaiPraLá", url: "/" },
          publisher: {
            "@type": "Organization",
            name: "VaiPraLá",
            logo: { "@type": "ImageObject", url: "/favicon.ico" },
          },
          datePublished: "2026-06-01",
          dateModified: new Date().toISOString().slice(0, 10),
          mainEntityOfPage: { "@type": "WebPage", "@id": "/guia-visto-h2b" },
          image: ["/favicon.ico"],
          inLanguage: "pt-BR",
          articleSection: "Vistos americanos",
          keywords: ["visto h2b", "h2b", "h-2b", "trabalho temporário EUA", "hotelaria EUA", "paisagismo EUA", "sorteio h2b"],
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
  component: H2BGuidePage,
});

function H2BGuidePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/guia-h2a-vs-h2b" className="text-sm font-medium hover:underline">
            Comparar com H-2A →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <nav className="text-sm text-muted-foreground mb-4">
          <Link to="/" className="hover:underline">Início</Link>
          <span className="mx-2">/</span>
          <span>Guia do Visto H-2B</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Visto H-2B para brasileiros: o guia definitivo
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Tudo sobre o visto americano de trabalho temporário não-agrícola — sorteio anual,
          funções, salário, inglês exigido e o caminho para conseguir o seu.
        </p>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">O que é o visto H-2B</h2>
          <p>
            O <strong>H-2B</strong> é o visto de trabalho temporário emitido pelos EUA para
            funções <strong>não-agrícolas</strong>: hotelaria, paisagismo, construção sazonal,
            parques temáticos, processamento de pescado e limpeza em resorts. Diferente do H-2A
            (rural), o H-2B atende empregadores em cidades turísticas e regiões com pico sazonal
            — Flórida, Carolina do Sul, Maine, Colorado, Texas.
          </p>
          <p>
            É a porta de entrada mais usada por brasileiros que querem trabalhar legalmente nos
            EUA fora do campo, com salário em dólar, contrato formal e direito a renovar.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Como funciona o sorteio (lottery)</h2>
          <p>
            O governo americano libera <strong>66.000 vistos H-2B por ano fiscal</strong>,
            divididos em duas metades: 33.000 para contratações entre 1º de outubro e 31 de
            março, e 33.000 entre 1º de abril e 30 de setembro. Quando os pedidos passam do
            teto, o USCIS faz um sorteio aleatório.
          </p>
          <ul className="space-y-2 ml-1">
            <li className="flex gap-2"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Empregador americano abre a petição I-129 com o USCIS.</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Se aprovada, o trabalhador agenda entrevista no consulado.</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Em anos recentes houve liberação de vistos suplementares por demanda.</li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Funções e salários no H-2B</h2>
          <p>
            O salário segue o <em>prevailing wage</em> da função na região, definido pelo
            Department of Labor. Faixas típicas para brasileiros:
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Função</th>
                  <th className="text-left p-3 font-medium">Faixa salarial (US$/h)</th>
                  <th className="text-left p-3 font-medium">Regiões comuns</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { f: "Camareira / housekeeper", s: "13 – 18", r: "Flórida, Carolina do Sul, Colorado" },
                  { f: "Cozinheiro auxiliar", s: "15 – 22", r: "Hotelaria em todo o país" },
                  { f: "Garçom / atendente", s: "12 + gorjetas", r: "Resorts e cruzeiros costeiros" },
                  { f: "Paisagismo / jardinagem", s: "15 – 20", r: "Texas, Califórnia, Nordeste" },
                  { f: "Construção sazonal", s: "18 – 25", r: "Norte (verão), Sul (inverno)" },
                  { f: "Operador de parque", s: "13 – 17", r: "Flórida, Califórnia, Virgínia" },
                ].map((r) => (
                  <tr key={r.f} className="border-t">
                    <td className="p-3 font-medium">{r.f}</td>
                    <td className="p-3 text-muted-foreground">{r.s}</td>
                    <td className="p-3 text-muted-foreground">{r.r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Inglês exigido</h2>
          <p>
            Para funções de fundo (cozinha, paisagismo, limpeza) inglês <strong>básico</strong>
            costuma bastar. Para atendimento direto ao público (recepção, garçom, parques) os
            empregadores exigem conversação <strong>intermediária</strong>. Quanto melhor seu
            inglês, melhor a função, a gorjeta e a chance de renovação.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Família: o visto H-4</h2>
          <p>
            Cônjuge e filhos menores de 21 anos podem solicitar visto <strong>H-4</strong> como
            dependentes. O H-4 permite acompanhar o titular nos EUA durante toda a validade do
            H-2B, mas não autoriza trabalhar.
          </p>
        </section>

        <section className="mt-12 space-y-6">
          <h2 className="text-2xl font-bold">Perguntas frequentes sobre o H-2B</h2>
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </section>

        <div className="mt-12 rounded-2xl border bg-primary/5 p-6 sm:p-8 text-center">
          <h3 className="text-xl font-bold">Quer comparar com o H-2A?</h3>
          <p className="mt-2 text-muted-foreground">
            O H-2A é a porta rural — sem sorteio, com moradia paga. Veja o comparativo completo.
          </p>
          <Link
            to="/guia-h2a-vs-h2b"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Comparar H-2A vs H-2B <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
