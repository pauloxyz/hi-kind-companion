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
    // Land on a localhost page and wait for any client-side redirects to
    // settle BEFORE evaluating into the page — otherwise the index route's
    // post-mount navigation tears down the execution context mid-evaluate
    // ("Execution context was destroyed, most likely because of a navigation").
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    // Wait for the live region to be present — that's the signal AppShell
    // has finished its first render and any nested async boundaries resolved.
    await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  const cases: { keys: [string, string]; label: string; urlRe: RegExp }[] = [
    { keys: ["g", "v"], label: "Vagas", urlRe: /\/app\/vagas/ },
    { keys: ["g", "c"], label: "Currículo", urlRe: /\/app\/curriculo/ },
    { keys: ["g", "j"], label: "Jornada", urlRe: /\/app$/ },
  ];

  for (const c of cases) {
    test(`G ${c.keys[1].toUpperCase()} shows toast "${c.label}", keeps focus visible, leaves aria-live untouched`, async ({ page }) => {
      // Snapshot live region before; must not change because of navigation.
      const before = await page.getByTestId("journey-live-region").innerText();

      // Move focus to the matching sidebar nav link so we can observe its
      // focus ring through the transition. The shortcut still works because
      // the link is not an editable input.
      const navId =
        c.keys[1] === "v" ? "nav-jobs" : c.keys[1] === "c" ? "nav-resume" : "nav-dashboard";
      await page.evaluate((id) => document.getElementById(id)?.focus(), navId);

      await page.keyboard.press(c.keys[0]);
      await page.keyboard.press(c.keys[1]);
      await page.waitForURL(c.urlRe);

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
          outline: cs.outlineStyle,
          boxShadow: cs.boxShadow,
          // Tailwind's focus-visible:ring uses box-shadow; outline-none is OK
          // as long as box-shadow shows the ring.
          hasRing: cs.boxShadow !== "none" || cs.outlineStyle !== "none",
        };
      });
      expect(focus, "active element after navigation").not.toBeNull();
      expect(focus!.inViewport).toBe(true);
      expect(focus!.hasRing).toBe(true);

      // Aria-live region must not have been spammed by the route change.
      const after = await page.getByTestId("journey-live-region").innerText();
      expect(after).toBe(before);
    });
  }
});
