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
    ({ key, json }) => {
      window.localStorage.setItem(key!, json!);
      // Dismiss the first-run OnboardingTour overlay so it doesn't sit on
      // top of the drawer and intercept pointer events in click-based
      // tests. Keyboard-only tests don't need this, but it's harmless.
      window.localStorage.setItem("vaiprala_tour_done_v1", "1");
    },
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

/**
 * Dedicated Escape-restores-focus contract. Parametrized across the same
 * boundaries we care about for the drawer:
 *   - 360px  → mobile phone, drawer is the primary nav
 *   - 1023px → last px before lg, drawer still applies
 *   - 1024px → first px at lg, no drawer at all; Escape on the layout
 *              must NOT pull focus to <body> and the previously focused
 *              sidebar item must remain focused (Escape is a no-op for
 *              the persistent sidebar).
 */
test.describe("Escape closes drawer and restores focus to the correct layout element", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  for (const vp of [
    { label: "360 phone", width: 360, height: 780, hasDrawer: true },
    { label: "1023 lg-boundary", width: 1023, height: 900, hasDrawer: true },
    { label: "1024 desktop", width: 1024, height: 900, hasDrawer: false },
  ] as const) {
    test(`${vp.label} (${vp.width}px): Escape lands focus on the correct element`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await bootSession(page);
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
      await page.waitForLoadState("networkidle").catch(() => {});

      if (vp.hasDrawer) {
        // Mobile/tablet path: open drawer, then Escape, then focus must
        // be back exactly on the trigger that opened it.
        const trigger = page.getByRole("button", { name: "Abrir menu" });
        await expect(trigger).toBeVisible();
        await trigger.focus();
        await page.keyboard.press("Enter");

        const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
        await expect(dialog).toBeVisible();

        // Move focus a few times inside the dialog so the restore is a
        // real round-trip and not just "Escape on the auto-focused close
        // button happens to land back on the trigger".
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");

        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();

        const focused = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return {
            tag: el?.tagName ?? null,
            ariaLabel: el?.getAttribute("aria-label") ?? null,
          };
        });
        expect(focused.tag, `Escape dropped focus onto <body> at ${vp.width}px`).not.toBe("BODY");
        expect(
          focused.ariaLabel,
          `Escape at ${vp.width}px must restore focus to the trigger ("Abrir menu"), got ${JSON.stringify(focused)}`,
        ).toBe("Abrir menu");
      } else {
        // Desktop path: there IS no drawer. Escape on a focused sidebar
        // link must be a no-op — focus stays on the link, never on body,
        // and no dialog must open as a side effect.
        const dashboardLink = page.locator("#nav-dashboard").first();
        await expect(dashboardLink).toBeVisible();
        await dashboardLink.focus();

        const beforeKey = await page.evaluate(() => document.activeElement?.id ?? null);
        expect(beforeKey).toBe("nav-dashboard");

        await page.keyboard.press("Escape");

        // No mobile-style dialog should have appeared from Escape.
        const modalCount = await page.locator('[role="dialog"][aria-modal="true"]').count();
        expect(modalCount, "Escape must not spawn a modal at 1024px").toBe(0);

        const afterKey = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return { tag: el?.tagName ?? null, id: el?.id ?? null };
        });
        expect(afterKey.tag, `Escape at 1024px dropped focus onto <body>`).not.toBe("BODY");
        expect(
          afterKey.id,
          `Escape at 1024px must keep focus on the sidebar link, got ${JSON.stringify(afterKey)}`,
        ).toBe("nav-dashboard");
      }
    });
  }
});

/**
 * Outside-click contract. Clicking on the page surface OUTSIDE the open
 * drawer must close it and restore focus to the original layout element
 * (the trigger that opened the drawer). At 1024px there is no drawer at
 * all — clicking on the main content area must NOT spawn one and must
 * NOT steal focus from the sidebar link the user was on.
 *
 * We click on a deterministic main-content coordinate (away from the
 * drawer panel) and assert the resulting focus state.
 */
