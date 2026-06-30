import { describe, it, expect } from "vitest";
import { computeJourney, JOURNEY_FALLBACK_STAGE } from "./h2a-journey";

describe("computeJourney", () => {
  it("returns 0/5 for a brand new user", () => {
    const r = computeJourney({ onboardingDone: false, contractSigned: false, visaSteps: {} });
    expect(r.total).toBe(5);
    expect(r.doneCount).toBe(0);
    expect(r.progressPct).toBe(0);
    expect(r.currentStage).toBe("Currículo");
    expect(r.stages.map((s) => s.key)).toEqual([
      "curriculo",
      "contrato",
      "ds160",
      "entrevista",
      "visto",
    ]);
    expect(r.stages.every((s) => !s.done)).toBe(true);
  });

  it("marks Currículo done once onboarding is complete", () => {
    const r = computeJourney({ onboardingDone: true, contractSigned: false, visaSteps: {} });
    expect(r.doneCount).toBe(1);
    expect(r.progressPct).toBe(20);
    expect(r.currentStage).toBe("Contrato");
    expect(r.stages.find((s) => s.key === "curriculo")?.done).toBe(true);
  });

  it("does NOT advance past Contrato just because the user sent applications", () => {
    // Apenas enviar candidatura não é um marco — DS-160 só faz sentido após
    // o contrato assinado (hired_by_employer no checklist).
    const r = computeJourney({ onboardingDone: true, contractSigned: false, visaSteps: {} });
    expect(r.stages.find((s) => s.key === "contrato")?.done).toBe(false);
    expect(r.currentStage).toBe("Contrato");
  });

  it("marks Contrato done when the user has an accepted offer + signed contract", () => {
    const r = computeJourney({ onboardingDone: true, contractSigned: true, visaSteps: {} });
    expect(r.doneCount).toBe(2);
    expect(r.progressPct).toBe(40);
    expect(r.currentStage).toBe("DS-160");
  });

  it("maps ds160 / interview_done / visa_issued visa checklist keys", () => {
    const r = computeJourney({
      onboardingDone: true,
      contractSigned: true,
      visaSteps: { ds160: true, interview_done: true, visa_issued: false },
    });
    expect(r.stages.find((s) => s.key === "ds160")?.done).toBe(true);
    expect(r.stages.find((s) => s.key === "entrevista")?.done).toBe(true);
    expect(r.stages.find((s) => s.key === "visto")?.done).toBe(false);
    expect(r.doneCount).toBe(4);
    expect(r.progressPct).toBe(80);
    expect(r.currentStage).toBe("Visto emitido");
  });

  it("returns 100% and the fallback label when every stage is done", () => {
    const r = computeJourney({
      onboardingDone: true,
      contractSigned: true,
      visaSteps: { ds160: true, interview_done: true, visa_issued: true },
    });
    expect(r.doneCount).toBe(5);
    expect(r.progressPct).toBe(100);
    expect(r.currentStage).toBe(JOURNEY_FALLBACK_STAGE);
  });

  it("ignores unrelated visa_checklist keys", () => {
    const r = computeJourney({
      onboardingDone: false,
      contractSigned: false,
      visaSteps: { passport_ready: true, photo_uploaded: true },
    });
    expect(r.doneCount).toBe(0);
    expect(r.currentStage).toBe("Currículo");
  });

  it("transitions Contrato → DS-160 → Entrevista → Visto emitido in sequence", () => {
    const base = { onboardingDone: true, contractSigned: true };
    const r0 = computeJourney({ ...base, visaSteps: {} });
    expect(r0.doneCount).toBe(2);
    expect(r0.currentStage).toBe("DS-160");

    const r1 = computeJourney({ ...base, visaSteps: { ds160: true } });
    expect(r1.doneCount).toBe(3);
    expect(r1.progressPct).toBe(60);
    expect(r1.currentStage).toBe("Entrevista");

    const r2 = computeJourney({ ...base, visaSteps: { ds160: true, interview_done: true } });
    expect(r2.doneCount).toBe(4);
    expect(r2.progressPct).toBe(80);
    expect(r2.currentStage).toBe("Visto emitido");

    const r3 = computeJourney({
      ...base,
      visaSteps: { ds160: true, interview_done: true, visa_issued: true },
    });
    expect(r3.doneCount).toBe(5);
    expect(r3.progressPct).toBe(100);
    expect(r3.currentStage).toBe(JOURNEY_FALLBACK_STAGE);
    expect(r3.stages.every((s) => s.done)).toBe(true);
  });
});
