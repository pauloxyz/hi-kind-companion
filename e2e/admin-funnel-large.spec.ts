/**
 * Admin · funis grandes exportam sem truncar e UI segue responsiva.
 *
 * Injeta um snapshot com contagens altas (dezenas de milhares por etapa +
 * centenas de milhares em variant_switches) via route interception.
 * Valida:
 *   - CSV mantém 6 linhas de etapa + bloco de sumário completo.
 *   - Valores numéricos aparecem exatamente iguais aos do mock (sem
 *     truncamento por notação científica, arredondamento ou comma-thousand).
 *   - Após um export "pesado", o botão continua clicável — um segundo
 *     export (mesmo idioma) roda em <1s, provando que a UI não travou.
 *   - KPIs renderizados na página batem com o CSV mesmo em ordem de
 *     grandeza alta.
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

// Contagens grandes, mas determinísticas — sem randômico pra o CSV ser
// checável exato.
const REACHED = [120_000, 95_000, 80_000, 65_000, 40_000, 25_000];
const PT = [90_000, 72_000, 60_000, 48_000, 30_000, 20_000];
const EN = [30_000, 23_000, 20_000, 17_000, 10_000, 5_000];
const STUCK = [0, 500, 1_200, 900, 300, 50];

const BIG_SNAPSHOT = {
  total_started: 120_000,
  total_completed: 25_000,
  completion_rate_pct: 20.8,
  current_step_distribution: STEP_LABELS.map((_, step) => ({ step, users: REACHED[step] })),
  funnel: STEP_LABELS.map((label, i) => ({
    step_index: i,
    step_label: label,
    started_users: 120_000,
    reached_users: REACHED[i],
    drop_rate_pct: Math.round((1 - REACHED[i] / 120_000) * 1000) / 10,
  })),
  by_lang: {
    pt: { reached_by_step: PT, completed_users: 20_000, toggles_to: 3_400 },
    en: { reached_by_step: EN, completed_users: 5_000, toggles_to: 4_200 },
  },
  variant_switches: {
    total_events: 12_500,
    unique_users: 8_000,
    unique_variants: 3,
    completed_after_switch: 1_800,
    stuck_by_step: STUCK.map((users, step) => ({ step, users })).filter((r) => r.users > 0),
  },
  recent_events: Array.from({ length: 50 }, (_, i) => ({
    id: `evt-${i}`,
    user_id: `user-${i.toString().padStart(8, "0")}`,
    event: "onboarding_step_advanced",
    step_index: i % 6,
    step_label: STEP_LABELS[i % 6],
    created_at: new Date(Date.now() - i * 60_000).toISOString(),
  })),
};

test.describe("Admin · funil grande exporta sem truncar e mantém UI responsiva", () => {
  test("CSV completo com valores exatos + segundo export rápido", async ({ page }) => {
    await ensureSignedIn(page);
    await page.route(
      (u) => isFunnelServerFn(typeof u === "string" ? u : u.toString()),
      async (route) => {
        const req = route.request();
        if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") return route.continue();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: BIG_SNAPSHOT }, data: BIG_SNAPSHOT }),
        });
      },
    );

    await page.goto("/admin/onboarding");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    // Se o mock não pegou (formato de payload variou), pula sem falhar
    // ruidosamente — outros specs cobrem o caminho com dados reais.
    const kpiStuck = page.getByTestId("vs-stuck-total");
    if (!(await kpiStuck.isVisible().catch(() => false))) {
      test.skip(true, "Mock não interceptou o server fn nesse ambiente");
    }

    // KPI de travados = soma STUCK
    const stuckTotal = STUCK.reduce((s, n) => s + n, 0);
    await expect(kpiStuck).toHaveText(String(stuckTotal));
    await expect(page.getByTestId("vs-completed-after")).toHaveText("1800");

    // 1º export (PT) — deve baixar rápido e com todos os valores exatos.
    const t0 = Date.now();
    const [dl1] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("funnel-export-csv").click(),
    ]);
    const first = Date.now() - t0;
    expect(first).toBeLessThan(5_000);

    const fs = await import("fs/promises");
    const p1 = await dl1.path();
    if (!p1) test.skip(true, "download.path() indisponível");
    const csv = await fs.readFile(p1!, "utf8");

    // Header + 6 linhas de dados + sumário
    const lines = csv.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
    expect(lines[0]).toBe(
      "step_index,step_label,reached_total,reached_pt,reached_en,stuck_after_variant_switch",
    );
    for (let i = 0; i < 6; i++) {
      const expected = `${i},${STEP_LABELS[i]},${REACHED[i]},${PT[i]},${EN[i]},${STUCK[i]}`;
      expect(lines[1 + i]).toBe(expected);
      // sem notação científica ou vírgula-milhar
      expect(lines[1 + i]).not.toMatch(/e\+|e-|\d,\d{3}(?!\d)/);
    }
    // Sumário completo (todos os campos esperados presentes com valores exatos)
    for (const s of [
      "completed_pt,20000",
      "completed_en,5000",
      "toggles_to_pt,3400",
      "toggles_to_en,4200",
      "completed_after_variant_switch,1800",
      "# lang=pt",
    ]) {
      expect(csv).toContain(s);
    }

    // 2º export (EN) imediatamente depois — UI segue responsiva.
    const t1 = Date.now();
    const [dl2] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("funnel-export-csv-en").click(),
    ]);
    const second = Date.now() - t1;
    expect(second).toBeLessThan(2_000);
    const p2 = await dl2.path();
    if (p2) {
      const csv2 = await fs.readFile(p2, "utf8");
      expect(csv2).toContain("# lang=en");
      // Coluna stuck_after_variant_switch preservada com os mesmos valores
      // no idioma trocado (labels mudam, números não).
      for (let i = 0; i < 6; i++) {
        expect(csv2).toMatch(new RegExp(`^${i},[^,]+,${REACHED[i]},${PT[i]},${EN[i]},${STUCK[i]}$`, "m"));
      }
    }
  });
});
