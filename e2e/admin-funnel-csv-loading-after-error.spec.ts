/**
 * Admin · loading no export após um erro anterior.
 *
 * Contrato:
 *   1. Primeiro clique falha → banner de erro aparece.
 *   2. Dismiss.
 *   3. Segundo clique bem-sucedido:
 *        - Durante o processamento, o botão fica desabilitado com um
 *          spinner (`funnel-export-spinner-pt`) e `data-exporting="true"`.
 *        - Só volta a `data-exporting="false"` e `enabled` depois que o
 *          download completar.
 *
 * O handler defere o download em `requestAnimationFrame`, então o React
 * pinta o estado "exporting" antes do trabalho síncrono. Usamos um patch
 * de busy-wait no `URL.createObjectURL` para dar tempo suficiente ao
 * Playwright de observar o estado in-flight sem flake.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · loading no Exportar CSV após erro", () => {
  test("segundo clique mostra spinner até o download completar", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __csvCalls?: number };
      w.__csvCalls = 0;
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        w.__csvCalls = (w.__csvCalls ?? 0) + 1;
        if (w.__csvCalls === 1) throw new Error("first-click-failure");
        // Segundo clique: busy-wait síncrono de ~600ms para simular um
        // blob pesado. React já pintou "exporting=true" antes disso.
        const start = performance.now();
        while (performance.now() - start < 600) { /* spin */ }
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

    // 1) Falha proposital
    await btn.click();
    await expect(page.getByTestId("funnel-export-error")).toBeVisible();
    await expect(btn).toBeEnabled(); // handler síncrono liberou

    // 2) Dismiss
    await page.getByTestId("funnel-export-error-dismiss").click();
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);

    // 3) Retry: dispara o clique SEM aguardar o download completar.
    const downloadTask = page.waitForEvent("download");
    await btn.click();

    // Enquanto o rAF-pré-busy-wait roda, observamos loading:
    //   - data-exporting="true"
    //   - aria-busy="true"
    //   - disabled
    //   - spinner visível
    await expect(btn).toHaveAttribute("data-exporting", "true", { timeout: 2000 });
    await expect(btn).toHaveAttribute("aria-busy", "true");
    await expect(btn).toBeDisabled();
    await expect(page.getByTestId("funnel-export-spinner-pt")).toBeVisible();

    // Depois que o download termina, o estado de loading desaparece.
    const dl = await downloadTask;
    expect(dl.suggestedFilename()).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);

    await expect(btn).toHaveAttribute("data-exporting", "false");
    await expect(btn).toHaveAttribute("aria-busy", "false");
    await expect(btn).toBeEnabled();
    await expect(page.getByTestId("funnel-export-spinner-pt")).toHaveCount(0);
  });
});
