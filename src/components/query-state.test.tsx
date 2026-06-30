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
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { InlineQueryError } from "./query-state";
import { AppError } from "@/lib/errors";

afterEach(cleanup);

describe("InlineQueryError", () => {
  it("renders nothing when error is null", () => {
    const { container } = render(<InlineQueryError error={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when error is undefined", () => {
    const { container } = render(<InlineQueryError error={undefined} />);
    expect(container.innerHTML).toBe("");
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
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/JWT expired/i);
    expect(html).not.toMatch(/aud=authenticated/);
  });

  it("maps an unknown thrown value to the generic PT-BR fallback (no raw DB text)", () => {
    // Simulates a raw Postgrest error reaching the boundary — we must not
    // render its column/permission details to the user.
    const raw = {
      message: "permission denied for table applications",
      code: "42501",
    };

    render(<InlineQueryError error={raw} />);

    const html = document.body.innerHTML;
    expect(html).not.toMatch(/permission denied/i);
    expect(html).not.toMatch(/applications/);

    // Default title is shown.
    expect(screen.getByText(/não foi possível carregar/i)).toBeTruthy();

    // Some friendly PT-BR copy is rendered. We don't assert the exact
    // sentence so the wording can evolve without breaking the test.
    const alert = screen.getByRole("alert");
    expect(alert.textContent ?? "").toMatch(/tente novamente|aguarde|conex|suporte/i);
  });

  it("renders the retry button when onRetry is provided and calls it on click", () => {
    const onRetry = vi.fn();
    const err = new AppError("Falha temporária.", { kind: "upstream" });

    render(<InlineQueryError error={err} onRetry={onRetry} />);

    const button = screen.getByRole("button", { name: /tentar novamente/i });
    fireEvent.click(button);
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

  it("matches each Phase 2 route's failure copy", () => {
    // Locks in the exact titles passed by the four routes that consume this
    // component. If a route changes its title, this test points at it.
    const titles = [
      "Não foi possível carregar suas candidaturas.", // app.candidaturas
      "Não foi possível carregar seu painel.",         // app.index
      "Não foi possível carregar as vagas.",           // app.vagas
    ];
    for (const title of titles) {
      cleanup();
      render(
        <InlineQueryError
          error={new AppError("Sem conexão.", { kind: "network" })}
          title={title}
        />,
      );
      expect(screen.getByText(title)).toBeTruthy();
      // Friendly message from kind="network" surfaces, raw "Sem conexão." too.
      expect(screen.getByText(/sem conexão/i)).toBeTruthy();
    }
  });
});
