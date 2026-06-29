import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/vaiprala-logo.png";
import { AlertTriangle, ArrowRight, Check, DollarSign } from "lucide-react";

const FAQ = [
  {
    q: "Quanto custa o visto H-2A para brasileiros?",
    a: "O custo direto mais comum para o trabalhador é a taxa MRV do visto temporário de trabalho, paga ao agendar a entrevista consular. Também podem existir custos pessoais como passaporte, deslocamento até o consulado, exames ou documentos. No H-2A, o empregador deve arcar com custos essenciais de recrutamento, transporte e moradia conforme as regras americanas.",
  },
  {
    q: "Existe taxa de reciprocidade para visto H-2A?",
    a: "A taxa de reciprocidade depende da nacionalidade, categoria do visto e validade emitida. Para brasileiros, ela deve ser conferida na tabela oficial do Departamento de Estado antes da entrevista, porque valores e regras podem mudar.",
  },
  {
    q: "O empregador H-2A pode cobrar taxa de recrutamento?",
    a: "Não. O trabalhador H-2A não deve pagar taxa de recrutamento, promessa de vaga ou intermediação para conseguir o contrato. Cobranças desse tipo são sinal de alerta e devem ser evitadas.",
  },
  {
    q: "Quem paga passagem e moradia no H-2A?",
    a: "O programa H-2A exige que o empregador forneça moradia aprovada e transporte diário entre a moradia e o local de trabalho. O reembolso de transporte internacional e alimentação em trânsito segue regras específicas do contrato e do período trabalhado.",
  },
  {
    q: "Preciso comprovar dinheiro no consulado?",
    a: "O foco da entrevista H-2A é confirmar o contrato legítimo, a petição aprovada, seus vínculos com o Brasil e a intenção de cumprir as regras do visto. Ter reserva para deslocamento e despesas iniciais ajuda, mas não substitui documentação correta.",
  },
];

const COST_ROWS = [
  { item: "Taxa MRV do visto", who: "Trabalhador", note: "Pago no agendamento da entrevista. Confira o valor oficial atualizado antes de pagar." },
  { item: "Taxa de reciprocidade", who: "Pode variar", note: "Depende da nacionalidade e da validade emitida; consulte a tabela oficial no momento da emissão." },
  { item: "Passaporte brasileiro", who: "Trabalhador", note: "Necessário se você ainda não tem passaporte válido para a viagem." },
  { item: "Deslocamento ao consulado", who: "Trabalhador", note: "Passagem, hospedagem e alimentação para entrevista no Brasil, se precisar viajar." },
  { item: "Moradia nos EUA", who: "Empregador", note: "No H-2A, o empregador deve fornecer moradia aprovada sem custo ao trabalhador." },
  { item: "Transporte local para o trabalho", who: "Empregador", note: "O transporte entre moradia e fazenda/local de trabalho deve ser fornecido." },
  { item: "Recrutamento e petição", who: "Empregador", note: "Taxas de recrutamento, certificação e petição não devem ser cobradas do trabalhador." },
];

