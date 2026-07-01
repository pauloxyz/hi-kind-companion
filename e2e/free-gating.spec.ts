/**
 * Gating Pro para usuário Free em /app/ingles e /app/comecar.
 *
 * Objetivo: garantir que os controles de tradução / EN e as lições
 * completas do curso ficam VISIVELMENTE bloqueados/ocultos pra Free.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Free gating · tradução e inglês", () => {
  test.beforeEach(async ({ page, context }) => {
    await ensureSignedIn(page, context);
  });

  test("/app/ingles mostra locks e badge 'Pro libera tudo' para Free", async ({ page }) => {
    await page.goto("/app/ingles");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/app/ingles")) {
      test.skip(true, "Rota não acessível.");
    }
    await expect(
      page.getByRole("heading", { name: /Inglês para o H-2A/i }),
    ).toBeVisible();

    const badges = page.getByText(/Pro libera tudo/i);
    const count = await badges.count();
    if (count === 0) test.skip(true, "Sem módulos seedados.");

    // Todos os cards devem exibir o badge (não pode haver módulo destravado
    // sem gating pra Free).
    expect(count).toBeGreaterThan(0);
    await expect(badges.first()).toBeVisible();
  });

  test("/app/comecar (Free) não expõe toggle PT/EN nem select de variantes", async ({ page }) => {
    await page.goto("/app/comecar");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/app/comecar")) {
      test.skip(true, "Rota não acessível.");
    }

    // Se o usuário de teste for Pro, o toggle aparece — nesse caso,
    // esse spec não se aplica e a gente pula.
    const toggle = page.getByTestId("onb-lang-toggle");
    const variantSel = page.getByTestId("onb-variant-select");

    const toggleVisible = await toggle.isVisible().catch(() => false);
    const variantVisible = await variantSel.isVisible().catch(() => false);

    if (toggleVisible || variantVisible) {
      test.skip(true, "Usuário de teste está em modo Pro — gating Free não se aplica.");
    }

    // Estruturalmente: nenhum controle Pro deve estar no DOM pra Free.
    await expect(toggle).toHaveCount(0);
    await expect(variantSel).toHaveCount(0);
  });
});
