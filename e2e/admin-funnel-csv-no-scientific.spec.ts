/**
 * Admin · CSV baixado nunca contém notação científica e trata floats
 * (incluindo negativos e frações) como inteiros arredondados.
 *
 * O intercept substitui a resposta do server fn `getOnboardingFunnel`
 * por um payload cuidadosamente montado com floats extremos
 * (0.5, -0.5, 1.9, -2.3, 1e21, MIN_VALUE) para garantir que o
 * formatCsvNumber colapse tudo em dígitos inteiros sem separadores
 * nem exponencial.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ensureSignedIn } from "./_helpers/auth";

function payloadWithFloats() {
  const steps = [
    "Boas-vindas",
    "Como funciona",
    "Dados básicos",
    "Experiência",
    "Condições físicas",
    "Tudo pronto",
  ];
  // Floats "hostis" injetados nas colunas por etapa e no sumário.
  const floats = [1.9, -2.3, 0.5, -0.5, 1e21, 0.4999999];
  return {
    total_started: 1.9,          // → 2
    total_completed: -0.5,       // → 0
    completion_rate_pct: 0.49,   // KPI numérico exibido no admin
    funnel: steps.map((step_label, step_index) => ({
      step_index,
      step_label,
      started_users: 100,
      reached_users: floats[step_index]!, // hostil
      drop_rate_pct: 0,
    })),
    by_lang: {
      pt: {
        reached_by_step: [1.5, -1.5, 0.49, -0.49, 1.23e18, 5e-10],
        completed_users: 1.9,   // → 2
        toggles_to: -2.3,       // → -2
      },
      en: {
        reached_by_step: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        completed_users: -0.5,  // → 0
        toggles_to: 1e21,
      },
    },
    variant_switches: {
      total_events: 0,
      unique_users: 0,
      unique_variants: 0,
      completed_after_switch: 1.5, // → 2
      stuck_by_step: [
        { step: 0, users: 1.9 },   // → 2
        { step: 1, users: -0.49 }, // → 0
      ],
    },
    current_step_distribution: [],
    recent_events: [],
  };
}

test.describe("Admin · CSV baixado nunca tem notação científica", () => {
  test("floats no payload viram inteiros no CSV; nenhum '1e+21' escapa", async ({ page }) => {
    await page.route(/getOnboardingFunnel|serverFn/i, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { data: payloadWithFloats() } }),
      });
    });

    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    const btn = page.getByTestId("funnel-export-csv");
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled({ timeout: 10_000 });

    const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    const path = await dl.path();
    expect(path).toBeTruthy();
    const content = readFileSync(path!, "utf8");

    // Nenhuma célula pode carregar notação científica.
    expect(content, `CSV contém notação científica:\n${content}`)
      .not.toMatch(/,-?\d+(?:\.\d+)?e[+-]?\d+/i);
    // Nem separador de milhar (nenhum vírgula-decimal ou ponto-decimal
    // vindo do formatter — separadores só devem existir entre colunas).
    // Estratégia: cada célula numérica pura deve casar /^-?\d+$/.
    const lines = content.split("\n").filter(Boolean);
    const [header, ...rest] = lines;
    expect(header).toBe(
      "step_index,step_label,reached_total,reached_pt,reached_en,stuck_after_variant_switch",
    );

    // Primeiras 6 linhas são as etapas — verifica cada célula numérica.
    for (const row of rest.slice(0, 6)) {
      // Split simples é OK aqui: nenhum step_label do payload tem vírgula.
      const cells = row.split(",");
      expect(cells).toHaveLength(6);
      const [idx, , reachedTotal, reachedPt, reachedEn, stuck] = cells;
      for (const cell of [idx, reachedTotal, reachedPt, reachedEn, stuck]) {
        expect(cell, `célula inválida em "${row}"`).toMatch(/^-?\d+$/);
        expect(cell).not.toMatch(/e/i);
        expect(cell).not.toContain(".");
      }
    }

    // Sumário: valores devem ser inteiros arredondados.
    // 1.9 → 2, -0.5 → 0, -2.3 → -2, 1.5 → 2, 1e21 sem exponencial.
    expect(content).toMatch(/completed_pt,2\b/);
    expect(content).toMatch(/completed_en,0\b/);
    expect(content).toMatch(/toggles_to_pt,-2\b/);
    expect(content).toMatch(/completed_after_variant_switch,2\b/);
    // toggles_to_en=1e21 → dígitos puros
    expect(content).toMatch(/toggles_to_en,\d{15,}\b/);
    expect(content).not.toMatch(/toggles_to_en,\d+e/i);
  });
});
