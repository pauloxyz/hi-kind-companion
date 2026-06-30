/**
 * App-wide error primitives.
 *
 * Three goals:
 *   1. A single `AppError` class that carries a USER-FACING message (safe to
 *      show in a toast / error page) AND a developer code/cause for logs.
 *   2. `toAppError(unknown)` so any catch block can normalize whatever the
 *      runtime throws (Error, string, Supabase PostgrestError, fetch Response,
 *      Zod issues, …) into the same shape with a sensible PT-BR fallback.
 *   3. `friendlyMessage(err)` — never returns a raw stack or DB error to the
 *      user. Maps known error codes to localized phrases; otherwise returns a
 *      generic "algo deu errado, tente novamente" message.
 *
 * NOT for: control-flow / navigation (use TanStack `redirect()` / `notFound()`).
 */

export type AppErrorKind =
  | "validation"     // input failed schema/business validation
  | "unauthorized"   // missing or invalid session
  | "forbidden"      // session OK but role/permission insufficient
  | "not_found"      // resource doesn't exist
  | "conflict"       // duplicate key, optimistic lock, etc.
  | "rate_limited"   // throttled
  | "upstream"       // external service failed (AI gateway, Stripe, …)
  | "network"        // fetch failed / offline
  | "internal";      // catch-all

interface AppErrorOptions {
  kind?: AppErrorKind;
  /** Short stable code for logs/analytics (e.g. "stripe.checkout_failed"). */
  code?: string;
  /** HTTP status hint when thrown from a server route. */
  status?: number;
  /** Original error for logging — never serialized to the user. */
  cause?: unknown;
  /** Extra structured context for server logs. */
  context?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly code?: string;
  readonly status?: number;
  readonly context?: Record<string, unknown>;
  /** Marker so `instanceof AppError` works across HMR boundaries. */
  readonly __isAppError = true as const;

