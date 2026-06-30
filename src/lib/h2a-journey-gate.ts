// Helpers que mantêm a Jornada H-2A e o Checklist do Visto em sync.
//
// Regra de negócio: nenhuma etapa consular (DS-160, MRV, CASV, entrevista,
// emissão e retirada do visto) faz sentido antes do empregador ter, de fato,
// contratado o trabalhador — ou seja, antes da etapa `hired_by_employer`
// estar marcada como concluída no checklist. Bloquear esses avanços evita
// que a Jornada mostre `Fase · DS-160` para um candidato que ainda não tem
// oferta confirmada (era o bug original que o usuário reportou).
//
// Este módulo é pura função para ser trivialmente testável (sem React/DB).

/** Step keys do checklist que dependem do contrato assinado para fazer sentido. */
export const CONTRACT_GATED_STEP_KEYS = [
  "i129_filed",
  "ds160",
  "mrv_paid",
  "casv_scheduled",
  "interview_scheduled",
  "interview_done",
  "visa_issued",
  "passport_delivered",
] as const;

export type ContractGatedStepKey = (typeof CONTRACT_GATED_STEP_KEYS)[number];

const GATED_SET: ReadonlySet<string> = new Set(CONTRACT_GATED_STEP_KEYS);

/** true quando o passo só pode ser marcado depois do contrato assinado. */
export function isContractGatedStep(stepKey: string): boolean {
  return GATED_SET.has(stepKey);
}

/**
 * Pode-se marcar este passo agora? Permite reabrir (desmarcar) sempre, mas
 * impede MARCAR como concluído passos gated sem `hired_by_employer = true`.
 *
 * O reverso (desmarcar) é livre para não criar deadlock caso o usuário
 * tenha marcado tudo na ordem errada antes desta validação existir.
 */
export function canCompleteStep(params: {
  stepKey: string;
  contractSigned: boolean;
  /** o estado-alvo do clique. true = marcar concluído. */
  willComplete: boolean;
}): boolean {
  if (!params.willComplete) return true;
  if (!isContractGatedStep(params.stepKey)) return true;
  return params.contractSigned;
}

export const CONTRACT_GATE_BLOCKED_MESSAGE =
  "Marque primeiro \u201COferta de trabalho aceita\u201D no checklist \u2014 as etapas consulares (DS-160, MRV, entrevista) s\u00f3 fazem sentido ap\u00f3s o contrato assinado.";
