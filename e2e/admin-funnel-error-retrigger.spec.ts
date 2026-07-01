/**
 * Admin · re-trigger do export enquanto o `funnel-export-error` está aberto.
 *
 * Cenários:
 *   1. O usuário tenta clicar de novo em "Exportar CSV" enquanto o banner
 *      de erro está aberto — o handler é síncrono e cada tentativa que
 *      falhar apenas re-seta a mensagem. NUNCA deve criar múltiplas
 *      instâncias do card (`toHaveCount(1)`).
 *   2. Enquanto o card estiver aberto, o focus trap mantém o foco preso
 *      no "Fechar", mesmo após novas tentativas de export.
 *   3. Só após o dismiss explícito o card some.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · re-trigger do export com banner de erro aberto", () => {
  test("múltiplos cliques em Export não duplicam o card e não roubam o foco", async ({ page }) => {
    // Todos os cliques falham — o segundo/terceiro só re-armam a mensagem.
    await page.addInitScript(() => {
      URL.createObjectURL = (() => {
        throw new Error("simulated CSV failure for re-trigger test");
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

    // Primeiro clique abre o card.
    await btn.click();
    const card = page.getByTestId("funnel-export-error");
    const dismiss = page.getByTestId("funnel-export-error-dismiss");
    await expect(card).toBeVisible();
    await expect(card).toHaveCount(1);
    await expect(dismiss).toBeFocused();

    // Cliques adicionais no export enquanto o card está aberto.
    for (let i = 0; i < 3; i++) {
      await btn.click();
      // Ainda existe exatamente 1 card.
      await expect(card).toHaveCount(1);
      // Foco continua no Fechar (o effect refoca após o setState).
      await expect(dismiss).toBeFocused();
      // Botão nunca fica preso desabilitado.
      await expect(btn).toBeEnabled();
      await expect(btn).toHaveAttribute("data-exporting", "false");
    }

    // Também via teclado, o Tab continua preso no Fechar.
    await page.keyboard.press("Tab");
    await expect(dismiss).toBeFocused();

    // Nenhum download foi gerado.
    const downloads: string[] = [];
    page.on("download", (dl) => downloads.push(dl.suggestedFilename()));
    await page.waitForTimeout(300);
    expect(downloads).toHaveLength(0);

    // Dismiss explícito finalmente libera o card e devolve o foco.
    await dismiss.click();
    await expect(card).toHaveCount(0);
    await expect(btn).toBeFocused();
  });
});
