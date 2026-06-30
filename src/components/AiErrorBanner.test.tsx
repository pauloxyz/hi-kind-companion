// Renders AiErrorBanner via renderToStaticMarkup (no jsdom needed) and asserts
// the exact UI contract the user relies on for 429/402 retry flows.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiErrorBanner, type AiErrorInfo } from "./AiErrorBanner";

function render(error: AiErrorInfo | null, secondsLeft: number, busy = false) {
  return renderToStaticMarkup(
    <AiErrorBanner
      error={error}
      secondsLeft={secondsLeft}
      onRetry={() => {}}
      onDismiss={() => {}}
      busy={busy}
    />,
  );
}

describe("AiErrorBanner", () => {
  it("renders nothing when there is no error", () => {
    expect(render(null, 0)).toBe("");
  });

  it("429 with secondsLeft > 0: shows countdown, disables retry, no 'ready' badge", () => {
    const out = render(
      { action: "script", code: "rate_limited", msg: "Muitas requisições.", retryAt: Date.now() + 12_000 },
      12,
    );
    expect(out).toContain("Limite temporário atingido");
    expect(out).toContain("Muitas requisições.");
    expect(out).toContain("Aguarde 12s para tentar de novo");
    // Retry button is disabled while waiting.
    expect(out).toMatch(/disabled=""[^>]*data-testid="ai-error-retry"/);
    expect(out).toMatch(/data-waiting="1"/);
    // No "ready" badge until the countdown expires.
    expect(out).not.toContain("ai-error-ready");
  });

  it("429 with secondsLeft === 0: enables retry and shows the 'ready' badge", () => {
    const out = render(
      { action: "script", code: "rate_limited", msg: "Muitas requisições.", retryAt: 0 },
      0,
    );
    expect(out).toContain("Tentar de novo");
    expect(out).not.toContain("Aguarde");
    expect(out).toMatch(/data-waiting="0"/);
    expect(out).not.toMatch(/disabled=""[^>]*data-testid="ai-error-retry"/);
    expect(out).toContain("Pronto — pode tentar de novo");
  });

  it("402 no_credits: blocks retry entirely (no retry button), assertive live region", () => {
    const out = render(
      { action: "meta", code: "no_credits", msg: "Os créditos de IA acabaram.", retryAt: 0 },
      0,
    );
    expect(out).toContain("Créditos de IA esgotados");
    expect(out).toContain("Os créditos de IA acabaram.");
    expect(out).toMatch(/aria-live="assertive"/);
    expect(out).not.toContain('data-testid="ai-error-retry"');
    expect(out).not.toContain('data-testid="ai-error-dismiss"');
  });

  it("busy=true disables the retry button even when no countdown is pending", () => {
    const out = render(
      { action: "script", code: "other", msg: "Falha.", retryAt: 0 },
      0,
      true,
    );
    expect(out).toMatch(/disabled=""[^>]*data-testid="ai-error-retry"/);
  });

  it("exposes data-code and data-action so the page can target the right banner", () => {
    const out = render(
      { action: "meta", code: "rate_limited", msg: "x", retryAt: 0 },
      5,
    );
    expect(out).toMatch(/data-code="rate_limited"/);
    expect(out).toMatch(/data-action="meta"/);
  });
});
