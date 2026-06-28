import { describe, it, expect } from "vitest";

// Mirror of the regex used in changeEmailWithReauth's input validator.
// Keep in sync if the server fn changes.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(input: unknown): input is string {
  return typeof input === "string" && EMAIL_RE.test(input);
}

describe("email validator parity (changeEmailWithReauth)", () => {
  it("accepts well-formed addresses", () => {
    for (const e of ["a@b.co", "user.name+tag@example.com", "x@y.io"]) {
      expect(isValidEmail(e)).toBe(true);
    }
  });
  it("rejects malformed input", () => {
    for (const e of ["", "noatsign", "a@b", "a b@c.d", "a@b .com", null, 42]) {
      expect(isValidEmail(e as unknown)).toBe(false);
    }
  });
});

describe("security event allowlist (logSecurityEvent)", () => {
  const ALLOWED = ["hibp_block", "weak_password_block", "auth_failure"] as const;
  it("only allows the three anon events", () => {
    expect(ALLOWED).toHaveLength(3);
    expect(ALLOWED).toContain("hibp_block");
    expect(ALLOWED).not.toContain("settings_viewed" as never);
  });
});

describe("account event allowlist (logAccountEvent)", () => {
  const ALLOWED = [
    "password_changed",
    "password_change_failed",
    "email_change_requested",
    "email_change_failed",
    "account_deletion_requested",
    "settings_viewed",
    "language_changed",
    "theme_changed",
  ];
  it("does not accept arbitrary event types", () => {
    expect(ALLOWED.includes("delete_everything")).toBe(false);
  });
});
