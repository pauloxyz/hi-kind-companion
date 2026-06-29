import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/vaiprala-logo.png";

const PATH = "/guia-entrevista-visto-h2a";

const PERGUNTAS = [
  { q: "Why do you want to work in the United States?", pt: "Por que você quer trabalhar nos EUA?", dica: "Foque em motivos profissionais: aprender técnicas, ganhar experiência, renda para investir no Brasil. NUNCA diga 'quero morar nos EUA'." },
  { q: "What kind of work will you do?", pt: "Que tipo de trabalho você vai fazer?", dica: "Cite a função exata do contrato: 'I will pick oranges in Florida' / 'I will harvest tobacco in North Carolina'." },
  { q: "Have you been to the United States before?", pt: "Já esteve nos EUA antes?", dica: "Responda honestamente. Vistos anteriores cumpridos no prazo ajudam." },
  { q: "Do you have family in the US?", pt: "Tem família nos EUA?", dica: "Se tem, diga. Mentir sobre família é o motivo número 1 de negação." },
  { q: "Who is your employer?", pt: "Quem é seu empregador?", dica: "Saiba o nome exato da fazenda, cidade e estado. Decore." },
  { q: "How much will you earn?", pt: "Quanto você vai ganhar?", dica: "Diga o valor por hora em dólar (US$ 14,77/h por exemplo, dependendo do estado)." },
  { q: "Where will you live in the US?", pt: "Onde você vai morar?", dica: "O empregador fornece alojamento. Diga: 'Housing provided by my employer'." },
  { q: "When will you return to Brazil?", pt: "Quando volta ao Brasil?", dica: "Saiba a data exata do fim do contrato. Demonstre vínculo: 'I have family, house, and job to return to'." },
  { q: "Do you have a job in Brazil?", pt: "Tem trabalho no Brasil?", dica: "Idealmente sim — vínculo é fundamental. Leve carta do empregador brasileiro." },
  { q: "Are you married? Children?", pt: "Casado? Filhos?", dica: "Filhos no Brasil = vínculo forte. Leve certidões." },
];

const FAQ = [
  { q: "Em qual consulado faço a entrevista H-2A?", a: "Brasileiros podem fazer entrevista em São Paulo, Rio de Janeiro, Recife, Porto Alegre ou Brasília. Recife e Porto Alegre costumam ter agendas mais rápidas." },
  { q: "Quanto tempo dura a entrevista?", a: "A entrevista em si dura entre 2 e 5 minutos. O cônsul já analisou seu DS-160 e a petição do empregador antes." },
  { q: "Posso fazer a entrevista em português?", a: "Sim. O cônsul fala português ou tem intérprete. Mas saber responder em inglês básico ajuda muito — mostra preparo para a vaga." },
  { q: "Quais documentos levar?", a: "Passaporte válido, comprovante de agendamento, recibo MRV, foto 5x5 recente, DS-160 confirmation, carta do empregador americano, e provas de vínculo com o Brasil (carteira de trabalho, escritura de casa, certidão de filhos)." },
  { q: "Posso ser barrado por negação anterior?", a: "Negações antigas não barram automaticamente. Você precisa demonstrar que sua situação mudou: emprego no Brasil, vínculo familiar mais forte, ou agora tem contrato H-2A válido." },
];

export const Route = createFileRoute("/guia-entrevista-visto-h2a")({
  head: () => ({
    meta: [
      { title: "Entrevista do visto H-2A: 10 perguntas reais + respostas | VaiPraLá" },
      { name: "description", content: "Guia completo da entrevista consular H-2A: 10 perguntas reais do cônsul americano, respostas modelo em inglês, documentos para levar e dicas para São Paulo, Rio, Recife, Porto Alegre e Brasília." },
      { property: "og:title", content: "Entrevista visto H-2A: perguntas reais e como responder" },
      { property: "og:description", content: "As 10 perguntas que o cônsul americano mais faz na entrevista H-2A — com respostas modelo em inglês e dicas para não ser barrado." },
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
          headline: "Entrevista do visto H-2A: 10 perguntas reais + respostas",
          author: { "@type": "Organization", name: "VaiPraLá", url: "/" },
          publisher: { "@type": "Organization", name: "VaiPraLá", logo: { "@type": "ImageObject", url: "/favicon.ico" } },
          datePublished: "2026-01-20",
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
  component: EntrevistaPage,
});

function EntrevistaPage() {
  return (
    <div className="min-h-screen bg-background">
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
            <span>Entrevista H-2A</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Entrevista do visto H-2A: 10 perguntas reais + respostas</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            A entrevista consular é o último filtro antes do visto H-2A. Em 5 minutos o cônsul decide se você vai trabalhar
            legalmente nos EUA. A boa notícia: as perguntas são previsíveis. Aqui estão as 10 que mais aparecem,
            como responder em inglês básico e o que NÃO falar.
          </p>
        </article>

        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-5">As 10 perguntas mais frequentes</h2>
          <ol className="space-y-4">
            {PERGUNTAS.map((p, i) => (
              <li key={p.q} className="rounded-lg border bg-card p-5">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">{i + 1}</span>
                  <div className="space-y-2 flex-1 min-w-0">
                    <p className="font-semibold">"{p.q}"</p>
                    <p className="text-sm text-muted-foreground italic">{p.pt}</p>
                    <p className="text-sm"><strong>Dica:</strong> {p.dica}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-xl border bg-card p-6 space-y-3">
          <h2 className="text-2xl font-bold tracking-tight">Documentos para levar no dia</h2>
          <ul className="space-y-1.5 text-sm">
            <li>✅ Passaporte válido por pelo menos 6 meses</li>
            <li>✅ Comprovante de agendamento (CASV)</li>
            <li>✅ Recibo da taxa MRV (US$ 185)</li>
            <li>✅ Página de confirmação do DS-160</li>
            <li>✅ Foto 5x5 cm recente, fundo branco</li>
            <li>✅ Carta do empregador americano (sponsorship letter)</li>
            <li>✅ Cópia da petição I-129 aprovada</li>
            <li>✅ Carteira de trabalho brasileira</li>
            <li>✅ Comprovantes de vínculo: certidão de casamento, filhos, escritura de imóvel</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Consulados americanos no Brasil</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { city: "São Paulo", note: "Maior volume; agenda mais lenta" },
              { city: "Rio de Janeiro", note: "Boa rotatividade" },
              { city: "Recife", note: "Agenda mais rápida" },
              { city: "Porto Alegre", note: "Agenda mais rápida" },
              { city: "Brasília", note: "Embaixada principal" },
            ].map((c) => (
              <div key={c.city} className="rounded-lg border bg-card p-4">
                <p className="font-semibold">{c.city}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Agendamento oficial em <a href="https://ais.usvisa-info.com/pt-br/niv" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ais.usvisa-info.com</a>.</p>
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
          <Link to="/guia-ds160-visto-h2a" className="rounded-lg border bg-card p-5 hover:bg-accent transition-colors">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Próximo</p>
            <p className="font-semibold mt-1">Como preencher o DS-160 para H-2A →</p>
          </Link>
          <Link to="/vagas-h2a" className="rounded-lg border bg-primary/5 p-5 hover:bg-primary/10 transition-colors">
            <p className="text-xs uppercase tracking-wider text-primary">Pronto pra próximo passo?</p>
            <p className="font-semibold mt-1">Ver vagas H-2A disponíveis →</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