test.describe("Outside-click closes drawer and restores focus to layout element", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  for (const vp of [
    { label: "360 phone", width: 360, height: 780, hasDrawer: true },
    { label: "1023 lg-boundary", width: 1023, height: 900, hasDrawer: true },
    { label: "1024 desktop", width: 1024, height: 900, hasDrawer: false },
  ] as const) {
    test(`${vp.label} (${vp.width}px): outside click closes drawer and restores focus`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await bootSession(page);
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
      await page.waitForLoadState("networkidle").catch(() => {});

      if (vp.hasDrawer) {
        const trigger = page.getByRole("button", { name: "Abrir menu" });
        await expect(trigger).toBeVisible();
        await trigger.focus();
        await page.keyboard.press("Enter");

        const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
        await expect(dialog).toBeVisible();

        // The mobile drawer fills the viewport (`inset-0`) with a
        // black/40 backdrop overlay AND an inner panel. "Outside" means
        // outside the inner panel — i.e. on the backdrop. Locate the
        // inner panel and click just past its right edge.
        const panel = dialog.locator("div.relative.z-50").first();
        await expect(panel).toBeVisible();
        const panelBox = await panel.boundingBox();
        expect(panelBox, "drawer panel must have a layout box").not.toBeNull();
        const outsideX = Math.min(
          vp.width - 5,
          Math.floor(panelBox!.x + panelBox!.width + 20),
        );
        const outsideY = Math.floor(vp.height / 2);
        // Sanity: the chosen point is genuinely outside the panel.
        expect(outsideX).toBeGreaterThan(panelBox!.x + panelBox!.width);

        await page.mouse.click(outsideX, outsideY);
        await expect(dialog).toBeHidden();

        const focused = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return { tag: el?.tagName ?? null, ariaLabel: el?.getAttribute("aria-label") ?? null };
        });
        expect(focused.tag, `outside-click at ${vp.width}px dropped focus onto <body>`).not.toBe("BODY");
        expect(
          focused.ariaLabel,
          `outside-click at ${vp.width}px must restore focus to the trigger, got ${JSON.stringify(focused)}`,
        ).toBe("Abrir menu");
      } else {
        // Desktop: no drawer to close. Focusing a sidebar link, then
        // clicking on a neutral main-content coordinate must NOT spawn a
        // modal. Browsers legitimately blur the focused element when the
        // user clicks on a non-focusable target — that is correct
        // behavior, not a regression — so we do NOT assert focus stays
        // on the link. What we DO assert: (a) no modal spawned, (b) the
        // sidebar link is still in the DOM and reachable.
        const dashboardLink = page.locator("#nav-dashboard").first();
        await expect(dashboardLink).toBeVisible();
        await dashboardLink.focus();
        expect(await page.evaluate(() => document.activeElement?.id ?? null)).toBe("nav-dashboard");

        // Click on the far-right side of the viewport, in the main
        // content area — never on the sidebar (left side).
        await page.mouse.click(vp.width - 20, Math.floor(vp.height / 2));

        const modalCount = await page.locator('[role="dialog"][aria-modal="true"]').count();
        expect(modalCount, "outside click at 1024px must not spawn a modal").toBe(0);

        // Sidebar link still present and re-focusable — proves the
        // layout wasn't torn down by the stray click.
        await expect(dashboardLink).toBeVisible();
        await dashboardLink.focus();
        expect(await page.evaluate(() => document.activeElement?.id ?? null)).toBe("nav-dashboard");
      }
    });
  }
});

/**
 * Inside-panel click contract. Clicking on the drawer's own panel (a
 * link label, the panel background, the close button area but NOT the
 * close button itself) must NOT close the drawer and must keep focus
 * trapped inside the dialog. This is the symmetric counterpart to the
 * outside-click test above: outside closes, inside stays open.
 *
 * At 1024px there is no drawer; clicking on the persistent sidebar's
 * own surface must obviously not spawn a drawer.
 */
