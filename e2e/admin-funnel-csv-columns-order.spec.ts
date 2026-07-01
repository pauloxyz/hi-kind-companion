/**
 * Admin · ordem exata das colunas do CSV por etapa (PT/EN/ES).
 *
 * Regra crítica: o header em snake_case NÃO pode mudar entre idiomas — só
 * o valor do `step_label` é traduzido. Ferramentas externas dependem dessa
 * estabilidade pra parsear a exportação sem branch por idioma.
 *
 * Referência de header no admin: a constante EXPECTED_HEADER abaixo é o
 * mesmo header validado em `admin-funnel-csv-columns.spec.ts` e definido
 * em `src/lib/onboarding-funnel.helpers.ts` (buildFunnelCsv).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

const EXPECTED_HEADER = [
  "step_index",
  "step_label",
  "reached_total",
  "reached_pt",
  "reached_en",
  "stuck_after_variant_switch",
];

test.describe("Admin · ordem de colunas do CSV é idêntica em PT/EN/ES", () => {
  test("header snake_case em ordem estável para os 3 idiomas + data-locale bate com o arquivo", async ({ page }) => {
    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    const anyBtn = page.getByTestId("funnel-export-csv");
    await expect(anyBtn).toBeVisible();
    if (await anyBtn.isDisabled()) {
      test.skip(true, "Funil vazio nesse ambiente — botões desabilitados");
    }

    const fs = await import("fs/promises");
    const cases = [
      { testId: "funnel-export-csv", locale: "pt" },
      { testId: "funnel-export-csv-en", locale: "en" },
      { testId: "funnel-export-csv-es", locale: "es" },
    ] as const;

    for (const c of cases) {
      const btn = page.getByTestId(c.testId);
      // data-locale reflete a configuração do botão
      await expect(btn).toHaveAttribute("data-locale", c.locale);

      const [download] = await Promise.all([page.waitForEvent("download"), btn.click()]);
      // filename embute o locale escolhido
      expect(download.suggestedFilename()).toMatch(
        new RegExp(`^onboarding-funnel-${c.locale}-\\d{4}-\\d{2}-\\d{2}\\.csv$`),
      );

      const p = await download.path();
      if (!p) test.skip(true, "download.path() indisponível nesse ambiente");
      const csv = await fs.readFile(p!, "utf8");
      const lines = csv.replace(/\r\n/g, "\n").split("\n").filter(Boolean);

      // 1) Header EXATO, palavra-por-palavra, sem espaços/case diferente
      const header = lines[0].split(",");
      expect(header).toEqual(EXPECTED_HEADER);
      for (const h of header) {
        // regra: snake_case (letras minúsculas + _), sem acentos, sem CamelCase
        expect(h).toMatch(/^[a-z0-9_]+$/);
      }

      // 2) Cada linha de etapa tem exatamente 6 colunas na mesma ordem
      const dataRows = lines
        .slice(1)
        .filter((l) => !l.startsWith("#") && !l.startsWith("completed_") && !l.startsWith("toggles_"));
      expect(dataRows).toHaveLength(6);
      for (const [i, line] of dataRows.entries()) {
        // parser mínimo compatível com o formato do buildFunnelCsv
        const cells: string[] = [];
        let cur = "";
        let inQ = false;
        for (let k = 0; k < line.length; k++) {
          const ch = line[k];
          if (ch === '"') {
            if (inQ && line[k + 1] === '"') {
              cur += '"';
              k++;
            } else inQ = !inQ;
          } else if (ch === "," && !inQ) {
            cells.push(cur);
            cur = "";
          } else cur += ch;
        }
        cells.push(cur);
        expect(cells).toHaveLength(EXPECTED_HEADER.length);
        // step_index sempre é a 1ª coluna e corresponde ao índice da linha
        expect(cells[0]).toBe(String(i));
        // step_label (2ª coluna) é o único campo que muda entre locales
        expect(cells[1].length).toBeGreaterThan(0);
        // demais colunas continuam numéricas independente do idioma
        for (const k of [2, 3, 4, 5]) expect(cells[k]).toMatch(/^\d+$/);
      }

      // 3) Sumário sinaliza o idioma correspondente
      expect(csv).toContain(`# lang=${c.locale}`);
    }
  });
});
