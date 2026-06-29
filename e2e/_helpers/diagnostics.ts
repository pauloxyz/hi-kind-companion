import type { Page, TestInfo } from "@playwright/test";

/**
 * Captures a screenshot + structured dump (URL, activeElement, drawer state,
 * live-region text) ONLY when the test is failing — intended for the
 * timeout/intercept-prone suites (drawer-rapid, shortcuts-feedback,
 * axe-journey, sidebar-tab-order). Wire via test.afterEach.
 */
export async function attachFailureDiagnostics(page: Page, testInfo: TestInfo) {
  if (testInfo.status === testInfo.expectedStatus) return;
  try {
    const png = await page.screenshot({ fullPage: false }).catch(() => null);
    if (png) {
      await testInfo.attach(`diag-${testInfo.title.slice(0, 60)}.png`, {
        body: png,
        contentType: "image/png",
      });
    }
    const dump = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      const dlg = document.getElementById("app-mobile-sidebar");
      const trigger = document.querySelector('[data-testid="drawer-trigger"]') as HTMLElement | null;
      const live = document.querySelector('[data-testid="journey-live-region"]');
      const toast = document.querySelector("[data-sonner-toast]");
      return {
        url: location.href,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        activeElement: a
          ? {
              tag: a.tagName,
              id: a.id || null,
              testId: a.getAttribute("data-testid"),
              ariaLabel: a.getAttribute("aria-label"),
              text: (a.textContent ?? "").slice(0, 80),
              rect: a.getBoundingClientRect().toJSON(),
            }
          : null,
        drawer: dlg
          ? {
              present: true,
              visible: dlg.offsetParent !== null,
              ariaModal: dlg.getAttribute("aria-modal"),
            }
          : { present: false },
        trigger: trigger
          ? {
              ariaExpanded: trigger.getAttribute("aria-expanded"),
              rect: trigger.getBoundingClientRect().toJSON(),
            }
          : null,
        liveRegion: live ? (live.textContent ?? "").trim() : null,
        toast: toast ? (toast.textContent ?? "").trim().slice(0, 120) : null,
      };
    }).catch((e) => ({ error: String(e) }));
    await testInfo.attach(`diag-${testInfo.title.slice(0, 60)}.json`, {
      body: Buffer.from(JSON.stringify(dump, null, 2)),
      contentType: "application/json",
    });
    // Log to CI output as well for fast triage without downloading artifacts.
    // eslint-disable-next-line no-console
    console.error(`[diag ${testInfo.title}]`, JSON.stringify(dump));
  } catch {
    /* never let diagnostics throw */
  }
}

/**
 * Robust G+letter shortcut firing: blurs any focused editable element, then
 * fires the combo and waits for the URL to match — retrying up to `attempts`
 * times to absorb race conditions between React hydration and key handlers.
 */
export async function fireShortcut(
  page: Page,
  letter: string,
  urlRe: RegExp,
  opts: { attempts?: number; perAttemptMs?: number } = {},
) {
  const attempts = opts.attempts ?? 3;
  const perAttemptMs = opts.perAttemptMs ?? 2_000;
  for (let i = 0; i < attempts; i++) {
    if (urlRe.test(page.url())) return;
    await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) {
        a.blur();
      }
    });
    await page.keyboard.press("g");
    await page.waitForTimeout(40);
    await page.keyboard.press(letter);
    try {
      await page.waitForURL(urlRe, { timeout: perAttemptMs });
      return;
    } catch {
      // retry
    }
  }
  // final attempt — let the assertion surface the timeout for the diagnostics
  // dump to capture the page state.
  await page.waitForURL(urlRe, { timeout: perAttemptMs });
}

/**
 * Polls the journey-live-region until its text has not changed for `quietMs`,
 * so the test can capture a stable "before" snapshot without racing the
 * initial-mount announcement.
 */
export async function waitForLiveRegionQuiet(page: Page, quietMs = 900, maxMs = 6_000) {
  const start = Date.now();
  let lastText = "";
  let lastChange = Date.now();
  while (Date.now() - start < maxMs) {
    const text = await page
      .getByTestId("journey-live-region")
      .innerText()
      .catch(() => "");
    if (text !== lastText) {
      lastText = text;
      lastChange = Date.now();
    }
    if (Date.now() - lastChange >= quietMs) return lastText;
    await page.waitForTimeout(120);
  }
  return lastText;
}

/**
 * Safely closes any open mobile drawer before re-clicking the trigger so the
 * dialog overlay (z-40, fixed inset-0) doesn't intercept the pointer event.
 */
export async function ensureDrawerClosed(page: Page) {
  const trigger = page.getByTestId("drawer-trigger");
  const expanded = await trigger
    .getAttribute("aria-expanded")
    .catch(() => null);
  if (expanded !== "true") return;
  await page.keyboard.press("Escape");
  // Wait for either the dialog to detach or aria-expanded to flip.
  await page
    .waitForFunction(
      () =>
        document.getElementById("app-mobile-sidebar") === null ||
        document
          .querySelector('[data-testid="drawer-trigger"]')
          ?.getAttribute("aria-expanded") === "false",
      { timeout: 2_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(60);
}
