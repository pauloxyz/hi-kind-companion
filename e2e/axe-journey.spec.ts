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

  async function bootSession(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
  }

  test("desktop 1280: persistent sidebar + G J/V/C transitions remain accessible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);

    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");
    // Persistent left sidebar is visible at lg breakpoint.
    await expect(page.getByRole("navigation", { name: "Navegação principal" }).first()).toBeVisible();
    // Aria-live region for the Jornada H-2A is rendered (initially empty).
    await expect(page.getByTestId("journey-live-region")).toBeAttached();
    await expectClean(page, "desktop-app-dashboard");

    await page.keyboard.press("g"); await page.keyboard.press("j");
    await page.waitForURL(/\/app$/);
    await expectClean(page, "desktop-after-g-j");

    await page.keyboard.press("g"); await page.keyboard.press("v");
    await page.waitForURL(/\/app\/vagas/);
    await expectClean(page, "desktop-after-g-v");

    await page.keyboard.press("g"); await page.keyboard.press("c");
    await page.waitForURL(/\/app\/curriculo/);
    await expectClean(page, "desktop-after-g-c");
  });

  test("mobile 360: drawer open after shortcut navigation remains accessible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    await page.keyboard.press("g"); await page.keyboard.press("v");
    await page.waitForURL(/\/app\/vagas/);

    await page.setViewportSize({ width: 360, height: 780 });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await expect(page.getByRole("dialog", { name: "Menu de navegação" })).toBeVisible();
    await expectClean(page, "mobile-drawer-open");
  });
});
