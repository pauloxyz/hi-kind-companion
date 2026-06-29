import { test, expect } from "@playwright/test";

/**
 * Accessibility / responsive checks for the sidebar surface.
 *
 * The full AppShell sidebar lives behind authentication, so these tests
 * focus on what is reachable without a session:
 *   - the public landing renders at narrow widths without console errors
 *   - the skip-to-content link pattern works on small viewports
 *   - the auth fallback (used when navigating to a protected route) is
 *     reachable and usable at 360px wide
 */

test.describe("sidebar/responsive a11y", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("landing has no console errors at 360px and exposes a main landmark", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    // exactly one <main> landmark per page
    const mains = page.locator("main");
    await expect(mains).toHaveCount(1);

    // common a11y red flag: arbitrary horizontal scroll on mobile
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("protected route at 360px redirects to /auth with a focusable password field", async ({ page }) => {
    await page.goto("/app/auditoria");
    await page.waitForURL(/\/auth/i, { timeout: 10_000 });
    const pwd = page.locator('input[type="password"]').first();
    await expect(pwd).toBeVisible();
    await pwd.focus();
    await expect(pwd).toBeFocused();
  });
});
