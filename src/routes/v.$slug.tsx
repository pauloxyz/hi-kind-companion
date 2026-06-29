import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { getPublicProfileBySlug, trackProfileView, type PublicSkill, type PublicExperience, type PublicMedia } from "@/lib/public-profile.functions";
import { absUrl } from "@/lib/site";

export const Route = createFileRoute("/v/$slug")({
  loader: async ({ params }) => {
    const data = await getPublicProfileBySlug({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.profile.full_name ?? "Candidato H-2A";
    const headline = loaderData?.profile.public_headline ?? "Disponível para a próxima safra nos EUA";
    const path = `/v/${params.slug}`;
    const absPath = absUrl(path);
    const rawImage = (loaderData?.profile as { photo_url?: string | null })?.photo_url ?? undefined;
    const image = rawImage ? (rawImage.startsWith("http") ? rawImage : absUrl(rawImage)) : undefined;
    return {
      meta: [
        { title: `${name} — H-2A Candidate` },
        { name: "description", content: headline },
        { property: "og:title", content: `${name} — H-2A Candidate` },
        { property: "og:description", content: headline },
        { property: "og:url", content: absPath },
        { property: "og:type", content: "profile" },
        ...(image ? [{ property: "og:image", content: image } as const, { name: "twitter:image", content: image } as const] : []),
      ],
      links: [{ rel: "canonical", href: absPath }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Person",
          name,
          jobTitle: headline,
          nationality: loaderData?.profile.country ?? undefined,
          image,
          knowsLanguage: loaderData?.profile.languages ?? undefined,
          url: absPath,
        }),
      }],
    };
  },
  errorComponent: ({ error }) => <div className="p-8 text-center text-sm text-muted-foreground">Erro: {error.message}</div>,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Esta página de candidato não existe ou foi desativada.</p>
      </div>
    </div>
  ),
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const data = Route.useLoaderData();
  const { slug } = Route.useParams();

  useEffect(() => {
    // Fire-and-forget view tracking
    trackProfileView({ data: { slug, userAgent: navigator.userAgent, referer: document.referrer || undefined } }).catch(() => {});
  }, [slug]);

  const { profile, experiences, skills, media, video } = data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-8">
        {/* Header */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            H-2A Candidate Profile
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{profile.full_name ?? "Candidate"}</h1>
          {profile.public_headline && <p className="text-lg text-muted-foreground">{profile.public_headline}</p>}
          <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
            {profile.country && <span>📍 {profile.country}</span>}
            {profile.has_prior_h2_experience && <span>✓ Previous H-2 experience</span>}
            {profile.languages?.length ? (
              <span>🗣 {profile.languages.map((l: string) => {
                const [code, level] = l.split(":");
                const levelMap: Record<string, string> = { basic: "Basic", intermediate: "Intermediate", advanced: "Advanced", fluent: "Fluent", native: "Native" };
                const lvl = level ? levelMap[level] ?? level : null;
                return lvl ? `${code.toUpperCase()} (${lvl})` : code.toUpperCase();
              }).join(", ")}</span>
            ) : null}
          </div>
        </header>

        {/* Intro video */}
        {video && (
          <section className="rounded-xl overflow-hidden bg-black shadow-lg">
            <video src={video.url} controls playsInline className="w-full aspect-video" />
          </section>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {skills.map((s: PublicSkill) => (
                <span key={s.id} className="px-3 py-1.5 rounded-full bg-card border text-sm">
                  {s.skill_name}
                  {s.category && <span className="ml-1 text-xs text-muted-foreground">· {s.category}</span>}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Experience */}
        {experiences.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Experience</h2>
            <div className="space-y-3">
              {experiences.map((e: PublicExperience) => (
                <div key={e.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-semibold">{e.job_title ?? "Worker"}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.start_date ?? "?"} – {e.end_date ?? "present"}
                    </div>
                  </div>
                  {e.employer_name && <div className="text-sm text-muted-foreground">{e.employer_name}</div>}
                  {e.description && <p className="mt-2 text-sm whitespace-pre-line">{e.description}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Media gallery */}
        {media.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Work samples</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {media.map((m: PublicMedia) => (
                <figure key={m.id} className="rounded-lg overflow-hidden bg-muted aspect-square relative group">
                  {m.type === "video" ? (
                    <video src={m.url} controls playsInline className="w-full h-full object-cover" />
                  ) : (
                    <img src={m.url} alt={m.caption ?? "Work sample"} className="w-full h-full object-cover" loading="lazy" />
                  )}
                  {m.caption && (
                    <figcaption className="absolute bottom-0 inset-x-0 p-2 text-xs text-white bg-gradient-to-t from-black/70 to-transparent">
                      {m.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* Contact */}
        <section className="rounded-xl border bg-card p-6 text-center space-y-3">
          <h2 className="font-semibold">Get in touch</h2>
          <p className="text-sm text-muted-foreground">
            Reach out directly to discuss your hiring needs for the upcoming season.
          </p>
          {profile.phone && (
            <a
              href={`https://wa.me/${profile.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              WhatsApp
            </a>
          )}
        </section>

        <footer className="text-center text-xs text-muted-foreground pt-4 border-t">
          Profile generated by the H-2A Candidate Platform
        </footer>
      </div>
    </div>
  );
}
