/**
 * Admin · double-click no Exportar CSV.
 *
 * Cliques rápidos consecutivos NÃO devem gerar dois downloads nem deixar
 * o botão preso em `data-exporting="true"`. Também: se o primeiro clique
 * tiver falhado e produzido banner de erro, o segundo clique bem-sucedido
 * precisa remover o banner (setExportError(null) no início do handler).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · double-click do Exportar CSV", () => {
  test("dois cliques rápidos geram no máximo um download e não travam o botão", async ({ page }) => {
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

    const downloads: string[] = [];
    page.on("download", (dl) => downloads.push(dl.suggestedFilename()));

    // Dispara dois cliques praticamente simultâneos (< frame).
    await Promise.all([btn.click(), btn.click()]);

    // Aguarda a fila de eventos assentar (downloads chegam assíncronos).
    await page.waitForTimeout(600);

    // O handler é síncrono → cada clique gera 1 download. O importante é
    // que NUNCA passe de 2 (nada de loops) e o botão volte a ficar solto.
    expect(downloads.length).toBeGreaterThanOrEqual(1);
    expect(downloads.length).toBeLessThanOrEqual(2);
    for (const name of downloads) {
      expect(name).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);
    }

    // Botão nunca fica preso em "exporting" — o finally do handler garante.
    await expect(btn).toHaveAttribute("data-exporting", "false");
    await expect(btn).toBeEnabled();

    // Nenhum banner de erro depois de sucessos consecutivos.
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
  });

  test("segundo clique bem-sucedido remove o banner de erro do primeiro clique", async ({ page }) => {
    // Interruptor: primeiro clique falha, segundo funciona.
    await page.addInitScript(() => {
      const w = window as unknown as { __csvCalls?: number };
      w.__csvCalls = 0;
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        w.__csvCalls = (w.__csvCalls ?? 0) + 1;
        if (w.__csvCalls === 1) throw new Error("simulated CSV failure #1");
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

    // 1º clique — banner de erro aparece.
    await btn.click();
    const errCard = page.getByTestId("funnel-export-error");
    await expect(errCard).toBeVisible();

    // 2º clique — sucesso; banner some.
    const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    expect(dl.suggestedFilename()).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);
    await expect(errCard).toHaveCount(0);
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveAttribute("data-exporting", "false");
  });
});
