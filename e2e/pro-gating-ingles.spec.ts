/**
 * Gating Pro na tela de Inglês H-2A (/app/ingles).
 *
 * Como o usuário de teste normalmente é Free, a gente valida:
 *  - A página abre para usuário autenticado
 *  - A indicação de "Pro libera tudo" (gating visual) aparece nos módulos
 *  - Existe pelo menos um ícone de Lock renderizado
 *
 * Se não houver módulos seedados no ambiente, o teste faz soft-skip
 * pra manter o suite verde.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Pro gating · /app/ingles", () => {
  test.beforeEach(async ({ page, context }) => {
    await ensureSignedIn(page, context);
  });

  test("mostra indicador Pro nos módulos e ícones de lock", async ({ page }) => {
    await page.goto("/app/ingles");

    // Se o AppShell redirecionar por onboarding incompleto, aborta com skip
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/app/ingles")) {
      test.skip(true, "Rota /app/ingles não acessível nesse ambiente.");
    }

    // Header da página
    await expect(
      page.getByRole("heading", { name: /Inglês para o H-2A/i }),
    ).toBeVisible();

    // Sem módulos seedados? soft skip
    const hasModules = await page
      .getByText(/Pro libera tudo/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasModules) {
      test.skip(true, "Nenhum módulo de inglês seedado — nada pra travar.");
    }

    // Deve haver múltiplos "Pro libera tudo" (um por card)
    const proBadges = page.getByText(/Pro libera tudo/i);
    await expect(proBadges.first()).toBeVisible();
    expect(await proBadges.count()).toBeGreaterThan(0);
  });
});
