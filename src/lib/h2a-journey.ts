// Pure helpers for the Jornada H-2A progress shown in the sidebar.
// Keeping this isolated from React/Supabase makes it trivially unit-testable.

export type JourneyInput = {
  /** true when the user finished onboarding (resume created). */
  onboardingDone: boolean;
  /** total applications the user has created. */
  appsCount: number;
  /** map of visa_checklist_items.step_key -> is_completed. */
  visaSteps: Record<string, boolean>;
};

export type JourneyStageKey =
  | "curriculo"
  | "candidatura"
  | "ds160"
  | "entrevista"
  | "visto";

export type JourneyStage = {
  key: JourneyStageKey;
  label: string;
  done: boolean;
};

export type JourneyResult = {
  stages: JourneyStage[];
  doneCount: number;
  total: number;
  progressPct: number;
  /** Label of the first not-done stage, or "Embarque" when everything is done. */
  currentStage: string;
};

export const JOURNEY_FALLBACK_STAGE = "Embarque";

export function computeJourney(input: JourneyInput): JourneyResult {
  const { onboardingDone, appsCount, visaSteps } = input;
  const stages: JourneyStage[] = [
    { key: "curriculo", label: "Currículo", done: !!onboardingDone },
    { key: "candidatura", label: "Candidatura", done: appsCount > 0 },
    { key: "ds160", label: "DS-160", done: !!visaSteps.ds160 },
    { key: "entrevista", label: "Entrevista", done: !!visaSteps.interview_done },
    { key: "visto", label: "Visto emitido", done: !!visaSteps.visa_issued },
  ];
  const total = stages.length;
  const doneCount = stages.filter((s) => s.done).length;
  const progressPct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const currentStage = stages.find((s) => !s.done)?.label ?? JOURNEY_FALLBACK_STAGE;
  return { stages, doneCount, total, progressPct, currentStage };
}
