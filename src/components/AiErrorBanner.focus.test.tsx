// @vitest-environment jsdom

// Integration test: when the rate-limit countdown ends and the banner
// flips from "waiting" → "ready", focus must move to the retry button
// so keyboard / screen-reader users know they can act.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import { AiErrorBanner, type AiErrorInfo } from "./AiErrorBanner";

// jsdom doesn't implement rAF in a stable way for our purposes — make it sync.
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0 as unknown as number;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const error: AiErrorInfo = {
  action: "script",
  code: "rate_limited",
  msg: "Muitas requisições.",
  retryAt: Date.now() + 5_000,
};

function Harness({ initialSeconds }: { initialSeconds: number }) {
  // Parent owns secondsLeft so the test can drive the countdown.
  const [secs, setSecs] = useState(initialSeconds);
  return (
    <>
      <button data-testid="outside">outside</button>
      <AiErrorBanner
        error={error}
        secondsLeft={secs}
        onRetry={() => {}}
        onDismiss={() => {}}
        busy={false}
      />
      <button data-testid="tick" onClick={() => setSecs(0)}>tick</button>
    </>
  );
}

describe("AiErrorBanner focus integration", () => {
  it("moves focus to the retry button when countdown reaches 0", async () => {
    const { getByTestId } = render(<Harness initialSeconds={3} />);

    // Start with focus somewhere outside the banner.
    const outside = getByTestId("outside") as HTMLButtonElement;
    outside.focus();
    expect(document.activeElement).toBe(outside);

    // While waiting, retry is disabled — focus must NOT auto-move.
    const retry = getByTestId("ai-error-retry") as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(document.activeElement).toBe(outside);

    // Drive the countdown to 0 — banner should flip to "ready" and grab focus.
    await act(async () => {
      getByTestId("tick").click();
    });

    expect(retry.disabled).toBe(false);
    expect(document.activeElement).toBe(retry);

    // The dedicated assertive live region carries the announcement text.
    expect(getByTestId("ai-error-live").textContent).toMatch(/Pronto/i);
  });

  it("does NOT steal focus when the banner renders already-ready (no transition)", async () => {
    const { getByTestId } = render(<Harness initialSeconds={0} />);
    const outside = getByTestId("outside") as HTMLButtonElement;
    outside.focus();
    // No waiting→ready transition happened, so focus should stay put.
    expect(document.activeElement).toBe(outside);
  });
});
