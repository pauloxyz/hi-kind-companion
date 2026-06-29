import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "@/assets/vaiprala-logo.png";

const PATH = "/vagas-h2a/colheita-maca";
const ESTADOS = [
  { code: "WA", name: "Washington", note: "maior produtor — Yakima, Wenatchee" },
  { code: "NY", name: "Nova York", note: "Wayne County, oeste do estado" },
  { code: "MI", name: "Michigan", note: "Traverse City, Grand Rapids" },
  { code: "PA", name: "Pensilvânia", note: "Adams County" },
  { code: "VA", name: "Virgínia", note: "Shenandoah Valley" },
];

export const Route = createFileRoute("/vagas-h2a/colheita-maca")({
  head: () => ({
    meta: [
      { title: "Vagas H-2A colheita de maçã nos EUA 2025 | VaiPraLá" },
      { name: "description", content: "Trabalhar na colheita de maçã nos EUA com visto H-2A: salário US$ 17-20/h, estados (Washington, NY, Michigan), datas da safra e como se candidatar." },
      { property: "og:title", content: "Vagas H-2A colheita de maçã EUA" },
      { property: "og:description", content: "Como trabalhar na colheita de maçã nos Estados Unidos com visto H-2A: estados, salário, datas e empregadores." },
      { property: "og:image", content: "https://www.vaiprala.net/og-default.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://www.vaiprala.net/og-default.jpg" },
      { property: "og:url", content: PATH },
    ],
    links: [{ rel: "canonical", href: PATH }],
  }),
  component: () => <CropPage crop="maçã" path={PATH} estados={ESTADOS} salario="US$ 17,80–19,25/h" temporada="Agosto a outubro (com pico em setembro)" descricao="A colheita de maçã é a maior operação H-2A da costa oeste e norte dos EUA. Trabalhadores brasileiros experientes em fruticultura têm alta procura, especialmente em Washington — maior produtor mundial. A maçã é colhida à mão, em escadas de 3 metros, em jornadas de 8-10h por dia." />,
});

export function CropPage({ crop, path, estados, salario, temporada, descricao }: {
  crop: string; path: string; estados: { code: string; name: string; note: string }[]; salario: string; temporada: string; descricao: string;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/vagas-h2a" className="text-sm font-medium hover:underline">Todas as vagas →</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <article>
          <nav className="text-sm text-muted-foreground mb-4">
            <Link to="/vagas-h2a" className="hover:underline">Vagas H-2A</Link>
            <span className="mx-2">/</span>
            <span>Colheita de {crop}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Vagas H-2A: colheita de {crop} nos EUA</h1>
          <p className="mt-4 text-lg text-muted-foreground">{descricao}</p>
        </article>

        <section className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Salário</p>
            <p className="text-lg font-bold mt-1">{salario}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Temporada</p>
            <p className="text-lg font-bold mt-1">{temporada}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tipo de contrato</p>
            <p className="text-lg font-bold mt-1">H-2A sazonal</p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold tracking-tight mb-4">Estados com maior contratação</h2>
          <div className="space-y-2">
            {estados.map((e) => (
              <Link key={e.code} to="/vagas-h2a/$state" params={{ state: e.code.toLowerCase() }} className="block rounded-lg border bg-card p-4 hover:bg-accent transition-colors">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold">{e.name}</p>
                  <p className="text-sm text-primary">Ver vagas →</p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{e.note}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-primary/5 p-6 space-y-3">
          <h2 className="text-xl font-bold tracking-tight">O que esperar do trabalho de colheita de {crop}</h2>
          <ul className="text-sm space-y-1.5">
            <li>🌳 Trabalho ao ar livre, em pé, com uso de escadas e baldes de coleta</li>
            <li>⏰ Jornadas de 8-10h/dia, 6 dias por semana durante o pico da safra</li>
            <li>💰 Horas extras pagas a 1,5x acima de 40h/semana</li>
            <li>🏠 Alojamento e transporte fornecidos pelo empregador</li>
            <li>📋 Sem necessidade de inglês fluente — treinamento na fazenda</li>
            <li>🔁 Cumprindo bem, pode ser convidado a renovar H-2A na próxima safra</li>
          </ul>
        </section>

        <section className="text-center rounded-xl border bg-card p-6 space-y-3">
          <h3 className="text-xl font-semibold">Pronto pra se candidatar?</h3>
          <p className="text-sm text-muted-foreground">Crie sua conta grátis e veja todas as vagas H-2A de colheita de {crop} abertas.</p>
          <Link to="/auth" className="inline-flex rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">Começar grátis</Link>
        </section>
      </main>
    </div>
  );
}
