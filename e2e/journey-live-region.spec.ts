import { test, expect } from "@playwright/test";

/**
 * Rapid G+key shortcut bursts must NOT pollute the Jornada H-2A aria-live
 * region — the live region only narrates real journey-state transitions
 * (DS-160 / Entrevista / Visto). Route changes alone are not progress
 * changes, so the polite live region must stay quiet even under a burst.
 *
 * This protects against accidental regressions where someone wires the
 * live region to route changes, badge counts, or any high-frequency signal.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

test.describe("aria-live debounce under rapid shortcut bursts", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");
  test.use({ viewport: { width: 1280, height: 900 } });

  test("rapid G J/V/C bursts emit at most one aggregated announcement per debounce window", async ({ page }) => {
    // Settle any client-side redirects on "/" before evaluating, otherwise
    // the index route navigates mid-evaluate and destroys the context.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle").catch(() => {});

    const live = page.getByTestId("journey-live-region");
    await expect(live).toBeAttached();

    // Track every mutation to the live region across the burst.
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="journey-live-region"]');
      if (!el) return;
      (window as unknown as { __liveMutations: string[] }).__liveMutations = [];
      const obs = new MutationObserver(() => {
        const txt = (el.textContent ?? "").trim();
        (window as unknown as { __liveMutations: string[] }).__liveMutations.push(txt);
      });
      obs.observe(el, { childList: true, characterData: true, subtree: true });
    });

    // Fire ~9 G+key shortcuts as fast as Playwright will allow.
    for (const k of ["j", "v", "c", "j", "v", "c", "j", "v", "c"]) {
      await page.keyboard.press("g");
      await page.keyboard.press(k);
    }
    // Wait two full debounce windows so any pending announcement settles.
    await page.waitForTimeout(1500);

    const mutations = await page.evaluate(
      () => (window as unknown as { __liveMutations: string[] }).__liveMutations ?? [],
    );

    // Route changes alone must not trigger journey announcements. If journey
    // data also moved during the burst (rare), the debouncer guarantees at
    // most one aggregated message per ~600ms window — for ~1.5s that is ≤ 3.
    expect(mutations.length).toBeLessThanOrEqual(3);
    for (const txt of mutations) {
      if (txt.length === 0) continue;
      // Every non-empty announcement must be a full, legible sentence.
      expect(txt).toMatch(/Jornada H-2A (atualizada|concluída):/);
      expect(txt).toMatch(/\d+ de \d+/);
    }
  });
});

/**
 * Same anti-spam contract under `prefers-reduced-motion: reduce`. Reduced
 * motion users rely more heavily on the live region (since they get no
 * visual transition feedback), so any regression that produces duplicate
 * consecutive announcements is doubly disruptive. We assert the dupes
 * guard explicitly here in addition to the well-formedness checks.
 */
test.describe("aria-live debounce under rapid bursts with reduced motion", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");
  test.use({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });

  test("reduced-motion: rapid G J/V/C bursts never emit consecutive duplicates", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Force the media query via emulation so the assertion below is meaningful
    // regardless of the underlying Chromium emulation defaults — `test.use`
    // should already cover this, but emulateMedia() is the authoritative API.
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    ).toBe(true);

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="journey-live-region"]');
      if (!el) return;
      (window as unknown as { __live: string[] }).__live = [];
      new MutationObserver(() => {
        const txt = (el.textContent ?? "").trim();
        if (txt) (window as unknown as { __live: string[] }).__live.push(txt);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    for (const k of ["j", "v", "c", "j", "v", "c", "j", "v", "c"]) {
      await page.keyboard.press("g");
      await page.keyboard.press(k);
    }
    await page.waitForTimeout(1500);

    const live = (await page.evaluate(
      () => (window as unknown as { __live: string[] }).__live ?? [],
    )) as string[];

    // Anti-spam cap (≤ 3 per ~1.5s with a 600ms debounce window).
    expect(live.length).toBeLessThanOrEqual(3);

    // Dedicated guard: no two consecutive announcements may be identical
    // under reduced motion either.
    for (let i = 1; i < live.length; i++) {
      expect(
        live[i],
        `consecutive duplicate at index ${i} under reduced motion: ${JSON.stringify(live)}`,
      ).not.toBe(live[i - 1]);
    }

    // Well-formedness still holds.
    for (const msg of live) {
      expect(msg).toMatch(/Jornada H-2A (atualizada|concluída):/);
      expect(msg).toMatch(/\d+ de \d+/);
    }
  });
});
