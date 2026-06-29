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

// Debounce window used by JourneyLiveRegion (keep aligned with the source).
const DEBOUNCE_MS = 600;
// 5 burst transitions over ~300ms + 800ms drain = ~1.1s total → at most
// ceil(1100 / 600) + 1 = 3 distinct announcements. Cap a bit higher to absorb
// CI jitter without masking real regressions.
const MAX_ANNOUNCEMENTS_PER_BURST = 4;

async function bootSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
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

  test("aria-live: rapid bursts produce no duplicate consecutive messages and respect per-transition cap", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
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

    // Run two independent bursts to assert the per-transition cap.
    const counts: number[] = [];
    for (let i = 0; i < 2; i++) {
      const before = (await page.evaluate(
        () => (window as unknown as { __live: string[] }).__live?.length ?? 0,
      )) as number;
      await rapidPhaseBurst(page);
      // Drain another debounce window so any pending emit lands before counting.
      await page.waitForTimeout(DEBOUNCE_MS + 100);
      const after = (await page.evaluate(
        () => (window as unknown as { __live: string[] }).__live?.length ?? 0,
      )) as number;
      counts.push(after - before);
    }

    const live = (await page.evaluate(
      () => (window as unknown as { __live: string[] }).__live ?? [],
    )) as string[];

    // 1) No consecutive duplicates anywhere in the stream.
    for (let i = 1; i < live.length; i++) {
      expect(live[i], `consecutive duplicate at index ${i}: ${live[i]}`).not.toBe(live[i - 1]);
    }

    // 2) Each burst respects the debounce-derived cap.
    counts.forEach((c, idx) => {
      expect(
        c,
        `burst ${idx} emitted ${c} messages; cap is ${MAX_ANNOUNCEMENTS_PER_BURST}`,
      ).toBeLessThanOrEqual(MAX_ANNOUNCEMENTS_PER_BURST);
    });

    // 3) Every emitted message matches the canonical Jornada H-2A format.
    for (const msg of live) {
      expect(msg).toMatch(/Jornada H-2A (atualizada|concluída).*\d+ de \d+/);
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
