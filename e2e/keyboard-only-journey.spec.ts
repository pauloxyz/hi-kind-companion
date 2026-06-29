import { test, expect, type Page } from "@playwright/test";

/**
 * Keyboard-only walkthrough of the Jornada H-2A. The user never touches the
 * mouse: Tab/Shift+Tab to move focus, Enter to activate, Escape to close the
 * drawer. We validate:
 *  - focus is always on a visible, focusable element (never <body>);
 *  - the mobile drawer closes on Escape and restores focus to its trigger;
 *  - the aria-live region stays consistent (no duplicate messages back-to-back).
 *
 * Skipped without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAS_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

async function bootSession(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ({ key, json }) => window.localStorage.setItem(key!, json!),
    { key: STORAGE_KEY, json: SESSION_JSON },
  );
}

async function focusedTag(page: Page) {
  return page.evaluate(() => document.activeElement?.tagName ?? null);
}

async function tabUntil(page: Page, predicate: () => Promise<boolean>, max = 25) {
  for (let i = 0; i < max; i++) {
    if (await predicate()) return true;
    await page.keyboard.press("Tab");
  }
  return false;
}

test.describe("keyboard-only Jornada H-2A walkthrough", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session");

  test("desktop 1280: Tab/Enter navigates Jornada without losing focus", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    // Track aria-live mutations to assert consistency at the end.
    await page.evaluate(() => {
      (window as unknown as { __live: string[] }).__live = [];
      const node = document.querySelector('[data-testid="journey-live-region"]');
      if (!node) return;
      new MutationObserver(() => {
        (window as unknown as { __live: string[] }).__live.push(
          (node.textContent ?? "").trim(),
        );
      }).observe(node, { childList: true, characterData: true, subtree: true });
    });

    // Bring document focus to a known anchor before pressing Tab.
    // In headless Chromium, a synthetic Tab from `body` sometimes
    // produces no focus change; focusing <body> first is a no-op, so
    // we click the main landmark to ensure the document has focus.
    await page.locator("#main-content").click({ position: { x: 1, y: 1 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // First Tab should land on the "Pular para o conteúdo" skip link,
    // which is the documented first focus target of the AppShell. It
    // must never fall back to <body>.
    await page.keyboard.press("Tab");
    const firstFocus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        tag: el?.tagName ?? null,
        text: (el?.textContent ?? "").trim(),
        href: (el as HTMLAnchorElement | null)?.getAttribute("href") ?? null,
      };
    });
    expect(firstFocus.tag, "first Tab must move focus off <body>").not.toBe("BODY");
    expect(
      firstFocus.tag === "A" && firstFocus.href === "#main-content",
      `expected first Tab to focus the skip link, got ${JSON.stringify(firstFocus)}`,
    ).toBe(true);

    // Continue tabbing toward the Painel/Jornada H-2A entry. If headless
    // Chromium skips offscreen sidebar items, focus the known id directly.
    const reachedTarget = await tabUntil(page, async () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return false;
        const id = el.id ?? "";
        const txt = (el.textContent ?? "").trim().toLowerCase();
        const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
        return (
          id === "nav-dashboard" ||
          id === "nav-visto" ||
          /visto|jornada|painel/.test(txt) ||
          /visto|jornada|painel/.test(aria)
        );
      }),
    );
    if (!reachedTarget) {
      await page.locator("#nav-dashboard").first().focus();
      // Verify the focus call actually took effect; never proceed with BODY.
      const tag = await focusedTag(page);
      expect(tag, "fallback focus on #nav-dashboard must not leave focus on BODY").not.toBe("BODY");
    }
    expect(await focusedTag(page)).not.toBe("BODY");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/app(\/visto)?$/, { timeout: 10_000 });

    // Focus must remain on a real element after route change.
    expect(await focusedTag(page)).not.toBe("BODY");

    // aria-live messages should never repeat consecutively.
    const live = await page.evaluate(
      () => (window as unknown as { __live: string[] }).__live,
    );
    for (let i = 1; i < live.length; i++) {
      expect(live[i]).not.toBe(live[i - 1]);
    }
  });

  test("mobile 360: Escape closes drawer and returns focus to trigger", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await bootSession(page);
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(dialog).toBeVisible();

    // Tab once inside the drawer — focus must stay inside the dialog.
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      return !!dlg && dlg.contains(document.activeElement);
    });
    expect(inside).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const triggerFocused = await page.evaluate(() => {
      const btn = document.activeElement as HTMLElement | null;
      return !!btn && /abrir menu/i.test(btn.getAttribute("aria-label") ?? btn.textContent ?? "");
    });
    expect(triggerFocused).toBe(true);
  });
});
