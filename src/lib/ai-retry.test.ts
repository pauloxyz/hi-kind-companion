// Integration test: simulate 429 / 402 / unknown failures from the generator
// and assert the orchestrator emits telemetry + breadcrumbs with the exact
// shape the page (and downstream Sentry/Plausible) expects.

import { describe, it, expect, vi } from "vitest";
import { runAiAttempt, parseAiError, type AiSinks } from "./ai-retry";

function makeSinks() {
  const track = vi.fn();
  const breadcrumb = vi.fn();
  const capture = vi.fn();
  const times = [1_000, 1_000, 1_500]; // click, start, end → latencyMs=500
  const now = vi.fn(() => (times.length > 1 ? times.shift()! : times[0]));
  const sinks: AiSinks = { track, breadcrumb, capture, now };
  return { sinks, track, breadcrumb, capture };
}

const CID = "cid-test-123";

describe("parseAiError", () => {
  it("decodes AI_ERR rate-limited with retry_after", () => {
    const e = new Error("AI_ERR|rate_limited|42|Muitas requisições.");
    expect(parseAiError(e)).toEqual({ code: "rate_limited", retryAfter: 42, msg: "Muitas requisições." });
  });
  it("decodes AI_ERR no_credits with retry_after=0", () => {
    const e = new Error("AI_ERR|no_credits|0|Créditos acabaram.");
    expect(parseAiError(e)).toEqual({ code: "no_credits", retryAfter: 0, msg: "Créditos acabaram." });
  });
  it("falls back to 'other' for unstructured errors", () => {
    expect(parseAiError(new Error("boom"))).toEqual({ code: "other", retryAfter: 0, msg: "boom" });
  });
});

describe("runAiAttempt — 429", () => {
  it("emits ai_error with correlationId, retryAfter and latencyMs; adds matching breadcrumb", async () => {
    const { sinks, track, breadcrumb, capture } = makeSinks();
    const err = new Error("AI_ERR|rate_limited|30|Muitas requisições.");
    const result = await runAiAttempt({
      action: "script",
      isRetry: false,
      correlationId: CID,
      readyAt: 0,
      generator: () => Promise.reject(err),
      sinks,
    });

    expect(result.ok).toBe(false);
    if (result.ok || "skipped" in result) throw new Error("expected error result");
    expect(result.error.code).toBe("rate_limited");
    expect(result.error.retryAfter).toBe(30);
    expect(result.latencyMs).toBe(500);

    // ai_error payload contract — every field the dashboards depend on.
    expect(track).toHaveBeenCalledWith("ai_error", {
      action: "script",
      code: "rate_limited",
      retryAfter: 30,
      latencyMs: 500,
      correlationId: CID,
    });
    // Sentry breadcrumb mirrors the same correlationId for trail joining.
    expect(breadcrumb).toHaveBeenCalledWith(
      "ai-error",
      { correlationId: CID, action: "script", code: "rate_limited", retryAfter: 30, latencyMs: 500 },
      "warning",
    );
    // Sentry capture receives the original Error (so stack trace survives).
    expect(capture).toHaveBeenCalledWith(
      err,
      { ai_action: "script", ai_code: "rate_limited", correlation_id: CID },
      { retryAfter: 30, latencyMs: 500, msg: "Muitas requisições." },
    );
  });
});

describe("runAiAttempt — 402", () => {
  it("emits ai_error with retryAfter=0 and an 'error'-level breadcrumb", async () => {
    const { sinks, track, breadcrumb } = makeSinks();
    const err = new Error("AI_ERR|no_credits|0|Créditos esgotados.");
    await runAiAttempt({
      action: "meta",
      isRetry: true,
      correlationId: CID,
      readyAt: 0,
      previousCode: "no_credits",
      generator: () => Promise.reject(err),
      sinks,
    });

    expect(track).toHaveBeenCalledWith("ai_error", {
      action: "meta",
      code: "no_credits",
      retryAfter: 0,
      latencyMs: 500,
      correlationId: CID,
    });
    // no_credits is fatal — breadcrumb level escalates to "error".
    const call = breadcrumb.mock.calls.find((c) => c[0] === "ai-error");
    expect(call?.[2]).toBe("error");
    // Retry-specific failure event also fires (with same correlationId).
    expect(track).toHaveBeenCalledWith("ai_retry_failure", { action: "meta", correlationId: CID });
  });
});

