import { describe, it, expect } from "vitest";
import { scorePassword, isPasswordAcceptable, MIN_ACCEPTABLE_SCORE } from "./PasswordStrength";

describe("scorePassword", () => {
  it("rejects empty string", () => {
    const { score, checks } = scorePassword("");
    expect(score).toBe(0);
    expect(checks.length).toBe(false);
    expect(checks.notCommon).toBe(false);
  });

  it.each([
    ["12345678",       0, "common numeric"],
    ["password",       0, "common word"],
    ["senha123",       0, "common pt-br"],
    ["abcdefgh",       0, "lowercase only short"],
    ["abcdefghij",     0, "lowercase only"],
    ["Abcdefg1",       2, "mixed case + number = fair"],
    ["Abcdefgh1!",     3, "+ symbol = strong"],
    ["Abcdefghij1!xy", 4, "long mixed everything = excellent"],
  ])("scores %s → %i (%s)", (pw, expected) => {
    expect(scorePassword(pw).score).toBe(expected);
  });

  it("clamps common passwords to 1 even if structurally complex", () => {
    expect(scorePassword("Password1").score).toBeLessThanOrEqual(1);
  });
});

describe("isPasswordAcceptable", () => {
  it("blocks below MIN_ACCEPTABLE_SCORE", () => {
    expect(MIN_ACCEPTABLE_SCORE).toBe(2);
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
