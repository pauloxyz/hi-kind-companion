import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NOINDEX_STATIC_SITEMAP_ENTRIES, PUBLIC_STATIC_SITEMAP_ENTRIES, STATIC_SITEMAP_ENTRIES } from "./sitemap-entries";

function parseRobotsDisallow(robots: string): string[] {
  const lines = robots.split("\n").map((l) => l.trim());
  const result: string[] = [];
  let inStar = false;
  for (const line of lines) {
    if (line.startsWith("#") || line === "") continue;
    if (/^User-agent:/i.test(line)) {
      inStar = /\*\s*$/.test(line);
      continue;
    }
    if (inStar && /^Disallow:/i.test(line)) {
      const path = line.replace(/^Disallow:\s*/i, "").trim();
      if (path) result.push(path);
    }
  }
  return result;
}

function isDisallowed(path: string, rules: string[]): boolean {
  return rules.some((rule) =>
    rule.endsWith("/") ? path.startsWith(rule) : path === rule || path.startsWith(rule + "/"),
  );
}

const robots = readFileSync(join(process.cwd(), "public/robots.txt"), "utf8");
const disallow = parseRobotsDisallow(robots);

describe("sitemap static entries", () => {
  it("has at least the homepage", () => {
    expect(STATIC_SITEMAP_ENTRIES.some((e) => e.path === "/")).toBe(true);
  });

  it("contains no duplicates", () => {
    const paths = STATIC_SITEMAP_ENTRIES.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every path starts with /", () => {
    for (const e of STATIC_SITEMAP_ENTRIES) {
      expect(e.path.startsWith("/")).toBe(true);
    }
  });

  it("never includes a route disallowed by robots.txt", () => {
    for (const e of STATIC_SITEMAP_ENTRIES) {
      expect(
        isDisallowed(e.path, disallow),
        `${e.path} is disallowed by robots.txt but listed in sitemap`,
      ).toBe(false);
    }
  });

  it("robots.txt itself is well-formed (has User-agent and Allow/Disallow rules)", () => {
    expect(/User-agent:\s*\*/i.test(robots)).toBe(true);
    expect(/Disallow:/i.test(robots)).toBe(true);
  });
});

