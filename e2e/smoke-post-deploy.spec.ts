/**
 * Post-deploy smoke test — runs against a live URL.
 *
 * Verifies that the basic security posture of the published site is still
 * intact AFTER a deploy:
 *
 *  - public profile route renders for an enabled slug (no auth needed)
 *  - protected /app/* routes redirect unauthenticated users to /auth
 *    instead of rendering protected content
 *  - the Supabase Data API does not expose `phone` / `birth_date` on the
 *    public_profiles view to anon
 *  - the admin route specifically (/app/admin/security) is gated
 *
 * Run locally:
 *   PLAYWRIGHT_BASE_URL=https://vplusa.com bunx playwright test e2e/smoke-post-deploy.spec.ts
 *
 * The package.json `test:smoke:deploy` script wraps that for you.
 */
import { test, expect, request } from "@playwright/test";

const PUBLIC_SLUG = process.env.SMOKE_PUBLIC_SLUG ?? "demo";
const ANON_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

test.describe("post-deploy smoke", () => {
  test("public profile route is reachable without auth", async ({ page }) => {
    const res = await page.goto(`/v/${PUBLIC_SLUG}`, { waitUntil: "domcontentloaded" });
    // 200 (slug exists) or 404 (slug doesn't) — both are acceptable. A
    // 5xx, redirect to /auth, or auth wall is NOT.
    expect(res?.status()).toBeLessThan(500);
    const url = page.url();
    expect(url).not.toContain("/auth");
  });

  test("protected /app redirects unauthenticated users away", async ({ page }) => {
    await page.goto("/app/perfil", { waitUntil: "domcontentloaded" });
    // After client-side gate runs, we should NOT be on /app/perfil.
    await page.waitForURL((u) => !u.pathname.startsWith("/app/perfil"), { timeout: 10_000 }).catch(() => null);
    expect(page.url()).not.toContain("/app/perfil");
  });

  test("admin security page is gated", async ({ page }) => {
    await page.goto("/app/admin/security", { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => !u.pathname.startsWith("/app/admin"), { timeout: 10_000 }).catch(() => null);
    expect(page.url()).not.toContain("/app/admin/security");
  });

  test.skip(!ANON_URL || !ANON_KEY, "needs VITE_SUPABASE_URL/PUBLISHABLE_KEY in env");
  test("anon cannot read PII columns through the Data API", async () => {
    const api = await request.newContext({
      baseURL: ANON_URL!,
      extraHTTPHeaders: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` },
    });

    // public_profiles view: must not even know about the columns
    const view = await api.get(
      "/rest/v1/public_profiles?select=phone,birth_date&limit=1",
    );
    // PostgREST returns 400 "column does not exist" when the column isn't
    // in the view — that's the success case here.
    expect([400, 404]).toContain(view.status());

    // my_profile base table: anon must not be able to SELECT phone
    const base = await api.get("/rest/v1/my_profile?select=phone&limit=1");
    if (base.ok()) {
      const body = (await base.json()) as { phone?: unknown }[];
      for (const row of body) {
        expect(row.phone).toBeFalsy();
      }
    } else {
      // permission-denied / RLS rejection is the ideal outcome
      expect([401, 403, 404]).toContain(base.status());
    }
  });
});
