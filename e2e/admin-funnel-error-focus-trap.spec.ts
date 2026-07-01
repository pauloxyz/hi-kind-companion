/**
 * Admin · focus trap do card `funnel-export-error`.
 *
 * Com o trap ativo, nenhuma tecla (Tab, Shift+Tab, ou tentativa
 * programática via `Tab` repetido) deve tirar o foco do único controle
 * interativo do alerta (o botão "Fechar") enquanto ele estiver aberto.
 * A única forma de sair é fechar o card (Enter/Space/Esc/click).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · focus trap no funnel-export-error", () => {
  test("foco permanece no Fechar durante Tab/Shift+Tab repetidos", async ({ page }) => {
    await page.addInitScript(() => {
      URL.createObjectURL = (() => {
        throw new Error("simulated CSV failure for focus-trap test");
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
    const dismiss = page.getByTestId("funnel-export-error-dismiss");
    await expect(dismiss).toBeFocused();

    // 10 Tabs consecutivos — foco NUNCA sai do Fechar.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      await expect(dismiss).toBeFocused();
    }

    // Mesma coisa para Shift+Tab.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Shift+Tab");
      await expect(dismiss).toBeFocused();
    }

    // Sanidade: o activeElement no DOM real também é o botão de Fechar.
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    );
    expect(activeTestId).toBe("funnel-export-error-dismiss");

    // Fechar por Enter libera o trap e devolve foco ao export.
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
    await expect(btn).toBeFocused();

    // Depois de fechado, Tab volta a funcionar normalmente (o trap sumiu).
    await page.keyboard.press("Tab");
    await expect(btn).not.toBeFocused();
  });
});
