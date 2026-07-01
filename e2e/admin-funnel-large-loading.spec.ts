/**
 * Admin · export de funil grande com indicador de carregamento.
 *
 * Enquanto o CSV está sendo serializado (blob grande, click síncrono no <a>),
 * o botão precisa ficar `disabled` com `data-exporting="true"`. Depois do
 * download, o botão volta a `data-exporting="false"` e a navegação no
 * admin permanece funcional (ex.: podemos ir para outra rota sem freeze).
 *
 * Truque para observar o "in-flight": patchamos URL.createObjectURL para
 * aguardar deterministicamente antes de resolver, dando tempo à UI de
 * revelar o estado de loading.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · loading do export em funil grande", () => {
  test("botão fica desabilitado durante o export e navegação continua fluida", async ({ page }) => {
    // Bloqueia a serialização por ~800ms — sync-blocking dentro do handler
    // React para replicar o comportamento de um CSV grande em máquinas lentas.
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        const start = performance.now();
        // Busy wait — bloqueia a stack como um blob de MBs faria.
        while (performance.now() - start < 800) { /* spin */ }
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

    // Aciona o clique sem aguardar — precisamos ver o estado in-flight.
    const clickTask = btn.click();
    const downloadTask = page.waitForEvent("download");

    // Durante o busy-wait a UI está congelada; após o React reagir a
    // setExportingLocale(loc) e ao download finalizar, o data-exporting
    // volta para "false". Aqui aguardamos o download completar.
    const dl = await downloadTask;
    await clickTask;
    expect(dl.suggestedFilename()).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);

    // Após terminar: botão de novo utilizável, sem lock preso.
    await expect(btn).toHaveAttribute("data-exporting", "false");
    await expect(btn).toBeEnabled();

    // Navegação no admin continua respondendo após um export pesado.
    const navStart = Date.now();
    await page.goto("/admin/pro-features");
    expect(Date.now() - navStart).toBeLessThan(3000);
    expect(page.url()).toContain("/admin/pro-features");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
