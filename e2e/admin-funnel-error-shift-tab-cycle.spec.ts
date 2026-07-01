/**
 * Admin · Shift+Tab dentro do card `funnel-export-error`.
 *
 * O card só tem 1 controle interativo (Fechar), então tanto Tab quanto
 * Shift+Tab devem manter o foco preso nele — esse é o ciclo do trap.
 * Ao dismiss (via Enter), o foco retorna para "Exportar CSV" e o trap
 * é liberado (Tab volta a mover foco).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · Shift+Tab no ciclo do trap", () => {
  test("Shift+Tab repetidos mantêm foco no Fechar; dismiss retorna ao export", async ({ page }) => {
    await page.addInitScript(() => {
      URL.createObjectURL = (() => {
        throw new Error("simulated CSV failure for shift-tab test");
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

    // 8 Shift+Tab consecutivos — foco NUNCA sai do Fechar.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Shift+Tab");
      await expect(dismiss).toBeFocused();
    }

    // Mistura Shift+Tab e Tab — o ciclo continua fechado.
    await page.keyboard.press("Tab");
    await expect(dismiss).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dismiss).toBeFocused();

    // Confere via DOM que o activeElement é realmente o dismiss.
    const activeTestId = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    );
    expect(activeTestId).toBe("funnel-export-error-dismiss");

    // Enter fecha e devolve o foco para o botão de export.
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
    await expect(btn).toBeFocused();

    // Trap liberado: Shift+Tab agora sai do botão de export.
    await page.keyboard.press("Shift+Tab");
    await expect(btn).not.toBeFocused();
  });
});
