/**
 * Admin · retry com sucesso após erro no Exportar CSV.
 *
 * 1) Primeiro clique falha e mostra funnel-export-error.
 * 2) Usuário fecha via botão "Fechar".
 * 3) Novo clique executa com sucesso, gera exatamente 1 download e
 *    nenhuma requisição HTTP extra (export é 100% client-side).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · Exportar CSV — retry após dismiss", () => {
  test("retry após fechar o erro gera exatamente um download", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      let calls = 0;
      URL.createObjectURL = ((blob: Blob) => {
        calls += 1;
        if (calls === 1) {
          throw new Error("simulated failure for retry test");
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

    // 1º clique → erro.
    await btn.click();
    const errCard = page.getByTestId("funnel-export-error");
    await expect(errCard).toBeVisible();

    // Coleta requisições e downloads a partir do retry.
    const requests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (/\.(css|js|png|jpg|svg|woff2?)(\?|$)/.test(url)) return;
      if (/\/@vite\/|\/__vite|\/@id\//.test(url)) return;
      requests.push(`${req.method()} ${url}`);
    });
    const downloads: string[] = [];
    page.on("download", (dl) => downloads.push(dl.suggestedFilename()));

    // Fechar via botão "Fechar".
    await page.getByTestId("funnel-export-error-dismiss").click();
    await expect(errCard).toHaveCount(0);
    await expect(btn).toBeFocused();
    await expect(btn).toBeEnabled();

    // Retry → sucesso.
    await btn.click();
    await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 5000 });
    await page.waitForTimeout(300);

    expect(
      downloads,
      `Esperava exatamente 1 download no retry, recebi ${downloads.length}: ${downloads.join(", ")}`,
    ).toHaveLength(1);
    expect(downloads[0]).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);

    expect(
      requests,
      `Nenhuma requisição HTTP deveria ter sido feita no retry.\n${requests.join("\n")}`,
    ).toHaveLength(0);

    // Nenhum erro reapareceu após o retry bem-sucedido.
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
    await expect(btn).toBeEnabled();
  });
});
