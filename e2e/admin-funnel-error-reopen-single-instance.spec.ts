/**
 * Admin · reabrir rapidamente o `funnel-export-error` (via teclado e clique)
 * nunca cria mais de uma instância do card.
 *
 * Estratégia: com todos os cliques falhando, alternamos entre:
 *   - clique no botão "Exportar CSV" via mouse
 *   - Enter/Space no botão via teclado
 * mesmo enquanto o card já está aberto. Em cada iteração conferimos
 * que `page.getByTestId("funnel-export-error")` tem count === 1 e que
 * o foco continua no botão "Fechar".
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · reabrir alerta não duplica o card", () => {
  test("mouse + teclado alternados mantêm exatamente 1 card e foco no Fechar", async ({ page }) => {
    await page.addInitScript(() => {
      URL.createObjectURL = (() => {
        throw new Error("simulated CSV failure for re-open test");
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

    // Abre pela primeira vez via mouse.
    await btn.click();
    const card = page.getByTestId("funnel-export-error");
    const dismiss = page.getByTestId("funnel-export-error-dismiss");
    await expect(card).toHaveCount(1);
    await expect(dismiss).toBeFocused();

    // Sequência agressiva de re-abertura:
    //   click → focar btn via JS → Enter → focar btn → Space → click
    const attempts = [
      () => btn.click(),
      async () => {
        await btn.focus();
        await page.keyboard.press("Enter");
      },
      async () => {
        await btn.focus();
        await page.keyboard.press("Space");
      },
      () => btn.click(),
      () => btn.click(),
    ];

    for (const attempt of attempts) {
      await attempt();
      // Depois de cada tentativa, EXATAMENTE 1 card, foco no Fechar.
      await expect(card).toHaveCount(1);
      await expect(dismiss).toBeFocused();
      await expect(btn).toBeEnabled();
      await expect(btn).toHaveAttribute("data-exporting", "false");
    }

    // Nenhum download foi disparado (todas as tentativas falham).
    let downloads = 0;
    page.on("download", () => (downloads += 1));
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);

    // Só o dismiss explícito remove o card — via Enter no Fechar.
    await page.keyboard.press("Enter");
    await expect(card).toHaveCount(0);
    await expect(btn).toBeFocused();
  });
});
