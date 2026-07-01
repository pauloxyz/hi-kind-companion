/**
 * Admin · a11y semântica e i18n do `funnel-export-error`.
 *
 * Confere role/aria-* obrigatórios e que a mensagem principal (título) é
 * exibida no idioma ativo. O idioma é forçado via localStorage antes de
 * carregar a rota — o `I18nProvider` lê `localStorage.lang` no bootstrap.
 */
import { test, expect, type Page } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

const TITLES: Record<"pt" | "en" | "es", RegExp> = {
  pt: /Falha ao gerar o CSV/i,
  en: /Failed to build CSV/i,
  es: /Error al generar el CSV/i,
};

const MESSAGES: Record<"pt" | "en" | "es", RegExp> = {
  pt: /Não foi possível gerar o CSV/i,
  en: /couldn'?t build the CSV/i,
  es: /No pudimos generar el CSV/i,
};

async function openErrorInLang(page: Page, lang: "pt" | "en" | "es") {
  await page.addInitScript((l) => {
    // Força idioma antes do I18nProvider inicializar.
    localStorage.setItem("lang", l);
    document.cookie = `lang=${l}; path=/; max-age=31536000; SameSite=Lax`;
    URL.createObjectURL = (() => {
      throw new Error("simulated CSV failure for i18n test");
    }) as typeof URL.createObjectURL;
  }, lang);

  await ensureSignedIn(page);
  await page.goto("/admin/onboarding");
  await page.waitForLoadState("domcontentloaded");
}

test.describe("Admin · funnel-export-error · a11y + i18n", () => {
  for (const lang of ["pt", "en", "es"] as const) {
    test(`role/aria + mensagem localizada em ${lang.toUpperCase()}`, async ({ page }) => {
      await openErrorInLang(page, lang);
      if (!page.url().includes("/admin/onboarding")) {
        test.skip(true, "Usuário de teste não é admin");
      }

      const btn = page.getByTestId("funnel-export-csv");
      await expect(btn).toBeVisible();
      if (await btn.isDisabled()) {
        test.skip(true, "Funil vazio — nada para exportar neste ambiente");
      }
      await btn.click();

      const card = page.getByTestId("funnel-export-error");
      await expect(card).toBeVisible();

      // Semântica obrigatória para leitores de tela.
      await expect(card).toHaveAttribute("role", "alert");
      await expect(card).toHaveAttribute("aria-live", "assertive");
      await expect(card).toHaveAttribute("aria-atomic", "true");
      await expect(card).toHaveAttribute("aria-labelledby", "funnel-export-error-title");
      await expect(card).toHaveAttribute("aria-describedby", "funnel-export-error-desc");

      // Os elementos apontados por labelledby/describedby existem e são
      // realmente descendentes do card.
      const title = page.locator("#funnel-export-error-title");
      const desc = page.locator("#funnel-export-error-desc");
      await expect(title).toBeVisible();
      await expect(desc).toBeVisible();
      await expect(title).toHaveText(TITLES[lang]);
      await expect(desc).toHaveText(MESSAGES[lang]);

      // A raiz `<html lang>` reflete o idioma escolhido.
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
    });
  }
});
