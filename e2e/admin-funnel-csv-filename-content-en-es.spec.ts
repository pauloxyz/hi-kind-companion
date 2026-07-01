/**
 * Admin · nome + conteúdo do CSV após retry, em EN e ES.
 *
 * Similar ao spec em PT (`admin-funnel-csv-filename-content.spec.ts`),
 * mas força o idioma via `localStorage.lang` para validar que:
 *   - O nome do arquivo carrega o locale correto
 *     (`onboarding-funnel-<lang>-YYYY-MM-DD.csv`).
 *   - O cabeçalho snake_case permanece estável entre idiomas
 *     (contrato para ferramentas externas).
 *   - O bloco de sumário traz `# lang=<lang>`.
 *   - Os rótulos localizados dos passos aparecem
 *     (ex.: `Welcome` em EN, `Bienvenida` em ES).
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ensureSignedIn } from "./_helpers/auth";

type Lang = "en" | "es";

const LABEL_STEP0: Record<Lang, string> = {
  en: "Welcome",
  es: "Bienvenida",
};

const EXPORT_BTN_TESTID: Record<Lang, string> = {
  en: "funnel-export-csv-en",
  es: "funnel-export-csv-es",
};

test.describe("Admin · CSV filename + conteúdo em EN/ES após retry", () => {
  for (const lang of ["en", "es"] as const) {
    test(`retry em ${lang.toUpperCase()} baixa CSV com nome e conteúdo localizados`, async ({ page }) => {
      await page.addInitScript((l) => {
        // idioma da UI (não afeta os botões de export, que forçam o locale)
        localStorage.setItem("lang", l);
        document.cookie = `lang=${l}; path=/; max-age=31536000; SameSite=Lax`;
        const w = window as unknown as { __csvCalls?: number };
        w.__csvCalls = 0;
        const orig = URL.createObjectURL.bind(URL);
        URL.createObjectURL = ((blob: Blob) => {
          w.__csvCalls = (w.__csvCalls ?? 0) + 1;
          if (w.__csvCalls === 1) throw new Error(`first-click-${l}-fail`);
          return orig(blob);
        }) as typeof URL.createObjectURL;
      }, lang);

      await ensureSignedIn(page);
      await page.goto("/admin/onboarding");
      await page.waitForLoadState("domcontentloaded");
      if (!page.url().includes("/admin/onboarding")) {
        test.skip(true, "Usuário de teste não é admin");
      }

      const btn = page.getByTestId(EXPORT_BTN_TESTID[lang]);
      await expect(btn).toBeVisible();
      if (await btn.isDisabled()) {
        test.skip(true, "Funil vazio — nada para exportar neste ambiente");
      }

      // 1º clique falha
      await btn.click();
      await expect(page.getByTestId("funnel-export-error")).toBeVisible();

      // Fecha banner e faz retry
      await page.getByTestId("funnel-export-error-dismiss").click();
      await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);

      const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);

      // Nome do arquivo: sempre `onboarding-funnel-<lang>-YYYY-MM-DD.csv`
      const name = dl.suggestedFilename();
      expect(name).toMatch(new RegExp(`^onboarding-funnel-${lang}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
      expect(name.startsWith("onboarding-funnel-")).toBe(true);
      expect(name.endsWith(".csv")).toBe(true);
      expect(name).toContain(`-${lang}-`);

      // Conteúdo do arquivo
      const path = await dl.path();
      expect(path).toBeTruthy();
      const content = readFileSync(path!, "utf8");
      const [header, firstRow] = content.split("\n");

      // Cabeçalho snake_case permanece IDÊNTICO em todos os idiomas
      // (é contrato estável para ingestão externa).
      expect(header).toBe(
        "step_index,step_label,reached_total,reached_pt,reached_en,stuck_after_variant_switch",
      );

      // Primeira linha começa com index 0 e traz o rótulo localizado.
      expect(firstRow).toMatch(/^0,/);
      expect(firstRow).toContain(LABEL_STEP0[lang]);

      // Sumário localizado
      expect(content).toContain(`# lang=${lang}`);
      expect(content).toContain("completed_pt,");
      expect(content).toContain("completed_en,");
      expect(content).toContain("completed_after_variant_switch,");

      // Nenhum número em notação científica (regressão do formatter).
      expect(content).not.toMatch(/,\d+(?:\.\d+)?e[+-]?\d+/i);
    });
  }
});
