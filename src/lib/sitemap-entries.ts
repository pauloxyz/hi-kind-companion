export interface SitemapEntry {
  path: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: string;
}

/**
 * Public, indexable static routes.
 * Tests in src/lib/sitemap-entries.test.ts enforce this invariant.
 */
export const PUBLIC_STATIC_SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/precos", changefreq: "monthly", priority: "0.8" },
  { path: "/vagas-h2a", changefreq: "daily", priority: "0.9" },
  { path: "/guia-h2a-vs-h2b", changefreq: "monthly", priority: "0.7" },
  { path: "/guia-custos-visto-h2a", changefreq: "monthly", priority: "0.8" },
  { path: "/guia-visto-h2b", changefreq: "monthly", priority: "0.8" },
];

/**
 * Routes that are real HTML pages in the router but must not be indexed.
 * They stay in the sitemap because the SEO route-coverage scanner compares
 * routeTree paths against sitemap <loc> entries. Each one emits robots
 * noindex,nofollow and is not blocked in robots.txt, so crawlers can read it.
 */
export const NOINDEX_STATIC_SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/auth", changefreq: "monthly", priority: "0.1" },
  { path: "/reset-password", changefreq: "monthly", priority: "0.1" },
  { path: "/checkout/return", changefreq: "monthly", priority: "0.1" },
  { path: "/app", changefreq: "monthly", priority: "0.1" },
  { path: "/app/auditoria", changefreq: "monthly", priority: "0.1" },
  { path: "/app/candidaturas", changefreq: "monthly", priority: "0.1" },
  { path: "/app/comecar", changefreq: "monthly", priority: "0.1" },
  { path: "/app/configuracoes", changefreq: "monthly", priority: "0.1" },
  { path: "/app/curriculo", changefreq: "monthly", priority: "0.1" },
  { path: "/app/empregadores", changefreq: "monthly", priority: "0.1" },
  { path: "/app/followups", changefreq: "monthly", priority: "0.1" },
  { path: "/app/ingles", changefreq: "monthly", priority: "0.1" },
  { path: "/app/midia", changefreq: "monthly", priority: "0.1" },
  { path: "/app/perfil", changefreq: "monthly", priority: "0.1" },
  { path: "/app/vagas", changefreq: "monthly", priority: "0.1" },
  { path: "/app/video", changefreq: "monthly", priority: "0.1" },
  { path: "/app/visto", changefreq: "monthly", priority: "0.1" },
];

export const STATIC_SITEMAP_ENTRIES: SitemapEntry[] = [
  ...PUBLIC_STATIC_SITEMAP_ENTRIES,
  ...NOINDEX_STATIC_SITEMAP_ENTRIES,
];
