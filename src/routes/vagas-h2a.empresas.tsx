import { createFileRoute, Link } from "@tanstack/react-router";
import { listPublicTopEmployers } from "@/lib/public-jobs.functions";
import logo from "@/assets/vaiprala-logo.png";

type Employer = { name: string; jobs: number; openings: number; states: string[]; cities: string[]; avgWage: number };


const PATH = "/vagas-h2a/empresas";

export const Route = createFileRoute("/vagas-h2a/empresas")({
  loader: () => listPublicTopEmployers(),
  head: ({ loaderData }) => {
    const count = loaderData?.employers.length ?? 0;
    return {
      meta: [
        { title: `${count} empresas americanas que contratam com visto H-2A | VaiPraLá` },
        { name: "description", content: `Lista oficial de ${count} empregadores H-2A certificados pelo Departamento do Trabalho dos EUA: fazendas, estados, salários e número de vagas. Atualizada diariamente.` },
        { property: "og:title", content: "Empresas que contratam com visto H-2A" },
        { property: "og:description", content: "Lista completa e oficial dos maiores empregadores H-2A nos EUA — direto do feed do Department of Labor." },
        { property: "og:url", content: PATH },
      ],
      links: [{ rel: "canonical", href: PATH }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Empresas americanas que contratam H-2A",
          numberOfItems: count,
          itemListElement: (loaderData?.employers ?? []).slice(0, 25).map((e, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: { "@type": "Organization", name: e.name, address: { "@type": "PostalAddress", addressRegion: e.states[0], addressCountry: "US" } },
          })),
        }),
      }],
    };
  },
  errorComponent: () => <div className="p-10 text-center">Falha ao carregar empregadores.</div>,
  notFoundComponent: () => <div className="p-10 text-center">Página não encontrada.</div>,
  component: EmpresasPage,
});

function EmpresasPage() {
  const { employers } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/vagas-h2a" className="text-sm font-medium hover:underline">Ver por estado →</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <article>
          <nav className="text-sm text-muted-foreground mb-4">
            <Link to="/vagas-h2a" className="hover:underline">Vagas H-2A</Link>
            <span className="mx-2">/</span>
            <span>Empresas</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Empresas americanas que contratam com visto H-2A</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Lista oficial e atualizada dos {employers.length} maiores empregadores H-2A nos EUA, importada diariamente
            do feed do Departamento do Trabalho americano (DOL). Cada empresa abaixo tem certificação ativa para contratar
            trabalhadores brasileiros via H-2A. Clique no estado para ver as vagas específicas.
          </p>
        </article>

        <section className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Empregador</th>
                <th className="px-4 py-3 font-semibold">Estados</th>
                <th className="px-4 py-3 font-semibold text-right">Vagas certificadas</th>
                <th className="px-4 py-3 font-semibold text-right">Posições</th>
                <th className="px-4 py-3 font-semibold text-right">Salário médio</th>
              </tr>
            </thead>
            <tbody>
              {employers.map((e: Employer) => (
                <tr key={e.name} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3">
                    {e.states.slice(0, 3).map((s: string) => (
                      <Link key={s} to="/vagas-h2a/$state" params={{ state: s.toLowerCase() }} className="inline-block mr-1.5 text-primary hover:underline">
                        {s}
                      </Link>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.jobs}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{e.openings || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{e.avgWage ? `US$ ${e.avgWage.toFixed(2)}/h` : "—"}</td>
                </tr>
              ))}
              {!employers.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum empregador indexado no momento.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border bg-card p-6 space-y-2">
          <h2 className="text-xl font-bold tracking-tight">Como esta lista é mantida</h2>
          <p className="text-sm text-muted-foreground">
            Todos os empregadores listados têm uma <strong>Job Order H-2A certificada</strong> pelo Department of Labor americano.
            Importamos diariamente o feed público do DOL — nenhuma empresa paga pra estar aqui, nenhuma é omitida.
            Os dados de salário, número de vagas e localização vêm direto da certificação oficial (formulário ETA-9142A).
          </p>
        </section>

        <section className="rounded-xl border bg-primary/5 p-6 text-center space-y-3">
          <h3 className="text-xl font-semibold">Pronto pra se candidatar?</h3>
          <p className="text-sm text-muted-foreground">Crie sua conta grátis e gere uma carta em inglês personalizada para qualquer dessas empresas.</p>
          <Link to="/auth" className="inline-flex rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">Começar grátis</Link>
        </section>
      </main>
    </div>
  );
}
