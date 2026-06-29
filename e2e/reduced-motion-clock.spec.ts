import { test, expect, type Page } from "@playwright/test";

/**
 * Clock-controlled variant of the prefers-reduced-motion aria-live test.
 *
 * Instead of relying on real-time `waitForTimeout`s (which makes the
 * announcement cap timing-dependent and flaky in CI), we install
 * Playwright's deterministic clock and advance it by exact debounce
 * windows. This proves the cap holds purely from the debounce math, not
 * from CI scheduler luck.
 *
 * Skipped without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

const DEBOUNCE_MS = 600;

test.use({ reducedMotion: "reduce" });

async function bootWithFrozenClock(page: Page) {
  // Install the synthetic clock BEFORE any app code runs. `page.clock.install`
  // freezes Date.now / performance.now / setTimeout for every script the page
  // loads after this point.
  await page.clock.install({ time: new Date("2026-06-29T12:00:00Z") });
  await page.goto("/");
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key!, json!),
    { key: STORAGE_KEY, json: SESSION_JSON },
  );
}

test.describe("prefers-reduced-motion aria-live with frozen clock", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("debounce cap holds deterministically across rapid bursts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootWithFrozenClock(page);
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    await page.evaluate(() => {
      (window as unknown as { __live: string[] }).__live = [];
      const node = document.querySelector('[data-testid="journey-live-region"]');
      if (!node) return;
      new MutationObserver(() => {
        const text = (node.textContent ?? "").trim();
        if (text) (window as unknown as { __live: string[] }).__live.push(text);
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });

    // Three bursts, each followed by a clock advance past the debounce window.
    // Because the clock is frozen between advances, the debouncer cannot fire
    // multiple times per burst no matter how many shortcuts we send.
    for (let burst = 0; burst < 3; burst++) {
      for (const k of ["v", "c", "j", "v", "c", "j"]) {
        await page.keyboard.press("g");
        await page.keyboard.press(k);
      }
      // Advance just past the debounce window so exactly one emit can flush.
      await page.clock.runFor(DEBOUNCE_MS + 50);
    }

    const live = (await page.evaluate(
      () => (window as unknown as { __live: string[] }).__live ?? [],
    )) as string[];

    // Strict bound: at most one announcement per advanced debounce window.
    expect(live.length, `expected ≤ 3 announcements, got ${live.length}`).toBeLessThanOrEqual(3);

    // No consecutive duplicates.
    for (let i = 1; i < live.length; i++) {
      expect(live[i]).not.toBe(live[i - 1]);
    }

    // All messages match the canonical Jornada format.
    for (const msg of live) {
      expect(msg).toMatch(/Jornada H-2A (atualizada|concluída).*\d+ de \d+/);
    }
  });
});
