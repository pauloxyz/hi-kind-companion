import { createFileRoute, Link } from "@tanstack/react-router";
import { listPublicJobStates } from "@/lib/public-jobs.functions";
import logo from "@/assets/vaiprala-logo.png";

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alasca", AZ: "Arizona", AR: "Arkansas", CA: "Califórnia",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Flórida", GA: "Geórgia",
  HI: "Havaí", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "Novo México",
  NY: "Nova York", NC: "Carolina do Norte", ND: "Dakota do Norte", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pensilvânia", RI: "Rhode Island",
  SC: "Carolina do Sul", SD: "Dakota do Sul", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virgínia", WA: "Washington", WV: "Virgínia Ocidental",
  WI: "Wisconsin", WY: "Wyoming",
};

export const Route = createFileRoute("/vagas-h2a/")({
  head: () => ({
    meta: [
      { title: "Vagas H-2A nos Estados Unidos por estado | VaiPraLá" },
      {
        name: "description",
        content:
          "Lista atualizada de vagas H-2A em fazendas americanas, organizadas por estado. Dados oficiais do Departamento do Trabalho dos EUA.",
      },
      { property: "og:title", content: "Vagas H-2A por estado nos EUA" },
      {
        property: "og:description",
        content:
          "Encontre vagas de trabalho rural temporário (H-2A) em qualquer estado americano. Atualizado direto do DOL.",
      },
      { property: "og:url", content: "/vagas-h2a" },
    ],
    links: [{ rel: "canonical", href: "/vagas-h2a" }],
  }),
  loader: () => listPublicJobStates(),
  component: StatesIndex,
});

function StatesIndex() {
  const { states } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/auth" className="text-sm font-medium hover:underline">Entrar</Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        <article>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Vagas H-2A nos Estados Unidos por estado
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-3xl">
            Lista atualizada diariamente com vagas H-2A oficiais do Departamento do Trabalho dos EUA.
            Trabalho rural temporário em fazendas americanas para brasileiros, com salário a partir de
            US$ 14,53/h, alojamento gratuito, transporte e passagem reembolsada.
            Escolha um estado, uma cultura ou veja a <Link to="/vagas-h2a/empresas" className="text-primary hover:underline font-semibold">lista de empresas certificadas</Link>.
          </p>
        </article>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Por estado</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {states.map((s: { state: string; count: number }) => (
              <Link
                key={s.state}
                to="/vagas-h2a/$state"
                params={{ state: s.state.toLowerCase() }}
                className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
              >
                <div className="font-semibold">{US_STATE_NAMES[s.state] ?? s.state}</div>
                <div className="text-sm text-muted-foreground">{s.count} vagas</div>
              </Link>
            ))}
            {!states.length && (
              <p className="col-span-full text-sm text-muted-foreground">
                Nenhuma vaga indexada no momento.
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Por cultura</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link to="/vagas-h2a/colheita-maca" className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors">
              <p className="font-semibold">🍎 Colheita de maçã</p>
              <p className="text-sm text-muted-foreground">Washington, NY, Michigan</p>
            </Link>
            <Link to="/vagas-h2a/colheita-laranja" className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors">
              <p className="font-semibold">🍊 Colheita de laranja</p>
              <p className="text-sm text-muted-foreground">Flórida, Califórnia</p>
            </Link>
            <Link to="/vagas-h2a/tabaco" className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors">
              <p className="font-semibold">🌿 Colheita de tabaco</p>
              <p className="text-sm text-muted-foreground">Carolina do Norte, Kentucky</p>
            </Link>
          </div>
        </section>

        <section className="rounded-xl border bg-primary/5 p-6 grid sm:grid-cols-2 gap-3 text-sm">
          <Link to="/guia-salario-h2a" className="hover:underline">💰 Quanto ganha trabalhador H-2A → tabela AEWR 2025</Link>
          <Link to="/guia-entrevista-visto-h2a" className="hover:underline">🎙️ Entrevista consular: 10 perguntas + respostas</Link>
          <Link to="/guia-custos-visto-h2a" className="hover:underline">💵 Quanto custa o visto H-2A para brasileiros</Link>
          <Link to="/guia-golpes-h2a" className="hover:underline">🚩 Como identificar golpes de visto H-2A</Link>
        </section>
      </main>
    </div>
  );
}