describe("runAiAttempt — waitedPastUnlockMs on retry click", () => {
  it("computes waitedPastUnlockMs from readyAt to click timestamp", async () => {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    // Click happens 2300ms after the banner unlocked at readyAt=8000.
    // now() is called as: click(=10_300), startedAt, endedAt.
    const times = [10_300, 10_300, 10_350];
    const now = vi.fn(() => (times.length > 1 ? times.shift()! : times[0]));

    await runAiAttempt({
      action: "script",
      isRetry: true,
      correlationId: CID,
      readyAt: 8_000,
      previousCode: "rate_limited",
      generator: () => Promise.resolve({ ok: 1 }),
      sinks: { track, breadcrumb, capture, now },
    });

    // ai_retry_click MUST include waitedPastUnlockMs = clickAt - readyAt.
    expect(track).toHaveBeenCalledWith("ai_retry_click", {
      action: "script",
      code: "rate_limited",
      correlationId: CID,
      waitedPastUnlockMs: 2_300,
    });
    expect(breadcrumb).toHaveBeenCalledWith("retry-click", {
      correlationId: CID,
      action: "script",
      code: "rate_limited",
      waitedPastUnlockMs: 2_300,
    });
    // Success event keeps the same correlationId so the full journey joins.
    expect(track).toHaveBeenCalledWith("ai_retry_success", expect.objectContaining({
      correlationId: CID, action: "script",
    }));
  });

  it("waitedPastUnlockMs is 0 when banner never went through 'ready' (readyAt=0)", async () => {
    const { sinks, track } = makeSinks();
    await runAiAttempt({
      action: "meta",
      isRetry: true,
      correlationId: CID,
      readyAt: 0,
      previousCode: "rate_limited",
      generator: () => Promise.resolve({}),
      sinks,
    });
    expect(track).toHaveBeenCalledWith("ai_retry_click", expect.objectContaining({
      waitedPastUnlockMs: 0,
    }));
  });
});

describe("runAiAttempt — Sentry breadcrumb trail", () => {
  it("emits breadcrumbs at every step (error, click, success) with the same correlationId", async () => {
    // Attempt 1: 429 → breadcrumbs: generate-click, ai-error.
    const track1 = vi.fn();
    const breadcrumb1 = vi.fn();
    const capture1 = vi.fn();
    const t1 = [1_000, 1_000, 1_400];
    await runAiAttempt({
      action: "script",
      isRetry: false,
      correlationId: CID,
      readyAt: 0,
      generator: () => Promise.reject(new Error("AI_ERR|rate_limited|10|slow down")),
      sinks: { track: track1, breadcrumb: breadcrumb1, capture: capture1, now: () => t1.shift() ?? 1_400 },
    });

    const messages1 = breadcrumb1.mock.calls.map((c) => c[0]);
    expect(messages1).toEqual(["generate-click", "ai-error"]);
    // Every breadcrumb shares the same correlationId.
    for (const call of breadcrumb1.mock.calls) {
      expect(call[1]).toMatchObject({ correlationId: CID });
    }
    // 429 → warning level (no_credits would escalate to "error").
    expect(breadcrumb1.mock.calls.find((c) => c[0] === "ai-error")?.[2]).toBe("warning");

    // Attempt 2: retry that succeeds → click + success breadcrumbs, same correlationId.
    const track2 = vi.fn();
    const breadcrumb2 = vi.fn();
    const capture2 = vi.fn();
    const t2 = [5_000, 5_000, 5_100];
    await runAiAttempt({
      action: "script",
      isRetry: true,
      correlationId: CID,
      readyAt: 4_500,
      previousCode: "rate_limited",
      bannerReady: true,
      generator: () => Promise.resolve({ ok: 1 }),
      sinks: { track: track2, breadcrumb: breadcrumb2, capture: capture2, now: () => t2.shift() ?? 5_100 },
    });
    expect(breadcrumb2.mock.calls.map((c) => c[0])).toEqual(["retry-click", "retry-success"]);
    for (const call of breadcrumb2.mock.calls) {
      expect(call[1]).toMatchObject({ correlationId: CID });
    }
  });

  it("uses 'error' breadcrumb level for no_credits (fatal) and 'warning' for rate_limited", async () => {
    const { sinks, breadcrumb } = makeSinks();
    await runAiAttempt({
      action: "script", isRetry: false, correlationId: CID, readyAt: 0,
      generator: () => Promise.reject(new Error("AI_ERR|no_credits|0|sem creditos")),
      sinks,
    });
    expect(breadcrumb.mock.calls.find((c) => c[0] === "ai-error")?.[2]).toBe("error");
  });
});

