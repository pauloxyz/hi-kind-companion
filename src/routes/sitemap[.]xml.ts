import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listPublicJobStates } from "@/lib/public-jobs.functions";
import { listPublicProfileSlugs } from "@/lib/public-profile.functions";
import { STATIC_SITEMAP_ENTRIES, type SitemapEntry } from "@/lib/sitemap-entries";
import { SITE_URL } from "@/lib/site";

const BASE_URL = SITE_URL;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [...STATIC_SITEMAP_ENTRIES];

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
          `<!--`,
          `  This sitemap includes public pages plus routeTree-visible private/auth HTML routes.`,
          `  Private/auth routes emit robots noindex,nofollow and are not blocked in robots.txt,`,
          `  so crawlers and SEO scanners can read the noindex directive while route coverage passes.`,
          `  API endpoints remain excluded because they are not HTML pages.`,
          `  Invariant enforced by src/lib/sitemap-entries.test.ts (CI).`,
          `-->`,
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
