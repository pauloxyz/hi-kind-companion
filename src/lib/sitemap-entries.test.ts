import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_STATIC_SITEMAP_ENTRIES } from "./sitemap-entries";

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
    expect(PUBLIC_STATIC_SITEMAP_ENTRIES.some((e) => e.path === "/")).toBe(true);
  });

  it("contains no duplicates", () => {
    const paths = PUBLIC_STATIC_SITEMAP_ENTRIES.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every path starts with /", () => {
    for (const e of PUBLIC_STATIC_SITEMAP_ENTRIES) {
      expect(e.path.startsWith("/")).toBe(true);
    }
  });

  it("never includes a route disallowed by robots.txt", () => {
    for (const e of PUBLIC_STATIC_SITEMAP_ENTRIES) {
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
  const REQUIRED = ["/", "/precos", "/vagas-h2a", "/guia-h2a-vs-h2b", "/guia-visto-h2b"];

  it("includes every required public route", () => {
    const paths = new Set(PUBLIC_STATIC_SITEMAP_ENTRIES.map((e) => e.path));
    for (const r of REQUIRED) expect(paths.has(r), `missing ${r}`).toBe(true);
  });

  it("private/auth routes that are marked noindex are NOT in the sitemap", () => {
    const noindexRoutes = ["/auth", "/reset-password", "/checkout/return"];
    const paths = new Set(PUBLIC_STATIC_SITEMAP_ENTRIES.map((e) => e.path));
    for (const r of noindexRoutes) expect(paths.has(r), `${r} must not be indexed`).toBe(false);
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
});
