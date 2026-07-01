/**
 * Admin · double-click em Exportar CSV no caminho de SUCESSO.
 *
 * Contrato:
 *   - Dois cliques rápidos consecutivos NÃO devem enviar requisições HTTP
 *     extras ao backend (o export é 100% client-side).
 *   - Apenas UM download deve ser gerado — o segundo clique cai em cima
 *     do estado `data-exporting="true"` (botão disabled) e é ignorado
 *     pelo browser.
 *   - Ao final o botão volta a `data-exporting="false"` e enabled, sem
 *     banner de erro.
 *
 * Usa um busy-wait síncrono dentro de `URL.createObjectURL` para manter
 * o botão em estado "exporting" durante alguns ms — o suficiente para o
 * segundo clique chegar enquanto o handler ainda está em execução.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · Exportar CSV — double-click em sucesso", () => {
  test("dois cliques rápidos em sucesso disparam apenas um download e nenhuma requisição extra", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        // Segura o handler por ~500ms para o 2º clique cair em cima
        // do estado exporting (botão disabled).
        const start = performance.now();
        while (performance.now() - start < 500) {
          /* busy-wait */
        }
        return orig(blob);
      }) as typeof URL.createObjectURL;
    });

    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    const btn = page.getByTestId("funnel-export-csv");
    await expect(btn).toBeVisible();
    if (await btn.isDisabled()) {
      test.skip(true, "Funil vazio — nada para exportar neste ambiente");
    }

    // Coleta de requisições ao backend a partir daqui.
    const requests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (/\.(css|js|png|jpg|svg|woff2?)(\?|$)/.test(url)) return;
      if (/\/@vite\/|\/__vite|\/@id\//.test(url)) return;
      requests.push(`${req.method()} ${url}`);
    });

    const downloads: string[] = [];
    page.on("download", (dl) => downloads.push(dl.suggestedFilename()));

    // Dois cliques praticamente simultâneos.
    await Promise.all([btn.click(), btn.click({ force: true }).catch(() => {})]);

    // Aguarda o handler terminar (busy-wait + processing).
    await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 5000 });
    await page.waitForTimeout(300);

    // 1) Exatamente um download foi gerado.
    expect(
      downloads,
      `Esperava exatamente 1 download, recebi ${downloads.length}: ${downloads.join(", ")}`,
    ).toHaveLength(1);
    expect(downloads[0]).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);

    // 2) Nenhuma requisição de backend disparada pelo export.
    expect(
      requests,
      `Nenhuma requisição HTTP deveria ter sido feita durante o double-click.\n` +
        `Requests observadas:\n${requests.join("\n")}`,
    ).toHaveLength(0);

    // 3) Botão volta ao estado idle e nenhum erro apareceu.
    await expect(btn).toBeEnabled();
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
  });
});
