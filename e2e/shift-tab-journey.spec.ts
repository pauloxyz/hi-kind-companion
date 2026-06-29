import { test, expect, type Page } from "@playwright/test";

/**
 * Reverse keyboard navigation: Shift+Tab walks focus backwards through the
 * Jornada H-2A surfaces. Validates that Enter activates the focused control,
 * Escape closes the drawer and restores focus to its trigger, and the
 * aria-live region never emits the same message twice in a row.
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

async function installLiveObserver(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __live: string[] }).__live = [];
    const node = document.querySelector('[data-testid="journey-live-region"]');
    if (!node) return;
    new MutationObserver(() => {
      const text = (node.textContent ?? "").trim();
      if (text) (window as unknown as { __live: string[] }).__live.push(text);
    }).observe(node, { childList: true, characterData: true, subtree: true });
  });
}

async function readLive(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __live: string[] }).__live ?? [],
  );
}

test.describe("Shift+Tab reverse navigation on Jornada H-2A", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("desktop 1280: Shift+Tab walks back, Enter activates, aria-live stays unique", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");
    await installLiveObserver(page);

    // Move forward a few times, then reverse.
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    const forwardEl = await page.evaluate(() => (document.activeElement as HTMLElement)?.outerHTML ?? "");
    expect(forwardEl).not.toBe("");

    // Shift+Tab back through the same chain — focus must always be a real element.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName ?? null);
      expect(tag, `step ${i}`).not.toBe("BODY");
    }

    // Tab forward into the Jornada link and activate it.
    for (let i = 0; i < 20; i++) {
      const onJornada = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return !!el && /jornada/i.test(el.textContent ?? el.getAttribute("aria-label") ?? "");
      });
      if (onJornada) break;
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/app(\/visto)?$/);

    // aria-live: no consecutive duplicates.
    const live = await readLive(page);
    for (let i = 1; i < live.length; i++) {
      expect(live[i]).not.toBe(live[i - 1]);
    }
  });

  test("mobile 360: Shift+Tab inside drawer stays trapped, Escape returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(dialog).toBeVisible();

    // Tab forward then Shift+Tab back — both must stay inside the dialog.
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+Tab");
      const inside = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        return !!dlg && dlg.contains(document.activeElement);
      });
      expect(inside, `shift+tab step ${i}`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const back = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && /abrir menu/i.test(el.getAttribute("aria-label") ?? el.textContent ?? "");
    });
    expect(back).toBe(true);
  });
});
