// Static guard: the Jornada H-2A aria-live region in AppShell.tsx MUST keep
// the attributes that make announcements readable for screen readers. This
// runs in CI without a browser, so we just assert the source contains the
// required attributes on the <div data-testid="journey-live-region"> element.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = readFileSync(
  path.resolve(__dirname, "../components/AppShell.tsx"),
  "utf8",
);

function liveRegionBlock(): string {
  // Capture the JSX element that carries the journey-live-region testid.
  const m = SOURCE.match(/<div([^>]*data-testid="journey-live-region"[^>]*)>/);
  if (!m) throw new Error("journey-live-region <div> not found in AppShell.tsx");
  return m[1];
}

describe("journey live region (static a11y attributes)", () => {
  it("declares role=status", () => {
    expect(liveRegionBlock()).toMatch(/role="status"/);
  });
  it("declares aria-live=polite (never assertive, to avoid interrupting)", () => {
    expect(liveRegionBlock()).toMatch(/aria-live="polite"/);
    expect(liveRegionBlock()).not.toMatch(/aria-live="assertive"/);
  });
  it("declares aria-atomic=true so the full message is re-read", () => {
    expect(liveRegionBlock()).toMatch(/aria-atomic="true"/);
  });
  it("is visually hidden (sr-only) so it doesn't disturb the layout", () => {
    expect(liveRegionBlock()).toMatch(/className="[^"]*\bsr-only\b/);
  });
  it("renders the debounced announcement variable as its text content", () => {
    // The element must render {journeyAnnouncement} so screen readers pick
    // up updates as the debouncer emits.
    expect(SOURCE).toMatch(
      /data-testid="journey-live-region"[\s\S]{0,200}\{journeyAnnouncement\}/,
    );
  });
});
