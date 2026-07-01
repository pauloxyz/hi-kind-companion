/**
 * Admin · falha ao gerar o CSV do funil.
 *
 * O CSV é gerado 100% client-side (buildFunnelCsv + Blob + createObjectURL).
 * Simulamos falha injetando um patch antes da app carregar que faz
 * `URL.createObjectURL` lançar apenas quando marcado. Assim:
 *
 *   - O clique dispara o try/catch do handler de export.
 *   - Nenhum download acontece.
 *   - O banner `funnel-export-error` aparece com mensagem em PT.
 *   - O botão continua habilitado (permite nova tentativa).
 *   - Depois de fechar o banner, remover o patch e clicar de novo, o
 *     download acontece normalmente.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · falha na geração do CSV do funil", () => {
  test("erro ao gerar CSV mostra mensagem, mantém botão habilitado e não baixa", async ({ page }) => {
    // Patch antes de qualquer script de app rodar — instala um interruptor
    // controlado por window.__forceCsvFailure para não afetar outros usos.
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      (window as unknown as { __forceCsvFailure?: boolean }).__forceCsvFailure = true;
      URL.createObjectURL = ((blob: Blob) => {
        if ((window as unknown as { __forceCsvFailure?: boolean }).__forceCsvFailure) {
          throw new Error("simulated 500 while building CSV blob");
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
      test.skip(true, "Funil vazio nesse ambiente — export desabilitado por outro motivo");
    }

    let downloaded = false;
    page.on("download", () => (downloaded = true));

    // 1) Clique com o patch ativo → deve pegar o erro no catch
    await btn.click();

    const errCard = page.getByTestId("funnel-export-error");
    await expect(errCard).toBeVisible();
    await expect(errCard).toContainText(/Não foi possível gerar o CSV/i);
    await expect(errCard).toContainText(/simulated 500 while building CSV blob/);

    // O botão continua habilitado — usuário pode tentar de novo
    await expect(btn).toBeEnabled();
    // data-exporting foi reposto pra "false" no finally
    await expect(btn).toHaveAttribute("data-exporting", "false");

    // Nenhum download foi gerado
    await page.waitForTimeout(300);
    expect(downloaded).toBe(false);

    // 2) Fechar o banner via botão dedicado
    await page.getByTestId("funnel-export-error-dismiss").click();
    await expect(errCard).toHaveCount(0);

    // 3) Desligar o patch e clicar novamente → agora baixa normalmente
    await page.evaluate(() => {
      (window as unknown as { __forceCsvFailure?: boolean }).__forceCsvFailure = false;
    });
    const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    expect(dl.suggestedFilename()).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);
    // Banner de erro NÃO reaparece após sucesso
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
  });
});
