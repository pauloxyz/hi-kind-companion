import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

/**
 * E2E: post-login auto-redirect.
 *
 * This test provisions its own Supabase session via email+password
 * (see `_helpers/auth.ts`). It does NOT depend on
 * `LOVABLE_BROWSER_AUTH_STATUS` and will not be skipped — if credentials
 * are missing the helper throws with setup instructions, which is the
 * correct CI signal.
 *
 * What we are validating:
 *   After OAuth (or any sign-in) returns the user to `/`, the landing
 *   component must navigate to `/app` on its own. No "Abrir meu app"
 *   button click required.
 */

test("landing redirects signed-in user to /app without a click", async ({ page }) => {
  // Sign in via Supabase Auth REST and seed the session into localStorage
  // (the same shape supabase-js writes after a normal sign-in / OAuth
  // callback).
  await ensureSignedIn(page);

  // Re-open the landing page — this mirrors the post-OAuth navigation that
  // `lovable.auth.signInWithOAuth` performs (redirect_uri =
  // window.location.origin).
  await page.goto("/");

  // The landing component reads the session and must navigate to /app on
  // its own — no clicks, no manual nav.
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 15_000 });
  expect(new URL(page.url()).pathname).toMatch(/^\/app(\/|$)/);

  // Sanity: we are inside the protected shell, not still on the public
  // landing with the "Abrir meu app" CTA.
  await expect(
    page.getByRole("link", { name: /abrir meu app/i }),
  ).toHaveCount(0);
});
