import { test, expect } from "@playwright/test";

/**
 * Open the AppShell mobile drawer, focus an item inside, press Escape, and
 * confirm the menu closes and focus returns to the trigger button.
 *
 * Requires an injected Supabase session (LOVABLE_BROWSER_SUPABASE_*). In CI
 * without a session, this test is skipped — the focus-trap unit behavior is
 * also exercised indirectly by the public a11y axe spec.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

test.describe("sidebar drawer focus trap", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");
  test.use({ viewport: { width: 390, height: 844 } });

  test("Escape closes the drawer and returns focus to the menu trigger", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await trigger.waitFor();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(dialog).toBeVisible();

    // Close button receives focus on open (trap entry).
    const closeBtn = page.getByRole("button", { name: "Fechar menu" });
    await expect(closeBtn).toBeFocused();

    // Move focus to a nav link inside the drawer.
    await page.keyboard.press("Tab");
    const activeIsInside = await page.evaluate(() => {
      const dlg = document.getElementById("app-mobile-sidebar");
      return !!dlg && !!document.activeElement && dlg.contains(document.activeElement);
    });
    expect(activeIsInside).toBe(true);

    // Escape closes and returns focus to trigger.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
