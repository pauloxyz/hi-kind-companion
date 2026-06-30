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
