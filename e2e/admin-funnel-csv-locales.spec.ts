/**
 * Admin · exportação do funil em PT / EN / ES.
 *
 * Baixa o CSV clicando em cada um dos três botões e valida:
 *  - Nome do arquivo com o locale correto.
 *  - Cabeçalho da tabela permanece estável (snake_case) em todos os idiomas.
 *  - O bloco de sumário `# lang=<locale>` reflete o idioma escolhido.
 *  - `stuck_after_variant_switch` continua presente como coluna e
 *    `completed_after_variant_switch,` continua no sumário — o comparativo
 *    de "travados após trocar" deve ser mantido em todos os idiomas.
 *
 * Soft-skip quando o usuário de teste não é admin (rota redireciona).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

const HEADER =
  "step_index,step_label,reached_total,reached_pt,reached_en,stuck_after_variant_switch";

async function readCsv(download: Awaited<ReturnType<import("@playwright/test").Page["waitForEvent"]>>) {
  // @ts-expect-error waitForEvent("download") narrows correctly at call site
  const p = await download.path();
  if (!p) return "";
  const fs = await import("fs/promises");
  return fs.readFile(p, "utf8");
}

test.describe("Admin · exportar funil em PT / EN / ES", () => {
  test("cada botão baixa CSV com step_label localizado e mantém comparativo de travados", async ({ page }) => {
    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin nesse ambiente");
    }

    // Se o ambiente não tiver dados nenhum, o botão fica desabilitado —
    // nesse caso o cenário coberto é o outro spec (empty/error).
    const group = page.getByTestId("funnel-export-group");
    if (!(await group.isVisible().catch(() => false))) {
      test.skip(true, "Estado sem dados: coberto por admin-funnel-empty-error.spec.ts");
    }

    const cases = [
      { testId: "funnel-export-csv", locale: "pt", labels: ["Boas-vindas", "Como funciona"] },
      { testId: "funnel-export-csv-en", locale: "en", labels: ["Welcome", "How it works"] },
      { testId: "funnel-export-csv-es", locale: "es", labels: ["Bienvenida", "Cómo funciona"] },
    ] as const;

    const captured: Record<string, string> = {};
    for (const c of cases) {
      const btn = page.getByTestId(c.testId);
      await expect(btn).toBeVisible();
      const isDisabled = await btn.isDisabled();
      if (isDisabled) test.skip(true, "Botões desabilitados sem dados — cenário empty");

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        btn.click(),
      ]);
      expect(download.suggestedFilename()).toMatch(
        new RegExp(`^onboarding-funnel-${c.locale}-\\d{4}-\\d{2}-\\d{2}\\.csv$`),
      );
      const csv = await readCsv(download);
      captured[c.locale] = csv;

      // Cabeçalho estável em todos os idiomas
      expect(csv.split("\n")[0]).toBe(HEADER);
      // Sumário sinaliza o idioma escolhido
      expect(csv).toContain(`# lang=${c.locale}`);
      // Comparativo de travados após troca por etapa continua na exportação
      expect(csv).toContain("completed_after_variant_switch,");
      // step_label localizado — pelo menos um rótulo específico do idioma
      // deve aparecer, mesmo quando as contagens do funil são zero.
      // Como o CSV sempre gera 6 linhas de etapa (uma por STEP_LABELS),
      // os rótulos aparecem independentemente de haver eventos.
      for (const label of c.labels) {
        // vírgulas cercam o rótulo entre step_index e reached_total
        expect(csv).toContain(`,${label},`);
      }
    }

    // CSVs de idiomas diferentes NÃO podem ser idênticos byte-a-byte:
    // ao menos os rótulos de etapa + linha `# lang=` mudam.
    expect(captured.pt).not.toBe(captured.en);
    expect(captured.en).not.toBe(captured.es);
    expect(captured.pt).not.toBe(captured.es);
  });
});
