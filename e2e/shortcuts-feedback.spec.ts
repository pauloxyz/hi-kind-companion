import { test, expect } from "@playwright/test";

/**
 * G+key shortcuts must surface a sonner toast, keep keyboard focus on a
 * visible element, and NOT pollute the Jornada H-2A aria-live region.
 *
 * Skipped in CI without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

test.describe("shortcut visual feedback", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");
  });

  const cases: { keys: [string, string]; label: string; urlRe: RegExp }[] = [
    { keys: ["g", "v"], label: "Vagas", urlRe: /\/app\/vagas/ },
    { keys: ["g", "c"], label: "Currículo", urlRe: /\/app\/curriculo/ },
    { keys: ["g", "j"], label: "Jornada", urlRe: /\/app$/ },
  ];

  for (const c of cases) {
    test(`G ${c.keys[1].toUpperCase()} shows toast "${c.label}" and preserves focus`, async ({ page }) => {
      // Snapshot live region before; must not change because of navigation.
      const before = await page.getByTestId("journey-live-region").innerText();

      await page.keyboard.press(c.keys[0]);
      await page.keyboard.press(c.keys[1]);
      await page.waitForURL(c.urlRe);

      // Sonner toast appears with the destination label.
      const toast = page.locator('[data-sonner-toast]').filter({ hasText: c.label });
      await expect(toast).toBeVisible({ timeout: 2_000 });

      // The focused element after navigation is still on the page (not lost
      // to <body>) and a visible interactive element.
      const focusedOk = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || a === document.body) return false;
        const r = a.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      expect(focusedOk).toBe(true);

      // Aria-live region must not have been spammed by the route change.
      const after = await page.getByTestId("journey-live-region").innerText();
      expect(after).toBe(before);
    });
  }
});
