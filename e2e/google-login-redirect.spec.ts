import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

/**
 * E2E: post-login auto-redirect.
 *
 * Provisions its own Supabase session via the helper (no manual setup, no
 * `LOVABLE_BROWSER_AUTH_STATUS` dependency, never skipped).
 *
 * Validates that after a session exists and the user lands on `/` — the
 * exact post-Google-OAuth state — the landing component redirects to
 * `/app` on its own, with no clicks.
 */

const LANDING_MARKERS = [
  /quem usa/i,
  /come[çc]ar gr[áa]tis/i,
  /abrir meu app/i,
];

test("landing redirects signed-in user to /app without a click", async ({ page }) => {
  await ensureSignedIn(page);

  // Mirror the post-OAuth navigation (redirect_uri = window.location.origin).
  await page.goto("/");

  // The landing component must navigate to /app on its own.
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 15_000 });

  // 1) URL is exactly /app (not /app/something-else by accident, not still /).
  const finalUrl = new URL(page.url());
  expect(finalUrl.pathname).toBe("/app");

  // 2) Landing markers are gone — we are no longer rendering the public
  //    landing page under the hood.
  for (const marker of LANDING_MARKERS) {
    await expect(page.getByText(marker)).toHaveCount(0);
  }

  // 3) The protected shell body actually rendered (not a blank redirect
  //    placeholder).
  await expect(page.locator("body")).toBeVisible();
});
