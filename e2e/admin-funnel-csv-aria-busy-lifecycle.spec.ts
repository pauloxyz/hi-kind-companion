/**
 * Admin · lifecycle de aria-busy/spinner no Exportar CSV.
 *
 * Contrato:
 *   - Antes do clique: aria-busy="false", sem spinner.
 *   - Durante o download: aria-busy="true", spinner visível, botão
 *     desabilitado, data-exporting="true".
 *   - Exatamente quando o download termina: aria-busy volta a "false",
 *     spinner some, botão reabilita.
 *
 * Usa busy-wait em `URL.createObjectURL` para dar uma janela observável
 * de loading sem depender de timings frágeis.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · aria-busy lifecycle do Exportar CSV", () => {
  test("aria-busy e spinner aparecem no loading e somem quando o download conclui", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        const start = performance.now();
        while (performance.now() - start < 600) {
          /* busy-wait para deixar loading observável */
        }
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
    const spinner = page.getByTestId("funnel-export-spinner-pt");

    await expect(btn).toBeVisible();
    if (await btn.isDisabled()) {
      test.skip(true, "Funil vazio — nada para exportar neste ambiente");
    }

    // Estado inicial: idle.
    await expect(btn).toHaveAttribute("aria-busy", "false");
    await expect(btn).toHaveAttribute("data-exporting", "false");
    await expect(spinner).toHaveCount(0);

    // Dispara sem aguardar o download completar.
    const downloadTask = page.waitForEvent("download");
    await btn.click();

    // Durante o loading.
    await expect(btn).toHaveAttribute("aria-busy", "true", { timeout: 2000 });
    await expect(btn).toHaveAttribute("data-exporting", "true");
    await expect(btn).toBeDisabled();
    await expect(spinner).toBeVisible();

    // Ao completar o download, tudo volta ao normal.
    const dl = await downloadTask;
    expect(dl.suggestedFilename()).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);

    await expect(btn).toHaveAttribute("aria-busy", "false");
    await expect(btn).toHaveAttribute("data-exporting", "false");
    await expect(btn).toBeEnabled();
    await expect(spinner).toHaveCount(0);
  });
});
