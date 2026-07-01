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
  const s = typeof v === "number" ? formatCsvNumber(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Formata números para o CSV garantindo que:
 *   - Nunca aparecem em notação científica (ex.: "1e+21").
 *   - Nunca ganham separadores de milhar dependentes de locale
 *     (ex.: "1,000" ou "1.000") — sempre `1000`.
 *   - NaN / Infinity viram `"0"` para não corromper a coluna.
 *   - Valores inteiros (ou muito próximos) são serializados sem casas decimais
 *     — todo KPI e contagem por etapa do funil é inteiro por natureza.
 *   - Não-inteiros preservam sua precisão em notação fixa (sem exponencial).
 *
 * Exposto para ser reutilizado por qualquer outro caminho de export/CSV.
 */
export function formatCsvNumber(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  // Inteiros (incluindo os que Number.isInteger considera fora do safe range
  // mas ainda sem parte fracional) — usa toFixed(0) para nunca cair em
  // notação científica que Number#toString usaria em |n| >= 1e21.
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < Number.EPSILON) {
    const truncated = Math.trunc(n);
    // Number#toString cai em notação exponencial só para |n| >= 1e21.
    // Nunca usamos toLocaleString aqui — locales como pt-BR reintroduziriam
    // separadores de milhar ("1.000") que corromperiam o CSV.
    const s = truncated.toString();
    return /e/i.test(s) ? truncated.toFixed(0) : s;
  }
  // Não-inteiros: fixa até 12 casas, remove trailing zeros e o ponto solto.
  const fixed = n.toFixed(12);
  return fixed.replace(/\.?0+$/, "");
}

export type CsvLocale = "pt" | "en" | "es";

/** Rótulos de etapa por idioma. A ordem espelha `STEP_LABELS` do server fn. */
export const STEP_LABELS_I18N: Record<CsvLocale, readonly string[]> = {
  pt: [
    "Boas-vindas",
    "Como funciona",
    "Dados básicos",
    "Experiência",
    "Condições físicas",
    "Tudo pronto",
  ],
  en: [
    "Welcome",
    "How it works",
    "Basic info",
    "Experience",
    "Physical conditions",
    "All set",
  ],
  es: [
    "Bienvenida",
    "Cómo funciona",
    "Datos básicos",
    "Experiencia",
    "Condiciones físicas",
    "Todo listo",
  ],
};

const SUMMARY_HEADING: Record<CsvLocale, string> = {
  pt: "# summary (resumo)",
  en: "# summary",
  es: "# summary (resumen)",
};

/**
 * Gera CSV com o comparativo PT vs EN por etapa + travados-após-troca por
 * etapa. Cabeçalho estável (nomes de coluna em snake_case) para ferramentas
 * externas continuarem parseando; os valores de `step_label` e o cabeçalho
 * `# lang=` refletem o `locale` escolhido no admin.
 */
export function buildFunnelCsv(data: FunnelForCsv, locale: CsvLocale = "pt"): string {
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
  const labels = STEP_LABELS_I18N[locale];
  const rows = data.funnel.map((row) => {
    const label = labels[row.step_index] ?? row.step_label;
    return [
      row.step_index,
      label,
      row.reached_users,
      data.by_lang.pt.reached_by_step[row.step_index] ?? 0,
      data.by_lang.en.reached_by_step[row.step_index] ?? 0,
      stuckMap.get(row.step_index) ?? 0,
    ]
      .map(csvEscape)
      .join(",");
  });
  // Sumário no final: totais por idioma + total concluíram após troca
  const summary = [
    "",
    SUMMARY_HEADING[locale],
    `# lang=${locale}`,
    `completed_pt,${formatCsvNumber(data.by_lang.pt.completed_users)}`,
    `completed_en,${formatCsvNumber(data.by_lang.en.completed_users)}`,
    `toggles_to_pt,${formatCsvNumber(data.by_lang.pt.toggles_to)}`,
    `toggles_to_en,${formatCsvNumber(data.by_lang.en.toggles_to)}`,
    `completed_after_variant_switch,${formatCsvNumber(data.variant_switches.completed_after_switch)}`,
  ];
  return [header.join(","), ...rows, ...summary].join("\n") + "\n";
}
