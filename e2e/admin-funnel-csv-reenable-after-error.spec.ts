/**
 * Admin · Exportar CSV reabilita corretamente após erro no primeiro clique.
 *
 * Contrato:
 *   - Primeiro clique falha → banner de erro aparece.
 *   - Botão NUNCA fica preso desabilitado (o `finally` do handler zera
 *     `exportingLocale`, permitindo retry imediato).
 *   - Segundo clique bem-sucedido → download acontece, banner some, o
 *     atributo `data-exporting` permanece "false" durante toda a sequência
 *     depois do handler síncrono terminar.
 *   - Um TERCEIRO clique consecutivo também funciona sem estados presos.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · export CSV reabilita após erro", () => {
  test("botão continua enabled durante toda a sequência erro→sucesso→sucesso", async ({ page }) => {
    // Apenas o PRIMEIRO clique falha; os demais passam.
    await page.addInitScript(() => {
      const w = window as unknown as { __csvCalls?: number };
      w.__csvCalls = 0;
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        w.__csvCalls = (w.__csvCalls ?? 0) + 1;
        if (w.__csvCalls === 1) {
          throw new Error("simulated CSV failure on first click");
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
    await expect(btn).toBeVisible();
    if (await btn.isDisabled()) {
      test.skip(true, "Funil vazio — nada para exportar neste ambiente");
    }

    // Estado inicial — habilitado, nenhum banner.
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveAttribute("data-exporting", "false");
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);

    // 1º clique — falha síncrona. Banner aparece; botão volta a enabled.
    await btn.click();
    await expect(page.getByTestId("funnel-export-error")).toBeVisible();
    await expect(btn).toBeEnabled(); // NÃO ficou preso desabilitado
    await expect(btn).toHaveAttribute("data-exporting", "false");

    // 2º clique — sucesso. Download vem, banner some.
    const [dl2] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    expect(dl2.suggestedFilename()).toMatch(
      /^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveAttribute("data-exporting", "false");

    // 3º clique — sucesso outra vez, nenhum lock preso da tentativa anterior.
    const [dl3] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    expect(dl3.suggestedFilename()).toMatch(
      /^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveAttribute("data-exporting", "false");
  });
});
