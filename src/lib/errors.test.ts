import { describe, expect, it } from "vitest";

import { AppError, friendlyMessage, inferErrorKind, isAppError, toAppError } from "./errors";

describe("AppError", () => {
  it("carries a user-facing message and defaults to internal kind", () => {
    const err = new AppError("Algo deu errado");
    expect(err.message).toBe("Algo deu errado");
    expect(err.kind).toBe("internal");
    expect(err.status).toBe(500);
    expect(isAppError(err)).toBe(true);
  });

  it("honors explicit kind/code/status", () => {
    const err = new AppError("Sessão expirada", { kind: "unauthorized", code: "auth.expired" });
    expect(err.kind).toBe("unauthorized");
    expect(err.code).toBe("auth.expired");
    expect(err.status).toBe(401);
  });
});

describe("inferErrorKind", () => {
  it("maps HTTP-ish status codes", () => {
    expect(inferErrorKind({ status: 401 })).toBe("unauthorized");
    expect(inferErrorKind({ status: 403 })).toBe("forbidden");
    expect(inferErrorKind({ status: 404 })).toBe("not_found");
    expect(inferErrorKind({ status: 429 })).toBe("rate_limited");
    expect(inferErrorKind({ status: 503 })).toBe("upstream");
  });

  it("recognizes ZodError-like shapes", () => {
    expect(inferErrorKind({ name: "ZodError", issues: [] })).toBe("validation");
    expect(inferErrorKind({ issues: [{ path: ["x"], message: "bad" }] })).toBe("validation");
  });

  it("recognizes Postgrest-style codes", () => {
    expect(inferErrorKind({ code: "23505" })).toBe("conflict");
    expect(inferErrorKind({ code: "PGRST116" })).toBe("not_found");
    expect(inferErrorKind({ code: "42501" })).toBe("forbidden");
  });

  it("detects fetch network failures", () => {
    expect(inferErrorKind(new TypeError("Failed to fetch"))).toBe("network");
  });

  it("falls back to internal for unknown shapes", () => {
    expect(inferErrorKind(undefined)).toBe("internal");
    expect(inferErrorKind({ foo: "bar" })).toBe("internal");
  });
});

describe("toAppError", () => {
  it("returns the same instance for an AppError without overrides", () => {
    const err = new AppError("x", { kind: "conflict" });
    expect(toAppError(err)).toBe(err);
  });

  it("never leaks raw DB / JWT messages", () => {
    const raw = new Error("PostgrestError: duplicate key value violates unique constraint");
    const mapped = toAppError(raw);
    expect(mapped.message).not.toContain("Postgrest");
    expect(mapped.kind).toBe("internal");
    expect(mapped.cause).toBe(raw);
  });

  it("uses a short readable error message when safe", () => {
    const mapped = toAppError(new Error("Endereço de email inválido"));
    expect(mapped.message).toBe("Endereço de email inválido");
  });

  it("falls back to the kind phrase when message looks like a stack line", () => {
    const mapped = toAppError(new Error("    at handler (file.ts:10:5)"));
    expect(mapped.message).toMatch(/Algo deu errado|Tente novamente/);
  });
});

describe("friendlyMessage", () => {
  it("always returns a non-empty PT-BR string", () => {
    expect(friendlyMessage(undefined)).toMatch(/[A-Za-zÀ-ÿ]/);
    expect(friendlyMessage(null)).toMatch(/[A-Za-zÀ-ÿ]/);
    expect(friendlyMessage("falha qualquer")).toBe("falha qualquer");
  });
});
