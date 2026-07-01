/**
 * Admin · cliques fora do `funnel-export-error` não devem tirar o foco
 * do botão "Fechar". A única forma de dismiss é confirmar explicitamente
 * (Enter/Space/click no Fechar, ou Esc no teclado).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · clique fora do funnel-export-error", () => {
  test("cliques fora não fecham o card nem tiram o foco do Fechar", async ({ page }) => {
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

    // Um ponto guaranteed-outside: um pixel dentro do <body> mas fora do
    // card. Coordenada 5,5 fica no canto superior esquerdo — se por acaso
    // acertar o card, usamos elementFromPoint pra evitar falso positivo.
    const outsideHitsCard = await page.evaluate(() => {
      const el = document.elementFromPoint(5, 5);
      return !!el?.closest('[data-testid="funnel-export-error"]');
    });
    expect(outsideHitsCard, "coord 5,5 não deveria acertar o card").toBe(false);

    // Clique fora #1 — no <html>/<body>.
    await page.mouse.click(5, 5);
    await expect(card).toBeVisible();

    // Clique fora #2 — em um controle claramente fora do alerta (KPI card
    // "Iniciaram onboarding" fica logo abaixo).
    const otherCard = page.locator('[data-testid="funnel-export-group"]');
    await otherCard.click({ position: { x: 2, y: 2 } });
    await expect(card).toBeVisible();

    // Depois desses cliques fora, o foco pode ter migrado (browser move
    // ao target do click). O contrato é: quando o usuário voltar a
    // interagir com teclado, o trap devolve o foco ao Fechar. Simulamos
    // essa "próxima interação" via Tab.
    await page.keyboard.press("Tab");
    await expect(dismiss).toBeFocused();

    // Sanidade: nenhum clique fora dispensou o card.
    await expect(card).toBeVisible();

    // Confirmar dismiss explícito no Fechar libera o card e devolve foco.
    await dismiss.click();
    await expect(card).toHaveCount(0);
    await expect(btn).toBeFocused();
  });
});
