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

test("landing redirects signed-in user to /app without a click", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("landing-page")).toBeVisible();
  await expect(page.getByTestId("landing-hero")).toBeVisible();
  await expect(page.getByTestId("landing-social-proof")).toBeVisible();
  await expect(page.getByTestId("app-shell")).toHaveCount(0);

  await ensureSignedIn(page);

  // Mirror the post-OAuth navigation (redirect_uri = window.location.origin).
  await page.goto("/");

  // The landing component must navigate to /app on its own; wait for stable
  // UI markers before asserting the exact URL to reduce redirect flakiness.
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 15_000 });
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByTestId("landing-page")).toHaveCount(0);
  await expect(page.getByTestId("landing-hero")).toHaveCount(0);
  await expect(page.getByTestId("landing-social-proof")).toHaveCount(0);

  // 1) URL is exactly /app (not /app/something-else by accident, not still /).
  const finalUrl = new URL(page.url());
  expect(finalUrl.pathname).toBe("/app");

  // 2) The protected shell body actually rendered (not a blank redirect
  //    placeholder).
  await expect(page.getByTestId("app-main")).toBeVisible();
});
