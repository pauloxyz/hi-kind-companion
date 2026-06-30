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

