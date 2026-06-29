// Coalesce rapid Journey H-2A changes into a single, consistent aria-live
// announcement. The pure helpers below are framework-free so they can be
// unit-tested without React or timers; AppShell.tsx wires them into a
// debounced useEffect.

export type JourneyAnnouncementInput = {
  doneCount: number;
  total: number;
  currentStage: string;
};

export function formatJourneyAnnouncement(input: JourneyAnnouncementInput): string {
  const { doneCount, total, currentStage } = input;
  if (doneCount >= total) {
    return `Jornada H-2A concluída: ${doneCount} de ${total} etapas. Próximo passo: ${currentStage}.`;
  }
  return `Jornada H-2A atualizada: ${doneCount} de ${total} etapas concluídas. Próxima fase: ${currentStage}.`;
}

/**
 * Decide whether the next snapshot deserves a new announcement.
 * Suppresses duplicates and "no-op" updates that don't change progress or stage.
 */
export function shouldAnnounceJourney(
  prev: JourneyAnnouncementInput | null,
  next: JourneyAnnouncementInput,
): boolean {
  if (!prev) return false; // first paint is silent
  if (prev.doneCount === next.doneCount && prev.currentStage === next.currentStage) {
    return false;
  }
  return true;
}

/**
 * Minimal debounce helper used by the live-region effect. Calling .schedule()
 * during the window replaces the pending payload; only the last value fires.
 * Exposed for unit testing — AppShell uses window.setTimeout directly.
 */
export function createAnnouncementDebouncer(
  emit: (msg: string) => void,
  delayMs = 600,
  scheduler: {
    set: (cb: () => void, ms: number) => number;
    clear: (id: number) => void;
  } = {
    set: (cb, ms) => setTimeout(cb, ms) as unknown as number,
    clear: (id) => clearTimeout(id),
  },
) {
  let pending: JourneyAnnouncementInput | null = null;
  let timer: number | null = null;
  return {
    schedule(input: JourneyAnnouncementInput) {
      pending = input;
      if (timer != null) scheduler.clear(timer);
      timer = scheduler.set(() => {
        timer = null;
        if (pending) emit(formatJourneyAnnouncement(pending));
        pending = null;
      }, delayMs);
    },
    cancel() {
      if (timer != null) scheduler.clear(timer);
      timer = null;
      pending = null;
    },
    /** test helper: whether an emit is currently queued */
    isPending() {
      return timer != null;
    },
  };
}
