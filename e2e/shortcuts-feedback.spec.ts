import { test, expect } from "@playwright/test";
import {
  attachFailureDiagnostics,
  fireShortcut,
  waitForLiveRegionQuiet,
} from "./_helpers/diagnostics";

/**
 * G+key shortcuts must surface a sonner toast, keep keyboard focus on a
 * visible element, and NOT pollute the Jornada H-2A aria-live region with
 * spurious announcements caused by the route change.
 *
 * Skipped in CI without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

test.describe("shortcut visual feedback", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");
  test.use({ viewport: { width: 1280, height: 900 } });

  test.afterEach(async ({ page }, testInfo) => {
    await attachFailureDiagnostics(page, testInfo);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle").catch(() => {});
    // Drain any initial-mount Jornada announcement so the test's "before"
    // snapshot below is taken from a stable region — otherwise the post-
    // navigation read picks up the deferred announcement and the assertion
    // (after === before) flakes.
    await waitForLiveRegionQuiet(page);
  });

  const cases: { keys: [string, string]; label: string; urlRe: RegExp }[] = [
    { keys: ["g", "v"], label: "Vagas", urlRe: /\/app\/vagas/ },
    { keys: ["g", "c"], label: "Currículo", urlRe: /\/app\/curriculo/ },
    { keys: ["g", "j"], label: "Jornada", urlRe: /\/app$/ },
  ];

  for (const c of cases) {
    test(`G ${c.keys[1].toUpperCase()} shows toast "${c.label}", keeps focus visible, leaves aria-live untouched`, async ({ page }) => {
      // If we're already at the target URL (G+J → /app, and beforeEach landed
      // on /app), pre-navigate elsewhere so the shortcut actually fires and
      // the toast can be observed.
      if (c.urlRe.test(page.url())) {
        await fireShortcut(page, "v", /\/app\/vagas/);
        await waitForLiveRegionQuiet(page);
      }

      // Snapshot the live region after the initial-mount announcement settled.
      const before = await page.getByTestId("journey-live-region").innerText();

      // Move focus to the matching sidebar nav link so we can observe its
      // focus ring through the transition.
      const navId =
        c.keys[1] === "v" ? "nav-jobs" : c.keys[1] === "c" ? "nav-resume" : "nav-dashboard";
      await page.evaluate((id) => document.getElementById(id)?.focus(), navId);

      await fireShortcut(page, c.keys[1], c.urlRe);

      // Sonner toast appears with the destination label.
      const toast = page.locator('[data-sonner-toast]').filter({ hasText: c.label });
      await expect(toast).toBeVisible({ timeout: 2_000 });

      // The focused element after navigation is still on the page (not lost
      // to <body>) and the focus ring computed style is non-zero (visible).
      const focus = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || a === document.body) return null;
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        return {
          inViewport: r.width > 0 && r.height > 0,
          hasRing: cs.boxShadow !== "none" || cs.outlineStyle !== "none",
        };
      });
      expect(focus, "active element after navigation").not.toBeNull();
      expect(focus!.inViewport).toBe(true);
      expect(focus!.hasRing).toBe(true);

      // Aria-live region must not have been spammed by the route change.
      // Wait for the same quiet window before comparing to absorb any
      // micro-debounced re-render from the navigation.
      const after = await waitForLiveRegionQuiet(page, 700, 3_000);
      expect(after).toBe(before);
    });
  }
});
