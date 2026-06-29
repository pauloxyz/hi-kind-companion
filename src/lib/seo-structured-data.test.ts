import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const routesDir = join(process.cwd(), "src/routes");

/**
 * Pull every JSON-LD payload embedded in a route file's head() scripts.
 * The route source uses `children: JSON.stringify({...})` blocks.
 */
function extractJsonLd(source: string): unknown[] {
  const out: unknown[] = [];
  const marker = "JSON.stringify(";
  let idx = source.indexOf(marker);
  while (idx !== -1) {
    // Skip whitespace, then expect "{"
    let i = idx + marker.length;
    while (i < source.length && /\s/.test(source[i])) i++;
    if (source[i] !== "{") {
      idx = source.indexOf(marker, idx + 1);
      continue;
    }
    // Balanced-brace scan that respects strings, template strings, and escapes.
    const start = i;
    let depth = 0;
    let inStr: '"' | "'" | "`" | null = null;
    let escape = false;
    while (i < source.length) {
      const c = source[i];
      if (escape) { escape = false; i++; continue; }
      if (inStr) {
        if (c === "\\") { escape = true; i++; continue; }
        if (c === inStr) inStr = null;
        i++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = c; i++; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
    const literal = source.slice(start, i);
    if (/@context/.test(literal)) {
      try {
        const safe = literal
          .replace(/new Date\(\)\.toISOString\(\)\.slice\([^)]+\)/g, '"2026-01-01"')
          .replace(/new Date\(\)\.toISOString\(\)/g, '"2026-01-01T00:00:00.000Z"');
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const obj = new Function(`return (${safe});`)();
        out.push(obj);
      } catch {
        // skip un-parseable blocks
      }
    }
    idx = source.indexOf(marker, i);
  }
  return out;
}

function findByType<T = Record<string, unknown>>(payloads: unknown[], type: string): T | undefined {
  return payloads.find((p): p is T => {
    if (!p || typeof p !== "object") return false;
    const t = (p as { "@type"?: unknown })["@type"];
    return t === type;
  });
}

function deepFindByType(node: unknown, type: string): Record<string, unknown> | undefined {
  if (!node || typeof node !== "object") return undefined;
  const t = (node as { "@type"?: unknown })["@type"];
  if (t === type) return node as Record<string, unknown>;
  for (const v of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        const f = deepFindByType(item, type);
        if (f) return f;
      }
    } else if (v && typeof v === "object") {
      const f = deepFindByType(v, type);
      if (f) return f;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Sitewide JSON-LD in __root.tsx
// ---------------------------------------------------------------------------

describe("sitewide JSON-LD in __root.tsx", () => {
  const root = readFileSync(join(routesDir, "__root.tsx"), "utf8");
  const payloads = extractJsonLd(root);

  it("declares an Organization with name, url, logo, description", () => {
    const org = findByType<Record<string, unknown>>(payloads, "Organization");
    expect(org, "Organization JSON-LD missing in __root.tsx").toBeDefined();
    expect(org).toMatchObject({ name: expect.any(String), url: expect.any(String), description: expect.any(String) });
    expect(org!.logo, "Organization.logo missing").toBeDefined();
  });

  it("declares a WebSite tied to the Organization, with SearchAction", () => {
    const site = findByType<Record<string, unknown>>(payloads, "WebSite");
    expect(site, "WebSite JSON-LD missing in __root.tsx").toBeDefined();
    expect(site).toMatchObject({ name: expect.any(String), url: expect.any(String), inLanguage: expect.any(String) });
    expect(site!.potentialAction, "WebSite.potentialAction (SearchAction) missing").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Article schema completeness on guide routes
// ---------------------------------------------------------------------------

const ARTICLE_ROUTES = ["guia-h2a-vs-h2b.tsx", "guia-visto-h2b.tsx"];
const ARTICLE_REQUIRED = [
  "headline",
  "description",
  "author",
  "publisher",
  "datePublished",
  "dateModified",
  "mainEntityOfPage",
  "image",
  "inLanguage",
];

describe.each(ARTICLE_ROUTES)("Article schema in %s", (file) => {
  const source = readFileSync(join(routesDir, file), "utf8");
  const payloads = extractJsonLd(source);
  const article = findByType<Record<string, unknown>>(payloads, "Article");

  it("has an Article block", () => {
    expect(article).toBeDefined();
  });

  for (const field of ARTICLE_REQUIRED) {
    it(`includes required field: ${field}`, () => {
      expect(article).toBeDefined();
      expect(article![field], `Article.${field} missing in ${file}`).toBeDefined();
    });
  }

  it("publisher carries a logo (Google requirement)", () => {
    const publisher = article?.publisher as Record<string, unknown> | undefined;
    expect(publisher?.logo, `Article.publisher.logo missing in ${file}`).toBeDefined();
  });

  it("co-ships an FAQPage block for the page FAQ", () => {
    const faq = findByType(payloads, "FAQPage");
    expect(faq, `FAQPage JSON-LD missing in ${file}`).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// JobPosting completeness on /vagas-h2a/$state
// ---------------------------------------------------------------------------

describe("JobPosting schema in vagas-h2a.$state.tsx", () => {
  const source = readFileSync(join(routesDir, "vagas-h2a.$state.tsx"), "utf8");
  const payloads = extractJsonLd(source);
  // JobPosting is nested inside an ItemList → traverse.
  const list = findByType<Record<string, unknown>>(payloads, "ItemList");

  it("emits an ItemList container", () => {
    expect(list).toBeDefined();
  });

  // The list's itemListElement uses `.map(...)` so the literal payload is
  // an empty array; verify the source code declares each required key.
  const required = [
    "title",
    "description",
    "datePosted",
    "hiringOrganization",
    "jobLocation",
    "employmentType",
    "identifier",
    "applicantLocationRequirements",
  ];

  for (const key of required) {
    it(`source declares JobPosting.${key}`, () => {
      const re = new RegExp(`\\b${key}\\s*:`);
      expect(re.test(source), `JobPosting.${key} missing in vagas-h2a.$state.tsx`).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Heading discipline: every route file ships exactly one <h1>
// ---------------------------------------------------------------------------

describe("heading discipline (one <h1> per public route)", () => {
  const SKIP = new Set([
    "__root.tsx",
    "sitemap[.]xml.ts",
    "checkout.return.tsx", // noindex; minimal page
  ]);

  const files = readdirSync(routesDir)
    .filter((f) => f.endsWith(".tsx") && !f.startsWith("_") && !SKIP.has(f));

  for (const f of files) {
    it(`${f} contains exactly one <h1> tag`, () => {
      const src = readFileSync(join(routesDir, f), "utf8");
      const matches = src.match(/<h1\b/g) ?? [];
      expect(matches.length, `${f} has ${matches.length} <h1> tags (expected 1)`).toBe(1);
    });
  }
});

// ---------------------------------------------------------------------------
// Canonical href hygiene (lowercase, leading slash, no trailing slash, no host)
// ---------------------------------------------------------------------------

describe("canonical href hygiene", () => {
  const files = readdirSync(routesDir).filter((f) => f.endsWith(".tsx"));
  for (const f of files) {
    const src = readFileSync(join(routesDir, f), "utf8");
    const re = /rel:\s*["']canonical["'][^}]*href:\s*(["'`])([^"'`]+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const href = m[2];
      it(`${f}: canonical "${href}" follows hygiene rules`, () => {
        expect(href.startsWith("/"), `canonical must be root-relative (no host)`).toBe(true);
        // allow root "/" but otherwise no trailing slash
        if (href !== "/") {
          expect(href.endsWith("/"), `canonical must not end with "/" (${href})`).toBe(false);
        }
        // ignore the $param placeholder segments when checking lowercase
        const literalPart = href.replace(/\$\{[^}]+\}/g, "");
        expect(
          literalPart,
          `canonical must be lowercase (${href})`,
        ).toBe(literalPart.toLowerCase());
        expect(href.includes("//"), `canonical must not contain double-slashes`).toBe(false);
      });
    }
  }
});