export const Route = createFileRoute("/guia-custos-visto-h2a")({
  head: () => ({
    meta: [
      { title: "Quanto custa o visto H-2A? Taxas e reciprocidade" },
      {
        name: "description",
        content:
          "Veja quanto custa o visto H-2A para brasileiros: taxa MRV, taxa de reciprocidade, passaporte, viagem ao consulado e custos que o empregador deve pagar.",
      },
      { name: "keywords", content: "quanto custa o visto H-2A, taxa MRV H-2A, taxa de reciprocidade visto americano, custos visto H2A" },
      { property: "og:title", content: "Quanto custa o visto H-2A? Taxas, MRV e reciprocidade" },
      { property: "og:description", content: "Guia claro para brasileiros entenderem custos do H-2A, taxas consulares e o que o empregador deve pagar." },
      { property: "og:url", content: "/guia-custos-visto-h2a" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "/guia-custos-visto-h2a" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Quanto custa o visto H-2A? Taxas, MRV e reciprocidade para brasileiros",
          description:
            "Guia de custos do visto H-2A para brasileiros, incluindo taxa MRV, possível taxa de reciprocidade, passaporte, deslocamento consular e despesas que o empregador deve assumir.",
          author: { "@type": "Organization", name: "VaiPraLá", url: "/" },
          publisher: {
            "@type": "Organization",
            name: "VaiPraLá",
            logo: { "@type": "ImageObject", url: "/favicon.ico" },
          },
          datePublished: "2026-06-29",
          dateModified: new Date().toISOString().slice(0, 10),
          mainEntityOfPage: { "@type": "WebPage", "@id": "/guia-custos-visto-h2a" },
          image: ["/favicon.ico"],
          inLanguage: "pt-BR",
          articleSection: "Vistos americanos",
          keywords: ["quanto custa o visto H-2A", "taxa MRV H-2A", "taxa de reciprocidade visto americano", "custos visto H2A"],
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
  component: H2ACostGuidePage,
});

function H2ACostGuidePage() {
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
          <span>Custos do visto H-2A</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Quanto custa o visto H-2A? Taxas, MRV e reciprocidade para brasileiros
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Entenda o investimento real para sair do Brasil com uma vaga H-2A: o que você paga,
          o que o empregador deve pagar e onde aparecem as taxas consulares.
        </p>

        <section className="mt-10 rounded-xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <DollarSign className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="text-xl font-bold">Resumo rápido dos custos</h2>
              <p className="mt-2 text-muted-foreground">
                Para o trabalhador brasileiro, os custos mais prováveis são a taxa consular do visto,
                passaporte se ainda não tiver, deslocamento até o consulado e despesas pessoais antes
                do primeiro pagamento. Já recrutamento, petição, moradia e transporte local no H-2A
                ficam do lado do empregador, conforme as regras do programa.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Taxa MRV: o pagamento obrigatório da entrevista</h2>
          <p>
            A <strong>taxa MRV</strong> é a taxa de solicitação do visto americano. Ela é paga no
            sistema de agendamento antes da entrevista e normalmente não é reembolsável. O valor pode
            mudar, então a regra prática é: confira o valor oficial no momento em que for agendar.
          </p>
          <p>
            Se alguém prometer “visto garantido” mediante taxa extra fora do sistema oficial, trate
            como alerta. A taxa consular é uma coisa; cobrança de atravessador ou promessa de vaga é outra.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Taxa de reciprocidade do visto americano</h2>
          <p>
            A <strong>taxa de reciprocidade</strong> é uma cobrança que pode existir para algumas
            nacionalidades e categorias de visto, geralmente ligada à validade emitida. Para brasileiros,
            ela deve ser checada na tabela oficial do Departamento de Estado no período da entrevista,
            porque regras consulares mudam.
          </p>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm">
              Não use print antigo de internet como base. Confirme a categoria do visto, nacionalidade,
              validade emitida e cobrança no sistema oficial antes de separar dinheiro.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold mb-4">Tabela: quem paga cada custo no H-2A</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Custo</th>
                  <th className="text-left p-3 font-medium">Quem normalmente paga</th>
                  <th className="text-left p-3 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {COST_ROWS.map((row) => (
                  <tr key={row.item} className="border-t">
                    <td className="p-3 font-medium">{row.item}</td>
                    <td className="p-3 text-muted-foreground">{row.who}</td>
                    <td className="p-3 text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-bold">Custos que você não deve pagar</h2>
          <p>
            O H-2A é desenhado para proteger o trabalhador rural temporário. Por isso, desconfie de
            qualquer pessoa cobrando para “colocar seu nome na lista”, “segurar vaga”, “comprar contrato”
            ou “pagar taxa de empregador”.
          </p>
          <ul className="space-y-2 ml-1">
            <li className="flex gap-2"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Não pague taxa de recrutamento por fora.</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Peça o nome do empregador e confirme a vaga oficial.</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-emerald-600 shrink-0" /> Guarde recibos de tudo que for custo obrigatório.</li>
          </ul>
        </section>

        <section className="mt-12 space-y-6">
          <h2 className="text-2xl font-bold">Perguntas frequentes sobre custos do H-2A</h2>
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </section>

        <div className="mt-12 rounded-2xl border bg-primary/5 p-6 sm:p-8 text-center">
          <h3 className="text-xl font-bold">Quer evitar gasto com vaga errada?</h3>
          <p className="mt-2 text-muted-foreground">
            Veja vagas H-2A oficiais por estado e compare com o contrato antes de pagar qualquer etapa.
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