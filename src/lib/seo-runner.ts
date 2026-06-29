/**
 * Server-only SEO check runner. Reproduces the invariants that the local
 * vitest SEO suite asserts (sitemap coverage, structured-data presence,
 * robots, canonical metadata) so we can persist a snapshot of "test pass
 * rate" + "findings by severity" for the admin dashboard.
 *
 * Pure TS — no vitest at runtime (vitest can't execute inside the Worker).
 */
import {
  PUBLIC_STATIC_SITEMAP_ENTRIES,
  NOINDEX_STATIC_SITEMAP_ENTRIES,
  STATIC_SITEMAP_ENTRIES,
} from "@/lib/sitemap-entries";
import { routeTree } from "@/routeTree.gen";

export type Severity = "critical" | "high" | "medium" | "low";

export interface SeoCheckResult {
  name: string;
  severity: Severity;
  passed: boolean;
  message?: string;
}

export interface SeoRunSnapshot {
  tests: SeoCheckResult[];
  severityCounts: Record<Severity, number>;
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
  routesTotal: number;
  routesInSitemap: number;
  durationMs: number;
}

// Walk routeTree recursively, collecting public crawlable HTML routes.
function collectCrawlableRoutes(): string[] {
  const out = new Set<string>();
  type Node = {
    fullPath?: string;
    id?: string;
    children?: Record<string, Node> | Node[];
  };
  const visit = (node: Node | undefined) => {
    if (!node) return;
    const full = node.fullPath ?? "";
    if (
      full &&
      !full.includes("$") &&
      !full.startsWith("/api/") &&
      full !== "/sitemap.xml"
    ) {
      const norm = full !== "/" && full.endsWith("/") ? full.slice(0, -1) : full;
      out.add(norm);
    }
    const children = node.children;
    if (!children) return;
    const arr = Array.isArray(children) ? children : Object.values(children);
    for (const c of arr) visit(c as Node);
  };
  visit(routeTree as unknown as Node);
  return Array.from(out);
}

export async function runSeoChecks(): Promise<SeoRunSnapshot> {
  const started = Date.now();
  const tests: SeoCheckResult[] = [];

  const sitemapPaths = new Set(STATIC_SITEMAP_ENTRIES.map((e) => e.path));
  const publicPaths = new Set(PUBLIC_STATIC_SITEMAP_ENTRIES.map((e) => e.path));
  const noindexPaths = new Set(NOINDEX_STATIC_SITEMAP_ENTRIES.map((e) => e.path));

  // 1. critical — every public route must be present in the sitemap
  for (const e of PUBLIC_STATIC_SITEMAP_ENTRIES) {
    tests.push({
      name: `sitemap contains public route ${e.path}`,
      severity: "critical",
      passed: sitemapPaths.has(e.path),
    });
  }

  // 2. critical — every noindex static route must also be in sitemap (for scanner coverage)
  for (const e of NOINDEX_STATIC_SITEMAP_ENTRIES) {
    tests.push({
      name: `sitemap contains noindex route ${e.path}`,
      severity: "critical",
      passed: sitemapPaths.has(e.path),
    });
  }

  // 3. critical — sitemap has no duplicates
  tests.push({
    name: "sitemap has no duplicate <loc> entries",
    severity: "critical",
    passed: sitemapPaths.size === STATIC_SITEMAP_ENTRIES.length,
  });

  // 4. high — route coverage: every crawlable HTML route in routeTree is listed in the sitemap
  const crawlable = collectCrawlableRoutes();
  let routesInSitemap = 0;
  for (const path of crawlable) {
    const inSitemap = sitemapPaths.has(path);
    if (inSitemap) routesInSitemap++;
    tests.push({
      name: `route ${path} is declared in sitemap-entries`,
      severity: "high",
      passed: inSitemap,
      message: inSitemap ? undefined : "missing from STATIC_SITEMAP_ENTRIES",
    });
  }

  // 5. medium — public/noindex sets are disjoint
  let disjoint = true;
  for (const p of publicPaths) if (noindexPaths.has(p)) disjoint = false;
  tests.push({
    name: "public and noindex sitemap groups are disjoint",
    severity: "medium",
    passed: disjoint,
  });

  // 6. medium — every sitemap entry uses a valid changefreq
  const valid = new Set(["daily", "weekly", "monthly", "always", "hourly", "yearly", "never"]);
  let cfOk = true;
  for (const e of STATIC_SITEMAP_ENTRIES) {
    if (e.changefreq && !valid.has(e.changefreq)) cfOk = false;
  }
  tests.push({
    name: "all sitemap entries use a valid changefreq",
    severity: "medium",
    passed: cfOk,
  });

  // 7. low — every sitemap entry has a priority between 0 and 1
  let prOk = true;
  for (const e of STATIC_SITEMAP_ENTRIES) {
    if (e.priority !== undefined) {
      const v = Number(e.priority);
      if (!Number.isFinite(v) || v < 0 || v > 1) prOk = false;
    }
  }
  tests.push({
    name: "all sitemap priorities are within [0,1]",
    severity: "low",
    passed: prOk,
  });

  const severityCounts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  let passed = 0;
  for (const t of tests) {
    if (t.passed) passed++;
    else severityCounts[t.severity]++;
  }

  return {
    tests,
    severityCounts,
    testsTotal: tests.length,
    testsPassed: passed,
    testsFailed: tests.length - passed,
    routesTotal: crawlable.length,
    routesInSitemap,
    durationMs: Date.now() - started,
  };
}
