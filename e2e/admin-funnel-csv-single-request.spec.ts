/**
 * Admin · single-request no double-click do Exportar CSV.
 *
 * O export do CSV é 100% client-side (buildFunnelCsv + Blob), então NÃO
 * dispara requisição HTTP nova por clique. Este teste garante o contrato
 * inverso: dois cliques rápidos no botão de export NÃO devem gerar
 * requisições adicionais para o backend (nem re-fetch do funil, nem
 * chamada de telemetria repetida). Também garantimos que apenas UM
 * download acontece por clique — não há loop de re-envio.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · export CSV — nenhuma requisição extra em double-click", () => {
  test("dois cliques rápidos não disparam requisições adicionais ao backend", async ({ page }) => {
    // Coleta TODAS as requisições depois que a página estabilizar.
    const requests: string[] = [];

    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("networkidle");

    const btn = page.getByTestId("funnel-export-csv");
    await expect(btn).toBeVisible();
    if (await btn.isDisabled()) {
      test.skip(true, "Funil vazio — nada para exportar neste ambiente");
    }

    // A partir daqui, qualquer request nos importa.
    page.on("request", (req) => {
      const url = req.url();
      // Ignora ruído de assets / hot-reload; só requests para o backend.
      if (/\.(css|js|png|jpg|svg|woff2?)(\?|$)/.test(url)) return;
      if (/\/@vite\/|\/__vite|\/@id\//.test(url)) return;
      requests.push(`${req.method()} ${url}`);
    });

    const downloads: string[] = [];
    page.on("download", (dl) => downloads.push(dl.suggestedFilename()));

    // Dois cliques em paralelo — o mais próximo possível de "double-click".
    await Promise.all([btn.click(), btn.click()]);
    await page.waitForTimeout(800);

    // Zero requisições extras: o handler de export é síncrono e local.
    expect(
      requests,
      `Nenhuma requisição HTTP deveria ter sido feita durante o double-click.\n` +
        `Requests observadas:\n${requests.join("\n")}`,
    ).toHaveLength(0);

    // Um clique = um download. Confirmamos que não houve loop.
    expect(downloads.length).toBeGreaterThanOrEqual(1);
    expect(downloads.length).toBeLessThanOrEqual(2);
    for (const name of downloads) {
      expect(name).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);
    }

    // Botão continua utilizável ao final.
    await expect(btn).toHaveAttribute("data-exporting", "false");
    await expect(btn).toBeEnabled();
  });
});
