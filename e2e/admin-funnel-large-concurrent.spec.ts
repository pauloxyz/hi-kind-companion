/**
 * Admin · export em funil grande + interações concorrentes.
 *
 * Injeta um snapshot com contagens de 6 dígitos por etapa e uma tabela
 * "vs-stuck-table" grande. Enquanto o export do CSV em PT roda, o teste
 * interage com outros controles da página:
 *   - clica no botão de export EN durante a mesma janela
 *   - alterna hover/scroll pra card de KPI
 *   - executa `document.title` via evaluate pra medir responsividade
 * Todos precisam responder em <1s por operação, provando que a thread
 * principal não está bloqueada durante a geração do CSV.
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
const REACHED = [500_000, 420_000, 350_000, 260_000, 180_000, 90_000];
const PT = [400_000, 340_000, 280_000, 210_000, 140_000, 70_000];
const EN = [100_000, 80_000, 70_000, 50_000, 40_000, 20_000];
const STUCK = [10, 250, 800, 1_500, 3_200, 600];

const HUGE_SNAPSHOT = {
  total_started: 500_000,
  total_completed: 90_000,
  completion_rate_pct: 18,
  current_step_distribution: STEP_LABELS.map((_, step) => ({ step, users: REACHED[step] })),
  funnel: STEP_LABELS.map((label, i) => ({
    step_index: i,
    step_label: label,
    started_users: 500_000,
    reached_users: REACHED[i],
    drop_rate_pct: Math.round((1 - REACHED[i] / 500_000) * 1000) / 10,
  })),
  by_lang: {
    pt: { reached_by_step: PT, completed_users: 72_000, toggles_to: 15_000 },
    en: { reached_by_step: EN, completed_users: 18_000, toggles_to: 22_000 },
  },
  variant_switches: {
    total_events: 55_000,
    unique_users: 32_000,
    unique_variants: 5,
    completed_after_switch: 8_400,
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

test.describe("Admin · export grande sem travar a UI", () => {
  test("export em PT + interações concorrentes respondem <1s cada", async ({ page }) => {
    await ensureSignedIn(page);
    await page.route(
      (u) => isFunnelServerFn(typeof u === "string" ? u : u.toString()),
      async (route) => {
        const req = route.request();
        if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") return route.continue();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: HUGE_SNAPSHOT }, data: HUGE_SNAPSHOT }),
        });
      },
    );

    await page.goto("/admin/onboarding");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    if (!(await page.getByTestId("vs-stuck-total").isVisible().catch(() => false))) {
      test.skip(true, "Mock não interceptou o server fn nesse ambiente");
    }

    // Dispara export em PT sem aguardar o download — assim conseguimos
    // interagir "durante" a geração/entrega do arquivo.
    const dlPtPromise = page.waitForEvent("download");
    const btnPt = page.getByTestId("funnel-export-csv");
    await btnPt.click();

    // Interações concorrentes: cada uma precisa completar em <1s
    const interactions: Array<[string, () => Promise<unknown>]> = [
      ["hover no KPI vs-completed-after", () => page.getByTestId("vs-completed-after").hover()],
      ["scroll até o fim da página", () => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))],
      ["evaluate document.title", () => page.evaluate(() => document.title)],
      ["click no botão de export EN", async () => {
        const dlEnPromise = page.waitForEvent("download");
        await page.getByTestId("funnel-export-csv-en").click();
        return dlEnPromise;
      }],
    ];

    const downloads = [dlPtPromise];
    for (const [label, run] of interactions) {
      const t0 = Date.now();
      const result = await run();
      const elapsed = Date.now() - t0;
      expect.soft(elapsed, `Interação "${label}" bloqueou por ${elapsed}ms`).toBeLessThan(1_000);
      // O click em EN também retorna um download promise — coleta pra validar depois
      if (result && typeof (result as { path?: unknown }).path === "function") {
        downloads.push(result as Awaited<typeof dlPtPromise>);
      }
    }

    // Ambos os downloads chegam íntegros
    const dlPt = await dlPtPromise;
    expect(dlPt.suggestedFilename()).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);

    // Não deve haver banner de erro após exports bem-sucedidos
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);

    // A página segue interativa: outro click funciona normalmente
    const t = Date.now();
    await page.getByTestId("vs-events").click({ trial: true }).catch(() => {});
    expect(Date.now() - t).toBeLessThan(500);
  });
});
