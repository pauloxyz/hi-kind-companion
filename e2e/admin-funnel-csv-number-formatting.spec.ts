/**
 * Admin · formatação numérica do CSV e dos KPIs.
 *
 * Todos os números — tanto no CSV exportado quanto nos KPIs renderizados —
 * precisam ser inteiros não-negativos, sem:
 *   - notação científica (`1e5`, `1.2E+04`)
 *   - separador de milhar com vírgula/ponto (`1,200`, `1.200`)
 *   - sinal, símbolo de moeda ou fração (`+1200`, `-3`, `1,5`, `R$ 30`)
 *   - `NaN` / `Infinity`
 *
 * A única exceção intencional é `completion_rate_pct` na UI (mostrado como
 * "20%" ou "18.5%") — esse valor NÃO aparece no CSV.
 *
 * Snapshot é mockado com contagens grandes pra flagrar formatação errada
 * cedo (JS tende a converter 1e6 pra notação exponencial em .toString()
 * quando roteado por certas libs).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

function isFunnelServerFn(url: string): boolean {
  return /_serverFn|_server-fn|server-fn|onboarding.*funnel|getOnboardingFunnel/i.test(url);
}

const STEP_LABELS = [
  "Boas-vindas",
  "Como funciona",
  "Dados básicos",
  "Experiência",
  "Condições físicas",
  "Tudo pronto",
];
const REACHED = [1_500_000, 1_200_000, 900_000, 700_000, 400_000, 250_000];
const PT = [1_100_000, 900_000, 700_000, 550_000, 320_000, 200_000];
const EN = [400_000, 300_000, 200_000, 150_000, 80_000, 50_000];
const STUCK = [0, 0, 1_000_000, 250_000, 100_000, 50_000];

const SNAPSHOT = {
  total_started: 1_500_000,
  total_completed: 250_000,
  completion_rate_pct: 16.7,
  current_step_distribution: STEP_LABELS.map((_, step) => ({ step, users: REACHED[step] })),
  funnel: STEP_LABELS.map((label, i) => ({
    step_index: i,
    step_label: label,
    started_users: 1_500_000,
    reached_users: REACHED[i],
    drop_rate_pct: Math.round((1 - REACHED[i] / 1_500_000) * 1000) / 10,
  })),
  by_lang: {
    pt: { reached_by_step: PT, completed_users: 200_000, toggles_to: 45_000 },
    en: { reached_by_step: EN, completed_users: 50_000, toggles_to: 62_000 },
  },
  variant_switches: {
    total_events: 180_000,
    unique_users: 95_000,
    unique_variants: 4,
    completed_after_switch: 30_000,
    stuck_by_step: STUCK.map((users, step) => ({ step, users })).filter((r) => r.users > 0),
  },
  recent_events: [],
};

/** Recusa notação científica, separadores, sinais, moeda, decimais, NaN/Infinity. */
function expectStrictInteger(raw: string, label: string) {
  const trimmed = raw.trim();
  expect.soft(trimmed, `${label}: string vazia`).not.toBe("");
  expect.soft(trimmed, `${label}: notação científica em "${trimmed}"`).not.toMatch(/[eE][+-]?\d/);
  expect.soft(trimmed, `${label}: separador de milhar em "${trimmed}"`).not.toMatch(/\d[.,]\d{3}(\D|$)/);
  expect.soft(trimmed, `${label}: sinal/símbolo/fração em "${trimmed}"`).toMatch(/^\d+$/);
  const n = Number(trimmed);
  expect.soft(Number.isFinite(n), `${label}: NaN/Infinity em "${trimmed}"`).toBe(true);
  expect.soft(n, `${label}: negativo em "${trimmed}"`).toBeGreaterThanOrEqual(0);
}

test.describe("Admin · formatação numérica consistente no CSV e KPIs", () => {
  test("nenhum número aparece em notação científica ou com separador inconsistente", async ({ page }) => {
    await ensureSignedIn(page);
    await page.route(
      (u) => isFunnelServerFn(typeof u === "string" ? u : u.toString()),
      async (route) => {
        const req = route.request();
        if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") return route.continue();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: SNAPSHOT }, data: SNAPSHOT }),
        });
      },
    );

    await page.goto("/admin/onboarding");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/admin/onboarding")) test.skip(true, "Usuário de teste não é admin");
    if (!(await page.getByTestId("vs-stuck-total").isVisible().catch(() => false))) {
      test.skip(true, "Mock não interceptou o server fn nesse ambiente");
    }

    // --- 1) KPIs numéricos renderizados ---
    const kpiIds = ["vs-events", "vs-users", "vs-variants", "vs-completed-after", "vs-stuck-total"];
    for (const id of kpiIds) {
      const txt = await page.getByTestId(id).innerText();
      expectStrictInteger(txt, `KPI ${id}`);
    }
    // Valores esperados exatos após render
    await expect(page.getByTestId("vs-completed-after")).toHaveText("30000");
    await expect(page.getByTestId("vs-stuck-total")).toHaveText(String(STUCK.reduce((s, n) => s + n, 0)));

    // --- 2) CSV: todas as células numéricas por etapa + sumário ---
    const fs = await import("fs/promises");
    for (const [testId, locale] of [
      ["funnel-export-csv", "pt"],
      ["funnel-export-csv-en", "en"],
      ["funnel-export-csv-es", "es"],
    ] as const) {
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
      const p = await dl.path();
      if (!p) continue;
      const csv = await fs.readFile(p, "utf8");
      const lines = csv.replace(/\r\n/g, "\n").split("\n").filter(Boolean);

      // step rows: colunas 0 (step_index) e 2..5 são numéricas
      const rows = lines.slice(1).filter((l) => /^\d/.test(l));
      expect(rows).toHaveLength(6);
      for (const [i, line] of rows.entries()) {
        const cells: string[] = [];
        let cur = "";
        let inQ = false;
        for (let k = 0; k < line.length; k++) {
          const ch = line[k];
          if (ch === '"') {
            if (inQ && line[k + 1] === '"') {
              cur += '"';
              k++;
            } else inQ = !inQ;
          } else if (ch === "," && !inQ) {
            cells.push(cur);
            cur = "";
          } else cur += ch;
        }
        cells.push(cur);
        for (const idx of [0, 2, 3, 4, 5]) {
          expectStrictInteger(cells[idx], `CSV ${locale} etapa ${i} coluna ${idx}`);
        }
        // valores exatos batem com o mock (sem "1.5e+06" no lugar de 1500000)
        if (i === 0) {
          expect(cells[2]).toBe("1500000");
          expect(cells[3]).toBe("1100000");
          expect(cells[4]).toBe("400000");
        }
        if (i === 2) {
          expect(cells[5]).toBe("1000000"); // stuck_after_variant_switch
        }
      }

      // sumário: `key,value` — validamos o value
      const summaryLines = lines.filter((l) => /^(completed_|toggles_)/.test(l));
      expect(summaryLines.length).toBeGreaterThanOrEqual(5);
      for (const l of summaryLines) {
        const [k, v] = l.split(",", 2);
        expectStrictInteger(v ?? "", `CSV ${locale} sumário ${k}`);
      }
      // valores exatos do sumário
      expect(csv).toContain("completed_after_variant_switch,30000");
      expect(csv).toContain("toggles_to_pt,45000");
      expect(csv).toContain("toggles_to_en,62000");
    }
  });
});
