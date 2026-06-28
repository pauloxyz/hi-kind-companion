import { describe, it, expect } from "vitest";
import { scorePassword, isPasswordAcceptable, MIN_ACCEPTABLE_SCORE } from "./PasswordStrength";

/**
 * E2E-style tests covering the full password validation surface.
 * Covers UI scoring + server-equivalent acceptance logic.
 */

describe("scorePassword - basic scoring", () => {
  it("rejects empty string", () => {
    const { score, checks } = scorePassword("");
    expect(score).toBe(0);
    expect(checks.length).toBe(false);
    expect(checks.notCommon).toBe(false);
  });

  it.each([
    ["12345678", 0, "common numeric"],
    ["password", 0, "common word"],
    ["senha123", 0, "common pt-br"],
    ["abcdefgh", 0, "lowercase only short"],
    ["abcdefghij", 0, "lowercase only"],
    ["Abcdefg1", 2, "mixed case + number = fair"],
    ["Abcdefgh1!", 3, "+ symbol = strong"],
    ["Abcdefghij1!xy", 4, "long mixed everything = excellent"],
  ])("scores %s → %i (%s)", (pw, expected) => {
    expect(scorePassword(pw).score).toBe(expected);
  });

  it("clamps common passwords to 1 even if structurally complex", () => {
    expect(scorePassword("Password1").score).toBeLessThanOrEqual(1);
  });
});

describe("isPasswordAcceptable - acceptance gate", () => {
  it("MIN_ACCEPTABLE_SCORE is 2 (fair)", () => {
    expect(MIN_ACCEPTABLE_SCORE).toBe(2);
  });

  it("blocks below minimum", () => {
    expect(isPasswordAcceptable("12345678")).toBe(false);
    expect(isPasswordAcceptable("abcdefgh")).toBe(false);
  });

  it("allows score >= 2", () => {
    expect(isPasswordAcceptable("Abcdefg1")).toBe(true);
    expect(isPasswordAcceptable("Abcdefgh1!")).toBe(true);
    expect(isPasswordAcceptable("Abcdefghij1!xy")).toBe(true);
  });

  it("blocks empty and common", () => {
    expect(isPasswordAcceptable("")).toBe(false);
    expect(isPasswordAcceptable("password")).toBe(false);
  });
});

describe("E2E: common attack patterns blocked", () => {
  const KNOWN_WEAK = [
    "123456",
    "12345678",
    "qwerty",
    "abc123",
    "password",
    "password1",
    "senha",
    "senha123",
    "admin",
    "letmein",
    "iloveyou",
    "111111",
  ];

  it.each(KNOWN_WEAK)("rejects common password: %s", (pw) => {
    expect(isPasswordAcceptable(pw)).toBe(false);
  });

  it("rejects keyboard walks", () => {
    expect(isPasswordAcceptable("qwertyui")).toBe(false);
    expect(isPasswordAcceptable("asdfghjk")).toBe(false);
  });

  it("rejects password padded with simple variations", () => {
    expect(isPasswordAcceptable("password!")).toBe(false);
    expect(isPasswordAcceptable("Password1")).toBe(false);
  });
});

describe("E2E: strong passwords accepted", () => {
  it.each([
    "Tr0ub4dor&3xampl3",
    "C0rrect-Horse!Battery",
    "M1nh@Senh@Forte99",
    "x9$Lp2!qZ#rB7v",
  ])("accepts strong password: %s", (pw) => {
    expect(isPasswordAcceptable(pw)).toBe(true);
  });
});

describe("E2E: scoring contract", () => {
  it("score never exceeds 4", () => {
    const veryLong = "A".repeat(50) + "a1!" + "z".repeat(50);
    expect(scorePassword(veryLong).score).toBeLessThanOrEqual(4);
  });

  it("score never negative", () => {
    expect(scorePassword("").score).toBeGreaterThanOrEqual(0);
    expect(scorePassword("a").score).toBeGreaterThanOrEqual(0);
  });

  it("checks object always returns the expected flags", () => {
    const r = scorePassword("X");
    expect(Object.keys(r.checks).sort()).toEqual(
      ["length", "long", "notCommon", "number", "symbol", "upperLower"].sort(),
    );
  });
});
