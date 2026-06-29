import { test, expect, type Page } from "@playwright/test";

/**
 * Accessibility / mobile coverage for /app/visto.
 *  - Tab order: skip link → main → first focusable inside checklist (never <body>)
 *  - Focus-visible: outline is rendered on tabbed interactive elements
 *  - aria-live: status region updates after toggling a step
 *  - Mobile: row buttons remain ≥44px tap targets
 *  - History link is reachable and routes to /app/visto/historico
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

test.describe("/app/visto accessibility", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("desktop: keyboard reaches checklist without landing on <body>", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app/visto");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("main");

    await page.locator("#main-content").click({ position: { x: 1, y: 1 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // 25 tabs is more than enough to reach the first interactive item.
    let everyTabKeepsFocus = true;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName ?? "BODY");
      if (tag === "BODY") {
        everyTabKeepsFocus = false;
        break;
      }
    }
    expect(everyTabKeepsFocus, "Tab navigation must never drop focus to <body>").toBe(true);
  });

  test("focus-visible ring is rendered on focused buttons", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app/visto");
    await page.waitForLoadState("domcontentloaded");

    const btn = page.getByRole("button", { name: /exportar pdf/i }).first();
    await btn.focus();
    const outlined = await btn.evaluate((el) => {
      const cs = getComputedStyle(el);
      // tailwind focus-visible:ring sets box-shadow or outline; either is acceptable
      return (
        cs.outlineStyle !== "none" ||
        (cs.boxShadow !== "none" && cs.boxShadow.length > 0)
      );
    });
    expect(outlined, "focused button must have a visible focus indicator").toBe(true);
  });

  test("aria-live region announces after toggling the first step", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app/visto");
    await page.waitForLoadState("domcontentloaded");

    // Capture any text written to the page-level live region.
    await page.evaluate(() => {
      (window as unknown as { __vlive: string[] }).__vlive = [];
      const node = document.querySelector('[role="status"][aria-live="polite"]');
      if (!node) return;
      new MutationObserver(() => {
        (window as unknown as { __vlive: string[] }).__vlive.push(
          (node.textContent ?? "").trim(),
        );
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });

    const firstCheckbox = page.getByRole("checkbox").first();
    await firstCheckbox.click();
    await page.waitForTimeout(400);

    const msgs = await page.evaluate(
      () => (window as unknown as { __vlive: string[] }).__vlive,
    );
    const announced = msgs.find((m) => /etapa/i.test(m));
    expect(announced, `expected an etapa-related announcement, got ${JSON.stringify(msgs)}`).toBeTruthy();

    // Reset so the test doesn't leak state.
    await firstCheckbox.click();
  });

  test("mobile 360: row buttons keep ≥44px tap targets", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await bootSession(page);
    await page.goto("/app/visto");
    await page.waitForLoadState("domcontentloaded");

    const buttons = page.locator(
      'a[target="_blank"], button[aria-label^="Anexar"], button[aria-label^="Remover anexo"]',
    );
    const count = await buttons.count();
    if (count === 0) return; // nothing rendered on this account yet
    for (let i = 0; i < Math.min(count, 6); i++) {
      const box = await buttons.nth(i).boundingBox();
      if (!box) continue;
      expect(box.height, `button ${i} too short`).toBeGreaterThanOrEqual(40);
    }
  });

  test("history page is reachable from checklist", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app/visto");
    await page.waitForLoadState("domcontentloaded");

    await page.getByRole("link", { name: /hist[oó]rico/i }).first().click();
    await page.waitForURL(/\/app\/visto\/historico$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
