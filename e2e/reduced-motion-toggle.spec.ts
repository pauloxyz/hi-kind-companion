import { test, expect, type Page } from "@playwright/test";

/**
 * Toggles prefers-reduced-motion ON → OFF → ON in the middle of the
 * Jornada H-2A flow and asserts the aria-live region never emits two
 * consecutive identical messages, regardless of which CSS transitions
 * happen to be running at the time.
 *
 * Skipped without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

async function bootSession(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key!, json!),
    { key: STORAGE_KEY, json: SESSION_JSON },
  );
}

async function burst(page: Page) {
  for (const k of ["v", "c", "j", "v", "c"]) {
    await page.keyboard.press("g");
    await page.keyboard.press(k);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(800);
}

test.describe("aria-live consistency when toggling prefers-reduced-motion", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("toggling reduced-motion mid-flow does not pollute the live region", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // Start with reduced motion ON.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    await page.evaluate(() => {
      (window as unknown as { __live: string[] }).__live = [];
      const node = document.querySelector('[data-testid="journey-live-region"]');
      if (!node) return;
      new MutationObserver(() => {
        const text = (node.textContent ?? "").trim();
        if (text) (window as unknown as { __live: string[] }).__live.push(text);
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });

    // Phase 1: reduced ON
    await burst(page);
    expect(
      await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    ).toBe(true);

    // Phase 2: switch reduced OFF and burst again.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(
      await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    ).toBe(false);
    await burst(page);

    // Phase 3: back to reduced ON, one more burst.
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    ).toBe(true);
    await burst(page);

    const live = (await page.evaluate(
      () => (window as unknown as { __live: string[] }).__live ?? [],
    )) as string[];

    // No consecutive duplicates across the entire toggle sequence.
    for (let i = 1; i < live.length; i++) {
      expect(
        live[i],
        `consecutive duplicate at index ${i} after reduced-motion toggle: ${live[i]}`,
      ).not.toBe(live[i - 1]);
    }

    // All messages remain in the canonical Jornada format.
    for (const msg of live) {
      expect(msg).toMatch(/Jornada H-2A (atualizada|concluída).*\d+ de \d+/);
    }

    // Sanity cap: 3 bursts × ~1 announcement per debounce window, with margin.
    expect(live.length).toBeLessThanOrEqual(9);
  });
});
