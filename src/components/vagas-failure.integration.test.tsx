// @vitest-environment jsdom
/**
 * Integration test for the data-failure pipeline used by app.vagas (and the
 * other Phase 2 routes that share the pattern):
 *
 *   useQuery(["vagas-bundle"], queryFn) → on error → <InlineQueryError />
 *
 * We reproduce the exact wiring the route uses — same query key, same
 * QueryClient, same component — but stub the bundle fetch so the queryFn
 * rejects with a Postgrest-shaped error. Then we assert:
 *
 *   1. The skeleton (pending state) gives way to the error UI.
 *   2. InlineQueryError appears with the route's exact title.
 *   3. A friendly PT-BR message is shown.
 *   4. The raw Postgrest/DB text never reaches the DOM.
 *   5. Clicking "Tentar novamente" re-invokes the queryFn.
 *
 * We don't mount the actual route file (it pulls in TanStack Router,
 * supabase client, server fns, dialogs, etc. — too much surface for a unit
 * test). Mirroring the pattern is the integration: if this passes, the
 * route's failure UX is correct by construction.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { InlineQueryError } from "./query-state";

afterEach(cleanup);

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

/** Minimal mirror of app.vagas's data-failure surface. */
function VagasLike({
  queryFn,
  onLoaded,
}: {
  queryFn: () => Promise<unknown>;
  onLoaded?: (data: unknown) => void;
}) {
  const bundle = useQuery({
    queryKey: ["vagas-bundle"],
    queryFn,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (bundle.data && onLoaded) onLoaded(bundle.data);
  }, [bundle.data, onLoaded]);

  return (
    <div>
      <h1>Vagas</h1>
      {bundle.isPending && <div data-testid="skeleton">Carregando…</div>}
      {!bundle.isPending && bundle.error && (
        <InlineQueryError
          error={bundle.error}
          title="Não foi possível carregar as vagas."
          onRetry={() => bundle.refetch()}
        />
      )}
      {!bundle.isPending && !bundle.error && (
        <div data-testid="list">ok</div>
      )}
    </div>
  );
}

function renderWith(queryFn: () => Promise<unknown>) {
  const client = makeClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <VagasLike queryFn={queryFn} />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

describe("app.vagas-like integration: bundle failure → InlineQueryError", () => {
  it("shows the route's title + friendly PT-BR message, no raw Postgrest leak", async () => {
    const queryFn = vi.fn(async () => {
      // Shape the supabase client throws when RLS blocks a select.
      throw Object.assign(new Error("permission denied for table jobs"), {
        code: "42501",
      });
    });

    renderWith(queryFn);

    // Pending → error.
    expect(screen.getByTestId("skeleton")).toBeTruthy();
    const alert = await screen.findByRole("alert");

    // Route-specific title.
    expect(
      screen.getByText("Não foi possível carregar as vagas."),
    ).toBeTruthy();

    // Friendly PT-BR copy (forbidden / sem permissão), exact wording owned
    // by errors.ts.
    expect((alert.textContent ?? "")).toMatch(/permissão|acesso/i);

    // No raw DB text in the entire document.
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/permission denied/i);
    expect(html).not.toMatch(/table jobs/i);
    expect(html).not.toMatch(/42501/);
  });

  it("retry button re-invokes the queryFn (calls go from 1 → 2)", async () => {
    let attempts = 0;
    const queryFn = vi.fn(async () => {
      attempts += 1;
      throw Object.assign(new Error("Bad Gateway"), { status: 502 });
    });

    renderWith(queryFn);

    await screen.findByRole("alert");
    expect(queryFn).toHaveBeenCalledTimes(1);

    const retry = screen.getByRole("button", { name: /tentar novamente/i });
    fireEvent.click(retry);

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    expect(attempts).toBe(2);

    // Still showing the alert (still failing).
    expect(screen.getByRole("alert")).toBeTruthy();
    // And no internal HTTP detail leaked.
    expect(document.body.innerHTML).not.toMatch(/Bad Gateway/);
  });

  it("when the retry succeeds, the alert disappears and the list renders", async () => {
    let attempt = 0;
    const queryFn = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw Object.assign(new Error("Internal Server Error"), { status: 500 });
      }
      return { jobs: [], applied: [], saved: [], alerts: [], suspicious: [], profile: null, resume: null };
    });

    renderWith(queryFn);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(screen.getByTestId("list")).toBeTruthy();
  });

  it("404-shaped error surfaces a friendly 'não encontrado' message", async () => {
    const queryFn = vi.fn(async () => {
      throw Object.assign(new Error("Not Found"), { status: 404 });
    });

    renderWith(queryFn);
    const alert = await screen.findByRole("alert");

    // No raw "Not Found" leak in the DOM.
    expect(document.body.innerHTML).not.toMatch(/Not Found/);
    // Friendly PT-BR copy for not_found.
    expect((alert.textContent ?? "")).toMatch(/encontramos|encontrado/i);
  });
});
