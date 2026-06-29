import { test, expect } from "@playwright/test";

/**
 * Tab order and keyboard behavior (Escape/Enter) inside the sidebar on
 * desktop, and inside the drawer on mobile, after navigating via shortcuts.
 *
 * Skipped without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

test.describe("sidebar tab order + Escape/Enter", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  async function boot(page: import("@playwright/test").Page, w: number, h: number) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");
    // Navigate via shortcut so we're explicitly past a phase change.
    await page.keyboard.press("g"); await page.keyboard.press("v");
    await page.waitForURL(/\/app\/vagas/);
  }

  test("desktop 1280: Tab cycles through the persistent sidebar in DOM order; Enter activates a link", async ({ page }) => {
    await boot(page, 1280, 900);

    // Focus the skip link first (always the first focusable element).
    await page.keyboard.press("Tab");
    const skipFocused = await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.textContent?.includes("Pular para o conteúdo"),
    );
    expect(skipFocused).toBe(true);

    // Tab into the sidebar logo → first nav link.
    const seenIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.id ?? null,
      );
      if (id && id.startsWith("nav-")) seenIds.push(id);
      if (seenIds.length >= 3) break;
    }
    expect(seenIds.length).toBeGreaterThanOrEqual(2);

    // Activate the currently focused nav link with Enter.
    const beforeUrl = page.url();
    await page.keyboard.press("Enter");
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).not.toBe(beforeUrl);
  });

  test("mobile 360: Escape closes the drawer; Tab traps inside it; Enter activates focused item", async ({ page }) => {
    await boot(page, 360, 780);

    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(dialog).toBeVisible();

    // Close button is auto-focused on open.
    await expect(page.getByRole("button", { name: "Fechar menu" })).toBeFocused();

    // Tab a few times — focus must stay inside the dialog.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const d = document.getElementById("app-mobile-sidebar");
        const a = document.activeElement;
        return !!d && !!a && d.contains(a);
      });
      expect(inside).toBe(true);
    }

    // Enter on a nav link inside the drawer activates it and closes the menu.
    await page.evaluate(() => {
      const link = document.querySelector('#app-mobile-sidebar a[id^="nav-"]') as HTMLElement | null;
      link?.focus();
    });
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();

    // Re-open and Escape closes + returns focus to trigger.
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
