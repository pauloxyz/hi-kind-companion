/**
 * Admin · Esc fecha o `funnel-export-error`, devolve o foco ao botão de
 * export e libera o focus trap.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · Esc no funnel-export-error", () => {
  test("Esc fecha o card, devolve o foco ao Exportar CSV e destrava o trap", async ({ page }) => {
    await page.addInitScript(() => {
      URL.createObjectURL = (() => {
        throw new Error("simulated CSV failure for esc test");
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
    const errCard = page.getByTestId("funnel-export-error");
    const dismiss = page.getByTestId("funnel-export-error-dismiss");

    await expect(errCard).toBeVisible();
    await expect(dismiss).toBeFocused();

    // Enquanto o card estiver aberto o trap prende o foco no Fechar.
    await page.keyboard.press("Tab");
    await expect(dismiss).toBeFocused();

    // Esc fecha o card sem depender de clique.
    await page.keyboard.press("Escape");
    await expect(errCard).toHaveCount(0);

    // Foco volta imediatamente ao botão de export.
    await expect(btn).toBeFocused();

    // Trap foi liberado — Tab agora move para outro controle.
    await page.keyboard.press("Tab");
    await expect(btn).not.toBeFocused();
  });
});
