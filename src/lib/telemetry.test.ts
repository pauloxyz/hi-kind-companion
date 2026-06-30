// Validates the correlationId contract: shape, uniqueness, and that the
// same id flows unchanged through the orchestrator's telemetry + breadcrumb
// payloads (server → client → analytics joinability depends on this).

import { describe, it, expect, vi } from "vitest";
import { newCorrelationId } from "./telemetry";
import { runAiAttempt, type AiSinks } from "./ai-retry";

// RFC4122 v4 OR the documented fallback `cid_<base36>_<base36>`. Anything
// else means the contract drifted — dashboards and Sentry queries would
// stop matching across logs.
const ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|cid_[0-9a-z]+_[0-9a-z]+)$/i;

describe("newCorrelationId — format & uniqueness", () => {
  it("returns a value matching the expected shape", () => {
    for (let i = 0; i < 20; i++) {
      const id = newCorrelationId();
      expect(id, `bad id: ${id}`).toMatch(ID_RE);
    }
  });

  it("is unique across many calls (no collisions in 1k samples)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1_000; i++) set.add(newCorrelationId());
    expect(set.size).toBe(1_000);
  });

  it("falls back to cid_* when crypto.randomUUID is absent", () => {
    const original = globalThis.crypto;
    // Simulate a runtime without randomUUID (e.g. older webviews).
    // @ts-expect-error — narrow override for the test only.
    globalThis.crypto = undefined;
    try {
      const id = newCorrelationId();
      expect(id).toMatch(/^cid_[0-9a-z]+_[0-9a-z]+$/);
    } finally {
      globalThis.crypto = original;
    }
  });
});

describe("correlationId propagation through runAiAttempt", () => {
  // The orchestrator must never mutate, regenerate, or partially attach the
  // id. If any sink call omits or rewrites it, journey-join breaks.
  function makeSinks() {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    const t = [1, 1, 2];
    const now = vi.fn(() => t.shift() ?? 2);
    const sinks: AiSinks = { track, breadcrumb, capture, now };
    return { sinks, track, breadcrumb, capture };
  }

  function assertCorrelationEverywhere(
    cid: string,
    track: ReturnType<typeof vi.fn>,
    breadcrumb: ReturnType<typeof vi.fn>,
    capture: ReturnType<typeof vi.fn>,
  ) {
    expect(track.mock.calls.length).toBeGreaterThan(0);
    expect(breadcrumb.mock.calls.length).toBeGreaterThan(0);
    for (const call of track.mock.calls) {
      expect(call[1]).toMatchObject({ correlationId: cid });
    }
    for (const call of breadcrumb.mock.calls) {
      expect(call[1]).toMatchObject({ correlationId: cid });
    }
    for (const call of capture.mock.calls) {
      // Sentry tags use snake_case `correlation_id` and must equal the same value.
      expect(call[1]).toMatchObject({ correlation_id: cid });
    }
  }

  it("propagates a freshly generated id unchanged through a successful attempt", async () => {
    const { sinks, track, breadcrumb, capture } = makeSinks();
    const cid = newCorrelationId();
    await runAiAttempt({
      action: "script", isRetry: false, correlationId: cid, readyAt: 0,
      generator: () => Promise.resolve({}),
      sinks,
    });
    assertCorrelationEverywhere(cid, track, breadcrumb, capture);
  });

  it("propagates the id through a rate_limited failure (track + breadcrumb + capture)", async () => {
    const { sinks, track, breadcrumb, capture } = makeSinks();
    const cid = newCorrelationId();
    await runAiAttempt({
      action: "script", isRetry: false, correlationId: cid, readyAt: 0,
      generator: () => Promise.reject(new Error("AI_ERR|rate_limited|30|slow")),
      sinks,
    });
    assertCorrelationEverywhere(cid, track, breadcrumb, capture);
  });

  it("propagates the id through a no_credits failure", async () => {
    const { sinks, track, breadcrumb, capture } = makeSinks();
    const cid = newCorrelationId();
    await runAiAttempt({
      action: "meta", isRetry: false, correlationId: cid, readyAt: 0,
      generator: () => Promise.reject(new Error("AI_ERR|no_credits|0|sem creditos")),
      sinks,
    });
    assertCorrelationEverywhere(cid, track, breadcrumb, capture);
  });

  it("propagates the id through the suppressed-retry path (no track call, breadcrumb still tagged)", async () => {
    const { sinks, breadcrumb } = makeSinks();
    const cid = newCorrelationId();
    await runAiAttempt({
      action: "script", isRetry: true, correlationId: cid, readyAt: 0,
      previousCode: "rate_limited", bannerReady: false,
      generator: () => Promise.resolve({}),
      sinks,
    });
    // Only the suppression breadcrumb fires — but it MUST carry the same id.
    expect(breadcrumb).toHaveBeenCalledTimes(1);
    expect(breadcrumb.mock.calls[0][1]).toMatchObject({ correlationId: cid });
  });

  it("two distinct attempts use two distinct ids and never bleed across sinks", async () => {
    const { sinks: s1, track: t1, breadcrumb: b1 } = makeSinks();
    const { sinks: s2, track: t2, breadcrumb: b2 } = makeSinks();
    const cid1 = newCorrelationId();
    const cid2 = newCorrelationId();
    expect(cid1).not.toBe(cid2);

    await runAiAttempt({
      action: "script", isRetry: false, correlationId: cid1, readyAt: 0,
      generator: () => Promise.resolve({}), sinks: s1,
    });
    await runAiAttempt({
      action: "meta", isRetry: false, correlationId: cid2, readyAt: 0,
      generator: () => Promise.resolve({}), sinks: s2,
    });

    for (const call of t1.mock.calls) expect(call[1]).toMatchObject({ correlationId: cid1 });
    for (const call of b1.mock.calls) expect(call[1]).toMatchObject({ correlationId: cid1 });
    for (const call of t2.mock.calls) expect(call[1]).toMatchObject({ correlationId: cid2 });
    for (const call of b2.mock.calls) expect(call[1]).toMatchObject({ correlationId: cid2 });
    // Negative check — no cross-contamination either way.
    for (const call of t1.mock.calls) expect(call[1]).not.toMatchObject({ correlationId: cid2 });
    for (const call of t2.mock.calls) expect(call[1]).not.toMatchObject({ correlationId: cid1 });
  });
});
