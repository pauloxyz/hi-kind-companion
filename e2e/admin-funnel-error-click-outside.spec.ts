/**
 * Admin · clique fora do `funnel-export-error` fecha o card e devolve
 * o foco ao botão "Exportar CSV". Antes o contrato mantinha o card
 * aberto até dismiss explícito; agora o card é tratado como popover
 * dismissível por clique externo, preservando o trap de teclado
 * enquanto está aberto.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · clique fora do funnel-export-error", () => {
  test("clique fora fecha o card e devolve o foco ao Exportar CSV", async ({ page }) => {
    await page.addInitScript(() => {
      URL.createObjectURL = (() => {
        throw new Error("simulated CSV failure for click-outside test");
      }) as typeof URL.createObjectURL;
    });

    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    const btn = page.getByTestId("funnel-export-csv");
    await expect(btn).toBeVisible();
    if (await btn.isDisabled()) {
      test.skip(true, "Funil vazio — nada para exportar neste ambiente");
    }

    await btn.click();
    const card = page.getByTestId("funnel-export-error");
    const dismiss = page.getByTestId("funnel-export-error-dismiss");
    await expect(card).toBeVisible();
    await expect(dismiss).toBeFocused();

    // Sanidade: coord 5,5 está fora do card.
    const outsideHitsCard = await page.evaluate(() => {
      const el = document.elementFromPoint(5, 5);
      return !!el?.closest('[data-testid="funnel-export-error"]');
    });
    expect(outsideHitsCard, "coord 5,5 não deveria acertar o card").toBe(false);

    // Clique fora fecha e devolve o foco.
    await page.mouse.click(5, 5);
    await expect(card).toHaveCount(0);
    await expect(btn).toBeFocused();
  });
});