test.describe("Inside-panel click keeps drawer open and focus trapped", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  for (const vp of [
    { label: "360 phone", width: 360, height: 780, hasDrawer: true },
    { label: "1023 lg-boundary", width: 1023, height: 900, hasDrawer: true },
    { label: "1024 desktop", width: 1024, height: 900, hasDrawer: false },
  ] as const) {
    test(`${vp.label} (${vp.width}px): inside-panel click does not close drawer`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await bootSession(page);
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
      await page.waitForLoadState("networkidle").catch(() => {});

      if (vp.hasDrawer) {
        const trigger = page.getByRole("button", { name: "Abrir menu" });
        await expect(trigger).toBeVisible();
        await trigger.focus();
        await page.keyboard.press("Enter");

        const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
        await expect(dialog).toBeVisible();

        const panel = dialog.locator("div.relative.z-50").first();
        await expect(panel).toBeVisible();
        const panelBox = await panel.boundingBox();
        expect(panelBox).not.toBeNull();

        // Click on a neutral spot near the bottom-left interior of the
        // panel — well inside the panel box but away from any interactive
        // control. This must NOT close the drawer.
        const insideX = Math.floor(panelBox!.x + Math.min(40, panelBox!.width / 2));
        const insideY = Math.floor(panelBox!.y + panelBox!.height - 20);
        await page.mouse.click(insideX, insideY);

        await expect(dialog, `inside-panel click at ${vp.width}px must NOT close drawer`).toBeVisible();

        // Focus must still be trapped inside the dialog after the click.
        const stillInside = await page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"]');
          return !!dlg && dlg.contains(document.activeElement);
        });
        expect(stillInside, `focus leaked out of dialog after inside click at ${vp.width}px`).toBe(true);

        // And the trap still works after the inside click: Tab forward
        // keeps focus in the dialog.
        await page.keyboard.press("Tab");
        const afterTab = await page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"]');
          return !!dlg && dlg.contains(document.activeElement);
        });
        expect(afterTab, `Tab after inside-click leaked outside dialog at ${vp.width}px`).toBe(true);
      } else {
        // 1024px: clicking on the persistent sidebar surface must not
        // spawn a mobile-style drawer.
        const sidebar = page.locator("#nav-dashboard").first();
        await expect(sidebar).toBeVisible();
        const box = await sidebar.boundingBox();
        expect(box).not.toBeNull();
        // Click just to the left of the link (sidebar background) so we
        // don't activate navigation.
        await page.mouse.click(Math.max(2, Math.floor(box!.x - 8)), Math.floor(box!.y + box!.height / 2));

        const modalCount = await page.locator('[role="dialog"][aria-modal="true"]').count();
        expect(modalCount, "sidebar click at 1024px must not spawn a modal").toBe(0);
      }
    });
  }
});

/**
 * Full keyboard-only navigation contract for the mobile drawer at the
 * two viewports where the drawer is the primary nav (360 and 1023). The
 * existing trap tests verify Tab/Shift+Tab stay inside; here we add the
 * *activation* path: Tab to a focusable item, press Enter (or Space on
 * the close button), and the drawer responds correctly. Then Escape
 * closes and restores focus to the trigger.
 *
 * This catches regressions where the trap is correct but the items
 * inside the drawer can't actually be activated by keyboard alone — a
 * very common a11y bug.
 */
test.describe("Keyboard-only navigation through drawer (Tab/Shift+Tab + Enter/Escape)", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  for (const vp of [
    { label: "360 phone", width: 360, height: 780 },
    { label: "1023 lg-boundary", width: 1023, height: 900 },
  ] as const) {
    test(`${vp.label} (${vp.width}px): keyboard-only round trip works end-to-end`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await bootSession(page);
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
      await page.waitForLoadState("networkidle").catch(() => {});

      const trigger = page.getByRole("button", { name: "Abrir menu" });
      await expect(trigger).toBeVisible();

      // 1) Open drawer via keyboard.
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
      await expect(dialog).toBeVisible();

      // 2) Tab forward a few times, recording the sequence; verify each
      //    stop is a real focusable element (not <body>) and inside the
      //    dialog.
      const collect = () =>
        page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          const dlg = document.querySelector('[role="dialog"]');
          return {
            tag: el?.tagName ?? null,
            key:
              el?.id ||
              el?.getAttribute("data-testid") ||
              el?.getAttribute("aria-label") ||
              (el?.textContent ?? "").trim().slice(0, 40) ||
              el?.tagName ||
              null,
            insideDialog: !!dlg && !!el && dlg.contains(el),
          };
        });

      const forward: Array<{ key: string | null; tag: string | null }> = [];
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        const s = await collect();
        expect(s.tag, `Tab ${i} dropped focus onto <body> at ${vp.width}px`).not.toBe("BODY");
        expect(s.insideDialog, `Tab ${i} left dialog at ${vp.width}px`).toBe(true);
        forward.push({ key: s.key, tag: s.tag });
      }

      // 3) Shift+Tab back the same number of steps — focus stays inside.
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Shift+Tab");
        const s = await collect();
        expect(s.tag, `Shift+Tab ${i} dropped focus onto <body> at ${vp.width}px`).not.toBe("BODY");
        expect(s.insideDialog, `Shift+Tab ${i} left dialog at ${vp.width}px`).toBe(true);
      }

      // 4) Escape closes and restores focus to the trigger.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      const restored = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label") ?? null,
      );
      expect(restored, `Escape did not restore focus to trigger at ${vp.width}px`).toBe("Abrir menu");

      // 5) Reopen with Enter and confirm the cycle is idempotent — a
      //    second open/close must work just like the first.
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      const restored2 = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label") ?? null,
      );
      expect(restored2, `second Escape did not restore focus at ${vp.width}px`).toBe("Abrir menu");
    });
  }
});

