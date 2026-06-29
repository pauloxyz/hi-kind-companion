import { test, expect } from "@playwright/test";

/**
 * Validates the G+key global shortcut guard: pressing G then V/C/J while the
 * focus is in an editable field MUST NOT navigate or fire the shortcut toast.
 * The positive shortcut path is covered by unit tests in
 * src/lib/sidebar-shortcuts.test.ts; here we only need to assert the guard
 * holds in a real browser, which we can do without an authenticated session
 * by exercising the /auth form inputs.
 */

test("shortcuts do not fire while typing in inputs/textarea", async ({ page }) => {
  await page.goto("/auth");
  const pwd = page.locator('input[type="password"]').first();
  await pwd.waitFor();
  await pwd.focus();

  await page.keyboard.press("g");
  await page.keyboard.press("v");
  await page.keyboard.press("g");
  await page.keyboard.press("c");
  await page.keyboard.press("g");
  await page.keyboard.press("j");

  // Still on /auth — no navigation.
  await expect(page).toHaveURL(/\/auth/);
  // No sonner toast appeared.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  // The typed letters landed in the password field.
  await expect(pwd).toHaveValue("gvgcgj");
});
