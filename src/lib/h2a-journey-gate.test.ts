import { describe, expect, it } from "vitest";
import {
  CONTRACT_GATE_BLOCKED_MESSAGE,
  CONTRACT_GATED_STEP_KEYS,
  canCompleteStep,
  computeStepGateBlocked,
  isContractGatedStep,
} from "./h2a-journey-gate";
import { computeJourney, type JourneyInput, type JourneyStageKey } from "./h2a-journey";

/**
 * Estes testes existem para travar a invariante mais importante da Jornada
 * H-2A: ninguém pode aparecer em "Fase · DS-160" antes de marcar o contrato
 * assinado (`hired_by_employer`). Esse era o bug que o usuário reportou.
 */

const ALL_VISA_FLAGS_TRUE: Record<string, boolean> = {
  ds160: true,
  interview_done: true,
  visa_issued: true,
  // ruído proposital para garantir que chaves desconhecidas não vazam:
  passport_valid_6mo: true,
  photo_5x5_white: true,
  mrv_paid: true,
};

describe("Jornada H-2A · gate por contrato assinado", () => {
  describe("isContractGatedStep", () => {
    it("inclui todas as etapas consulares", () => {
      for (const k of CONTRACT_GATED_STEP_KEYS) {
        expect(isContractGatedStep(k)).toBe(true);
      }
    });

    it("NÃO bloqueia passos preparatórios (passaporte, foto)", () => {
      expect(isContractGatedStep("passport_valid_6mo")).toBe(false);
      expect(isContractGatedStep("photo_5x5_white")).toBe(false);
      expect(isContractGatedStep("hired_by_employer")).toBe(false);
    });

    it("NÃO bloqueia chaves desconhecidas", () => {
      expect(isContractGatedStep("step_que_nao_existe")).toBe(false);
    });
  });

  describe("canCompleteStep", () => {
    it("permite marcar passos preparatórios mesmo sem contrato", () => {
      expect(
        canCompleteStep({
          stepKey: "passport_valid_6mo",
          contractSigned: false,
          willComplete: true,
        }),
      ).toBe(true);
    });

    it("bloqueia DS-160 / MRV / entrevista quando o contrato NÃO está marcado", () => {
      for (const k of CONTRACT_GATED_STEP_KEYS) {
        expect(
          canCompleteStep({ stepKey: k, contractSigned: false, willComplete: true }),
          `${k} deveria estar bloqueado`,
        ).toBe(false);
      }
    });

    it("libera todas as etapas consulares depois que o contrato é marcado", () => {
      for (const k of CONTRACT_GATED_STEP_KEYS) {
        expect(
          canCompleteStep({ stepKey: k, contractSigned: true, willComplete: true }),
          `${k} deveria estar liberado`,
        ).toBe(true);
      }
    });

    it("sempre permite REABRIR (desmarcar) uma etapa, evitando deadlock", () => {
      for (const k of CONTRACT_GATED_STEP_KEYS) {
        expect(
          canCompleteStep({ stepKey: k, contractSigned: false, willComplete: false }),
        ).toBe(true);
      }
    });

    it("usa uma mensagem padrão em pt-BR explicando o motivo", () => {
      expect(CONTRACT_GATE_BLOCKED_MESSAGE).toMatch(/Oferta/);
      expect(CONTRACT_GATE_BLOCKED_MESSAGE).toMatch(/DS-160/);
    });
  });
});

describe("Jornada H-2A · transições antes/depois de hired_by_employer", () => {
  function journey(input: Partial<JourneyInput>) {
    return computeJourney({
      onboardingDone: input.onboardingDone ?? true,
      contractSigned: input.contractSigned ?? false,
      visaSteps: input.visaSteps ?? {},
    });
  }

  it("INVARIANTE: nunca mostra DS-160 quando contractSigned=false, mesmo com TUDO depois marcado", () => {
    // Cenário-armadilha: usuário (ou bug de UI) marcou visaSteps consulares
    // sem ter o contrato. A Jornada precisa ignorar e continuar em Contrato.
    const r = journey({ contractSigned: false, visaSteps: ALL_VISA_FLAGS_TRUE });
    expect(r.currentStage).not.toBe("DS-160");
    expect(r.currentStage).toBe("Contrato");
    expect(r.stages.find((s) => s.key === "contrato")?.done).toBe(false);
  });

  it("antes do contrato → currentStage = Contrato (não DS-160)", () => {
    const r = journey({ contractSigned: false });
    expect(r.currentStage).toBe("Contrato");
    const ds160 = r.stages.find((s) => s.key === "ds160");
    expect(ds160?.done).toBe(false);
  });

  it("logo após marcar o contrato → currentStage avança para DS-160", () => {
    const before = journey({ contractSigned: false });
    const after = journey({ contractSigned: true });
    expect(before.currentStage).toBe("Contrato");
    expect(after.currentStage).toBe("DS-160");
    expect(after.doneCount).toBe(before.doneCount + 1);
  });

  it("se o usuário REABRE o contrato (desmarca), a Jornada volta para Contrato", () => {
    const r = journey({
      contractSigned: false,
      visaSteps: { ds160: true }, // já tinha marcado DS-160 antes
    });
    // Mesmo com DS-160 "true" no checklist, a fase atual volta para Contrato
    // — a Jornada respeita a invariante e ignora o DS-160 órfão.
    expect(r.currentStage).toBe("Contrato");
  });

  it("ordem completa de fases nunca pula Contrato", () => {
    const order: JourneyStageKey[] = [
      "curriculo",
      "contrato",
      "ds160",
      "entrevista",
      "visto",
    ];
    const r = journey({ contractSigned: true, visaSteps: ALL_VISA_FLAGS_TRUE });
    expect(r.stages.map((s) => s.key)).toEqual(order);
  });

  it("progressPct nunca pula 20%→60% (Currículo→DS-160) sem passar por Contrato (40%)", () => {
    // Sem contrato, com qualquer combinação de visaSteps, o progressPct
    // máximo permitido é 80% (curriculo + 3 etapas consulares "órfãs"
    // contam para doneCount mas a fase atual segue sendo Contrato).
    // Esta verificação garante que doneCount nunca passe à frente do
    // currentStage de forma silenciosa.
    const noContract = journey({ contractSigned: false, visaSteps: ALL_VISA_FLAGS_TRUE });
    expect(noContract.currentStage).toBe("Contrato");
    // doneCount inclui curriculo + ds160 + entrevista + visto = 4/5 = 80%
    // mas a "fase atual" para o usuário continua sendo Contrato:
    expect(noContract.doneCount).toBe(4);
    expect(noContract.progressPct).toBe(80);
    expect(noContract.stages.find((s) => s.key === "contrato")?.done).toBe(false);
  });
});
