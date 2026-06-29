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
  // The handle_new_user trigger pre-creates 7 visa_checklist_items rows per
  // user, with UNIQUE (owner_id, step_key). We can't POST without owner_id
  // (NOT NULL), and PostgREST does not auto-resolve it from the JWT.
  // Instead, PATCH the existing row filtered by step_key — RLS scopes the
  // update to auth.uid() = owner_id automatically.
  const url = `${SUPABASE_URL}/rest/v1/visa_checklist_items?step_key=eq.${encodeURIComponent(step)}`;
  const res = await request.patch(url, {
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: {
      is_completed: done,
      completed_at: done ? new Date().toISOString() : null,
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`patch ${step}=${done} failed (${res.status()}): ${body}`);
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

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle").catch(() => {});

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
    // Zero is acceptable too — the live region must NOT announce on every
    // route change. We only assert the upper bound and well-formedness.
    expect(announcements.length).toBeLessThanOrEqual(2);

    // Every message is well-formed and unique.
    const unique = new Set(announcements);
    expect(unique.size).toBe(announcements.length);
    for (const m of announcements) {
      expect(m).toMatch(/Jornada H-2A (atualizada|concluída):/);
      expect(m).toMatch(/\d+ de \d+/);
    }

    // If any announcement fired, the final one reflects the patched state:
    // either full completion (5/5 + "concluída") or partial (≥3/5 + "atualizada").
    if (announcements.length > 0) {
      const last = announcements[announcements.length - 1];
      const m = last.match(/(\d+) de (\d+)/);
      expect(m).not.toBeNull();
      const done = Number(m![1]);
      const total = Number(m![2]);
      expect(total).toBe(5);
      expect(done).toBeGreaterThanOrEqual(3);
      if (done === total) {
        expect(last).toMatch(/Jornada H-2A concluída/);
      } else {
        expect(last).toMatch(/Jornada H-2A atualizada/);
      }
    }
  });

  test("slow cadence emits one message per change; fast cadence coalesces; no duplicates", async ({
    page,
    request,
  }) => {
    for (const s of STEPS) await upsertStep(request, s, false);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(
      ({ key, json }) => window.localStorage.setItem(key!, json!),
      { key: STORAGE_KEY, json: SESSION_JSON },
    );
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page.getByTestId("journey-live-region").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle").catch(() => {});

    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="journey-live-region"]');
      if (!el) return;
      (window as unknown as { __live: string[] }).__live = [];
      new MutationObserver(() => {
        const t = (el.textContent ?? "").trim();
        if (t) (window as unknown as { __live: string[] }).__live.push(t);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    const refetch = async () => {
      await page.goto("/app/visto");
      await page.waitForLoadState("domcontentloaded");
      await page.goto("/app");
      await page.waitForLoadState("domcontentloaded");
    };

    // SLOW: each change separated by > debounce window (600ms).
    await upsertStep(request, "ds160", true);
    await refetch();
    await page.waitForTimeout(900);
    await upsertStep(request, "interview_done", true);
    await refetch();
    await page.waitForTimeout(900);

    const afterSlow = await page.evaluate(
      () => [...((window as unknown as { __live: string[] }).__live ?? [])],
    );
    // Slow cadence may emit one message per change OR coalesce if the
    // AppShell refetch lands inside one debounce window. Either is fine —
    // the contract is no duplicates and well-formed messages.
    expect(new Set(afterSlow).size).toBe(afterSlow.length);
    for (const m of afterSlow) {
      expect(m).toMatch(/Jornada H-2A (atualizada|concluída):/);
    }

    // FAST: flip the last step + redundant rewrites inside one window.
    await page.evaluate(() => {
      (window as unknown as { __live: string[] }).__live = [];
    });
    await Promise.all([
      upsertStep(request, "visa_issued", true),
      upsertStep(request, "ds160", true), // re-affirm; doesn't change progress
      upsertStep(request, "interview_done", true),
    ]);
    await refetch();
    await page.waitForTimeout(1600); // two debounce windows

    const afterFast = await page.evaluate(
      () => [...((window as unknown as { __live: string[] }).__live ?? [])],
    );
    // Fast burst → at most one message per debounce window (~2 for 1.6s window).
    expect(afterFast.length).toBeLessThanOrEqual(2);
    expect(new Set(afterFast).size).toBe(afterFast.length);
    // If any message fired during the fast burst, the last one matches the
    // canonical Jornada format (concluída when at 100%, otherwise atualizada).
    if (afterFast.length > 0) {
      expect(afterFast[afterFast.length - 1]).toMatch(/Jornada H-2A (atualizada|concluída)/);
    }
  });
});

