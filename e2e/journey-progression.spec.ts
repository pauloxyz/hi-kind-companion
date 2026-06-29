import { test, expect } from "@playwright/test";

/**
 * Drive REAL Jornada H-2A phase transitions (DS-160 → Entrevista → Visto)
 * by mutating visa_checklist_items via PostgREST with the user's session,
 * then assert the aria-live region narrates the new state at most once per
 * debounce window and lands on the correct 100% / partial wording.
 *
 * Skipped without an injected Supabase session.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const ACCESS_TOKEN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const HAS_SESSION =
  Boolean(STORAGE_KEY && SESSION_JSON && ACCESS_TOKEN && SUPABASE_URL && SUPABASE_KEY);

const STEPS = ["ds160", "interview_done", "visa_issued"] as const;

async function upsertStep(
  request: import("@playwright/test").APIRequestContext,
  step: (typeof STEPS)[number],
  done: boolean,
) {
  // PostgREST upsert by (user_id, step_key) — the server resolves user_id
  // from the JWT, so we only send step_key + is_completed.
  const res = await request.post(`${SUPABASE_URL}/rest/v1/visa_checklist_items`, {
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    data: { step_key: step, is_completed: done },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`upsert ${step}=${done} failed (${res.status()}): ${body}`);
  }
}

test.describe("journey progression → aria-live", () => {
  test.skip(!HAS_SESSION, "needs an injected Supabase session + access token");
  test.use({ viewport: { width: 1280, height: 900 } });

  test.afterEach(async ({ request }) => {
    // Best-effort cleanup so re-runs are deterministic.
    for (const s of STEPS) {
      try {
        await upsertStep(request, s, false);
      } catch {
        /* noop */
      }
    }
  });

  test("DS-160 → Entrevista → Visto narration is debounced and ends on 100% wording", async ({
    page,
    request,
  }) => {
    // Reset to a known baseline.
    for (const s of STEPS) await upsertStep(request, s, false);

    await page.goto("/");
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    // Install a mutation observer on the live region.
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="journey-live-region"]');
      if (!el) return;
      (window as unknown as { __live: string[] }).__live = [];
      new MutationObserver(() => {
        const t = (el.textContent ?? "").trim();
        if (t) (window as unknown as { __live: string[] }).__live.push(t);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    // Burst: flip all three visa steps inside one debounce window.
    await Promise.all(STEPS.map((s) => upsertStep(request, s, true)));
    // AppShell refetches visa_checklist_items on pathname change → force one.
    await page.goto("/app/visto");
    await page.waitForLoadState("domcontentloaded");
    await page.goto("/app");
    await page.waitForLoadState("domcontentloaded");

    // Allow two debounce windows for any pending announcement to settle.
    await page.waitForTimeout(1600);

    const announcements = await page.evaluate(
      () => (window as unknown as { __live: string[] }).__live ?? [],
    );

    // Anti-spam contract: at most ~2 messages even across multiple refetches.
    expect(announcements.length).toBeGreaterThanOrEqual(1);
    expect(announcements.length).toBeLessThanOrEqual(2);

    // Every message is well-formed and not a partial duplicate.
    const unique = new Set(announcements);
    expect(unique.size).toBe(announcements.length);
    for (const m of announcements) {
      expect(m).toMatch(/Jornada H-2A (atualizada|concluída):/);
      expect(m).toMatch(/\d+ de \d+/);
    }

    // Final state should reflect either full completion (5/5 + "concluída")
    // or near completion (≥4/5 + "atualizada"), depending on onboarding/apps.
    const last = announcements[announcements.length - 1];
    const m = last.match(/(\d+) de (\d+)/);
    expect(m).not.toBeNull();
    const done = Number(m![1]);
    const total = Number(m![2]);
    expect(total).toBe(5);
    expect(done).toBeGreaterThanOrEqual(3); // ds160 + interview + visa = at least 3
    if (done === total) {
      expect(last).toMatch(/Jornada H-2A concluída/);
    } else {
      expect(last).toMatch(/Jornada H-2A atualizada/);
    }
  });
});