describe("runAiAttempt — 429 → successful retry sequence", () => {
  it("preserves correlationId across both attempts and emits events in the expected order", async () => {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    // Attempt 1 timeline: click=0, start=0, end=200 → latency=200.
    // Attempt 2 timeline: click=10_000, start=10_000, end=10_350 → latency=350.
    const stream = [0, 0, 200, 10_000, 10_000, 10_350];
    const now = vi.fn(() => stream.shift() ?? 10_350);
    const sinks: AiSinks = { track, breadcrumb, capture, now };

    const r1 = await runAiAttempt({
      action: "script", isRetry: false, correlationId: CID, readyAt: 0,
      generator: () => Promise.reject(new Error("AI_ERR|rate_limited|10|slow")),
      sinks,
    });
    expect(r1.ok).toBe(false);

    const r2 = await runAiAttempt({
      action: "script", isRetry: true, correlationId: CID, readyAt: 9_500,
      previousCode: "rate_limited", bannerReady: true,
      generator: () => Promise.resolve({ pt: "x" }),
      sinks,
    });
    expect(r2.ok).toBe(true);

    // Event order — what dashboards rely on to stitch a journey.
    const events = track.mock.calls.map((c) => c[0]);
    expect(events).toEqual([
      "ai_generate_click",
      "ai_error",
      "ai_retry_click",
      "ai_retry_success",
    ]);
    // Every event carries the same correlationId.
    for (const call of track.mock.calls) {
      expect(call[1]).toMatchObject({ correlationId: CID });
    }
    // Latency carried per attempt.
    expect(track).toHaveBeenCalledWith("ai_error", expect.objectContaining({ latencyMs: 200, retryAfter: 10 }));
    expect(track).toHaveBeenCalledWith("ai_retry_success", expect.objectContaining({ latencyMs: 350 }));
    // Wait time = clickAt(10_000) - readyAt(9_500) = 500ms.
    expect(track).toHaveBeenCalledWith("ai_retry_click", expect.objectContaining({ waitedPastUnlockMs: 500 }));
  });
});