  constructor(userMessage: string, options: AppErrorOptions = {}) {
    super(userMessage);
    this.name = "AppError";
    this.kind = options.kind ?? "internal";
    this.code = options.code;
    this.status = options.status ?? defaultStatusFor(this.kind);
    this.context = options.context;
    if (options.cause !== undefined) {
      // Node/Workers both honor `Error.cause`.
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function defaultStatusFor(kind: AppErrorKind): number {
  switch (kind) {
    case "validation":   return 400;
    case "unauthorized": return 401;
    case "forbidden":    return 403;
    case "not_found":    return 404;
    case "conflict":     return 409;
    case "rate_limited": return 429;
    case "upstream":     return 502;
    case "network":      return 503;
    case "internal":     return 500;
  }
}

export function isAppError(value: unknown): value is AppError {
  return (
    value instanceof AppError ||
    (typeof value === "object" && value !== null && (value as { __isAppError?: boolean }).__isAppError === true)
  );
}

/** PT-BR fallback messages used when an unknown error reaches `toAppError`. */
const FALLBACK_BY_KIND: Record<AppErrorKind, string> = {
  validation:   "Alguns campos precisam de atenção. Revise e tente novamente.",
  unauthorized: "Você precisa entrar na sua conta para continuar.",
  forbidden:    "Você não tem permissão para fazer isso.",
  not_found:    "Não encontramos o que você está procurando.",
  conflict:     "Esse item já existe ou foi alterado em outra aba. Recarregue e tente de novo.",
  rate_limited: "Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.",
  upstream:     "Um serviço externo está instável agora. Tente novamente em alguns minutos.",
  network:      "Sem conexão com o servidor. Verifique sua internet e tente novamente.",
  internal:     "Algo deu errado do nosso lado. Tente novamente — se persistir, fale com o suporte.",
};

/**
 * Best-effort kind inference from an unknown error. Recognizes common shapes
 * (PostgrestError, AuthError, fetch Response, Zod ZodError, plain { code }).
 */
export function inferErrorKind(err: unknown): AppErrorKind {
  if (isAppError(err)) return err.kind;

  // Zod issues — `.issues` is the canonical marker; `.name === 'ZodError'`
  // also fires for re-thrown ZodErrors across module boundaries.
  if (err && typeof err === "object") {
    const e = err as { name?: string; status?: number; code?: string; issues?: unknown };
    if (e.name === "ZodError" || Array.isArray(e.issues)) return "validation";
    if (typeof e.status === "number") {
      if (e.status === 400) return "validation";
      if (e.status === 401) return "unauthorized";
      if (e.status === 403) return "forbidden";
      if (e.status === 404) return "not_found";
      if (e.status === 409) return "conflict";
      if (e.status === 429) return "rate_limited";
      if (e.status >= 500 && e.status < 600) return "upstream";
    }
    if (typeof e.code === "string") {
      const c = e.code.toLowerCase();
      if (c.includes("unauth") || c === "pgrst301") return "unauthorized";
      if (c.includes("forbid") || c === "42501")    return "forbidden";
      if (c === "23505" || c.includes("conflict"))  return "conflict";
      if (c.includes("not_found") || c === "pgrst116") return "not_found";
      if (c.includes("rate")) return "rate_limited";
    }
  }

  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return "network";
  }
  return "internal";
}

/**
 * Normalize ANY thrown value into an AppError without leaking internals to
 * the user. The original error is preserved on `.cause` for server logs.
 */
export function toAppError(err: unknown, overrides: AppErrorOptions = {}): AppError {
  if (isAppError(err)) {
    if (overrides.kind || overrides.code || overrides.status || overrides.context) {
      return new AppError(err.message, { ...err, ...overrides, cause: err.cause });
    }
    return err;
  }

  const kind = overrides.kind ?? inferErrorKind(err);
  // When we successfully classified the error from a structured signal
  // (recognized status/code → non-internal kind), prefer the PT-BR fallback
  // over the raw wire text. This catches plain-object errors that
  // `pickReadableMessage` can't see (e.g. `{ code: "42501", message: "…" }`).
  const wasClassified = kind !== "internal" || isAppError(err);
  const userMessage = overrides.code || wasClassified
    ? FALLBACK_BY_KIND[kind]
    : pickReadableMessage(err) ?? FALLBACK_BY_KIND[kind];

  return new AppError(userMessage, { kind, cause: err, ...overrides });
}

/**
 * Pull a short, safe-ish message out of an unknown error. Strips known
 * leakable prefixes (e.g. `PostgrestError: …`, stack lines). Returns
 * undefined when nothing usable exists — caller falls back to the
 * kind-based phrase.
 */
function pickReadableMessage(err: unknown): string | undefined {
  if (typeof err === "string") {
    if (err.length === 0 || err.length >= 300) return undefined;
    // String might still carry leakable substrings — same filter as below.
    if (/postgrest|sqlstate|jwt|jws|bearer|permission denied|relation .* (does not|doesn't) exist|duplicate key/i.test(err)) {
      return undefined;
    }
    return err;
  }
  if (err instanceof Error) {
    const msg = err.message?.trim();
    if (!msg) return undefined;
    // Don't surface raw DB messages, stack lines, or internal markers.
    if (/at\s+\w+\s+\(/.test(msg)) return undefined;
    if (/postgrest|sqlstate|jwt|jws|bearer|permission denied|relation .* (does not|doesn't) exist|duplicate key/i.test(msg)) return undefined;
    if (msg.length > 240) return undefined;

    // Structured errors (HTTP status or recognized error code) are better
    // served by the kind-based PT-BR fallback than by surfacing the raw
    // wire text (e.g. "Bad Gateway", "Not Found", "permission denied …").
    const e = err as Error & { status?: unknown; code?: unknown };
    if (typeof e.status === "number") return undefined;
    if (typeof e.code === "string" && e.code.length > 0) return undefined;

    return msg;
  }
  return undefined;
}


/** Convenience: always return a user-facing PT-BR string. */
export function friendlyMessage(err: unknown): string {
  return toAppError(err).message;
}

/**
 * Throwable: validates `input` with a Zod-like schema and converts any
 * failure into a validation AppError so callers don't need to know about
 * ZodError internals. Works with any object exposing `.safeParse`.
 */
export function assertInput<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: unknown } },
  input: unknown,
  message = "Verifique os campos e tente novamente.",
): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new AppError(message, {
    kind: "validation",
    code: "input.invalid",
    cause: result.error,
  });
}
