import { test, expect } from "@playwright/test";

/**
 * Rapidly fire G+key shortcuts while the mobile drawer is open and confirm:
 *   1. Escape still closes the drawer at any point
 *   2. Enter on a focused item still activates it
 *   3. Tab order stays trapped inside #app-mobile-sidebar
 *   4. Focus returns to the trigger button when the drawer closes
 *
 * Skipped without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

test.describe("drawer keyboard contract under rapid shortcut bursts", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");
  test.use({ viewport: { width: 360, height: 780 } });

  test("Escape + Enter + focus trap survive rapid G V/C/J presses while drawer is open", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Fechar menu" })).toBeFocused();

    // Fire 6 rapid G+key bursts. Because focus is inside the drawer (not in
    // an input), the matcher arms, but the shortcut handler runs at window
    // level — it MUST NOT break Escape/Enter or break the trap.
    for (const k of ["v", "c", "j", "v", "c", "j"]) {
      await page.keyboard.press("g");
      await page.keyboard.press(k);
      // After navigation, route may change but the drawer stays open
      // (component remains mounted under AppShell).
    }
    // Drawer is still attached (we re-open if a navigation closed it).
    if (!(await dialog.isVisible())) {
      await trigger.click();
      await expect(dialog).toBeVisible();
    }

    // Tab order remains trapped: 8 tabs all stay inside the dialog.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const d = document.getElementById("app-mobile-sidebar");
        const a = document.activeElement;
        return !!d && !!a && d.contains(a);
      });
      expect(inside, `Tab #${i + 1} escaped the drawer`).toBe(true);
    }

    // Enter on a focused nav link activates it and closes the drawer.
    await page.evaluate(() => {
      const link = document.querySelector('#app-mobile-sidebar a[id^="nav-"]') as HTMLElement | null;
      link?.focus();
    });
    const beforeUrl = page.url();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).not.toBe(beforeUrl);

    // Re-open → Escape closes and returns focus to the trigger, even after
    // a fresh round of shortcut bursts.
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("g"); await page.keyboard.press("v");
    await page.keyboard.press("g"); await page.keyboard.press("c");
    if (!(await dialog.isVisible())) {
      await trigger.click();
      await expect(dialog).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