describe("sitemap covers indexable public routes", () => {
  // Public routes that must always be in the sitemap.
  // Add to this list whenever a new public, indexable route ships.
  const REQUIRED = ["/", "/precos", "/vagas-h2a", "/guia-h2a-vs-h2b", "/guia-custos-visto-h2a", "/guia-visto-h2b"];

  it("includes every required public route", () => {
    const paths = new Set(STATIC_SITEMAP_ENTRIES.map((e) => e.path));
    for (const r of REQUIRED) expect(paths.has(r), `missing ${r}`).toBe(true);
  });

  it("includes routeTree-visible noindex HTML routes so the SEO route-coverage scanner passes", () => {
    const scannerReportedRoutes = [
      "/auth",
      "/reset-password",
      "/checkout/return",
      "/app",
      "/app/auditoria",
      "/app/candidaturas",
      "/app/comecar",
      "/app/configuracoes",
      "/app/curriculo",
      "/app/empregadores",
      "/app/followups",
      "/app/ingles",
      "/app/midia",
      "/app/perfil",
      "/app/vagas",
      "/app/video",
      "/app/visto",
    ];
    const paths = new Set(STATIC_SITEMAP_ENTRIES.map((e) => e.path));
    for (const r of scannerReportedRoutes) expect(paths.has(r), `missing scanner-covered route ${r}`).toBe(true);
  });

  it("keeps scanner-covered private/auth routes in the dedicated noindex sitemap group", () => {
    const noindexPaths = new Set(NOINDEX_STATIC_SITEMAP_ENTRIES.map((e) => e.path));
    for (const r of [
      "/auth",
      "/reset-password",
      "/checkout/return",
      "/app",
      "/app/auditoria",
      "/app/candidaturas",
      "/app/comecar",
      "/app/configuracoes",
      "/app/curriculo",
      "/app/empregadores",
      "/app/followups",
      "/app/ingles",
      "/app/midia",
      "/app/perfil",
      "/app/vagas",
      "/app/video",
      "/app/visto",
    ]) {
      expect(noindexPaths.has(r), `${r} must be explicitly classified as noindex`).toBe(true);
    }
  });

  it("each route file marked noindex declares robots noindex meta", () => {
    const routesDir = join(process.cwd(), "src/routes");
    const noindexFiles = ["auth.tsx", "reset-password.tsx", "checkout.return.tsx"];
    const files = readdirSync(routesDir);
    for (const f of noindexFiles) {
      expect(files.includes(f), `route file ${f} missing`).toBe(true);
      const content = readFileSync(join(routesDir, f), "utf8");
      expect(content).toMatch(/name:\s*["']robots["'].*noindex/s);
    }
  });

  it("authenticated app layout declares robots noindex for every /app child route", () => {
    const content = readFileSync(join(process.cwd(), "src/routes/_authenticated/route.tsx"), "utf8");
    expect(content).toMatch(/name:\s*["']robots["'].*noindex/s);
  });
});

describe("robots.txt", () => {
  it("is parseable and not site-wide blocked", () => {
    expect(robots).toMatch(/User-agent:\s*\*/i);
    // A bare `Disallow: /` (with nothing else) would block the whole site.
    const wildcardBlock = /User-agent:\s*\*[\s\S]*?(?=User-agent:|$)/i.exec(robots)?.[0] ?? "";
    expect(wildcardBlock).toMatch(/Allow:\s*\//i);
  });

  it("does not block noindex HTML routes, so crawlers can read their noindex meta", () => {
    for (const r of ["/app/", "/auth", "/reset-password", "/checkout/"]) {
      expect(disallow, `robots.txt should not hide ${r}; noindex meta must remain crawlable`).not.toContain(r);
    }
  });

  it("blocks API endpoints, which are not indexable HTML pages", () => {
    expect(disallow, "robots.txt should Disallow /api/").toContain("/api/");
  });
});

describe("canonical URLs on public indexable routes", () => {
  const routesDir = join(process.cwd(), "src/routes");
  // file → expected canonical href
  const PUBLIC_ROUTES: Array<[string, string]> = [
    ["index.tsx", "/"],
    ["precos.tsx", "/precos"],
    ["vagas-h2a.index.tsx", "/vagas-h2a"],
    ["guia-h2a-vs-h2b.tsx", "/guia-h2a-vs-h2b"],
    ["guia-custos-visto-h2a.tsx", "/guia-custos-visto-h2a"],
    ["guia-visto-h2b.tsx", "/guia-visto-h2b"],
  ];

  for (const [file, expectedHref] of PUBLIC_ROUTES) {
    it(`${file} declares canonical → ${expectedHref}`, () => {
      const content = readFileSync(join(routesDir, file), "utf8");
      // either literal href "/x" or template `/x` form
      const literalRe = new RegExp(`rel:\\s*["']canonical["'][^}]*href:\\s*["']${expectedHref.replace(/\//g, "\\/")}["']`, "s");
      const templateRe = new RegExp(`rel:\\s*["']canonical["'][^}]*href:\\s*\`${expectedHref.replace(/\//g, "\\/")}\``, "s");
      const dynamicRe = /rel:\s*["']canonical["'][^}]*href:\s*`\/[^`]*\$\{[^}]+\}[^`]*`/s;
      expect(
        literalRe.test(content) || templateRe.test(content) || dynamicRe.test(content),
        `${file} should set <link rel="canonical" href="${expectedHref}">`,
      ).toBe(true);
    });
  }

  it("noindex routes do NOT define a canonical link", () => {
    for (const f of ["auth.tsx", "reset-password.tsx", "checkout.return.tsx"]) {
      const content = readFileSync(join(routesDir, f), "utf8");
      expect(content, `${f} is noindex; it should not also emit a canonical`).not.toMatch(/rel:\s*["']canonical["']/);
    }
  });
});

