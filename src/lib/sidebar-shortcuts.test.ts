import { describe, it, expect } from "vitest";
import { createShortcutMatcher, isTypingTarget, SHORTCUTS } from "./sidebar-shortcuts";

function fakeTarget(tag: string, opts: { role?: string; editable?: boolean } = {}) {
  return {
    tagName: tag,
    isContentEditable: !!opts.editable,
    getAttribute: (name: string) => (name === "role" ? opts.role ?? null : null),
  } as unknown as EventTarget;
}

describe("isTypingTarget", () => {
  it.each(["INPUT", "TEXTAREA", "SELECT", "input", "textarea"])("blocks %s", (tag) => {
    expect(isTypingTarget(fakeTarget(tag))).toBe(true);
  });
  it("blocks contentEditable surfaces", () => {
    expect(isTypingTarget(fakeTarget("DIV", { editable: true }))).toBe(true);
  });
  it("blocks ARIA textbox/combobox", () => {
    expect(isTypingTarget(fakeTarget("DIV", { role: "combobox" }))).toBe(true);
    expect(isTypingTarget(fakeTarget("DIV", { role: "textbox" }))).toBe(true);
  });
  it("allows ordinary elements", () => {
    expect(isTypingTarget(fakeTarget("BUTTON"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("createShortcutMatcher", () => {
  const advance = () => {
    let t = 0;
    return {
      now: () => t,
      tick: (ms: number) => {
        t += ms;
      },
    };
  };

  it("resolves G V → Vagas, G C → Currículo, G J → Jornada", () => {
    const clock = advance();
    const m = createShortcutMatcher({ now: clock.now });
    expect(m.handle({ key: "g" })).toBeNull();
    expect(m.handle({ key: "v" })).toEqual(SHORTCUTS.v);

    expect(m.handle({ key: "g" })).toBeNull();
    expect(m.handle({ key: "c" })).toEqual(SHORTCUTS.c);

    expect(m.handle({ key: "g" })).toBeNull();
    expect(m.handle({ key: "j" })).toEqual(SHORTCUTS.j);
  });

  it("ignores unmapped second keys", () => {
    const m = createShortcutMatcher();
    expect(m.handle({ key: "g" })).toBeNull();
    expect(m.handle({ key: "x" })).toBeNull();
  });

  it("does not arm while the user is typing in an input", () => {
    const m = createShortcutMatcher();
    expect(m.handle({ key: "g" }, fakeTarget("INPUT"))).toBeNull();
    // second key after typing must NOT navigate
    expect(m.handle({ key: "v" })).toBeNull();
  });

  it("ignores keys with modifier (cmd/ctrl/alt)", () => {
    const m = createShortcutMatcher();
    expect(m.handle({ key: "g", metaKey: true })).toBeNull();
    expect(m.handle({ key: "v" })).toBeNull();
  });

  it("times out after the sequence window", () => {
    const clock = advance();
    const m = createShortcutMatcher({ windowMs: 500, now: clock.now });
    m.handle({ key: "g" });
    clock.tick(800);
    expect(m.handle({ key: "v" })).toBeNull();
  });

  it("resets state on demand", () => {
    const m = createShortcutMatcher();
    m.handle({ key: "g" });
    m.reset();
    expect(m.handle({ key: "v" })).toBeNull();
  });
});
