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
});
