/**
 * Admin · Enter/Space no botão "Fechar" do funnel-export-error.
 *
 * Cobre o contrato de teclado nativo do <button>: tanto Enter quanto
 * Space disparam o click handler. Após o dismiss:
 *   - O card some.
 *   - O foco volta ao botão "Exportar CSV".
 *   - O focus trap é liberado (Tab move o foco para fora do botão).
 */
import { test, expect, type Page } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

async function openErrorCard(page: Page) {
  await page.addInitScript(() => {
    URL.createObjectURL = (() => {
      throw new Error("simulated CSV failure for enter/space test");
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

test.describe("Admin · Enter/Space no Fechar do funnel-export-error", () => {
  for (const key of ["Enter", "Space"] as const) {
    test(`${key} fecha o card, foca o Exportar CSV e libera o trap`, async ({ page }) => {
      const exportBtn = await openErrorCard(page);
      const card = page.getByTestId("funnel-export-error");
      const dismiss = page.getByTestId("funnel-export-error-dismiss");

      await expect(dismiss).toBeFocused();

      await page.keyboard.press(key);
      await expect(card).toHaveCount(0);
      await expect(exportBtn).toBeFocused();

      // Trap liberado: um Tab agora move o foco para outro controle.
      await page.keyboard.press("Tab");
      await expect(exportBtn).not.toBeFocused();
    });
  }
});