describe("runAiAttempt — bannerReady guard", () => {
  it("does NOT fire ai_retry_click when banner is still counting down", async () => {
    const { sinks, track, breadcrumb } = makeSinks();
    const generator = vi.fn(() => Promise.resolve({}));
    const result = await runAiAttempt({
      action: "script",
      isRetry: true,
      correlationId: CID,
      readyAt: 0,
      previousCode: "rate_limited",
      bannerReady: false, // user somehow re-clicked before unlock
      generator,
      sinks,
    });

    expect(result).toEqual({ ok: false, skipped: "not_ready", latencyMs: 0 });
    // The generator must never run while waiting.
    expect(generator).not.toHaveBeenCalled();
    // No retry-click telemetry — the click was suppressed.
    const events = track.mock.calls.map((c) => c[0]);
    expect(events).not.toContain("ai_retry_click");
    // But we still leave a Sentry trail of the suppression for debugging.
    expect(breadcrumb).toHaveBeenCalledWith(
      "retry-click-suppressed",
      expect.objectContaining({ correlationId: CID, reason: "not_ready" }),
      "info",
    );
  });

  it("fires ai_retry_click with waitedPastUnlockMs=0 when click lands exactly at unlock", async () => {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    // clickAt === readyAt → exact unlock.
    const stream = [7_000, 7_000, 7_050];
    const now = vi.fn(() => stream.shift() ?? 7_050);
    await runAiAttempt({
      action: "script",
      isRetry: true,
      correlationId: CID,
      readyAt: 7_000,
      previousCode: "rate_limited",
      bannerReady: true,
      generator: () => Promise.resolve({}),
      sinks: { track, breadcrumb, capture, now },
    });
    expect(track).toHaveBeenCalledWith("ai_retry_click", {
      action: "script", code: "rate_limited", correlationId: CID, waitedPastUnlockMs: 0,
    });
  });

  it("clamps waitedPastUnlockMs to 0 if click somehow arrives before readyAt (clock skew)", async () => {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    // clickAt < readyAt should never produce a negative metric.
    const stream = [6_900, 6_900, 6_950];
    const now = vi.fn(() => stream.shift() ?? 6_950);
    await runAiAttempt({
      action: "script", isRetry: true, correlationId: CID,
      readyAt: 7_000, previousCode: "rate_limited", bannerReady: true,
      generator: () => Promise.resolve({}),
      sinks: { track, breadcrumb, capture, now },
    });
    expect(track).toHaveBeenCalledWith("ai_retry_click", expect.objectContaining({
      waitedPastUnlockMs: 0,
    }));
  });
});

describe("runAiAttempt — 402 → successful retry sequence", () => {
  it("preserves correlationId, computes waitedPastUnlockMs, and emits events in expected order", async () => {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    // Attempt 1: click=0, start=0, end=150 → latency=150 (402).
    // Attempt 2: click=20_000, start=20_000, end=20_400 → latency=400.
    const stream = [0, 0, 150, 20_000, 20_000, 20_400];
    const now = vi.fn(() => stream.shift() ?? 20_400);
    const sinks: AiSinks = { track, breadcrumb, capture, now };

    const r1 = await runAiAttempt({
      action: "meta", isRetry: false, correlationId: CID, readyAt: 0,
      generator: () => Promise.reject(new Error("AI_ERR|no_credits|0|Sem créditos.")),
      sinks,
    });
    expect(r1.ok).toBe(false);

    // After admin recharges, user clicks retry. readyAt mirrors the moment
    // the banner re-enabled — for no_credits the page stamps readyAt on
    // mount/error (here 19_500).
    const r2 = await runAiAttempt({
      action: "meta", isRetry: true, correlationId: CID, readyAt: 19_500,
      previousCode: "no_credits", bannerReady: true,
      generator: () => Promise.resolve({ title: "ok" }),
      sinks,
    });
    expect(r2.ok).toBe(true);

    const events = track.mock.calls.map((c) => c[0]);
    expect(events).toEqual([
      "ai_generate_click",
      "ai_error",
      "ai_retry_click",
      "ai_retry_success",
    ]);
    for (const call of track.mock.calls) {
      expect(call[1]).toMatchObject({ correlationId: CID });
    }
    expect(track).toHaveBeenCalledWith("ai_error", {
      action: "meta", code: "no_credits", retryAfter: 0,
      latencyMs: 150, correlationId: CID,
    });
    // waitedPastUnlockMs = clickAt(20_000) - readyAt(19_500) = 500.
    expect(track).toHaveBeenCalledWith("ai_retry_click", {
      action: "meta", code: "no_credits", correlationId: CID, waitedPastUnlockMs: 500,
    });
    expect(track).toHaveBeenCalledWith("ai_retry_success", expect.objectContaining({
      action: "meta", latencyMs: 400, correlationId: CID,
    }));

    // Breadcrumb trail across both attempts joins on the same correlationId.
    const crumbs = breadcrumb.mock.calls.map((c) => c[0]);
    expect(crumbs).toEqual(["generate-click", "ai-error", "retry-click", "retry-success"]);
    for (const call of breadcrumb.mock.calls) {
      expect(call[1]).toMatchObject({ correlationId: CID });
    }
    // 402 escalates to "error" breadcrumb level.
    expect(breadcrumb.mock.calls.find((c) => c[0] === "ai-error")?.[2]).toBe("error");
  });
});

