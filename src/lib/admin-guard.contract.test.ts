/**
 * Regression guard: every server fn that touches admin-only data MUST use the
 * centralized `assertAdminWithAudit` helper. This catches the class of bug
 * where a new privileged fn ships without the role check (or with an inline
 * check that bypasses audit logging).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ADMIN_FN_FILES = [
  "admin-guard.functions.ts",
  "seo-runs.functions.ts",
  "security-admin.functions.ts",
  "security-alerts.functions.ts",
  "security-retention.functions.ts",
  "uptime.functions.ts",
];

const LIB_DIR = join(process.cwd(), "src/lib");

describe("admin server fn guard contract", () => {
  for (const file of ADMIN_FN_FILES) {
    it(`${file} imports and calls assertAdminWithAudit`, () => {
      const src = readFileSync(join(LIB_DIR, file), "utf8");
      expect(
        src.includes('from "@/lib/admin-guard.shared"'),
        `${file} must import assertAdminWithAudit from admin-guard.shared`,
      ).toBe(true);
      expect(
        src.includes("assertAdminWithAudit("),
        `${file} must call assertAdminWithAudit(...)`,
      ).toBe(true);
    });

    it(`${file} has no leftover inline has_role check`, () => {
      const src = readFileSync(join(LIB_DIR, file), "utf8");
      // Inline supabase.rpc("has_role" ...) bypasses audit logging — forbid it.
      expect(
        /\.rpc\(\s*["']has_role["']/.test(src),
        `${file} still calls supabase.rpc("has_role", ...) directly — route through assertAdminWithAudit instead`,
      ).toBe(false);
      // Local `async function assertAdmin(` shadows the shared helper — forbid it.
      expect(
        /async function assertAdmin\(/.test(src),
        `${file} declares a local assertAdmin() — remove it and use the shared helper`,
      ).toBe(false);
    });
  }

  it("no NEW *.functions.ts file silently skips the guard", () => {
    // If a new admin-flavored fn file appears, force the author to add it
    // explicitly to ADMIN_FN_FILES or add a `// @public-fn` marker.
    const all = readdirSync(LIB_DIR).filter((f) => f.endsWith(".functions.ts"));
    const suspicious = all.filter((f) => {
      if (ADMIN_FN_FILES.includes(f)) return false;
      const src = readFileSync(join(LIB_DIR, f), "utf8");
      // Files that already use has_role anywhere are admin-ish.
      return /has_role/.test(src);
    });
    expect(
      suspicious,
      `These files reference has_role but are not in ADMIN_FN_FILES — add them to the guard contract: ${suspicious.join(", ")}`,
    ).toEqual([]);
  });
});

describe("admin route beforeLoad guard", () => {
  const ADMIN_ROUTES = [
    "src/routes/_authenticated/admin.seo.tsx",
    "src/routes/_authenticated/app.auditoria.tsx",
  ];
  for (const route of ADMIN_ROUTES) {
    it(`${route} calls requireAdminAccess() in beforeLoad and redirects to /app on failure`, () => {
      const src = readFileSync(join(process.cwd(), route), "utf8");
      expect(src).toMatch(/beforeLoad\s*:/);
      expect(src).toMatch(/requireAdminAccess\(/);
      expect(src).toMatch(/redirect\(\s*\{\s*to:\s*["']\/app["']/);
    });
  }
});
