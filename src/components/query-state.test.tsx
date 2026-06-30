// @vitest-environment jsdom
/**
 * Tests for the shared <InlineQueryError /> component used by every Phase 2
 * route (app.index, app.vagas, app.candidaturas, app.curriculo) to render
 * load failures.
 *
 * Contract under test:
 *   1. Renders a friendly PT-BR message for AppError and unknown shapes.
 *   2. Maps known Postgrest/HTTP shapes (42501, 23505, pgrst116, 404, 5xx)
 *      to friendly PT-BR copy and never leaks the raw DB/network text.
 *   3. Surfaces AppError.code for support triage.
 *   4. Shows the configurable title.
 *   5. Wires the retry button to `onRetry` and supports keyboard focus.
 *   6. Omits the retry button when `onRetry` is absent — message still shows.
 *   7. Renders nothing when `error` is null/undefined.
 *   8. Has role="alert" so screen readers announce it.
 *
 * We test the component (not each route) because every route uses the same
 * primitive — if this contract holds, all four routes behave consistently.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { InlineQueryError } from "./query-state";
import { AppError, type AppErrorKind } from "@/lib/errors";

afterEach(cleanup);

/** Forbidden substrings that must NEVER appear in user-facing error UI. */
const LEAKABLE = [
  /JWT/i,
  /aud=/,
  /sub=/,
  /postgrest/i,
  /sqlstate/i,
  /permission denied/i,
  /relation .* does not exist/i,
  /duplicate key value/i,
  /at\s+\w+\s+\(/, // stack-frame shape
];

function assertNoLeak(html: string) {
  for (const pat of LEAKABLE) {
    expect(html, `leak: ${pat}`).not.toMatch(pat);
  }
}

describe("InlineQueryError — null/undefined", () => {
  it("renders nothing when error is null", () => {
    const { container } = render(<InlineQueryError error={null} />);
    expect(container.innerHTML).toBe("");
  });
  it("renders nothing when error is undefined", () => {
    const { container } = render(<InlineQueryError error={undefined} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("InlineQueryError — AppError variants", () => {
  const cases: Array<{ kind: AppErrorKind; userMsg: string; match: RegExp }> = [
    { kind: "validation",   userMsg: "Confira os campos destacados.",   match: /campos/i },
    { kind: "unauthorized", userMsg: "Sua sessão expirou.",              match: /sessão/i },
    { kind: "forbidden",    userMsg: "Você não tem acesso a isso.",      match: /acesso/i },
    { kind: "not_found",    userMsg: "Esse item não existe mais.",       match: /existe/i },
    { kind: "conflict",     userMsg: "Já existe um registro assim.",     match: /existe/i },
    { kind: "rate_limited", userMsg: "Tente em alguns segundos.",        match: /segundos/i },
    { kind: "upstream",     userMsg: "O Gmail está fora do ar.",         match: /gmail/i },
    { kind: "network",      userMsg: "Sem conexão com o servidor.",      match: /conexão/i },
    { kind: "internal",     userMsg: "Algo deu errado.",                 match: /errado/i },
  ];

  for (const c of cases) {
    it(`renders friendly message for kind="${c.kind}" and leaks nothing`, () => {
      const err = new AppError(c.userMsg, {
        kind: c.kind,
        code: `test.${c.kind}`,
        cause: new Error("postgrest: JWT expired aud=authenticated sub=abc at handler (foo.ts:1)"),
      });
      render(<InlineQueryError error={err} />);
      expect(screen.getByText(c.match)).toBeTruthy();
      expect(screen.getByText(/test\./)).toBeTruthy(); // code visible
      assertNoLeak(document.body.innerHTML);
    });
  }
});

describe("InlineQueryError — Postgrest/HTTP shapes", () => {
  // Each case: a raw error shape the supabase client might surface. We assert
  // that (a) the UI renders some friendly PT-BR copy and (b) no raw internal
  // text leaks. The exact wording is owned by errors.ts and can evolve.
  const cases = [
    { name: "42501 permission denied",
      err: { code: "42501", message: "permission denied for table applications" } },
    { name: "23505 duplicate key",
      err: { code: "23505", message: "duplicate key value violates unique constraint" } },
    { name: "PGRST116 no rows",
      err: { code: "PGRST116", message: "JSON object requested, no rows" } },
    { name: "PGRST301 JWT expired",
      err: { code: "PGRST301", message: "JWT expired" } },
    { name: "HTTP 404",
      err: { status: 404, message: "Not Found" } },
    { name: "HTTP 500",
      err: { status: 500, message: "Internal Server Error: relation public.x does not exist" } },
    { name: "HTTP 502",
      err: { status: 502, message: "Bad Gateway" } },
    { name: "HTTP 429",
      err: { status: 429, message: "Too Many Requests" } },
    { name: "TypeError network",
      err: new TypeError("Failed to fetch") },
    { name: "plain string",
      err: "alguma coisa quebrou no postgrest sqlstate 42P01" },
  ] as const;

  for (const c of cases) {
    it(`${c.name}: shows PT-BR friendly text, leaks nothing`, () => {
      render(<InlineQueryError error={c.err} />);
      const alert = screen.getByRole("alert");
      const txt = (alert.textContent ?? "").trim();

      // Default title is shown.
      expect(txt).toMatch(/não foi possível carregar/i);

      // Some PT-BR sentence is rendered (we don't pin exact wording).
      expect(txt).toMatch(
        /tente novamente|aguarde|conex|suporte|permissão|acesso|sessão|encontramos|existe|instável|atenção|alterado|entrar|conta/i,
      );

      assertNoLeak(document.body.innerHTML);
    });
  }
});

describe("InlineQueryError — retry button", () => {
  it("renders the retry button when onRetry is provided and calls it on click", () => {
    const onRetry = vi.fn();
    render(<InlineQueryError error={new AppError("Falha.", { kind: "upstream" })} onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: /tentar novamente/i });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the retry button when onRetry is absent but still shows the friendly message", () => {
    render(<InlineQueryError error={new AppError("Sem conexão.", { kind: "network" })} />);
    expect(screen.queryByRole("button")).toBeNull();
    // Message still rendered for the user.
    expect(screen.getByText(/sem conexão/i)).toBeTruthy();
    // Alert region still present.
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("renders a custom retry label when provided", () => {
    render(
      <InlineQueryError
        error={new AppError("x")}
        onRetry={() => {}}
        retryLabel="Recarregar painel"
      />,
    );
    expect(screen.getByRole("button", { name: /recarregar painel/i })).toBeTruthy();
  });
});

describe("InlineQueryError — accessibility", () => {
  it("exposes role=alert so assistive tech announces the failure", () => {
    render(<InlineQueryError error={new AppError("x")} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("retry button is a real <button>, keyboard-focusable, and not aria-hidden", () => {
    render(<InlineQueryError error={new AppError("x")} onRetry={() => {}} />);
    const button = screen.getByRole("button", { name: /tentar novamente/i });

    // Native <button> is focusable by default; tabIndex must not be -1.
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("tabindex")).not.toBe("-1");
    expect(button.getAttribute("aria-hidden")).not.toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);

    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("retry button activates on Enter/Space via click (default browser behavior)", () => {
    const onRetry = vi.fn();
    render(<InlineQueryError error={new AppError("x")} onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: /tentar novamente/i });
    button.focus();
    // jsdom doesn't translate keydown→click for <button>; simulate explicitly.
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalled();
  });

  it("message text is inside the alert region so it's announced", () => {
    render(
      <InlineQueryError
        error={new AppError("Detalhe específico.", { kind: "internal" })}
        title="Falhou."
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Falhou.");
    expect(alert.textContent).toContain("Detalhe específico.");
  });

  it("decorative AlertCircle icon is hidden from assistive tech", () => {
    render(<InlineQueryError error={new AppError("x")} />);
    const alert = screen.getByRole("alert");
    const icon = alert.querySelector("svg[aria-hidden]");
    expect(icon).not.toBeNull();
  });
});

describe("InlineQueryError — Phase 2 route titles", () => {
  it("matches each Phase 2 route's failure copy", () => {
    const titles = [
      "Não foi possível carregar suas candidaturas.",
      "Não foi possível carregar seu painel.",
      "Não foi possível carregar as vagas.",
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
      expect(screen.getByText(/sem conexão/i)).toBeTruthy();
    }
  });
});