describe("runAiAttempt — waitedPastUnlockMs clock-skew clamp", () => {
  it("clamps to 0 when clickAt < readyAt (negative skew)", async () => {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    // clickAt=4_900, readyAt=5_000 → raw diff -100, clamped to 0.
    const stream = [4_900, 4_900, 4_950];
    const now = vi.fn(() => stream.shift() ?? 4_950);
    await runAiAttempt({
      action: "script", isRetry: true, correlationId: CID,
      readyAt: 5_000, previousCode: "rate_limited", bannerReady: true,
      generator: () => Promise.resolve({}),
      sinks: { track, breadcrumb, capture, now },
    });
    const click = track.mock.calls.find((c) => c[0] === "ai_retry_click");
    expect(click?.[1]).toMatchObject({ waitedPastUnlockMs: 0 });
    // Never emits a negative metric — dashboards depend on this invariant.
    expect((click?.[1] as { waitedPastUnlockMs: number }).waitedPastUnlockMs)
      .toBeGreaterThanOrEqual(0);
  });

  it("preserves large positive values (well above retryAfter) without truncating", async () => {
    // The orchestrator does NOT cap on the upper bound — analytics need the
    // raw 'user took a long time' signal. retryAfter is server policy;
    // wait time is user behaviour.
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    // retryAfter was 30s (30_000ms); user waited 5 minutes (300_000ms).
    const stream = [305_000, 305_000, 305_100];
    const now = vi.fn(() => stream.shift() ?? 305_100);
    await runAiAttempt({
      action: "script", isRetry: true, correlationId: CID,
      readyAt: 5_000, previousCode: "rate_limited", bannerReady: true,
      generator: () => Promise.resolve({}),
      sinks: { track, breadcrumb, capture, now },
    });
    expect(track).toHaveBeenCalledWith("ai_retry_click", expect.objectContaining({
      waitedPastUnlockMs: 300_000,
    }));
  });
});

describe("runAiAttempt — ai_error payload by error type", () => {
  it("rate_limited carries retryAfter>0 and a 'warning' breadcrumb level", async () => {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    const stream = [1_000, 1_000, 1_250];
    const now = vi.fn(() => stream.shift() ?? 1_250);
    await runAiAttempt({
      action: "script", isRetry: false, correlationId: CID, readyAt: 0,
      generator: () => Promise.reject(new Error("AI_ERR|rate_limited|45|slow down")),
      sinks: { track, breadcrumb, capture, now },
    });
    expect(track).toHaveBeenCalledWith("ai_error", {
      action: "script", code: "rate_limited",
      retryAfter: 45, latencyMs: 250, correlationId: CID,
    });
    expect(breadcrumb.mock.calls.find((c) => c[0] === "ai-error")?.[2]).toBe("warning");
  });

  it("no_credits carries retryAfter=0 and an 'error' breadcrumb level, same correlationId", async () => {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    const stream = [2_000, 2_000, 2_180];
    const now = vi.fn(() => stream.shift() ?? 2_180);
    await runAiAttempt({
      action: "meta", isRetry: false, correlationId: CID, readyAt: 0,
      generator: () => Promise.reject(new Error("AI_ERR|no_credits|0|Sem créditos.")),
      sinks: { track, breadcrumb, capture, now },
    });
    expect(track).toHaveBeenCalledWith("ai_error", {
      action: "meta", code: "no_credits",
      retryAfter: 0, latencyMs: 180, correlationId: CID,
    });
    const aiError = breadcrumb.mock.calls.find((c) => c[0] === "ai-error");
    expect(aiError?.[1]).toMatchObject({ correlationId: CID, code: "no_credits", retryAfter: 0 });
    expect(aiError?.[2]).toBe("error");
  });
});

