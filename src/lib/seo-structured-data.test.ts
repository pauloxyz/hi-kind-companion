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
      let pushed = false;
      try {
        const safe = literal
          .replace(/new Date\(\)\.toISOString\(\)\.slice\([^)]+\)/g, '"2026-01-01"')
          .replace(/new Date\(\)\.toISOString\(\)/g, '"2026-01-01T00:00:00.000Z"');
        // Provide module-level identifiers that route head() blocks reference
        // (SITE_URL/absUrl from src/lib/site.ts) so template-literal payloads
        // eval cleanly at test time.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
        const obj = new Function(
          "SITE_URL",
          "absUrl",
          `return (${safe});`,
        )("https://www.vaiprala.net", (p: string) => `https://www.vaiprala.net${p.startsWith("/") ? p : `/${p}`}`);
        out.push(obj);
        pushed = true;
      } catch {
        // fall through to type-only sentinel
      }
      if (!pushed) {
        // Block references loader/closure vars (e.g. FAQ.map, jobs.slice) so it
        // can't be eval'd at test time. Extract the top-level "@type" so the
        // type-presence assertions still work; field-level assertions in this
        // suite are explicitly source-regex based (see JobPosting tests).
        const m2 = /^\s*\{[^]*?["']@type["']\s*:\s*["']([^"']+)["']/.exec(literal);
        if (m2) out.push({ "@type": m2[1], __sourceOnly: true });
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

const ARTICLE_ROUTES = ["guia-h2a-vs-h2b.tsx", "guia-custos-visto-h2a.tsx", "guia-visto-h2b.tsx"];
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
  const list = findByType<Record<string, unknown>>(payloads, "ItemList");

  it("emits an ItemList container", () => {
    expect(list).toBeDefined();
  });

  // Required JobPosting fields per Google Rich Results.
  // The list's itemListElement is built via .map(...) so the literal payload is
  // an empty array; verify the source code declares each required key.
  const required = [
    "title",
    "description",
    "datePosted",
    "validThrough",
    "hiringOrganization",
    "jobLocation",
    "employmentType",
    "identifier",
    "applicantLocationRequirements",
    "@id",
    "url",
  ];

  for (const key of required) {
    it(`source declares JobPosting.${key}`, () => {
      // @id / url use special quoting because @ is not a word char.
      const escaped = key.replace(/[@]/g, "\\$&");
      const re = new RegExp(`["']?${escaped}["']?\\s*:`);
      expect(re.test(source), `JobPosting.${key} missing in vagas-h2a.$state.tsx`).toBe(true);
    });
  }

  it("hiringOrganization carries a sameAs URL pointing to the site", () => {
    expect(/hiringOrganization[\s\S]{0,200}sameAs\s*:/.test(source)).toBe(true);
  });

  it("validThrough has a fallback (does not rely solely on j.end_date being non-null)", () => {
    // We accept the new fallback pattern: `validThrough: j.end_date ?? <expr>`
    expect(/validThrough\s*:\s*j\.end_date\s*\?\?/.test(source)).toBe(true);
  });

  it("@id and url are absolute (built via absUrl helper)", () => {
    expect(/["']@id["']\s*:\s*jobUrl/.test(source)).toBe(true);
    expect(/\burl\s*:\s*jobUrl/.test(source)).toBe(true);
    expect(/absUrl\(/.test(source)).toBe(true);
  });

  it("canonical, og:url and og:image (when present) use absUrl", () => {
    expect(/rel:\s*["']canonical["'][^}]*href:\s*absPath/.test(source)).toBe(true);
    expect(/property:\s*["']og:url["'][^}]*content:\s*absPath/.test(source)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Heading discipline: every route file ships exactly one <h1>
// ---------------------------------------------------------------------------

describe("heading discipline (one <h1> per public route)", () => {
  const SKIP = new Set([
    "__root.tsx",
    "sitemap[.]xml.ts",
    "checkout.return.tsx", // noindex; minimal page
    // Crop landing pages that delegate rendering to a shared <CropPage>
    // component imported from vagas-h2a.colheita-maca.tsx — the <h1> lives
    // in that shared component and is tested via colheita-maca.tsx itself.
    "vagas-h2a.colheita-laranja.tsx",
    "vagas-h2a.tabaco.tsx",
  ]);

  const files = readdirSync(routesDir)
    .filter((f) => f.endsWith(".tsx") && !f.startsWith("_") && !SKIP.has(f));

  for (const f of files) {
    it(`${f} renders exactly one <h1> at runtime (errorComponent/notFoundComponent don't co-render)`, () => {
      const raw = readFileSync(join(routesDir, f), "utf8");
      // Strip notFoundComponent/errorComponent function bodies — they replace
      // the main component on 404/error, never render alongside it.
      const stripped = raw
        .replace(/(notFoundComponent|errorComponent)\s*:\s*\(\s*[^)]*\)\s*=>\s*\([\s\S]*?\)\s*,/g, "")
        .replace(/(notFoundComponent|errorComponent)\s*:\s*\(\s*[^)]*\)\s*=>\s*\{[\s\S]*?\n\s*\}\s*,/g, "");
      const matches = stripped.match(/<h1\b/g) ?? [];
      expect(matches.length, `${f} has ${matches.length} runtime <h1> tags (expected 1)`).toBe(1);
    });
  }
});

// ---------------------------------------------------------------------------
// Canonical href hygiene (lowercase, leading slash, no trailing slash, no host)
// ---------------------------------------------------------------------------

describe("canonical href hygiene", () => {
  const ALLOWED_ORIGIN = "https://www.vaiprala.net";
  const files = readdirSync(routesDir).filter((f) => f.endsWith(".tsx"));
  for (const f of files) {
    const src = readFileSync(join(routesDir, f), "utf8");
    const re = /rel:\s*["']canonical["'][^}]*href:\s*(["'`])([^"'`]+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const href = m[2];
      it(`${f}: canonical "${href}" follows hygiene rules`, () => {
        // Either root-relative ("/foo") or absolute on the canonical origin
        const isAbsolute = /^https?:\/\//i.test(href);
        if (isAbsolute) {
          expect(href.startsWith(ALLOWED_ORIGIN), `canonical absolute URL must use ${ALLOWED_ORIGIN}`).toBe(true);
        } else {
          expect(href.startsWith("/"), `canonical must be root-relative or absolute`).toBe(true);
        }
        const pathOnly = isAbsolute ? href.slice(ALLOWED_ORIGIN.length) || "/" : href;
        if (pathOnly !== "/") {
          expect(pathOnly.endsWith("/"), `canonical path must not end with "/" (${href})`).toBe(false);
        }
        const literalPart = pathOnly.replace(/\$\{[^}]+\}/g, "");
        expect(literalPart, `canonical path must be lowercase (${href})`).toBe(literalPart.toLowerCase());
        const withoutScheme = href.replace(/^https?:\/\//i, "");
        expect(withoutScheme.includes("//"), `canonical must not contain double-slashes after host`).toBe(false);
      });
    }
  }
});
