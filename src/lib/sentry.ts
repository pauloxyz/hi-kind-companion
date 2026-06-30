// Thin Sentry wrapper — no-op when VITE_SENTRY_DSN is unset so dev/test
// runs don't need a DSN. Centralized so we never import @sentry/react
// scattered across the codebase.

import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry(): void {
  if (initialized || typeof window === "undefined") return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
  initialized = true;
}

type Tags = Record<string, string | number | boolean | undefined>;

/** Report a handled exception with breadcrumb-friendly tags/extra. */
export function captureAiError(
  err: unknown,
  tags: Tags = {},
  extra: Record<string, unknown> = {},
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    Object.entries(tags).forEach(([k, v]) => {
      if (v !== undefined) scope.setTag(k, String(v));
    });
    Object.entries(extra).forEach(([k, v]) => scope.setExtra(k, v));
    if (err instanceof Error) Sentry.captureException(err);
    else Sentry.captureMessage(String(err), "error");
  });
}

/** Attach a correlation id to the current scope so subsequent events carry it. */
export function setCorrelationId(id: string): void {
  if (!initialized) return;
  Sentry.getCurrentScope().setTag("correlation_id", id);
}