describe("runAiAttempt — automatic retry without user click", () => {
  it("does NOT emit ai_retry_click or retry-click breadcrumb when isRetry=false", async () => {
    // Programmatic regeneration (e.g. auto-trigger after countdown completes
    // without user interaction) MUST be modelled as isRetry=false so the
    // dashboards don't count a user click that never happened.
    const { sinks, track, breadcrumb } = makeSinks();
    await runAiAttempt({
      action: "script", isRetry: false, correlationId: CID, readyAt: 0,
      generator: () => Promise.resolve({ ok: 1 }),
      sinks,
    });
    const events = track.mock.calls.map((c) => c[0]);
    expect(events).not.toContain("ai_retry_click");
    const crumbs = breadcrumb.mock.calls.map((c) => c[0]);
    expect(crumbs).not.toContain("retry-click");
    // It records as a normal generate flow instead.
    expect(events).toEqual(["ai_generate_click", "ai_generate_success"]);
    expect(crumbs).toEqual(["generate-click", "generate-success"]);
  });
});

describe("runAiAttempt — retry-click-suppressed breadcrumb", () => {
  it("only appears when bannerReady=false and never when bannerReady=true", async () => {
    // bannerReady=true → no suppression breadcrumb at all.
    const { sinks: okSinks, breadcrumb: okBreadcrumb } = makeSinks();
    await runAiAttempt({
      action: "script", isRetry: true, correlationId: CID, readyAt: 1_000,
      previousCode: "rate_limited", bannerReady: true,
      generator: () => Promise.resolve({}),
      sinks: okSinks,
    });
    expect(okBreadcrumb.mock.calls.map((c) => c[0]))
      .not.toContain("retry-click-suppressed");

    // bannerReady=false → exactly one suppression breadcrumb, no duplicates.
    const { sinks: blockSinks, breadcrumb: blockBreadcrumb, track: blockTrack } = makeSinks();
    const generator = vi.fn(() => Promise.resolve({}));
    await runAiAttempt({
      action: "script", isRetry: true, correlationId: CID, readyAt: 0,
      previousCode: "rate_limited", bannerReady: false,
      generator, sinks: blockSinks,
    });
    const suppressed = blockBreadcrumb.mock.calls.filter(
      (c) => c[0] === "retry-click-suppressed",
    );
    expect(suppressed).toHaveLength(1);
    expect(generator).not.toHaveBeenCalled();
    expect(blockTrack.mock.calls.map((c) => c[0])).not.toContain("ai_retry_click");
  });

  it("each call emits exactly one suppression breadcrumb (no amplification on repeats)", async () => {
    // Simulates repeated user clicks / re-renders during the countdown.
    // Each call is independent and must produce one — and only one —
    // suppression breadcrumb, never a stale or amplified trail.
    const { sinks, breadcrumb } = makeSinks();
    const generator = vi.fn(() => Promise.resolve({}));
    for (let i = 0; i < 3; i++) {
      await runAiAttempt({
        action: "script", isRetry: true, correlationId: CID, readyAt: 0,
        previousCode: "rate_limited", bannerReady: false,
        generator, sinks,
      });
    }
    const suppressed = breadcrumb.mock.calls.filter(
      (c) => c[0] === "retry-click-suppressed",
    );
    expect(suppressed).toHaveLength(3); // one per call, never amplified
    // And no other breadcrumb types leaked in.
    const kinds = new Set(breadcrumb.mock.calls.map((c) => c[0]));
    expect(kinds).toEqual(new Set(["retry-click-suppressed"]));
    expect(generator).not.toHaveBeenCalled();
  });
});

