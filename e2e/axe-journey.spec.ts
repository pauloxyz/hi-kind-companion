import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { attachFailureDiagnostics, fireShortcut } from "./_helpers/diagnostics";

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

  test.afterEach(async ({ page }, testInfo) => {
    await attachFailureDiagnostics(page, testInfo);
  });

  async function bootSession(page: import("@playwright/test").Page) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
  }

  async function gotoAppReady(page: import("@playwright/test").Page) {
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle").catch(() => {});
  }

  test("desktop 1280: persistent sidebar + G J/V/C transitions remain accessible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await gotoAppReady(page);

    await expect(page.getByRole("navigation", { name: "Navegação principal" }).first()).toBeVisible();
    await expect(page.getByTestId("journey-live-region")).toBeAttached();
    await expectClean(page, "desktop-app-dashboard");

    await fireShortcut(page, "j", /\/app$/);
    await expectClean(page, "desktop-after-g-j");

    await fireShortcut(page, "v", /\/app\/vagas/);
    await expectClean(page, "desktop-after-g-v");

    await fireShortcut(page, "c", /\/app\/curriculo/);
    await expectClean(page, "desktop-after-g-c");
  });

  test("tablet 768: drawer + Jornada H-2A após alternar fases", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await gotoAppReady(page);

    // Switch to tablet width before exercising the navigation.
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(120);

    await fireShortcut(page, "j", /\/app$/);
    await expectClean(page, "tablet-after-g-j");

    await fireShortcut(page, "v", /\/app\/vagas/);
    await expectClean(page, "tablet-after-g-v");

    await fireShortcut(page, "c", /\/app\/curriculo/);
    await expectClean(page, "tablet-after-g-c");

    const trigger = page.getByTestId("drawer-trigger");
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await expect(page.getByRole("dialog", { name: "Menu de navegação" })).toBeVisible();
      await expectClean(page, "tablet-drawer-open");
    }
  });

  test("mobile 360: drawer open after shortcut navigation remains accessible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await gotoAppReady(page);

    await fireShortcut(page, "v", /\/app\/vagas/);

    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(120);
    await page.getByTestId("drawer-trigger").click();
    await expect(page.getByRole("dialog", { name: "Menu de navegação" })).toBeVisible();
    await expectClean(page, "mobile-drawer-open");
  });
});
