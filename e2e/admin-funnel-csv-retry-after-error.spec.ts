/**
 * Admin · Export CSV retry-after-error
 *
 * Cenário: o primeiro clique de Exportar CSV falha (URL.createObjectURL
 * lança), o banner de erro aparece, e o segundo clique — com o patch
 * removido — baixa o CSV normalmente. Ao final, o banner de erro NÃO
 * pode continuar visível: um export bem-sucedido deve resetar o estado.
 *
 * Complementa admin-funnel-csv-export-error.spec.ts (que apenas verifica o
 * primeiro clique falhando) — aqui garantimos o fluxo completo de retry.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · retry do CSV após erro no primeiro clique", () => {
  test("segundo clique baixa e remove o banner de erro", async ({ page }) => {
    // Interruptor global — decidiremos quando "desarmá-lo" via page.evaluate.
    await page.addInitScript(() => {
      const w = window as unknown as { __forceCsvFailure?: boolean };
      w.__forceCsvFailure = true;
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        if (w.__forceCsvFailure) {
          throw new Error("500: transient failure while building CSV blob");
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

    let downloads = 0;
    page.on("download", () => (downloads += 1));

    // 1º clique — erro esperado
    await btn.click();
    const errCard = page.getByTestId("funnel-export-error");
    await expect(errCard).toBeVisible();
    await expect(errCard).toContainText(/Não foi possível gerar o CSV/i);
    await expect(errCard).toContainText(/500: transient failure/);
    expect(downloads).toBe(0);
    await expect(btn).toBeEnabled();

    // Desarma o patch — o segundo clique deve baixar normalmente.
    await page.evaluate(() => {
      (window as unknown as { __forceCsvFailure?: boolean }).__forceCsvFailure = false;
    });

    const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    expect(dl.suggestedFilename()).toMatch(
      /^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    // O banner de erro deve sumir imediatamente após o sucesso — o handler
    // faz `setExportError(null)` no início de cada clique.
    await expect(errCard).toHaveCount(0);
    expect(downloads).toBeGreaterThanOrEqual(1);
  });
});
