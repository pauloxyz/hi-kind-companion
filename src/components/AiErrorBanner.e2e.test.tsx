// @vitest-environment jsdom

// End-to-end-style integration: combines the AiErrorBanner DOM behaviour
// with the orchestrator-driven Sentry breadcrumb trail to mirror the real
// user journey. We intentionally drive the same primitives the page uses
// (`runAiAttempt` + `AiErrorBanner`) instead of going through Playwright
// against the live app, because the live page requires Supabase auth and a
// real AI gateway response — neither is reproducible in a deterministic
// unit test. A Playwright spec can be layered on top of this once those
// fixtures land; the contract verified here (breadcrumb order, focus
// transition) is the same one the spec would assert.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { AiErrorBanner, type AiErrorInfo } from "./AiErrorBanner";
import { runAiAttempt, type AiSinks } from "@/lib/ai-retry";

beforeEach(() => {
  // jsdom's rAF is async — make it synchronous so the focus transition
  // is observable right after the countdown tick.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0 as unknown as number;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const CID = "cid-e2e-00000000-0000-4000-8000-000000000000";

describe("AiErrorBanner — 402 journey (real breadcrumb order)", () => {
  it("emits generate-click → ai-error → retry-click → retry-success in order, with one correlationId", async () => {
    const track = vi.fn();
    const breadcrumb = vi.fn();
    const capture = vi.fn();
    // Timestamps drive latency + waitedPastUnlockMs deterministically.
    const stream = [
      /* attempt 1: */ 0, 0, 120,
      /* attempt 2: */ 30_000, 30_000, 30_300,
    ];
    const now = vi.fn(() => stream.shift() ?? 30_300);
    const sinks: AiSinks = { track, breadcrumb, capture, now };

    // Attempt 1: 402 from the gateway.
    await runAiAttempt({
      action: "meta", isRetry: false, correlationId: CID, readyAt: 0,
      generator: () => Promise.reject(new Error("AI_ERR|no_credits|0|Sem créditos")),
      sinks,
    });

    // Render the banner in its "blocked" state — for 402 the retry button
    // is intentionally hidden (admin action required); only the message
    // + assertive live region should be present.
    const error402: AiErrorInfo = {
      action: "meta", code: "no_credits",
      msg: "Os créditos de IA acabaram. Avise o administrador.",
      retryAt: 0,
    };
    const { queryByTestId, getByTestId, unmount } = render(
      <AiErrorBanner
        error={error402} secondsLeft={0}
        onRetry={() => {}} onDismiss={() => {}} busy={false}
      />,
    );
    expect(getByTestId("ai-error-banner").getAttribute("data-code")).toBe("no_credits");
    expect(queryByTestId("ai-error-retry")).toBeNull(); // 402 hides retry intentionally
    expect(getByTestId("ai-error-banner").getAttribute("aria-live")).toBe("assertive");
    unmount();

    // Attempt 2: admin recharged — user-driven retry succeeds.
    await runAiAttempt({
      action: "meta", isRetry: true, correlationId: CID, readyAt: 29_500,
      previousCode: "no_credits", bannerReady: true,
      generator: () => Promise.resolve({ title: "ok" }),
      sinks,
    });

    // The Sentry trail across the whole journey, joinable by correlationId.
    expect(breadcrumb.mock.calls.map((c) => c[0])).toEqual([
      "generate-click", "ai-error", "retry-click", "retry-success",
    ]);
    for (const call of breadcrumb.mock.calls) {
      expect(call[1]).toMatchObject({ correlationId: CID });
    }
    // 402 escalates to "error", success stays at default "info".
    expect(breadcrumb.mock.calls.find((c) => c[0] === "ai-error")?.[2]).toBe("error");
    // waitedPastUnlockMs derived from the actual timestamps.
    expect(track).toHaveBeenCalledWith("ai_retry_click", expect.objectContaining({
      action: "meta", correlationId: CID, waitedPastUnlockMs: 500,
    }));
  });
});

function FocusHarness({ initialSeconds }: { initialSeconds: number }) {
  const [secs, setSecs] = useState(initialSeconds);
  const error: AiErrorInfo = {
    action: "script", code: "rate_limited",
    msg: "Muitas requisições.", retryAt: Date.now() + initialSeconds * 1_000,
  };
  return (
    <>
      <button data-testid="outside">outside</button>
      <AiErrorBanner
        error={error} secondsLeft={secs}
        onRetry={() => {}} onDismiss={() => {}} busy={false}
      />
      <button data-testid="tick" onClick={() => setSecs(0)}>tick</button>
    </>
  );
}

describe("AiErrorBanner — focus on unlock (rate_limited countdown)", () => {
  it("moves focus to 'Tentar de novo' once secondsLeft reaches 0", async () => {
    const { getByTestId } = render(<FocusHarness initialSeconds={3} />);

    const outside = getByTestId("outside") as HTMLButtonElement;
    outside.focus();
    expect(document.activeElement).toBe(outside);

    const retry = getByTestId("ai-error-retry") as HTMLButtonElement;
    expect(retry.disabled).toBe(true); // still waiting → can't focus yet
    expect(document.activeElement).toBe(outside);

    // Drive the countdown to 0: banner transitions waiting → ready.
    await act(async () => {
      fireEvent.click(getByTestId("tick"));
    });

    expect(retry.disabled).toBe(false);
    expect(document.activeElement).toBe(retry);
    expect(getByTestId("ai-error-live").textContent).toMatch(/Pronto/i);
  });
});
