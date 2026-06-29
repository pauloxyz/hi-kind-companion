import { test, expect, type Page } from "@playwright/test";
import {
  attachFailureDiagnostics,
  ensureDrawerClosed,
  fireShortcut,
} from "./_helpers/diagnostics";

/**
 * Rapidly fire G+key shortcuts while the mobile drawer is open and confirm:
 *   1. Escape still closes the drawer at any point
 *   2. Enter on a focused item still activates it
 *   3. Tab order stays trapped inside #app-mobile-sidebar
 *   4. Focus returns to the trigger button when the drawer closes
 *   5. At lg+ viewports the persistent sidebar replaces the drawer (no trigger,
 *      no overlay intercept).
 *
 * Skipped without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

async function bootApp(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key!, json!),
    { key: STORAGE_KEY, json: SESSION_JSON },
  );
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
  await page.waitForLoadState("networkidle").catch(() => {});
}

test.describe("drawer keyboard contract under rapid shortcut bursts", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test.afterEach(async ({ page }, testInfo) => {
    await attachFailureDiagnostics(page, testInfo);
  });

  for (const vp of [
    { label: "360px", w: 360, h: 780, hasDrawer: true },
    { label: "1023px", w: 1023, h: 900, hasDrawer: true },
  ]) {
    test(`@${vp.label} Escape + Enter + focus trap survive rapid G V/C/J bursts`, async ({
      page,
    }) => {
      await bootApp(page, vp.w, vp.h);

      const trigger = page.getByTestId("drawer-trigger");
      await expect(trigger).toBeVisible();
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("button", { name: "Fechar menu" })).toBeFocused();

      // 6 rapid G+key bursts. Drawer may close on navigation; that's OK —
      // we re-open below using a safe path that doesn't race the overlay.
      for (const k of ["v", "c", "j", "v", "c", "j"]) {
        await page.keyboard.press("g");
        await page.keyboard.press(k);
        await page.waitForTimeout(30);
      }

      // If the drawer closed mid-burst, reopen — but ALWAYS guarantee it's
      // closed (overlay detached) before issuing a fresh trigger.click(),
      // otherwise the z-40 dialog intercepts the pointer.
      if (!(await dialog.isVisible().catch(() => false))) {
        await ensureDrawerClosed(page);
        await trigger.click();
        await expect(dialog).toBeVisible();
      }

      // Tab order remains trapped inside the dialog.
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
        const link = document.querySelector(
          '#app-mobile-sidebar a[id^="nav-"]',
        ) as HTMLElement | null;
        link?.focus();
      });
      const beforeUrl = page.url();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeHidden();
      await page.waitForLoadState("domcontentloaded");
      expect(page.url()).not.toBe(beforeUrl);

      // Re-open → Escape closes and returns focus to the trigger, even after
      // a fresh round of shortcut bursts.
      await ensureDrawerClosed(page);
      await trigger.click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press("g");
      await page.keyboard.press("v");
      await page.keyboard.press("g");
      await page.keyboard.press("c");
      if (!(await dialog.isVisible().catch(() => false))) {
        await ensureDrawerClosed(page);
        await trigger.click();
        await expect(dialog).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  }

  test(`@1024px persistent sidebar replaces drawer (no trigger, no overlay)`, async ({ page }) => {
    await bootApp(page, 1024, 900);

    // At lg breakpoint the mobile header (and trigger) is `lg:hidden`.
    await expect(page.getByTestId("drawer-trigger")).toHaveCount(0);
    // The persistent sidebar landmark is visible and there's no z-40 overlay.
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }).first(),
    ).toBeVisible();
    expect(await page.locator("#app-mobile-sidebar").count()).toBe(0);

    // Shortcuts still work without any overlay interception.
    await fireShortcut(page, "v", /\/app\/vagas/);
    await fireShortcut(page, "c", /\/app\/curriculo/);
  });
});
