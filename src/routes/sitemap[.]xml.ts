import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listPublicJobStates } from "@/lib/public-jobs.functions";
import { listPublicProfileSlugs } from "@/lib/public-profile.functions";

// TODO: replace with your project URL once a project name or custom domain is set.
const BASE_URL = "";

interface SitemapEntry {
  path: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/precos", changefreq: "monthly", priority: "0.8" },
  { path: "/vagas-h2a", changefreq: "daily", priority: "0.9" },
  { path: "/guia-h2a-vs-h2b", changefreq: "monthly", priority: "0.7" },
  { path: "/auth", changefreq: "monthly", priority: "0.3" },
  { path: "/reset-password", changefreq: "monthly", priority: "0.2" },
  { path: "/checkout/return", changefreq: "monthly", priority: "0.2" },
  { path: "/app", changefreq: "weekly", priority: "0.4" },
  { path: "/app/auditoria", changefreq: "monthly", priority: "0.2" },
  { path: "/app/candidaturas", changefreq: "weekly", priority: "0.4" },
  { path: "/app/comecar", changefreq: "monthly", priority: "0.4" },
  { path: "/app/configuracoes", changefreq: "monthly", priority: "0.2" },
  { path: "/app/curriculo", changefreq: "weekly", priority: "0.4" },
  { path: "/app/empregadores", changefreq: "weekly", priority: "0.4" },
  { path: "/app/followups", changefreq: "weekly", priority: "0.4" },
  { path: "/app/ingles", changefreq: "weekly", priority: "0.4" },
  { path: "/app/midia", changefreq: "weekly", priority: "0.4" },
  { path: "/app/perfil", changefreq: "weekly", priority: "0.4" },
  { path: "/app/vagas", changefreq: "daily", priority: "0.4" },
  { path: "/app/video", changefreq: "weekly", priority: "0.4" },
  { path: "/app/visto", changefreq: "monthly", priority: "0.4" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [...staticEntries];

        try {
          const { states } = await listPublicJobStates();
          for (const s of states ?? []) {
            const code = s.state?.toLowerCase();
            if (code) entries.push({ path: `/vagas-h2a/${code}`, changefreq: "daily", priority: "0.7" });
          }
        } catch {
          // ignore — still serve the static entries
        }

        try {
          const { slugs } = await listPublicProfileSlugs();
          for (const slug of slugs) {
            entries.push({ path: `/v/${slug}`, changefreq: "weekly", priority: "0.5" });
          }
        } catch {
          // ignore
        }


        const seen = new Set<string>();
        const uniqueEntries = entries.filter((entry) => {
          if (seen.has(entry.path)) return false;
          seen.add(entry.path);
          return true;
        });

        const urls = uniqueEntries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ].filter(Boolean).join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
