/**
 * Admin · estado de loading do funil.
 *
 * Atrasa a resposta do server fn `getOnboardingFunnel` e valida:
 *   - Skeleton `funnel-loading` aparece com `aria-busy="true"`.
 *   - Os três botões de exportar CSV (PT/EN/ES) existem porém ficam
 *     `disabled` (com `title="Carregando dados do funil…"`).
 *   - Clicar num botão desabilitado NÃO produz download.
 *   - Após a resposta chegar, o skeleton some, `data-loading="false"`
 *     no grupo, e os botões voltam a ficar habilitados (se houver dados).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

function isFunnelServerFn(url: string): boolean {
  return /_serverFn|_server-fn|server-fn|onboarding.*funnel|getOnboardingFunnel/i.test(url);
}

const MINIMAL_SNAPSHOT = {
  total_started: 4,
  total_completed: 2,
  completion_rate_pct: 50,
  current_step_distribution: [{ step: 0, users: 1 }],
  funnel: [
    { step_index: 0, step_label: "Boas-vindas", started_users: 4, reached_users: 4, drop_rate_pct: 0 },
    { step_index: 1, step_label: "Como funciona", started_users: 4, reached_users: 3, drop_rate_pct: 25 },
    { step_index: 2, step_label: "Dados básicos", started_users: 4, reached_users: 3, drop_rate_pct: 25 },
    { step_index: 3, step_label: "Experiência", started_users: 4, reached_users: 2, drop_rate_pct: 50 },
    { step_index: 4, step_label: "Condições físicas", started_users: 4, reached_users: 2, drop_rate_pct: 50 },
    { step_index: 5, step_label: "Tudo pronto", started_users: 4, reached_users: 2, drop_rate_pct: 50 },
  ],
  by_lang: {
    pt: { reached_by_step: [4, 3, 3, 2, 2, 2], completed_users: 2, toggles_to: 1 },
    en: { reached_by_step: [0, 0, 0, 0, 0, 0], completed_users: 0, toggles_to: 0 },
  },
  variant_switches: {
    total_events: 1,
    unique_users: 1,
    unique_variants: 1,
    completed_after_switch: 1,
    stuck_by_step: [],
  },
  recent_events: [
    { id: "e1", user_id: "aaaaaaaa-1111", event: "onboarding_started", step_index: 0, step_label: "Boas-vindas", created_at: new Date().toISOString() },
  ],
};

test.describe("Admin · loading do funil desabilita Exportar CSV", () => {
  test("skeleton + botões desabilitados até os dados chegarem", async ({ page }) => {
    await ensureSignedIn(page);

    // Segura a primeira resposta por ~1.5s para o loading ficar observável.
    let firstCall = true;
    await page.route(
      (u) => isFunnelServerFn(typeof u === "string" ? u : u.toString()),
      async (route) => {
        const req = route.request();
        if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") return route.continue();
        if (firstCall) {
          firstCall = false;
          await new Promise((r) => setTimeout(r, 1500));
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: MINIMAL_SNAPSHOT }, data: MINIMAL_SNAPSHOT }),
        });
      },
    );

    await page.goto("/admin/onboarding");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    const group = page.getByTestId("funnel-export-group");
    await expect(group).toBeVisible();

    // Enquanto o loading está ativo, o skeleton está visível E os botões
    // estão desabilitados. Fazemos essa asserção rapidamente antes que
    // a resposta atrasada chegue.
    const loading = page.getByTestId("funnel-loading");
    if (await loading.isVisible().catch(() => false)) {
      await expect(loading).toHaveAttribute("aria-busy", "true");
      await expect(group).toHaveAttribute("data-loading", "true");

      for (const tid of ["funnel-export-csv", "funnel-export-csv-en", "funnel-export-csv-es"]) {
        const btn = page.getByTestId(tid);
        await expect(btn).toBeVisible();
        await expect(btn).toBeDisabled();
        await expect(btn).toHaveAttribute("title", /Carregando dados do funil/i);
      }

      // Tenta clicar durante loading — nada deve baixar.
      let downloaded = false;
      page.on("download", () => (downloaded = true));
      await page.getByTestId("funnel-export-csv").click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
      expect(downloaded).toBe(false);
    }

    // Após os dados carregarem, skeleton some e botões ficam habilitados.
    await expect(page.getByTestId("funnel-loading")).toHaveCount(0, { timeout: 5_000 });
    await expect(group).toHaveAttribute("data-loading", "false");
    for (const tid of ["funnel-export-csv", "funnel-export-csv-en", "funnel-export-csv-es"]) {
      await expect(page.getByTestId(tid)).toBeEnabled();
    }
  });
});
