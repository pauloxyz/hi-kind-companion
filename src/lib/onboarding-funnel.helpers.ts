/**
 * Helpers puros usados pelo funil de onboarding no admin.
 * Sem imports de servidor / Supabase — testáveis em isolado.
 */

export type ProfileSnapshotRow = {
  owner_id?: string | null;
  onboarding_step?: number | null;
  onboarding_completed_at?: string | null;
};

export type VariantSwitchImpact = {
  completed_after_switch: number;
  stuck_by_step: Array<{ step: number; users: number }>;
};

/**
 * Entre usuários que dispararam evento de troca de variante, quantos concluíram
 * o onboarding e — pra quem NÃO concluiu — a distribuição por etapa atual.
 * O retorno é SEMPRE bem-formado (arrays e números, nunca undefined).
 */
export function computeVariantSwitchImpact(
  snap: readonly ProfileSnapshotRow[] | null | undefined,
  variantUsers: ReadonlySet<string>,
): VariantSwitchImpact {
  let completedAfterSwitch = 0;
  const stuck = new Map<number, number>();
  for (const r of snap ?? []) {
    const uid = r?.owner_id ?? null;
    if (!uid || !variantUsers.has(uid)) continue;
    if (r.onboarding_completed_at) {
      completedAfterSwitch += 1;
    } else {
      const s = typeof r.onboarding_step === "number" ? r.onboarding_step : 0;
      stuck.set(s, (stuck.get(s) ?? 0) + 1);
    }
  }
  return {
    completed_after_switch: completedAfterSwitch,
    stuck_by_step: Array.from(stuck.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([step, users]) => ({ step, users })),
  };
}

/* ----------------------------- CSV export -------------------------------- */

export type FunnelForCsv = {
  funnel: Array<{ step_index: number; step_label: string; reached_users: number }>;
  by_lang: {
    pt: { reached_by_step: number[]; completed_users: number; toggles_to: number };
    en: { reached_by_step: number[]; completed_users: number; toggles_to: number };
  };
  variant_switches: {
    completed_after_switch: number;
    stuck_by_step: Array<{ step: number; users: number }>;
  };
};

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Gera CSV com o comparativo PT vs EN por etapa + travados-após-troca por
 * etapa. Cabeçalho estável, coluna por coluna, uma linha por etapa.
 */
export function buildFunnelCsv(data: FunnelForCsv): string {
  const header = [
    "step_index",
    "step_label",
    "reached_total",
    "reached_pt",
    "reached_en",
    "stuck_after_variant_switch",
  ];
  const stuckMap = new Map<number, number>(
    data.variant_switches.stuck_by_step.map((r) => [r.step, r.users]),
  );
  const rows = data.funnel.map((row) =>
    [
      row.step_index,
      row.step_label,
      row.reached_users,
      data.by_lang.pt.reached_by_step[row.step_index] ?? 0,
      data.by_lang.en.reached_by_step[row.step_index] ?? 0,
      stuckMap.get(row.step_index) ?? 0,
    ]
      .map(csvEscape)
      .join(","),
  );
  // Sumário no final: totais por idioma + total concluíram após troca
  const summary = [
    "",
    "# summary",
    `completed_pt,${data.by_lang.pt.completed_users}`,
    `completed_en,${data.by_lang.en.completed_users}`,
    `toggles_to_pt,${data.by_lang.pt.toggles_to}`,
    `toggles_to_en,${data.by_lang.en.toggles_to}`,
    `completed_after_variant_switch,${data.variant_switches.completed_after_switch}`,
  ];
  return [header.join(","), ...rows, ...summary].join("\n") + "\n";
}
