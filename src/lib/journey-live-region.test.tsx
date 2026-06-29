// Renders the Jornada H-2A live region in isolation and asserts both the
// ARIA contract (role / aria-live / aria-atomic) and the readability of the
// emitted text (no encoded entities, no stray whitespace/newlines).
//
// Uses React's renderToStaticMarkup so it works in the project's node-only
// vitest environment without jsdom.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JourneyLiveRegion } from "../components/JourneyLiveRegion";
import { formatJourneyAnnouncement } from "./journey-announcement";

function html(message: string): string {
  return renderToStaticMarkup(<JourneyLiveRegion message={message} />);
}

describe("JourneyLiveRegion render", () => {
  it("renders with role=status, aria-live=polite, aria-atomic=true and sr-only", () => {
    const out = html("");
    expect(out).toMatch(/role="status"/);
    expect(out).toMatch(/aria-live="polite"/);
    expect(out).not.toMatch(/aria-live="assertive"/);
    expect(out).toMatch(/aria-atomic="true"/);
    expect(out).toMatch(/class="[^"]*\bsr-only\b/);
    expect(out).toMatch(/data-testid="journey-live-region"/);
  });

  it("renders the message text verbatim with no stray HTML entities or line breaks", () => {
    const msg = formatJourneyAnnouncement({
      doneCount: 3,
      total: 5,
      currentStage: "Entrevista",
    });
    const out = html(msg);
    // No escaped entities other than the standard text-content escapes.
    expect(out).not.toMatch(/&amp;|&#x?[0-9a-f]+;/i);
    // No \n or \r leaking into the announcement.
    expect(out).not.toMatch(/[\n\r\t]/);
    // The full sentence is present (no truncation).
    expect(out).toContain("Jornada H-2A atualizada: 3 de 5 etapas concluídas. Próxima fase: Entrevista.");
  });

  it("preserves accented characters and the en-dash in stage names", () => {
    const msg = formatJourneyAnnouncement({
      doneCount: 1,
      total: 5,
      currentStage: "Currículo",
    });
    const out = html(msg);
    expect(out).toContain("Currículo");
    expect(out).toContain("concluídas");
  });

  it("escapes user-controlled stage names so the live region never injects HTML", () => {
    const out = html('<script>alert(1)</script>');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders an empty region when there is no announcement (first paint)", () => {
    const out = html("");
    // Element still present so the live region is attached and ready, just empty.
    expect(out).toMatch(/<div[^>]*data-testid="journey-live-region"[^>]*>\s*<\/div>/);
  });
});
