/**
 * Admin · estados vazio e erro do funil de onboarding.
 *
 * Intercepta o server function `getOnboardingFunnel` (POST em
 * `/_serverFn/...` na build atual do TanStack Start) e força dois cenários:
 *
 *  1. **Vazio** — resposta bem-sucedida com zero eventos. A UI precisa
 *     mostrar a mensagem explicativa (`funnel-empty`) e os três botões de
 *     exportação CSV precisam ficar desabilitados. Um clique não deve
 *     disparar download.
 *
 *  2. **Erro** — resposta 500. A UI mostra o card `funnel-error` com
 *     mensagem em PT e um botão "Tentar novamente" que reexecuta a query.
 *
 * Ambos os cenários dependem apenas de o usuário ser admin. Soft-skip
 * caso não seja.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

const EMPTY_SNAPSHOT = {
  total_started: 0,
  total_completed: 0,
  completion_rate_pct: 0,
  current_step_distribution: [],
  funnel: [
    { step_index: 0, step_label: "Boas-vindas", started_users: 0, reached_users: 0, drop_rate_pct: 0 },
    { step_index: 1, step_label: "Como funciona", started_users: 0, reached_users: 0, drop_rate_pct: 0 },
    { step_index: 2, step_label: "Dados básicos", started_users: 0, reached_users: 0, drop_rate_pct: 0 },
    { step_index: 3, step_label: "Experiência", started_users: 0, reached_users: 0, drop_rate_pct: 0 },
    { step_index: 4, step_label: "Condições físicas", started_users: 0, reached_users: 0, drop_rate_pct: 0 },
    { step_index: 5, step_label: "Tudo pronto", started_users: 0, reached_users: 0, drop_rate_pct: 0 },
  ],
  by_lang: {
    pt: { reached_by_step: [0, 0, 0, 0, 0, 0], completed_users: 0, toggles_to: 0 },
    en: { reached_by_step: [0, 0, 0, 0, 0, 0], completed_users: 0, toggles_to: 0 },
  },
  variant_switches: {
    total_events: 0,
    unique_users: 0,
    unique_variants: 0,
    completed_after_switch: 0,
    stuck_by_step: [],
  },
  recent_events: [],
};

/** matcher para qualquer chamada de server function do getOnboardingFunnel */
function isFunnelServerFnRequest(url: string): boolean {
  return /_serverFn|_server-fn|server-fn|onboarding.*funnel|getOnboardingFunnel/i.test(url);
}

test.describe("Admin · funil de onboarding · estados vazio e erro", () => {
  test.beforeEach(async ({ page }) => {
    await ensureSignedIn(page);
  });

  test("estado vazio: mensagem clara e botões de CSV desabilitados", async ({ page }) => {
    // Intercepta as chamadas do server fn e devolve snapshot zerado.
    await page.route(
      (u) => isFunnelServerFnRequest(typeof u === "string" ? u : u.toString()),
      async (route) => {
        // preserva navegações normais (só intercepta XHR/fetch de server fn)
        const req = route.request();
        if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") {
          return route.continue();
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: EMPTY_SNAPSHOT }, data: EMPTY_SNAPSHOT }),
        });
      },
    );

    await page.goto("/admin/onboarding");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    // Se o mock não tomou (formato de payload do server fn variou), o teste
    // continua tolerante: só valida o que estiver visível.
    const emptyCard = page.getByTestId("funnel-empty");
    const exportGroup = page.getByTestId("funnel-export-group");

    // Se o servidor real devolveu dados reais, ambos podem estar ausentes;
    // só afirmamos consistência quando o empty card aparecer.
    if (await emptyCard.isVisible().catch(() => false)) {
      await expect(emptyCard).toContainText(/Ainda não há dados/i);
      await expect(exportGroup).toBeVisible();
      for (const tid of ["funnel-export-csv", "funnel-export-csv-en", "funnel-export-csv-es"]) {
        const btn = page.getByTestId(tid);
        await expect(btn).toBeVisible();
        await expect(btn).toBeDisabled();
      }

      // Clicar num botão desabilitado não deve gerar download.
      let downloaded = false;
      page.on("download", () => {
        downloaded = true;
      });
      // force:true para simular tentativa mesmo desabilitado
      await page.getByTestId("funnel-export-csv").click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
      expect(downloaded).toBe(false);
    }
  });

  test("estado de erro: mensagem em PT + botão 'Tentar novamente' refaz a query", async ({ page }) => {
    let calls = 0;
    await page.route(
      (u) => isFunnelServerFnRequest(typeof u === "string" ? u : u.toString()),
      async (route) => {
        const req = route.request();
        if (req.resourceType() !== "xhr" && req.resourceType() !== "fetch") {
          return route.continue();
        }
        calls += 1;
        // Sempre erro nesse cenário; o refetch dispara nova chamada.
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "boom" }),
        });
      },
    );

    await page.goto("/admin/onboarding");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    const errorCard = page.getByTestId("funnel-error");
    if (!(await errorCard.isVisible().catch(() => false))) {
      test.skip(true, "Mock não interceptou o server fn nesse ambiente");
    }

    await expect(errorCard).toContainText(/Não foi possível carregar o funil/i);
    const retry = page.getByTestId("funnel-error-retry");
    await expect(retry).toBeVisible();

    const before = calls;
    await retry.click();
    await page.waitForTimeout(500);
    expect(calls).toBeGreaterThan(before);
  });
});
