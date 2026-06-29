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

  /**
   * At exactly 1023px, capture the forward Tab sequence inside the drawer
   * and assert Shift+Tab walks it back in reverse. This is stronger than
   * the "every step stays inside" check above: a buggy trap could keep
   * focus inside the dialog but cycle through items in the wrong order.
   * Catching that requires comparing the two sequences element-by-element.
   */
  test("1023 lg-boundary: forward Tab order is exactly mirrored by Shift+Tab (no trap leak)", async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 900 });
    await bootSession(page);
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle").catch(() => {});

    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(dialog).toBeVisible();

    // Identifies the focused element by something stable across renders.
    const keyOfFocused = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        return (
          el.id ||
          el.getAttribute("data-testid") ||
          el.getAttribute("aria-label") ||
          (el.textContent ?? "").trim().slice(0, 40) ||
          el.tagName
        );
      });
    const isInsideDialog = () =>
      page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        return !!dlg && dlg.contains(document.activeElement);
      });

    // Walk forward N steps, recording the focus key at each step. The
    // initial focused element (auto-focused on open) is index 0.
    const STEPS = 5;
    const forward: (string | null)[] = [await keyOfFocused()];
    for (let i = 0; i < STEPS; i++) {
      await page.keyboard.press("Tab");
      expect(await isInsideDialog(), `forward Tab ${i} leaked outside dialog at 1023px`).toBe(true);
      forward.push(await keyOfFocused());
    }

    // Sanity: we actually moved through several distinct items, not the
    // same element each press (which would also satisfy "still inside").
    const distinctForward = new Set(forward.filter(Boolean));
    expect(distinctForward.size, `forward walk visited only ${distinctForward.size} distinct items`).toBeGreaterThanOrEqual(3);

    // Walk Shift+Tab back the same number of steps and check the sequence
    // is the exact reverse of the forward walk.
    const reverse: (string | null)[] = [forward[forward.length - 1]];
    for (let i = 0; i < STEPS; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await isInsideDialog(), `reverse Tab ${i} leaked outside dialog at 1023px`).toBe(true);
      reverse.push(await keyOfFocused());
    }

    const expectedReverse = [...forward].reverse();
    expect(
      reverse,
      `Shift+Tab order mismatch at 1023px.\n  forward:  ${JSON.stringify(forward)}\n  reverse:  ${JSON.stringify(reverse)}\n  expected: ${JSON.stringify(expectedReverse)}`,
    ).toEqual(expectedReverse);
  });
});

/**
 * Sibling describe — at exactly 1024px the `lg:hidden` trigger disappears
 * and the persistent sidebar takes over. The mobile focus trap MUST NOT
 * apply: there is no dialog to trap into, Tab from the sidebar should
 * flow naturally into the main content, and aria-modal should be absent.
 */
test.describe("desktop layout at lg boundary (1024px) — no mobile trap", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("1024px: drawer trigger is hidden, persistent sidebar exposes nav, Tab flows into main", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await bootSession(page);
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // 1) The mobile trigger is `lg:hidden` and must NOT render at 1024px.
    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await expect(trigger, "mobile drawer trigger must be hidden at 1024px").toBeHidden();

    // 2) No aria-modal dialog should be present — the mobile drawer trap
    //    only exists when the drawer is mounted, which it must not be here.
    const modalCount = await page.locator('[role="dialog"][aria-modal="true"]').count();
    expect(modalCount, "no mobile-style aria-modal dialog allowed at 1024px").toBe(0);

    // 3) The persistent sidebar surfaces the primary nav links directly.
    const dashboardLink = page.locator("#nav-dashboard").first();
    await expect(dashboardLink).toBeVisible();

    // 4) Focusing a sidebar link and Tabbing forward must keep focus on
    //    visible, real elements — never on <body> (which would mean the
    //    focus left the document entirely) — AND must visit several
    //    distinct elements rather than recycling between the same few
    //    items, which is the tell-tale sign of a mobile-style focus trap
    //    accidentally engaging at desktop widths.
    await dashboardLink.focus();
    const visited: string[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return {
          tag: el?.tagName ?? null,
          key:
            el?.id ||
            el?.getAttribute("data-testid") ||
            el?.getAttribute("aria-label") ||
            (el?.textContent ?? "").trim().slice(0, 40) ||
            el?.tagName ||
            null,
        };
      });
      expect(info.tag, `Tab ${i} dropped focus onto <body> at 1024px`).not.toBe("BODY");
      if (info.key) visited.push(info.key);
    }
    const distinct = new Set(visited);
    // A real trap-free desktop layout walks through many distinct
    // tabbables. A mobile-style trap would cycle through ~3-5 items.
    expect(
      distinct.size,
      `Tab walk visited only ${distinct.size} distinct elements at 1024px — looks like a focus trap is engaged: ${JSON.stringify([...distinct])}`,
    ).toBeGreaterThanOrEqual(6);
  });
});
});
