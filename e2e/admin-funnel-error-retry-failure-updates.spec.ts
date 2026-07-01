/**
 * Admin · retry com falha após dismiss:
 *   - Card `funnel-export-error` reaparece com a nova mensagem
 *     (conteúdo atualizado) e existe apenas UMA instância no DOM.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · funnel-export-error — retry com falha atualiza mensagem", () => {
  test("segundo erro reabre o card com mensagem nova e uma única instância", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      let calls = 0;
      URL.createObjectURL = (() => {
        calls += 1;
        throw new Error(`simulated CSV failure #${calls}`);
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

    // 1º clique → 1º erro.
    await btn.click();
    const card = page.getByTestId("funnel-export-error");
    const desc = page.locator("#funnel-export-error-desc");
    await expect(card).toHaveCount(1);
    await expect(desc).toContainText("simulated CSV failure #1");

    // Fechar via botão.
    await page.getByTestId("funnel-export-error-dismiss").click();
    await expect(card).toHaveCount(0);
    await expect(btn).toBeFocused();

    // Retry → 2º erro com mensagem atualizada.
    await btn.click();
    await expect(card).toHaveCount(1);
    await expect(desc).toContainText("simulated CSV failure #2");
    await expect(desc).not.toContainText("#1");

    // Um terceiro clique falha de novo, e ainda assim continua UMA única instância.
    await page.getByTestId("funnel-export-error-dismiss").click();
    await expect(card).toHaveCount(0);
    await btn.click();
    await expect(card).toHaveCount(1);
    await expect(desc).toContainText("simulated CSV failure #3");
  });
});