describe("runAiAttempt — retryAfter & waitedPastUnlockMs limits", () => {
  it("retryAfter=0 (immediate) — readyAt=0 means waitedPastUnlockMs stays 0", async () => {
    // 429 with no wait: server told us to retry right away. The page
    // typically passes readyAt=0 since there's no countdown — waited time
    // is "not applicable" and MUST be reported as 0, never as clickAt.
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    const stream = [50_000, 50_000, 50_080];
    const now = vi.fn(() => stream.shift() ?? 50_080);
    await runAiAttempt({
      action: "script", isRetry: true, correlationId: CID,
      readyAt: 0, previousCode: "rate_limited", bannerReady: true,
      generator: () => Promise.resolve({}),
      sinks: { track, breadcrumb, capture, now },
    });
    expect(track).toHaveBeenCalledWith("ai_retry_click", expect.objectContaining({
      waitedPastUnlockMs: 0, correlationId: CID,
    }));
  });

  it("very large retryAfter (e.g. 600s) — waited time reported as raw delta", async () => {
    // retryAfter is a server hint; the wait metric is whatever the user
    // actually waited. A 10-minute wait must NOT be capped or rounded.
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    const readyAt = 1_000_000;
    const clickAt = readyAt + 10 * 60 * 1_000; // 600_000 ms past unlock
    const stream = [clickAt, clickAt, clickAt + 200];
    const now = vi.fn(() => stream.shift() ?? clickAt + 200);
    await runAiAttempt({
      action: "script", isRetry: true, correlationId: CID,
      readyAt, previousCode: "rate_limited", bannerReady: true,
      generator: () => Promise.resolve({}),
      sinks: { track, breadcrumb, capture, now },
    });
    expect(track).toHaveBeenCalledWith("ai_retry_click", expect.objectContaining({
      waitedPastUnlockMs: 600_000,
    }));
  });

  it("fractional now() values are passed through without rounding (sub-ms precision)", async () => {
    // `performance.now()` returns floats. The orchestrator should not
    // coerce to int — Math.max(0, diff) preserves the float so dashboards
    // get the real latency.
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    const readyAt = 2_000;
    const clickAt = 2_500.75;
    const stream = [clickAt, clickAt, clickAt + 12.5];
    const now = vi.fn(() => stream.shift() ?? clickAt + 12.5);
    await runAiAttempt({
      action: "script", isRetry: true, correlationId: CID,
      readyAt, previousCode: "rate_limited", bannerReady: true,
      generator: () => Promise.resolve({}),
      sinks: { track, breadcrumb, capture, now },
    });
    expect(track).toHaveBeenCalledWith("ai_retry_click", expect.objectContaining({
      waitedPastUnlockMs: 500.75,
    }));
  });

  it("parseAiError falls back to 'other' for malformed (fractional) retryAfter strings", async () => {
    // The structured error grammar is `\d+` — a server bug that sent
    // `5.5` would NOT be parsed as 5 seconds; it falls through to "other"
    // with retryAfter=0. This is what the page expects.
    const parsed = parseAiError(new Error("AI_ERR|rate_limited|5.5|slow"));
    expect(parsed).toEqual({
      code: "other", retryAfter: 0,
      msg: "AI_ERR|rate_limited|5.5|slow",
    });
  });
});

