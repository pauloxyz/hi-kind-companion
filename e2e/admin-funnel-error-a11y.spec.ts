/**
 * Admin · a11y do card `funnel-export-error`.
 *
 * Garante que:
 *   - O card tem role="alert" + aria-live="assertive" (leitores de tela
 *     anunciam a falha imediatamente).
 *   - Ao aparecer, o foco vai automaticamente para o botão "Fechar".
 *   - ESC fecha o card (equivalente ao clique em "Fechar").
 *   - Após fechar via teclado, o botão de Exportar continua habilitado
 *     e pode ser reativado — nenhum retry fica bloqueado.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · a11y do erro de export CSV", () => {
  test("aria-live/role adequados, foco no Fechar e ESC reabilita o export", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        throw new Error("simulated CSV failure for a11y test");
        // eslint-disable-next-line @typescript-eslint/no-unreachable
        return orig(blob);
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

    // Semântica de live region para leitores de tela.
    await expect(errCard).toBeVisible();
    await expect(errCard).toHaveAttribute("role", "alert");
    await expect(errCard).toHaveAttribute("aria-live", "assertive");
    await expect(errCard).toHaveAttribute("aria-atomic", "true");

    // Foco vai para o "Fechar" automaticamente.
    await expect(dismiss).toBeFocused();

    // ESC fecha o card via teclado — sem precisar clicar em nada.
    await page.keyboard.press("Escape");
    await expect(errCard).toHaveCount(0);

    // Após fechar, o botão de export continua habilitado (retry disponível).
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveAttribute("data-exporting", "false");

    // Sanidade: o foco voltou para o botão de export usado por último.
    await expect(btn).toBeFocused();
  });
});
