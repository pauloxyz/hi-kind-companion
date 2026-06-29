import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/vaiprala-logo.png";
import { STATE_INFO } from "@/lib/h2a-state-info";

const PATH = "/guia-salario-h2a";

const FAQ = [
  {
    q: "Quanto ganha um trabalhador H-2A em 2025?",
    a: "O salário mínimo federal H-2A em 2025 (AEWR) varia entre US$ 14,53 e US$ 20,02 por hora, dependendo do estado. A média nacional fica em torno de US$ 17,30/h. Em 40 horas semanais isso dá US$ 690–800/semana, ou cerca de R$ 17.000–20.000/mês na cotação atual.",
  },
  {
    q: "O salário H-2A é em dólar? Como recebo?",
    a: "Sim. O pagamento é em dólar, geralmente quinzenal ou semanal, depositado em conta americana (Bank of America, Wells Fargo) ou em cartão pré-pago. Você pode enviar para o Brasil via Wise, Remitly, ou conta digital tipo Nomad/Avenue.",
  },
  {
    q: "O empregador desconta moradia e comida do meu salário?",
    a: "Moradia é OBRIGATÓRIA e gratuita no H-2A — o empregador paga. Comida pode ser oferecida com desconto razoável (até US$ 14/dia em 2025), mas é opcional. Transporte da fazenda até o supermercado também é coberto.",
  },
  {
    q: "Tenho que pagar imposto americano sobre o salário H-2A?",
    a: "Sim, há retenção de Social Security e Medicare (~7,65%) e, dependendo do estado, imposto estadual. O trabalhador H-2A é considerado 'nonresident alien' e pode pedir restituição de parte via formulário 1040-NR no fim do ano.",
  },
  {
    q: "Horas extras pagam mais?",
    a: "Sim. A maioria dos estados paga horas extras a 1,5x após 40h semanais. Em colheitas com 50–60h/semana, o ganho mensal pode ultrapassar US$ 4.000.",
  },
];

export const Route = createFileRoute("/guia-salario-h2a")({
  head: () => ({
    meta: [
      { title: "Salário H-2A 2025: quanto ganha por estado | VaiPraLá" },
      { name: "description", content: "Tabela AEWR 2025 com salário mínimo H-2A por estado. Quanto ganha trabalhador agrícola brasileiro nos EUA em dólares e reais. Horas extras, descontos, moradia." },
      { property: "og:title", content: "Salário H-2A 2025 — Quanto ganha por estado nos EUA" },
      { property: "og:description", content: "Tabela completa AEWR 2025 + conversão em reais. Veja exatamente quanto você ganha trabalhando H-2A na Flórida, Califórnia, Geórgia e mais." },
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
          headline: "Salário H-2A 2025: tabela completa por estado",
          description: "Tabela oficial AEWR 2025 por estado para trabalho agrícola H-2A nos EUA, com conversão para reais.",
          author: { "@type": "Organization", name: "VaiPraLá", url: "/" },
          publisher: { "@type": "Organization", name: "VaiPraLá", logo: { "@type": "ImageObject", url: "/favicon.ico" } },
          datePublished: "2026-01-15",
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
  component: SalarioPage,
});

function SalarioPage() {
  const usdBrl = 5.45; // updated quarterly — see /guia-custos-visto-h2a for live rate
  const sorted = Object.entries(STATE_INFO).sort((a, b) => b[1].aewr2025 - a[1].aewr2025);

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
            <span>Guia de salário H-2A</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Salário H-2A 2025: quanto ganha por estado</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            O salário H-2A nos EUA é regulado pelo governo americano através do <strong>AEWR (Adverse Effect Wage Rate)</strong>,
            um piso atualizado todo ano pelo Departamento do Trabalho. Em 2025, o salário H-2A varia de
            <strong> US$ 14,53/h</strong> (Alabama) a <strong>US$ 20,02/h</strong> (Oregon/Washington).
            Veja abaixo a tabela completa e quanto isso representa em reais.
          </p>
        </article>

        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Tabela AEWR 2025 por estado</h2>
          <p className="text-sm text-muted-foreground mb-3">Cotação de referência: US$ 1 = R$ {usdBrl.toFixed(2)}. 40h/semana × 4,3 semanas = ~172h/mês.</p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right">AEWR (US$/h)</th>
                  <th className="px-4 py-3 font-semibold text-right">Mensal bruto (US$)</th>
                  <th className="px-4 py-3 font-semibold text-right">Mensal (R$)</th>
                  <th className="px-4 py-3 font-semibold">Culturas principais</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(([code, info]) => {
                  const monthlyUsd = info.aewr2025 * 172;
                  return (
                    <tr key={code} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        <Link to="/vagas-h2a/$state" params={{ state: code.toLowerCase() }} className="hover:underline text-primary">
                          {info.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-mono">{info.aewr2025.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">${monthlyUsd.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-primary">R$ {(monthlyUsd * usdBrl).toFixed(0)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{info.crops.slice(0, 3).join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Fonte: U.S. Department of Labor, AEWR 2025. Valores não incluem horas extras (1,5x acima de 40h/semana).</p>
        </section>

        <section className="rounded-xl border bg-card p-6 space-y-3">
          <h2 className="text-2xl font-bold tracking-tight">O que vem incluído além do salário</h2>
          <ul className="space-y-2 text-sm">
            <li>✅ <strong>Moradia gratuita</strong> — alojamento inspecionado pelo DOL, com cama, banheiro, cozinha.</li>
            <li>✅ <strong>Transporte coberto</strong> — do aeroporto até a fazenda, e da fazenda até o supermercado.</li>
            <li>✅ <strong>Reembolso de passagem</strong> — após 50% do contrato, empregador reembolsa o voo de ida e paga o de volta.</li>
            <li>✅ <strong>Mínimo de 35h/semana</strong> garantido (3/4 das horas contratadas).</li>
            <li>✅ <strong>Ferramentas</strong> e equipamentos de segurança (luvas, EPI) fornecidos.</li>
          </ul>
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

        <section className="rounded-xl border bg-primary/5 p-6 text-center">
          <h3 className="text-xl font-semibold">Veja as vagas H-2A abertas hoje</h3>
          <p className="mt-2 text-sm text-muted-foreground">Filtre por estado e veja o salário ofertado em cada vaga.</p>
          <Link to="/vagas-h2a" className="mt-4 inline-flex rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">Ver vagas H-2A disponíveis</Link>
        </section>
      </main>
    </div>
  );
}
