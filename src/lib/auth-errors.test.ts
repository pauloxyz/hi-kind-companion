/**
 * Unit tests for toAuthUiError() — the single normalizer used by every
 * auth flow (signin / signup / reset / oauth) to produce user-facing copy.
 *
 * Two invariants under test:
 *   1. Every well-known Supabase auth error maps to the expected bucket
 *      and to the canonical PT-BR title (one test per bucket).
 *   2. Raw / leakable strings NEVER reach the user — anything containing
 *      "PostgrestError", "JWT", "permission denied", stack traces, DB
 *      internals, sqlstate codes, or excessively long payloads must fall
 *      back to a safe PT-BR title + description.
 */
import { describe, it, expect } from "vitest";
import { toAuthUiError } from "./auth-errors";

/**
 * Substrings that MUST never appear in `title` or `description`. These
 * are the same patterns filtered by `pickReadableMessage` in errors.ts —
 * keeping them centralized here means adding a new leak vector to
 * errors.ts also gets caught by this suite.
 */
const LEAK_PATTERNS = [
  /postgrest/i,
  /sqlstate/i,
  /\bjwt\b/i,
  /\bjws\b/i,
  /bearer/i,
  /permission denied/i,
  /relation .* (does not|doesn't) exist/i,
  /duplicate key/i,
  /at\s+\w+\s+\(/, // stack frame pattern "at fn (file:line)"
  /pgrst\d+/i,
  /supabase\.co/i,
];

function assertNoLeak(text: string) {
  for (const p of LEAK_PATTERNS) {
    expect(text, `leaked pattern ${p} in "${text}"`).not.toMatch(p);
  }
}

describe("toAuthUiError — bucket mapping", () => {
  it("credentials: invalid_credentials", () => {
    const ui = toAuthUiError(new Error("Invalid login credentials"));
    expect(ui.bucket).toBe("credentials");
    expect(ui.title).toBe("E-mail ou senha incorretos");
    expect(ui.description).toMatch(/senha/i);
  });

  it("credentials: invalid_grant variant", () => {
    const ui = toAuthUiError({ message: "invalid_grant: bad password", status: 400 });
    expect(ui.bucket).toBe("credentials");
  });

  it("hibp: leaked / pwned password", () => {
    const ui = toAuthUiError(new Error("Password is known to be leaked in a data breach"));
    expect(ui.bucket).toBe("hibp");
    expect(ui.title).toMatch(/fraca|vazada/i);
  });

  it("hibp: weak_password code", () => {
    const ui = toAuthUiError(new Error("weak_password"));
    expect(ui.bucket).toBe("hibp");
  });

  it("rate_limit: over_email_send_rate_limit", () => {
    const ui = toAuthUiError(new Error("over_email_send_rate_limit"));
    expect(ui.bucket).toBe("rate_limit");
    expect(ui.title).toMatch(/muitas tentativas/i);
  });

  it("rate_limit: 429 Too Many Requests", () => {
    const ui = toAuthUiError({ message: "Too many requests", status: 429 });
    expect(ui.bucket).toBe("rate_limit");
  });

  it("network: fetch failure", () => {
    const ui = toAuthUiError(new TypeError("Failed to fetch"));
    expect(ui.bucket).toBe("network");
    expect(ui.title).toMatch(/sem conex/i);
  });

  it("network: offline literal", () => {
    const ui = toAuthUiError(new Error("You are offline"));
    expect(ui.bucket).toBe("network");
  });

  it("other: email_not_confirmed", () => {
    const ui = toAuthUiError(new Error("Email not confirmed"));
    expect(ui.bucket).toBe("other");
    expect(ui.title).toMatch(/confirme/i);
  });

  it("other: user_already_registered", () => {
    const ui = toAuthUiError(new Error("User already registered"));
    expect(ui.bucket).toBe("other");
    expect(ui.title).toMatch(/já tem conta/i);
  });

  it("other: captcha failure", () => {
    const ui = toAuthUiError(new Error("captcha verification failed"));
    expect(ui.bucket).toBe("other");
    expect(ui.title).toMatch(/verifica/i);
  });

  it("other: OAuth popup closed", () => {
    const ui = toAuthUiError(new Error("popup_closed_by_user"));
    expect(ui.bucket).toBe("other");
    expect(ui.title).toMatch(/google/i);
  });

  it("other: unsupported_provider", () => {
    const ui = toAuthUiError(new Error("Unsupported provider: google"));
    expect(ui.bucket).toBe("other");
    expect(ui.title).toMatch(/indispon/i);
  });
});

describe("toAuthUiError — never leaks raw messages", () => {
  const rawSamples: Array<{ label: string; err: unknown }> = [
    { label: "PostgrestError text", err: new Error("PostgrestError: permission denied for table users") },
    { label: "SQLSTATE code",       err: new Error("SQLSTATE 42501: permission denied") },
    { label: "JWT complaint",       err: new Error("Invalid JWT: JWS signature verification failed") },
    { label: "duplicate key",       err: new Error('duplicate key value violates unique constraint "users_email_key"') },
    { label: "relation missing",    err: new Error('relation "public.foo" does not exist') },
    { label: "stack frame",         err: new Error("boom\n    at handler (/app/routes/api.ts:42:9)") },
    { label: "PGRST code",          err: { code: "PGRST202", message: "Could not find the function" } },
    { label: "42501 code",          err: { code: "42501", message: "permission denied for schema public" } },
    { label: "supabase.co url",     err: new Error("fetch https://abc.supabase.co/auth/v1/token failed") },
    { label: "very long message",   err: new Error("x".repeat(600)) },
    { label: "plain string",        err: "PostgrestError: forbidden" },
    { label: "null",                err: null },
    { label: "undefined",           err: undefined },
    { label: "empty object",        err: {} },
    { label: "number",              err: 500 },
  ];

  it.each(rawSamples)("$label → safe copy, no leaked internals", ({ err }) => {
    const ui = toAuthUiError(err);
    // Non-empty PT-BR strings, always.
    expect(ui.title.length).toBeGreaterThan(0);
    expect(ui.description.length).toBeGreaterThan(0);
    // Never leaks known-bad substrings.
    assertNoLeak(ui.title);
    assertNoLeak(ui.description);
    // Bucket must be one of the four sanctioned values.
    expect(["credentials", "hibp", "rate_limit", "network", "other"]).toContain(ui.bucket);
  });

  it("permission denied → falls back to safe copy, not raw text", () => {
    const ui = toAuthUiError({ code: "42501", message: "permission denied for schema auth" });
    expect(ui.description).not.toMatch(/permission denied/i);
    expect(ui.description).not.toMatch(/schema auth/i);
  });

  it("description stays reasonably short (< 300 chars)", () => {
    // Even for edge-case long inputs, the user-facing copy is bounded.
    const ui = toAuthUiError(new Error("x".repeat(2000)));
    expect(ui.description.length).toBeLessThan(300);
  });
});

describe("toAuthUiError — determinism", () => {
  it("returns identical output for identical input", () => {
    const a = toAuthUiError(new Error("Invalid login credentials"));
    const b = toAuthUiError(new Error("Invalid login credentials"));
    expect(a).toEqual(b);
  });

  it("more-specific patterns win over generic ones", () => {
    // "weak_password" contains "password" — must match the HIBP rule,
    // NOT any hypothetical future generic "password" rule.
    expect(toAuthUiError(new Error("weak_password")).bucket).toBe("hibp");
    // "over_email_send_rate_limit" contains "email" — must match rate_limit.
    expect(toAuthUiError(new Error("over_email_send_rate_limit")).bucket).toBe("rate_limit");
  });
});
