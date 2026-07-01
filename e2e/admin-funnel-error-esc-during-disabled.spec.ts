/**
 * Admin · Esc no funnel-export-error mesmo quando o botão Exportar CSV
 * está desabilitado momentaneamente.
 *
 * Reproduz a condição de borda: o erro é levantado exatamente no meio
 * de um export "lento" (busy-wait). Enquanto o handler roda, o botão
 * está com `disabled` + `aria-busy`. Ao fim, o `finally` libera o
 * botão e o `catch` mostra o card de erro. Pressionamos Esc já com o
 * card aberto e confirmamos que:
 *   - o card fecha imediatamente;
 *   - o foco volta para o botão Exportar CSV (que já reabilitou);
 *   - o card NÃO reaparece sozinho depois disso.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · Esc no funnel-export-error com botão em transição", () => {
  test("Esc fecha o card, foco volta ao Exportar CSV e o card não reaparece", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((_blob: Blob) => {
        // Segura o botão como disabled por ~400ms e então falha.
        const start = performance.now();
        while (performance.now() - start < 400) {
          /* busy-wait */
        }
        void orig;
        throw new Error("simulated failure after loading window");
      }) as typeof URL.createObjectURL;
    });

    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    const btn = page.getByTestId("funnel-export-csv");
    const errCard = page.getByTestId("funnel-export-error");
    const dismiss = page.getByTestId("funnel-export-error-dismiss");

    await expect(btn).toBeVisible();
    if (await btn.isDisabled()) {
      test.skip(true, "Funil vazio — nada para exportar neste ambiente");
    }

    await btn.click();

    // Enquanto o busy-wait roda, o botão fica disabled/exporting.
    await expect(btn).toHaveAttribute("data-exporting", "true", { timeout: 2000 });
    await expect(btn).toBeDisabled();

    // Ao terminar o busy-wait a exceção sobe: card aparece, botão volta a
    // habilitar (finally).
    await expect(errCard).toBeVisible({ timeout: 3000 });
    await expect(btn).toBeEnabled();
    await expect(dismiss).toBeFocused();

    // Esc fecha o card sem intermediários.
    await page.keyboard.press("Escape");
    await expect(errCard).toHaveCount(0);

    // Foco volta ao botão de export.
    await expect(btn).toBeFocused();

    // Card não reaparece sozinho após um intervalo razoável.
    await page.waitForTimeout(500);
    await expect(errCard).toHaveCount(0);
    await expect(btn).toBeEnabled();
  });
});
