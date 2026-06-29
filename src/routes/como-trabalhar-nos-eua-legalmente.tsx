import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/vaiprala-logo.png";

const PATH = "/como-trabalhar-nos-eua-legalmente";

const VISTOS = [
  { code: "H-2A", name: "Trabalho rural temporário", req: "Sem inglês exigido, sem diploma. Empregador americano patrocina.", salario: "US$ 14-20/h", dificuldade: "Baixa", melhorPara: "Trabalhadores rurais brasileiros sem inglês, com experiência prática.", link: "/vagas-h2a" },
  { code: "H-2B", name: "Trabalho não-agrícola temporário", req: "Empregador patrocina. Sorteio anual (66.000 vistos).", salario: "US$ 13-22/h", dificuldade: "Média (sorteio)", melhorPara: "Hotelaria, paisagismo, parques de diversão, construção sazonal.", link: "/guia-visto-h2b" },
  { code: "H-1B", name: "Profissional especializado", req: "Diploma superior + oferta de emprego de US$ 60k+/ano. Sorteio anual.", salario: "US$ 60-200k/ano", dificuldade: "Alta", melhorPara: "TI, engenharia, finanças, medicina. Sorteio em março." },
  { code: "J-1", name: "Intercâmbio cultural", req: "Programa via agência autorizada (Work & Travel, Au Pair, Trainee).", salario: "US$ 10-18/h", dificuldade: "Média", melhorPara: "Estudantes universitários ou recém-formados querendo experiência de 4-12 meses." },
  { code: "TN (Tratado)", name: "Profissional NAFTA", req: "Só canadenses e mexicanos. Brasileiros não se aplicam.", salario: "Varia", dificuldade: "N/A para brasileiros", melhorPara: "Não aplicável" },
  { code: "EB-3", name: "Green card por trabalho", req: "Empregador patrocina. Fila de 5-8 anos. Sem inglês exigido.", salario: "US$ 12-30/h", dificuldade: "Alta (espera longa)", melhorPara: "Quem quer imigrar permanentemente e tem paciência pra fila." },
];

export const Route = createFileRoute("/como-trabalhar-nos-eua-legalmente")({
  head: () => ({
    meta: [
      { title: "Como trabalhar nos EUA legalmente: 6 vistos comparados | VaiPraLá" },
      { name: "description", content: "Guia completo dos vistos de trabalho americano para brasileiros: H-2A, H-2B, H-1B, J-1, TN, EB-3. Salário, dificuldade e qual escolher." },
      { property: "og:title", content: "Como trabalhar nos EUA legalmente — 6 caminhos" },
      { property: "og:description", content: "H-2A é a porta mais acessível para brasileiros sem inglês ou diploma. Veja os 6 vistos de trabalho e qual escolher." },
      { property: "og:url", content: PATH },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: PATH }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Como trabalhar nos EUA legalmente",
        author: { "@type": "Organization", name: "VaiPraLá", url: "/" },
        publisher: { "@type": "Organization", name: "VaiPraLá", logo: { "@type": "ImageObject", url: "/favicon.ico" } },
        datePublished: "2026-01-10",
        dateModified: new Date().toISOString().slice(0, 10),
        mainEntityOfPage: { "@type": "WebPage", "@id": PATH },
      }),
    }],
  }),
  component: PillarPage,
});

function PillarPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/vagas-h2a" className="text-sm font-medium hover:underline">Ver vagas H-2A →</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-12">
        <article>
          <nav className="text-sm text-muted-foreground mb-4">
            <Link to="/" className="hover:underline">Início</Link>
            <span className="mx-2">/</span>
            <span>Como trabalhar nos EUA</span>
          </nav>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Como trabalhar nos EUA legalmente</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Trabalhar nos Estados Unidos sem visto é arriscado: deportação, banimento de 10 anos, sem direitos trabalhistas.
            Existem 6 caminhos legais para brasileiros. Para a maioria, o <strong>H-2A é o mais acessível</strong> — não exige
            inglês, diploma ou sorteio. Aqui está o comparativo honesto.
          </p>
        </article>

        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-5">Os 6 vistos de trabalho dos EUA</h2>
          <div className="space-y-4">
            {VISTOS.map((v) => (
              <article key={v.code} className="rounded-lg border bg-card p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                  <span className="text-xl font-bold text-primary">{v.code}</span>
                  <span className="text-base font-semibold">{v.name}</span>
                </div>
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-3">
                  <div><dt className="font-semibold inline">Requisitos: </dt><dd className="inline text-muted-foreground">{v.req}</dd></div>
                  <div><dt className="font-semibold inline">Salário: </dt><dd className="inline text-muted-foreground">{v.salario}</dd></div>
                  <div><dt className="font-semibold inline">Dificuldade: </dt><dd className="inline text-muted-foreground">{v.dificuldade}</dd></div>
                  <div><dt className="font-semibold inline">Melhor para: </dt><dd className="inline text-muted-foreground">{v.melhorPara}</dd></div>
                </dl>
                {v.link && (
                  <Link to={v.link} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
                    Saiba mais sobre o {v.code} →
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border-2 border-primary/20 bg-primary/5 p-6 space-y-3">
          <h2 className="text-2xl font-bold tracking-tight">Por que H-2A é a melhor porta de entrada?</h2>
          <ul className="text-sm space-y-2">
            <li>✅ <strong>Sem sorteio</strong> — diferente do H-1B e H-2B, não há limite anual de vistos.</li>
            <li>✅ <strong>Sem inglês fluente</strong> — instruções básicas em campo, treinamento na fazenda.</li>
            <li>✅ <strong>Sem diploma</strong> — só experiência prática.</li>
            <li>✅ <strong>Empregador paga taxas oficiais</strong> — você só paga MRV e passagem (reembolsada).</li>
            <li>✅ <strong>Moradia gratuita</strong> + transporte + horas extras pagas a 1,5x.</li>
            <li>✅ <strong>Cumprindo o contrato</strong>, você renova H-2A todo ano e constrói histórico para vistos futuros.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Próximos passos</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link to="/vagas-h2a" className="rounded-lg border bg-card p-5 hover:bg-accent transition-colors">
              <p className="font-semibold">📋 Ver vagas H-2A abertas</p>
              <p className="text-sm text-muted-foreground mt-1">Vagas oficiais do DOL por estado</p>
            </Link>
            <Link to="/guia-salario-h2a" className="rounded-lg border bg-card p-5 hover:bg-accent transition-colors">
              <p className="font-semibold">💰 Quanto ganha H-2A</p>
              <p className="text-sm text-muted-foreground mt-1">Tabela AEWR 2025 por estado</p>
            </Link>
            <Link to="/guia-entrevista-visto-h2a" className="rounded-lg border bg-card p-5 hover:bg-accent transition-colors">
              <p className="font-semibold">🎙️ Entrevista consular</p>
              <p className="text-sm text-muted-foreground mt-1">10 perguntas reais + respostas</p>
            </Link>
            <Link to="/guia-custos-visto-h2a" className="rounded-lg border bg-card p-5 hover:bg-accent transition-colors">
              <p className="font-semibold">💵 Custos do visto</p>
              <p className="text-sm text-muted-foreground mt-1">Detalhamento de cada taxa</p>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
