import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { listPublicJobsByState } from "@/lib/public-jobs.functions";
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

type Job = {
  id: string;
  job_title: string | null;
  employer_name: string | null;
  worksite_city: string | null;
  worksite_state: string | null;
  wage_offered: number | null;
  wage_unit: string | null;
  start_date: string | null;
  end_date: string | null;
  total_openings: number | null;
};

export const Route = createFileRoute("/vagas-h2a/$state")({
  loader: async ({ params }) => {
    const code = params.state.toUpperCase();
    if (!US_STATE_NAMES[code]) throw notFound();
    const result = await listPublicJobsByState({ data: { state: code } });
    return { ...result, code };
  },
  head: ({ params, loaderData }) => {
    const code = params.state.toUpperCase();
    const name = US_STATE_NAMES[code] ?? code;
    const count = loaderData?.jobs.length ?? 0;
    const title = `Vagas H-2A em ${name} (${count}) | VaiPraLá`;
    const desc = `Veja ${count} vagas H-2A abertas em fazendas de ${name}. Salário, datas e empregadores oficiais do Departamento do Trabalho dos EUA.`;
    const path = `/vagas-h2a/${params.state.toLowerCase()}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: path },
      ],
      links: [{ rel: "canonical", href: path }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Vagas H-2A em ${name}`,
          numberOfItems: count,
          itemListElement: (loaderData?.jobs ?? []).slice(0, 25).map((j: Job, i: number) => {
            const jobTitle = j.job_title ?? "H-2A Farmworker";
            const employer = j.employer_name ?? "US Farm Employer";
            const locationCity = j.worksite_city ?? name;
            return {
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@context": "https://schema.org",
                "@type": "JobPosting",
                identifier: { "@type": "PropertyValue", name: "VaiPraLá Job ID", value: j.id },
                title: jobTitle,
                description: `Vaga oficial H-2A: ${jobTitle} para ${employer} em ${locationCity}, ${name} (EUA). ${
                  j.total_openings ? `${j.total_openings} posições abertas. ` : ""
                }${j.start_date ? `Início em ${j.start_date}` : "Início conforme cronograma do empregador"}${
                  j.end_date ? ` até ${j.end_date}.` : "."
                } Publicada pelo Departamento do Trabalho dos EUA.`,
                hiringOrganization: { "@type": "Organization", name: employer },
                jobLocation: {
                  "@type": "Place",
                  address: { "@type": "PostalAddress", addressLocality: j.worksite_city ?? undefined, addressRegion: code, addressCountry: "US" },
                },
                jobLocationType: undefined,
                applicantLocationRequirements: { "@type": "Country", name: "Brazil" },
                datePosted: j.start_date ?? new Date().toISOString().slice(0, 10),
                validThrough: j.end_date ?? undefined,
                employmentType: "TEMPORARY",
                directApply: false,
                totalJobOpenings: j.total_openings ?? undefined,
                baseSalary: j.wage_offered ? {
                  "@type": "MonetaryAmount",
                  currency: "USD",
                  value: { "@type": "QuantitativeValue", value: j.wage_offered, unitText: (j.wage_unit ?? "HOUR").toUpperCase() },
                } : undefined,
              },
            };
          }),
        }),
      }],
    };
  },
  notFoundComponent: () => (
    <div className="p-10 text-center">Estado não encontrado.</div>
  ),
  errorComponent: () => (
    <div className="p-10 text-center">Falha ao carregar vagas.</div>
  ),
  component: StateJobsPage,
});

function formatWage(j: Job): string {
  if (!j.wage_offered) return "—";
  const unit = j.wage_unit === "hour" ? "/h" : j.wage_unit ? `/${j.wage_unit}` : "";
  return `US$ ${j.wage_offered.toFixed(2)}${unit}`;
}

function StateJobsPage() {
  const { jobs, code } = Route.useLoaderData();
  const name = US_STATE_NAMES[code] ?? code;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="VaiPraLá" className="h-8 w-8" />
            <span className="font-bold">VaiPraLá</span>
          </Link>
          <Link to="/auth" className="text-sm font-medium hover:underline">
            Candidatar-se →
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-10">
        <nav className="text-sm text-muted-foreground mb-4">
          <Link to="/vagas-h2a" className="hover:underline">Todos os estados</Link>
          <span className="mx-2">/</span>
          <span>{name}</span>
        </nav>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Vagas H-2A em {name}
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          {jobs.length} vagas oficiais publicadas pelo Departamento do Trabalho dos EUA.
          Crie sua conta gratuita para se candidatar com carta em inglês gerada por IA.
        </p>

        <div className="mt-8 space-y-3">
          {jobs.map((j: Job) => (
            <article key={j.id} className="rounded-lg border bg-card p-4">
              <h2 className="font-semibold">{j.job_title ?? "Vaga agrícola H-2A"}</h2>
              <p className="text-sm text-muted-foreground">
                {j.employer_name ?? "Empregador"}
                {j.worksite_city ? ` • ${j.worksite_city}, ${name}` : ` • ${name}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <span>💰 {formatWage(j)}</span>
                {j.total_openings ? <span>👥 {j.total_openings} vagas</span> : null}
                {j.start_date ? <span>📅 {j.start_date} → {j.end_date ?? "?"}</span> : null}
              </div>
            </article>
          ))}
          {!jobs.length && (
            <p className="text-sm text-muted-foreground">
              Nenhuma vaga aberta em {name} no momento. Volte em alguns dias —
              o feed do DOL é atualizado diariamente.
            </p>
          )}
        </div>

        <div className="mt-12 rounded-xl border bg-primary/5 p-6 text-center">
          <h3 className="text-xl font-semibold">Pronto para se candidatar?</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Crie sua conta grátis e gere cartas em inglês com IA em segundos.
          </p>
          <Link
            to="/auth"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
          >
            Começar grátis
          </Link>
        </div>
      </main>
    </div>
  );
}
