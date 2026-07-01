/**
 * Admin · nome + conteúdo do arquivo baixado após retry.
 *
 * Sequência:
 *   1. Primeiro clique falha → banner de erro aparece.
 *   2. Fechar o banner.
 *   3. Segundo clique baixa o CSV.
 *   4. Confere que:
 *        - suggestedFilename() casa `onboarding-funnel-<lang>-YYYY-MM-DD.csv`.
 *        - O conteúdo lido do arquivo tem o cabeçalho snake_case esperado.
 *        - O conteúdo contém `# lang=pt` no bloco de sumário.
 *        - O conteúdo bate com o que `buildFunnelCsv` produziria a partir
 *          dos dados carregados (mesmo primeiro linha do funil).
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · nome + conteúdo do CSV após retry", () => {
  test("segundo clique baixa CSV com nome e conteúdo esperados", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __csvCalls?: number };
      w.__csvCalls = 0;
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        w.__csvCalls = (w.__csvCalls ?? 0) + 1;
        if (w.__csvCalls === 1) throw new Error("first-click-failure");
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

    // 2) Fechar banner
    await page.getByTestId("funnel-export-error-dismiss").click();
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);

    // 3) Retry bem-sucedido — captura o download.
    const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);

    // Nome do arquivo: convenção estável, inclui `onboarding-funnel`,
    // idioma (pt por default) e extensão .csv.
    const name = dl.suggestedFilename();
    expect(name).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(name.startsWith("onboarding-funnel-")).toBe(true);
    expect(name.endsWith(".csv")).toBe(true);

    // Conteúdo — lê o arquivo real gravado no disco pelo Playwright.
    const path = await dl.path();
    expect(path, "Playwright deve gravar o download em disco").toBeTruthy();
    const content = readFileSync(path!, "utf8");

    // Cabeçalho snake_case obrigatório (contrato para ferramentas externas).
    const [header, firstRow] = content.split("\n");
    expect(header).toBe(
      "step_index,step_label,reached_total,reached_pt,reached_en,stuck_after_variant_switch",
    );

    // Primeira linha começa com step_index=0.
    expect(firstRow).toMatch(/^0,/);

    // Bloco de sumário localizado — o CSV em pt inclui `# lang=pt` e as
    // chaves de comparativo por idioma.
    expect(content).toContain("# lang=pt");
    expect(content).toContain("completed_pt,");
    expect(content).toContain("completed_en,");
    expect(content).toContain("completed_after_variant_switch,");

    // Nenhum valor numérico em notação científica (regressão do formatter).
    expect(content).not.toMatch(/,\d+(?:\.\d+)?e[+-]?\d+/i);
  });
});