describe("runAiAttempt — reconnection / re-enqueue after unlock", () => {
  it("two successive successful retries for the same correlationId never duplicate retry-click", async () => {
    // Models a flaky network: after unlock the client retries; the request
    // fails transiently, the user clicks again. Each invocation must
    // produce exactly one ai_retry_click and one retry-click breadcrumb —
    // never accumulate state from the previous call.
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    // Two retry attempts with the same readyAt (banner unlocked once,
    // page kept readyAt around). Clicks at +500ms and +2_500ms.
    const readyAt = 10_000;
    const stream = [
      10_500, 10_500, 10_600,
      12_500, 12_500, 12_700,
    ];
    const now = vi.fn(() => stream.shift() ?? 12_700);
    const sinks: AiSinks = { track, breadcrumb, capture, now };

    for (const expected of [500, 2_500] as const) {
      await runAiAttempt({
        action: "script", isRetry: true, correlationId: CID,
        readyAt, previousCode: "rate_limited", bannerReady: true,
        generator: () => Promise.resolve({}),
        sinks,
      });
      // After each call, the LAST retry-click event must match this attempt.
      const clicks = track.mock.calls.filter((c) => c[0] === "ai_retry_click");
      expect(clicks.at(-1)?.[1]).toMatchObject({
        waitedPastUnlockMs: expected, correlationId: CID,
      });
    }

    // Final tallies: one retry-click + one retry-success per attempt.
    // Critically, NO retry-click-suppressed breadcrumbs anywhere.
    const events = track.mock.calls.map((c) => c[0]);
    expect(events.filter((e) => e === "ai_retry_click")).toHaveLength(2);
    expect(events.filter((e) => e === "ai_retry_success")).toHaveLength(2);
    const crumbs = breadcrumb.mock.calls.map((c) => c[0]);
    expect(crumbs.filter((c) => c === "retry-click")).toHaveLength(2);
    expect(crumbs.filter((c) => c === "retry-success")).toHaveLength(2);
    expect(crumbs).not.toContain("retry-click-suppressed");
  });

  it("rapid reconnects during the lock window emit only suppressed breadcrumbs (one per call, no ai_retry_click)", async () => {
    // Client reconnects 3 times while bannerReady is still false (e.g.
    // websocket flapping). The orchestrator must never let any of those
    // produce an ai_retry_click — only one suppression breadcrumb per call.
    const { sinks, track, breadcrumb } = makeSinks();
    const generator = vi.fn(() => Promise.resolve({}));
    for (let i = 0; i < 3; i++) {
      await runAiAttempt({
        action: "script", isRetry: true, correlationId: CID,
        readyAt: 0, previousCode: "rate_limited", bannerReady: false,
        generator, sinks,
      });
    }
    expect(track.mock.calls.map((c) => c[0])).not.toContain("ai_retry_click");
    const suppressed = breadcrumb.mock.calls.filter((c) => c[0] === "retry-click-suppressed");
    expect(suppressed).toHaveLength(3);
    // All carry the same correlationId — joinable across the reconnect storm.
    for (const call of suppressed) expect(call[1]).toMatchObject({ correlationId: CID });
    expect(generator).not.toHaveBeenCalled();
  });

  it("interleaved attempts in parallel keep their telemetry sinks isolated by correlationId", async () => {
    // Simulates two concurrent client reconnect retries (e.g. user opened
    // two tabs and both rehydrated). Each runs against its own sinks +
    // correlationId; neither should bleed into the other's trail.
    const mk = () => {
      const track = vi.fn(); const breadcrumb = vi.fn(); const capture = vi.fn();
      const t = [1, 1, 2]; const now = vi.fn(() => t.shift() ?? 2);
      return { sinks: { track, breadcrumb, capture, now } as AiSinks, track, breadcrumb };
    };
    const a = mk(); const b = mk();
    const cidA = "cid-tab-a"; const cidB = "cid-tab-b";

    await Promise.all([
      runAiAttempt({
        action: "script", isRetry: true, correlationId: cidA,
        readyAt: 0, previousCode: "rate_limited", bannerReady: true,
        generator: () => Promise.resolve({}), sinks: a.sinks,
      }),
      runAiAttempt({
        action: "meta", isRetry: true, correlationId: cidB,
        readyAt: 0, previousCode: "rate_limited", bannerReady: true,
        generator: () => Promise.resolve({}), sinks: b.sinks,
      }),
    ]);

    for (const call of a.track.mock.calls) expect(call[1]).toMatchObject({ correlationId: cidA });
    for (const call of b.track.mock.calls) expect(call[1]).toMatchObject({ correlationId: cidB });
    // Sinks never see the other tab's id.
    for (const call of a.track.mock.calls) expect(call[1]).not.toMatchObject({ correlationId: cidB });
    for (const call of b.track.mock.calls) expect(call[1]).not.toMatchObject({ correlationId: cidA });
  });
});



