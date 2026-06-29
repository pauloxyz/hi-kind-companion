import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/vaiprala-logo.png";

const PATH = "/guia-ds160-visto-h2a";

const PASSOS = [
  { passo: "1. Acessar o site oficial", detalhe: "Vá em ceac.state.gov/genniv. Selecione o consulado onde fará entrevista (São Paulo, Rio, Recife, Porto Alegre ou Brasília). Anote o número do aplicativo (AA00…) — você vai precisar pra retomar caso feche o navegador." },
  { passo: "2. Dados pessoais", detalhe: "Use exatamente como está no passaporte. Nome completo SEM acentos (José → Jose). Local de nascimento = cidade no passaporte." },
  { passo: "3. Endereço e contato", detalhe: "Endereço residencial no Brasil. Telefone com código do país (+55). Email que você acessa todo dia — o consulado pode pedir documentos extras." },
  { passo: "4. Informações do passaporte", detalhe: "Número, data de emissão, validade. País emissor: Brazil. Lost/stolen passports: declarar se já perdeu algum passaporte no passado." },
  { passo: "5. Viagens anteriores aos EUA", detalhe: "Liste TODAS as viagens anteriores aos EUA com datas exatas, mesmo as turísticas. Mentir aqui é negação certa." },
  { passo: "6. Contato nos EUA", detalhe: "Para H-2A: o empregador é o seu point of contact. Nome da fazenda, endereço completo, telefone. Pegue isso da carta do empregador." },
  { passo: "7. Família", detalhe: "Pais (nome completo, data de nascimento). Cônjuge. Filhos. Se tem parentes nos EUA, DECLARE — mentir é o erro mais comum e custa o visto." },
  { passo: "8. Histórico profissional", detalhe: "Emprego atual no Brasil + os 2 anos anteriores. Para o H-2A: 'Present Employer' = empresa brasileira atual. Não coloque a fazenda americana aqui (ela aparece no próximo bloco)." },
  { passo: "9. Informações da viagem H-2A", detalhe: "Visa Class: H — Temporary Worker, subcategoria H-2A. Specific Travel Plans: Yes. Date of Arrival, Duration, Address in US = endereço da fazenda. Person/Entity Paying = US Employer (nome da fazenda)." },
  { passo: "10. Perguntas de segurança", detalhe: "Responda HONESTAMENTE. Condenação criminal, doenças contagiosas, deportação anterior — qualquer mentira detectada é proibição permanente de entrar nos EUA." },
  { passo: "11. Foto", detalhe: "5x5 cm, fundo branco, sem óculos, sem sorriso largo. Tire em fotógrafo profissional ou use o app oficial do Departamento de Estado." },
  { passo: "12. Revisar e enviar", detalhe: "Imprima a página de confirmação com o código de barras. SEM ESSA PÁGINA não entra na entrevista." },
];

const FAQ = [
  { q: "Posso preencher o DS-160 em português?", a: "Não. O formulário é apenas em inglês. Você pode passar o mouse sobre algumas perguntas para ver tradução em português, mas as respostas precisam ser em inglês." },
  { q: "Quanto tempo leva pra preencher?", a: "Entre 1h30 e 3h se você tiver todos os documentos em mãos. Recomendamos fazer em 2 sessões — o sistema salva progresso pelo código AA00…" },
  { q: "Posso pagar alguém pra preencher meu DS-160?", a: "Tecnicamente sim, mas é arriscado. Você é responsável pelo que está lá. Despachantes que cobram R$ 800-1.500 só preenchem o formulário — não aumentam suas chances de aprovação." },
  { q: "Posso editar depois de enviar?", a: "Não. Mas você pode preencher um novo DS-160 com correções; só leve a confirmação do mais recente para a entrevista." },
];

export const Route = createFileRoute("/guia-ds160-visto-h2a")({
  head: () => ({
    meta: [
      { title: "Como preencher o DS-160 para H-2A: passo a passo | VaiPraLá" },
      { name: "description", content: "Guia completo de preenchimento do DS-160 para visto H-2A: 12 passos com armadilhas mais comuns, o que escrever em cada campo e como evitar negação." },
      { property: "og:title", content: "DS-160 para H-2A: tutorial passo a passo" },
      { property: "og:description", content: "Aprenda a preencher cada bloco do DS-160 específico para visto H-2A, evitando os erros que causam 80% das negações." },
      { property: "og:url", content: PATH },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: PATH }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "Como preencher o DS-160 para visto H-2A",
          description: "Passo a passo para preencher o formulário DS-160 do Departamento de Estado dos EUA para visto de trabalho temporário H-2A.",
          totalTime: "PT2H",
          step: PASSOS.map((p, i) => ({ "@type": "HowToStep", position: i + 1, name: p.passo, text: p.detalhe })),
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
  component: Ds160Page,
});

function Ds160Page() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/vagas-h2a" className="text-sm font-medium hover:underline">Ver vagas →</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        <article>
          <nav className="text-sm text-muted-foreground mb-4">
            <Link to="/" className="hover:underline">Início</Link>
            <span className="mx-2">/</span>
            <span>DS-160 para H-2A</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Como preencher o DS-160 para visto H-2A</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            O DS-160 é o formulário online obrigatório para qualquer visto americano de não-imigrante. Para o H-2A,
            existem campos específicos que diferem do visto de turismo. Erros aqui são a causa #1 de negação.
            Este guia mostra exatamente o que escrever em cada bloco.
          </p>
        </article>

        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-5">Os 12 blocos do DS-160 (na ordem)</h2>
          <ol className="space-y-3">
            {PASSOS.map((p, i) => (
              <li key={p.passo} className="rounded-lg border bg-card p-5">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{p.passo}</p>
                    <p className="text-sm text-muted-foreground mt-1">{p.detalhe}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-xl border-2 border-accent-red/30 bg-accent-red/5 p-6 space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-accent-red">⚠️ Os 3 erros mais comuns</h2>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li><strong>Omitir parentes nos EUA.</strong> O cônsul checa nos bancos de dados. Mentir é negação permanente.</li>
            <li><strong>Colocar a fazenda americana como 'Present Employer'.</strong> Errado. Present Employer = seu emprego atual no Brasil.</li>
            <li><strong>Datas erradas de viagens anteriores.</strong> O sistema americano tem registro de cada entrada e saída sua dos EUA. Confira no carimbo do passaporte.</li>
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

        <div className="grid sm:grid-cols-2 gap-3">
          <Link to="/guia-entrevista-visto-h2a" className="rounded-lg border bg-card p-5 hover:bg-accent transition-colors">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Próximo passo</p>
            <p className="font-semibold mt-1">10 perguntas da entrevista consular →</p>
          </Link>
          <Link to="/vagas-h2a" className="rounded-lg border bg-primary/5 p-5 hover:bg-primary/10 transition-colors">
            <p className="text-xs uppercase tracking-wider text-primary">Ainda não tem contrato?</p>
            <p className="font-semibold mt-1">Ver vagas H-2A disponíveis →</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
