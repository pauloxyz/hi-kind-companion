import { test, expect } from "@playwright/test";

/**
 * Smoke tests that validate the app loads and the public surface
 * (landing, /auth, /api/public/health) responds without errors.
 * No backend writes; no authenticated flows.
 */

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
  const main = page.locator("body");
  await expect(main).toBeVisible();
});

test("auth page renders sign-in form", async ({ page }) => {
  const res = await page.goto("/auth");
  expect(res?.ok()).toBeTruthy();
  // password input is the most stable signal
  await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 10_000 });
});

test("/api/public/health responds with JSON status", async ({ request }) => {
  const res = await request.get("/api/public/health");
  // 200 ok, 503 degraded — both are valid HTTP responses (not 404/500)
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(body).toHaveProperty("status");
  expect(body).toHaveProperty("checks");
});

test("protected route redirects unauthenticated users to /auth", async ({ page }) => {
  await page.goto("/app/auditoria");
  // managed _authenticated layout redirects to /auth
  await page.waitForURL(/\/auth/i, { timeout: 10_000 });
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
