// @vitest-environment jsdom
/**
 * Tests for the shared <InlineQueryError /> component used by every Phase 2
 * route (app.index, app.vagas, app.candidaturas, app.curriculo) to render
 * load failures.
 *
 * Contract under test:
 *   1. Renders a friendly PT-BR message — NEVER the raw DB / network text.
 *   2. Surfaces AppError.code for support triage.
 *   3. Shows the configurable title.
 *   4. Wires the retry button to `onRetry`.
 *   5. Renders nothing when `error` is null/undefined.
 *   6. Has role="alert" so screen readers announce it.
 *
 * We test the component (not each route) because every route uses the same
 * primitive — if this contract holds, all four routes behave consistently.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";

import { InlineQueryError } from "./query-state";
import { AppError } from "@/lib/errors";

afterEach(cleanup);

describe("InlineQueryError", () => {
  it("renders nothing when error is null", () => {
    const { container } = render(<InlineQueryError error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the friendly PT-BR message for an AppError and never leaks the cause", () => {
    const err = new AppError("Sua sessão expirou. Faça login novamente.", {
      kind: "unauthorized",
      code: "auth.session_expired",
      cause: new Error("JWT expired: aud=authenticated sub=abc-123"),
    });

    render(<InlineQueryError error={err} title="Não foi possível carregar." />);

    // Friendly headline + message are visible.
    expect(screen.getByText("Não foi possível carregar.")).toBeTruthy();
    expect(
      screen.getByText("Sua sessão expirou. Faça login novamente."),
    ).toBeTruthy();

    // Stable code for triage is shown.
    expect(screen.getByText(/auth\.session_expired/)).toBeTruthy();

    // Cause/stack must never reach the DOM.
    expect(screen.queryByText(/JWT expired/i)).toBeNull();
    expect(screen.queryByText(/aud=authenticated/)).toBeNull();
  });

  it("maps an unknown thrown value to the generic PT-BR fallback", () => {
    // Simulates a raw Postgrest error reaching the boundary — we must not
    // render its column/permission details to the user.
    const raw = {
      message: "permission denied for table applications",
      code: "42501",
    };

    render(<InlineQueryError error={raw} />);

    // No raw DB text.
    expect(screen.queryByText(/permission denied/i)).toBeNull();
    expect(screen.queryByText(/applications/i)).toBeNull();

    // Default title is shown.
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy();

    // Some friendly PT-BR copy is rendered. We don't assert the exact
    // sentence so the wording can evolve without breaking the test.
    const alert = screen.getByRole("alert");
    expect(alert.textContent ?? "").toMatch(/tente novamente|aguarde|conex/i);
  });

  it("renders the retry button only when onRetry is provided and calls it on click", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const err = new AppError("Falha temporária.", { kind: "upstream" });

    render(<InlineQueryError error={err} onRetry={onRetry} />);

    const button = screen.getByRole("button", { name: /tentar novamente/i });
    await user.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the retry button when onRetry is not provided", () => {
    render(<InlineQueryError error={new AppError("x")} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("exposes role=alert so assistive tech announces the failure", () => {
    render(<InlineQueryError error={new AppError("x")} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
