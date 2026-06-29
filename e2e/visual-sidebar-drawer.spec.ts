import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression for the sidebar (desktop) and the mobile drawer during
 * rapid phase transitions. We compare against committed baseline screenshots
 * so layout flicker or unexpected announcement grouping shows up as a diff.
 *
 * On first run with `--update-snapshots`, baselines are written. CI runs
 * compare against them. Skipped when there's no Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

// Slightly forgiving threshold so anti-aliasing / font rendering jitter
// across CI runners doesn't cause false failures, while still catching
// real layout shifts.
const VISUAL_OPTS = { maxDiffPixelRatio: 0.02, animations: "disabled" as const };

async function bootSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key!, json!),
    { key: STORAGE_KEY, json: SESSION_JSON },
  );
}

async function rapidPhaseBurst(page: Page) {
  // Fire G V / G C / G J in quick succession to exercise the debounce.
  for (const k of ["v", "c", "j", "v", "c"]) {
    await page.keyboard.press("g");
    await page.keyboard.press(k);
    await page.waitForTimeout(60);
  }
  // Let the debounce window flush.
  await page.waitForTimeout(800);
}

test.describe("visual regression: sidebar + drawer during rapid phase transitions", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("desktop sidebar stays stable across rapid G V/C/J bursts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    const sidebar = page.getByRole("navigation", { name: "Navegação principal" }).first();
    await expect(sidebar).toBeVisible();

    await rapidPhaseBurst(page);

    await expect(sidebar).toHaveScreenshot("sidebar-desktop-after-burst.png", VISUAL_OPTS);
  });

  test("mobile drawer renders consistently after rapid bursts", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("networkidle");

    await rapidPhaseBurst(page);

    await page.getByRole("button", { name: "Abrir menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(dialog).toBeVisible();

    await expect(dialog).toHaveScreenshot("drawer-mobile-after-burst.png", VISUAL_OPTS);
  });
});
