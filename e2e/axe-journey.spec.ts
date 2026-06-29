import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Axe scan after navigating between Jornada H-2A sections via keyboard
 * shortcuts (G J → G V → G C). Catches regressions introduced by the
 * sidebar / shortcut flow on authenticated routes.
 *
 * Skipped when no Supabase session is injected (the standard CI run).
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

const SCAN_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectClean(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(SCAN_TAGS).analyze();
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  if (critical.length > 0) {
    console.error(
      `[axe ${label}]`,
      JSON.stringify(
        critical.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        null,
        2,
      ),
    );
  }
  expect(critical, `axe critical/serious violations on ${label}`).toEqual([]);
}

test.describe("axe scan across Jornada H-2A shortcut navigation", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("sidebar + G J/V/C transitions remain accessible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );

    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");
    await expectClean(page, "app-dashboard");

    // G J → Jornada/dashboard
    await page.keyboard.press("g");
    await page.keyboard.press("j");
    await page.waitForURL(/\/app$/);
    await expectClean(page, "after-g-j");

    // G V → Vagas
    await page.keyboard.press("g");
    await page.keyboard.press("v");
    await page.waitForURL(/\/app\/vagas/);
    await expectClean(page, "after-g-v");

    // G C → Currículo
    await page.keyboard.press("g");
    await page.keyboard.press("c");
    await page.waitForURL(/\/app\/curriculo/);
    await expectClean(page, "after-g-c");

    // Mobile drawer at 360 wide after navigation
    await page.setViewportSize({ width: 360, height: 780 });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.getByRole("dialog", { name: "Menu de navegação" })).toBeVisible();
    await expectClean(page, "mobile-drawer-open");
  });
});
