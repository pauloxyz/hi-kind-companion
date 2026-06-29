import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/vaiprala-logo.png";

const PATH = "/guia-golpes-h2a";

const RED_FLAGS = [
  { titulo: "Cobra mais de R$ 5.000 adiantado", explicacao: "O empregador americano paga TODAS as taxas oficiais do H-2A (petição I-129, processamento). O candidato paga só MRV (US$ 185 ≈ R$ 1.000), passagem reembolsável, foto e documentos. Quem cobra R$ 8-15 mil 'pra te colocar na fila' é golpe." },
  { titulo: "Promete 'aprovação garantida' do visto", explicacao: "Nenhum recrutador, agenciador ou despachante pode garantir aprovação. A decisão é exclusiva do cônsul americano. Quem garante mente." },
  { titulo: "Pede pagamento via PIX para CPF pessoal", explicacao: "Empresa real recebe em CNPJ, com nota fiscal. PIX em CPF de 'parceiro' é como bandido recebe — e some." },
  { titulo: "Não mostra a Job Order do DOL", explicacao: "Toda vaga H-2A real tem uma 'Job Order' publicada no SeasonalJobs.dol.gov com número de certificação. Sem esse número, a vaga não existe." },
  { titulo: "Marca 'entrevista de seleção' em São Paulo cobrando R$ 500", explicacao: "Empregadores H-2A não fazem entrevista presencial no Brasil. Entrevistam por WhatsApp/Zoom em inglês básico — e isso é GRATUITO." },
  { titulo: "Diz que você precisa 'comprar o visto'", explicacao: "Visto não se compra. Quem fala isso quer seu dinheiro e seu passaporte." },
  { titulo: "Não tem CNPJ ou endereço físico verificável", explicacao: "Pesquise o CNPJ na Receita Federal. Se for empresa de fachada (capital social baixo, mesmo endereço de 50 outras), corra." },
  { titulo: "Pressiona com 'última vaga, decida hoje'", explicacao: "Vagas H-2A reais ficam abertas por semanas. Pressão pra decidir em 24h é manipulação de venda." },
];

const FAQ = [
  { q: "Quanto realmente custa o visto H-2A?", a: "Os custos oficiais para o candidato são: MRV (US$ 185), foto (~R$ 50), passagem aérea (reembolsada pelo empregador depois de 50% do contrato), traduções e atestado médico se exigido. Total realista: R$ 1.500–2.500." },
  { q: "Como verificar se uma vaga H-2A é real?", a: "Toda vaga H-2A certificada aparece em seasonaljobs.dol.gov ou no portal do Department of Labor. Peça ao recrutador o 'job order number' (formato H-300-NN-NNNNN) e pesquise." },
  { q: "Recrutador pode cobrar pelo serviço?", a: "Pela lei americana (H-2A regulations), recrutadores NÃO PODEM cobrar do trabalhador. Cobrança é ilegal e o empregador pode perder a certificação. Denuncie em wagehour.dol.gov." },
  { q: "Caí num golpe, o que fazer?", a: "1) Boletim de ocorrência (online em delegaciaeletronica.sp.gov.br ou similar). 2) Denúncia no Procon. 3) Denúncia no FBI (ic3.gov) se o golpista alega ser empresa americana. 4) Reclame Aqui pra alertar outros." },
];

export const Route = createFileRoute("/guia-golpes-h2a")({
  head: () => ({
    meta: [
      { title: "Golpes do visto H-2A no Brasil: 8 sinais de alerta | VaiPraLá" },
      { name: "description", content: "Como identificar golpes de visto H-2A: red flags, quanto realmente custa, como verificar se a vaga é real e o que fazer se já caiu. Guia honesto, sem agenciador." },
      { property: "og:title", content: "Golpes do visto H-2A: 8 sinais pra não cair" },
      { property: "og:description", content: "Brasileiros perdem R$ 20 milhões/ano com golpes de visto H-2A. Aprenda a identificar antes de pagar." },
      { property: "og:image", content: "https://www.vaiprala.net/og-default.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://www.vaiprala.net/og-default.jpg" },
      { property: "og:url", content: PATH },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: PATH }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Golpes do visto H-2A no Brasil: 8 sinais de alerta",
          author: { "@type": "Organization", name: "VaiPraLá", url: "/" },
          publisher: { "@type": "Organization", name: "VaiPraLá", logo: { "@type": "ImageObject", url: "/favicon.ico" } },
          datePublished: "2026-01-25",
          dateModified: new Date().toISOString().slice(0, 10),
          mainEntityOfPage: { "@type": "WebPage", "@id": PATH },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }),
      },
    ],
  }),
  component: GolpesPage,
});

function GolpesPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/vagas-h2a" className="text-sm font-medium hover:underline">Ver vagas reais →</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        <article>
          <nav className="text-sm text-muted-foreground mb-4">
            <Link to="/" className="hover:underline">Início</Link>
            <span className="mx-2">/</span>
            <span>Golpes H-2A</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Golpes do visto H-2A: 8 sinais de alerta</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Brasileiros perdem mais de R$ 20 milhões por ano com golpes de visto H-2A — recrutadores fantasmas,
            'agenciadores' que somem após receber, fazendas que não existem. A boa notícia: dá pra identificar
            todos eles antes de pagar. Use este checklist.
          </p>
        </article>

        <section className="space-y-3">
          {RED_FLAGS.map((r, i) => (
            <div key={r.titulo} className="rounded-lg border-l-4 border-accent-red bg-card p-5">
              <p className="font-semibold flex items-start gap-2">
                <span className="text-accent-red">🚩 {i + 1}.</span> {r.titulo}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{r.explicacao}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border bg-primary/5 p-6 space-y-3">
          <h2 className="text-xl font-bold tracking-tight">Como verificar se uma vaga H-2A é real (3 passos)</h2>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>Peça o <strong>job order number</strong> ao recrutador (formato H-300-XX-XXXXX).</li>
            <li>Pesquise no <a href="https://seasonaljobs.dol.gov" target="_blank" rel="noopener noreferrer" className="text-primary underline">seasonaljobs.dol.gov</a> (portal oficial do Departamento do Trabalho).</li>
            <li>Confira nome do empregador, cidade, datas e salário. Se algo divergir do que o recrutador disse, é golpe.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Perguntas frequentes</h2>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="rounded-lg border bg-card p-4">
                <summary className="font-semibold cursor-pointer">{f.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-xl border-2 border-primary/30 bg-card p-6 text-center space-y-3">
          <h3 className="text-xl font-bold">VaiPraLá lista apenas vagas oficiais do DOL</h3>
          <p className="text-sm text-muted-foreground">
            Importamos diariamente o feed público do Department of Labor americano. Cada vaga tem job order number verificável.
            Você se candidata DIRETO ao empregador — sem agenciador, sem taxa, sem intermediário.
          </p>
          <Link to="/vagas-h2a" className="inline-flex rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">Ver vagas H-2A verificadas</Link>
        </section>
      </main>
    </div>
  );
}
