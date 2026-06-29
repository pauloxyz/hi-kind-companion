import { test, expect, type Page } from "@playwright/test";

/**
 * Mobile drawer focus trap MUST hold across every viewport below the
 * lg breakpoint (1024px). We parametrize on 360px (phone) and 768px
 * (tablet) — the trigger is `lg:hidden`, so both must surface the same
 * dialog with the same trap behavior.
 *
 * Contract:
 *   1. Pressing Enter on the trigger opens the dialog.
 *   2. Tab/Shift+Tab keep focus inside the dialog (never escape).
 *   3. Escape closes the dialog and restores focus to the trigger.
 *
 * Skipped without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

async function bootSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key!, json!),
    { key: STORAGE_KEY, json: SESSION_JSON },
  );
}

const VIEWPORTS = [
  { label: "360 phone", width: 360, height: 780 },
  // 640px sits just under Tailwind's `sm` breakpoint and well below the
  // drawer's `lg:hidden` threshold (1024px). Covering it guards against
  // regressions where the focus trap depends on a specific mobile width.
  { label: "640 near-breakpoint", width: 640, height: 900 },
  { label: "768 tablet", width: 768, height: 1024 },
  // 1023px is the literal `lg:hidden` boundary: Tailwind's `lg` is
  // `min-width: 1024px`, so the drawer trigger is visible at ≤1023 and
  // hidden at ≥1024. Asserting the trap at the very last px of the mobile
  // regime guards the breakpoint itself — a future tweak that moves the
  // boundary by 1px would surface here first.
  { label: "1023 lg-boundary", width: 1023, height: 900 },
] as const;

test.describe("mobile drawer focus trap across viewports", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  for (const vp of VIEWPORTS) {
    test(`${vp.label} (${vp.width}x${vp.height}): drawer traps Tab/Shift+Tab, Escape restores focus`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await bootSession(page);
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
      await page.waitForLoadState("networkidle").catch(() => {});

      const trigger = page.getByRole("button", { name: "Abrir menu" });
      await expect(trigger, `trigger must be visible at ${vp.width}px`).toBeVisible();
      await trigger.focus();
      await page.keyboard.press("Enter");

      const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
      await expect(dialog).toBeVisible();

      // Confirm initial focus landed inside the dialog (drawer auto-focuses
      // the close button on open).
      const initiallyInside = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        return !!dlg && dlg.contains(document.activeElement);
      });
      expect(initiallyInside, "initial focus must be inside dialog").toBe(true);

      // Tab forward 6 times — every step must stay inside the dialog.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        const inside = await page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"]');
          return !!dlg && dlg.contains(document.activeElement);
        });
        expect(inside, `forward Tab ${i} at ${vp.width}px left the dialog`).toBe(true);
      }

      // Shift+Tab back 6 times — every step must stay inside the dialog.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Shift+Tab");
        const inside = await page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"]');
          return !!dlg && dlg.contains(document.activeElement);
        });
        expect(inside, `reverse Tab ${i} at ${vp.width}px left the dialog`).toBe(true);
      }

      // Escape closes and returns focus to the trigger.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      const focusBackOnTrigger = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return a?.getAttribute("aria-label") === "Abrir menu";
      });
      expect(focusBackOnTrigger, "focus must return to the trigger after Escape").toBe(true);
    });
  }
});
