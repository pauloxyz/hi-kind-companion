/**
 * Admin · navegação por teclado no card `funnel-export-error`.
 *
 * Valida:
 *   - Ao aparecer, o foco vai automaticamente para "Fechar".
 *   - Tab move o foco para o próximo controle focável fora do card
 *     (o card só tem 1 controle interativo — o próprio "Fechar").
 *   - Shift+Tab devolve o foco ao "Fechar".
 *   - Enter e Espaço no "Fechar" (via teclado) fecham o card.
 *   - Após fechar, o foco retorna ao botão de export usado (permitindo
 *     retry sem tocar no mouse).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

async function openErrorCard(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    URL.createObjectURL = (() => {
      throw new Error("simulated CSV failure for keyboard nav");
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
  await expect(page.getByTestId("funnel-export-error")).toBeVisible();
  return btn;
}

test.describe("Admin · teclado no funnel-export-error", () => {
  test("foco inicial no Fechar; Shift+Tab volta pra ele; Enter fecha e devolve foco", async ({ page }) => {
    const exportBtn = await openErrorCard(page);
    const dismiss = page.getByTestId("funnel-export-error-dismiss");

    // Foco automático no Fechar.
    await expect(dismiss).toBeFocused();

    // Focus trap: Tab e Shift+Tab mantêm o foco no Fechar enquanto o card
    // estiver aberto (o único controle interativo do alerta).
    await page.keyboard.press("Tab");
    await expect(dismiss).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dismiss).toBeFocused();

    // Enter fecha o card.
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);

    // Foco retorna ao botão de export.
    await expect(exportBtn).toBeFocused();
  });

  test("Espaço no Fechar também dispara o dismiss", async ({ page }) => {
    const exportBtn = await openErrorCard(page);
    const dismiss = page.getByTestId("funnel-export-error-dismiss");
    await expect(dismiss).toBeFocused();

    await page.keyboard.press("Space");
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
    await expect(exportBtn).toBeFocused();
  });
});
