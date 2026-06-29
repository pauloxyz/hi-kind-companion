import { describe, it, expect, vi } from "vitest";
import {
  createAnnouncementDebouncer,
  formatJourneyAnnouncement,
  shouldAnnounceJourney,
} from "./journey-announcement";

describe("formatJourneyAnnouncement", () => {
  it("uses 'atualizada' wording when there are remaining stages", () => {
    expect(
      formatJourneyAnnouncement({ doneCount: 3, total: 5, currentStage: "Entrevista" }),
    ).toBe("Jornada H-2A atualizada: 3 de 5 etapas concluídas. Próxima fase: Entrevista.");
  });
  it("uses 'concluída' wording when everything is done", () => {
    expect(
      formatJourneyAnnouncement({ doneCount: 5, total: 5, currentStage: "Embarque" }),
    ).toBe("Jornada H-2A concluída: 5 de 5 etapas. Próximo passo: Embarque.");
  });
});

describe("shouldAnnounceJourney", () => {
  const base = { doneCount: 2, total: 5, currentStage: "DS-160" };
  it("never announces on first paint", () => {
    expect(shouldAnnounceJourney(null, base)).toBe(false);
  });
  it("suppresses identical snapshots", () => {
    expect(shouldAnnounceJourney(base, { ...base })).toBe(false);
  });
  it("announces when doneCount changes", () => {
    expect(shouldAnnounceJourney(base, { ...base, doneCount: 3, currentStage: "Entrevista" })).toBe(true);
  });
  it("announces when only stage label changes (e.g. fallback flip)", () => {
    expect(shouldAnnounceJourney(base, { ...base, currentStage: "Embarque" })).toBe(true);
  });
});

describe("createAnnouncementDebouncer", () => {
  it("coalesces a burst of changes into a single emit with the latest payload", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const d = createAnnouncementDebouncer(emit, 600);
    d.schedule({ doneCount: 1, total: 5, currentStage: "Candidatura" });
    d.schedule({ doneCount: 2, total: 5, currentStage: "DS-160" });
    d.schedule({ doneCount: 3, total: 5, currentStage: "Entrevista" });
    expect(emit).not.toHaveBeenCalled();
    expect(d.isPending()).toBe(true);
    vi.advanceTimersByTime(600);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      "Jornada H-2A atualizada: 3 de 5 etapas concluídas. Próxima fase: Entrevista.",
    );
    vi.useRealTimers();
  });

  it("emits twice when changes are spaced beyond the window", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const d = createAnnouncementDebouncer(emit, 600);
    d.schedule({ doneCount: 1, total: 5, currentStage: "Candidatura" });
    vi.advanceTimersByTime(600);
    d.schedule({ doneCount: 2, total: 5, currentStage: "DS-160" });
    vi.advanceTimersByTime(600);
    expect(emit).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("cancel() drops the pending emit", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const d = createAnnouncementDebouncer(emit, 600);
    d.schedule({ doneCount: 1, total: 5, currentStage: "Candidatura" });
    d.cancel();
    vi.advanceTimersByTime(2000);
    expect(emit).not.toHaveBeenCalled();
    expect(d.isPending()).toBe(false);
    vi.useRealTimers();
  });

  it("emits at most one aggregated message per debounce window across rapid bursts", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const d = createAnnouncementDebouncer(emit, 500);
    // Window 1: 5 rapid schedules
    for (let i = 1; i <= 5; i++) {
      d.schedule({ doneCount: i, total: 5, currentStage: `Stage-${i}` });
      vi.advanceTimersByTime(50); // each tick < window
    }
    vi.advanceTimersByTime(500);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith(expect.stringContaining("5 de 5"));

    // Window 2: another burst after the window closed
    for (let i = 0; i < 3; i++) {
      d.schedule({ doneCount: 2, total: 5, currentStage: "DS-160" });
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(500);
    expect(emit).toHaveBeenCalledTimes(2);

    // Window 3
    d.schedule({ doneCount: 3, total: 5, currentStage: "Entrevista" });
    vi.advanceTimersByTime(500);
    expect(emit).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("simulates AppShell unmount: cancel() prevents any further emit", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const d = createAnnouncementDebouncer(emit, 600);
    d.schedule({ doneCount: 1, total: 5, currentStage: "Candidatura" });
    d.schedule({ doneCount: 2, total: 5, currentStage: "DS-160" });
    // AppShell unmounts → effect cleanup runs cancel().
    d.cancel();
    // Even rapid re-scheduling after cancel must not resurrect the timer
    // unless an explicit schedule comes in; cancel + no schedule = silence.
    vi.advanceTimersByTime(5000);
    expect(emit).not.toHaveBeenCalled();
    expect(d.isPending()).toBe(false);
    vi.useRealTimers();
  });

  it("does not emit anything if only cancel() is called (no schedule)", () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const d = createAnnouncementDebouncer(emit, 600);
    d.cancel();
    vi.advanceTimersByTime(2000);
    expect(emit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("100% vs partial aria-live wording", () => {
  it("uses distinct, legible wording and preserves doneCount/total/stage", () => {
    const partial = formatJourneyAnnouncement({ doneCount: 3, total: 5, currentStage: "Entrevista" });
    const complete = formatJourneyAnnouncement({ doneCount: 5, total: 5, currentStage: "Embarque" });

    // Different sentences entirely so screen readers don't sound repetitive.
    expect(partial).not.toBe(complete);
    expect(partial).toMatch(/atualizada/i);
    expect(complete).toMatch(/concluída/i);

    // Both messages must surface the same three semantic anchors.
    for (const msg of [partial, complete]) {
      expect(msg).toMatch(/\d+ de \d+/);
    }
    expect(partial).toContain("3 de 5");
    expect(partial).toContain("Entrevista");
    expect(complete).toContain("5 de 5");
    expect(complete).toContain("Embarque");
  });

  it("never claims completion when there is still work left", () => {
    const msg = formatJourneyAnnouncement({ doneCount: 4, total: 5, currentStage: "Visto emitido" });
    expect(msg).not.toMatch(/concluída/i);
  });
});
