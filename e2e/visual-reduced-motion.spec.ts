import { test, expect, type Page } from "@playwright/test";

/**
 * Re-runs the aria-live consistency and drawer/sidebar visual checks with
 * `prefers-reduced-motion: reduce` forced on. Catches transitions that
 * would otherwise flicker the layout or coalesce announcements unexpectedly
 * when animations are stripped.
 *
 * Skipped without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

const VISUAL_OPTS = { maxDiffPixelRatio: 0.02, animations: "disabled" as const };

test.use({ colorScheme: "light", reducedMotion: "reduce" });

async function bootSession(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key!, json!),
    { key: STORAGE_KEY, json: SESSION_JSON },
  );
}

async function rapidPhaseBurst(page: Page) {
  for (const k of ["v", "c", "j", "v", "c"]) {
    await page.keyboard.press("g");
    await page.keyboard.press(k);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
}

test.describe("prefers-reduced-motion: aria-live + visual regression", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("aria-live: rapid bursts produce no duplicate consecutive messages", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    // Confirm the media query is actually reduced.
    const reduced = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(reduced).toBe(true);

    await page.evaluate(() => {
      (window as unknown as { __live: string[] }).__live = [];
      const node = document.querySelector('[data-testid="journey-live-region"]');
      if (!node) return;
      new MutationObserver(() => {
        const text = (node.textContent ?? "").trim();
        if (text) (window as unknown as { __live: string[] }).__live.push(text);
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });

    await rapidPhaseBurst(page);

    const live = await page.evaluate(
      () => (window as unknown as { __live: string[] }).__live ?? [],
    );
    // At most ~1 message per debounce window across the burst (~3s of bursts).
    expect(live.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < live.length; i++) {
      expect(live[i], `consecutive duplicate at ${i}`).not.toBe(live[i - 1]);
    }
  });

  test("visual: desktop sidebar stable under reduced-motion bursts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    const sidebar = page.getByRole("navigation", { name: "Navegação principal" }).first();
    await expect(sidebar).toBeVisible();
    await rapidPhaseBurst(page);

    await expect(sidebar).toHaveScreenshot(
      "sidebar-desktop-reduced-motion.png",
      VISUAL_OPTS,
    );
  });

  test("visual: mobile drawer stable under reduced-motion bursts", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    await rapidPhaseBurst(page);

    await page.getByRole("button", { name: "Abrir menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(dialog).toBeVisible();

    await expect(dialog).toHaveScreenshot(
      "drawer-mobile-reduced-motion.png",
      VISUAL_OPTS,
    );
  });
});
