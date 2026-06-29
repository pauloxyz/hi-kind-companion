export interface SitemapEntry {
  path: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: string;
}

/**
 * Public, indexable static routes only.
 * Any route disallowed in public/robots.txt or marked noindex MUST NOT appear here.
 * Tests in src/lib/sitemap-entries.test.ts enforce this invariant.
 */
export const PUBLIC_STATIC_SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/precos", changefreq: "monthly", priority: "0.8" },
  { path: "/vagas-h2a", changefreq: "daily", priority: "0.9" },
  { path: "/guia-h2a-vs-h2b", changefreq: "monthly", priority: "0.7" },
];
