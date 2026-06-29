import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility regression scan via axe-core for the public surface.
 * Authenticated routes (AppShell sidebar, Jornada H-2A) cannot be reached
 * here without an injected Supabase session, so we scan what is reachable
 * and tag the run so future CI work can extend it without rewriting setup.
 */

const SCAN_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(SCAN_TAGS).analyze();
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  if (critical.length > 0) {
    console.error(
      `[axe ${label}] critical violations:`,
      JSON.stringify(
        critical.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        null,
        2,
      ),
    );
  }
  expect(critical, `axe critical/serious violations on ${label}`).toEqual([]);
}

test.describe("a11y axe scan", () => {
  test("landing page (desktop) has no critical axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await scan(page, "landing-desktop");
  });

  test("landing page (mobile 360) has no critical axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await scan(page, "landing-mobile");
  });

  test("/auth page (mobile 360) has no critical axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/auth");
    await page.locator('input[type="password"]').first().waitFor();
    await scan(page, "auth-mobile");
  });
});
