import { describe, expect, it } from "vitest";
import {
  buildFunnelCsv,
  computeVariantSwitchImpact,
  formatCsvNumber,
  type ProfileSnapshotRow,
} from "./onboarding-funnel.helpers";

describe("computeVariantSwitchImpact", () => {
  it("retorna forma correta mesmo com snap vazio ou nulo", () => {
    for (const input of [null, undefined, [] as ProfileSnapshotRow[]]) {
      const r = computeVariantSwitchImpact(input, new Set());
      expect(r).toEqual({ completed_after_switch: 0, stuck_by_step: [] });
      expect(Array.isArray(r.stuck_by_step)).toBe(true);
      expect(typeof r.completed_after_switch).toBe("number");
    }
  });

  it("ignora usuários que não trocaram de variante", () => {
    const snap: ProfileSnapshotRow[] = [
      { owner_id: "u1", onboarding_step: 3, onboarding_completed_at: null },
      { owner_id: "u2", onboarding_step: 5, onboarding_completed_at: "2026-01-01T00:00:00Z" },
    ];
    const r = computeVariantSwitchImpact(snap, new Set(["outro"]));
    expect(r.completed_after_switch).toBe(0);
    expect(r.stuck_by_step).toEqual([]);
  });

  it("conta concluídos e agrupa travados por etapa em ordem crescente", () => {
    const snap: ProfileSnapshotRow[] = [
      { owner_id: "a", onboarding_step: 3, onboarding_completed_at: null },
      { owner_id: "b", onboarding_step: 5, onboarding_completed_at: "2026-01-01T00:00:00Z" },
      { owner_id: "c", onboarding_step: 3, onboarding_completed_at: null },
      { owner_id: "d", onboarding_step: 1, onboarding_completed_at: null },
      { owner_id: "e", onboarding_step: null, onboarding_completed_at: null },
    ];
    const r = computeVariantSwitchImpact(snap, new Set(["a", "b", "c", "d", "e"]));
    expect(r.completed_after_switch).toBe(1);
    expect(r.stuck_by_step).toEqual([
      { step: 0, users: 1 }, // "e" cai em 0 porque step é null
      { step: 1, users: 1 },
      { step: 3, users: 2 },
    ]);
  });

  it("owner_id ausente/nulo não gera undefined no output", () => {
    const snap: ProfileSnapshotRow[] = [
      { owner_id: null, onboarding_step: 2, onboarding_completed_at: null },
      { onboarding_step: 4, onboarding_completed_at: null },
    ];
    const r = computeVariantSwitchImpact(snap, new Set(["a"]));
    expect(r).toEqual({ completed_after_switch: 0, stuck_by_step: [] });
  });
});

describe("buildFunnelCsv", () => {
  const base = {
    funnel: [
      { step_index: 0, step_label: "Boas-vindas", reached_users: 100 },
      { step_index: 1, step_label: "Como funciona, ok", reached_users: 80 },
      { step_index: 2, step_label: "Dados básicos", reached_users: 60 },
    ],
    by_lang: {
      pt: { reached_by_step: [90, 70, 50], completed_users: 50, toggles_to: 5 },
      en: { reached_by_step: [10, 10, 10], completed_users: 4, toggles_to: 12 },
    },
    variant_switches: {
      completed_after_switch: 3,
      stuck_by_step: [
        { step: 1, users: 2 },
        { step: 2, users: 7 },
      ],
    },
  };

  it("gera cabeçalho estável e uma linha por etapa (labels localizados em PT por padrão)", () => {
    const csv = buildFunnelCsv(base);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "step_index,step_label,reached_total,reached_pt,reached_en,stuck_after_variant_switch",
    );
    // step_label sempre vem do STEP_LABELS_I18N — não do que o server enviou
    expect(lines[1]).toBe("0,Boas-vindas,100,90,10,0");
    expect(lines[2]).toBe("1,Como funciona,80,70,10,2");
    // etapa com valores altos de "travados após trocar"
    expect(lines[3]).toBe("2,Dados básicos,60,50,10,7");
  });

  it("faz escape correto de vírgulas quando step_index não tem label localizado", () => {
    const withCustom = {
      ...base,
      funnel: [
        ...base.funnel,
        // etapa 99: fora do range → cai no fallback do row.step_label
        { step_index: 99, step_label: "Custom, extra", reached_users: 5 },
      ],
    };
    const csv = buildFunnelCsv(withCustom);
    expect(csv).toContain(`99,"Custom, extra",5,0,0,0`);
  });

  it("inclui bloco de sumário com todos os totais esperados", () => {
    const csv = buildFunnelCsv(base);
    expect(csv).toContain("completed_pt,50");
    expect(csv).toContain("completed_en,4");
    expect(csv).toContain("toggles_to_pt,5");
    expect(csv).toContain("toggles_to_en,12");
    expect(csv).toContain("completed_after_variant_switch,3");
    // sinaliza o idioma no cabeçalho do bloco de sumário
    expect(csv).toContain("# lang=pt");
  });

  it("localiza step_label e marca lang= para EN e ES sem trocar as colunas", () => {
    const csvEn = buildFunnelCsv(base, "en");
    const csvEs = buildFunnelCsv(base, "es");
    // cabeçalho estável em todos os locales
    for (const csv of [csvEn, csvEs]) {
      expect(csv.split("\n")[0]).toBe(
        "step_index,step_label,reached_total,reached_pt,reached_en,stuck_after_variant_switch",
      );
      // colunas travados/concluídos permanecem — só o rótulo muda
      expect(csv).toContain(",7\n"); // etapa 2 traz 7 travados após trocar
      expect(csv).toContain("completed_after_variant_switch,3");
    }
    // rótulos por idioma
    expect(csvEn).toContain(",Welcome,");
    expect(csvEn).toContain(",How it works,");
    expect(csvEn).toContain("# lang=en");
    expect(csvEs).toContain(",Bienvenida,");
    expect(csvEs).toContain(",Cómo funciona,");
    expect(csvEs).toContain("# lang=es");
    // CSVs realmente diferem entre idiomas
    expect(csvEn).not.toBe(csvEs);
    expect(csvEn).not.toBe(buildFunnelCsv(base, "pt"));
  });
});
