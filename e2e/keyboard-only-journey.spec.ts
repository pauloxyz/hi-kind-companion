import { test, expect, type Page } from "@playwright/test";

/**
 * Keyboard-only walkthrough of the Jornada H-2A. The user never touches the
 * mouse: Tab/Shift+Tab to move focus, Enter to activate, Escape to close the
 * drawer. We validate:
 *  - focus is always on a visible, focusable element (never <body>);
 *  - the mobile drawer closes on Escape and restores focus to its trigger;
 *  - the aria-live region stays consistent (no duplicate messages back-to-back).
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

async function focusedTag(page: Page) {
  return page.evaluate(() => document.activeElement?.tagName ?? null);
}

async function tabUntil(page: Page, predicate: () => Promise<boolean>, max = 25) {
  for (let i = 0; i < max; i++) {
    if (await predicate()) return true;
    await page.keyboard.press("Tab");
  }
  return false;
}

test.describe("keyboard-only Jornada H-2A walkthrough", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("desktop 1280: Tab/Enter navigates Jornada without losing focus", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    // Track aria-live mutations to assert consistency at the end.
    await page.evaluate(() => {
      (window as unknown as { __live: string[] }).__live = [];
      const node = document.querySelector('[data-testid="journey-live-region"]');
      if (!node) return;
      new MutationObserver(() => {
        (window as unknown as { __live: string[] }).__live.push(
          (node.textContent ?? "").trim(),
        );
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });

    // Tab into the navigation and Enter on the Visto / Jornada H-2A link
    // (sidebar id "nav-visto", label "Visto").
    const reachedTarget = await tabUntil(page, async () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return false;
        const txt = (el.textContent ?? "").trim().toLowerCase();
        const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
        return el.id === "nav-visto" || /visto|jornada/.test(txt) || /visto|jornada/.test(aria);
      }),
    );
    expect(reachedTarget).toBe(true);
    expect(await focusedTag(page)).not.toBe("BODY");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/app\/visto/);

    // Focus must remain on a real element after route change.
    expect(await focusedTag(page)).not.toBe("BODY");

    // aria-live messages should never repeat consecutively.
    const live = await page.evaluate(
      () => (window as unknown as { __live: string[] }).__live,
    );
    for (let i = 1; i < live.length; i++) {
      expect(live[i]).not.toBe(live[i - 1]);
    }
  });

  test("mobile 360: Escape closes drawer and returns focus to trigger", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(dialog).toBeVisible();

    // Tab once inside the drawer — focus must stay inside the dialog.
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return !!dlg && dlg.contains(document.activeElement);
    });
    expect(inside).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const triggerFocused = await page.evaluate(() => {
      const btn = document.activeElement as HTMLElement | null;
      return !!btn && /abrir menu/i.test(btn.getAttribute("aria-label") ?? btn.textContent ?? "");
    });
    expect(triggerFocused).toBe(true);
  });
});
