import { test, expect, type Page } from "@playwright/test";

/**
 * G+letter global shortcuts must navigate to /app/vagas, /app/curriculo and
 * /app (jornada) on every supported viewport: mobile (360px), tablet
 * boundary (1023px) and desktop (1024px).
 *
 * Skipped in CI without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

const VIEWPORTS: { label: string; width: number; height: number }[] = [
  { label: "360px", width: 360, height: 780 },
  { label: "1023px", width: 1023, height: 900 },
  { label: "1024px", width: 1024, height: 900 },
];

const COMBOS: { key: string; urlRe: RegExp; label: string }[] = [
  { key: "v", urlRe: /\/app\/vagas/, label: "Vagas" },
  { key: "c", urlRe: /\/app\/curriculo/, label: "Currículo" },
  { key: "j", urlRe: /\/app(\?|$)/, label: "Jornada" },
];

async function bootSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key!, json!),
    { key: STORAGE_KEY, json: SESSION_JSON },
  );
}

test.describe("G+letter shortcuts navigate across viewports", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  for (const vp of VIEWPORTS) {
    for (const combo of COMBOS) {
      test(`@${vp.label} G+${combo.key.toUpperCase()} → ${combo.label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await bootSession(page);
        await page.goto("/app", { waitUntil: "domcontentloaded" });
        await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
        await page.waitForLoadState("networkidle").catch(() => {});

        // Ensure focus is not in an editable surface (would block the matcher).
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

        await page.keyboard.press("g");
        await page.keyboard.press(combo.key);
        await page.waitForURL(combo.urlRe, { timeout: 4_000 });
        expect(page.url()).toMatch(combo.urlRe);
      });
    }
  }
});
