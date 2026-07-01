/**
 * Admin · anúncio via aria-live/aria-labelledby do card funnel-export-error.
 *
 * Verifica que:
 *   - Ao aparecer, o card tem role=alert, aria-live=assertive,
 *     aria-labelledby apontando para um título com texto e
 *     aria-describedby apontando para a mensagem do erro.
 *   - O texto que será anunciado (título + descrição) está presente.
 *   - Após dismiss, o card é removido do DOM (deixa de ser anunciável),
 *     e um novo erro é anunciado do zero (nova região aria-live).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · funnel-export-error — anúncio aria-live", () => {
  test("card é anunciado ao aparecer e removido após dismiss", async ({ page }) => {
    await page.addInitScript(() => {
      URL.createObjectURL = (() => {
        throw new Error("simulated CSV failure for aria-live test");
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

    await btn.click();

    const errCard = page.getByTestId("funnel-export-error");
    await expect(errCard).toBeVisible();

    // Atributos de acessibilidade obrigatórios para o anúncio.
    await expect(errCard).toHaveAttribute("role", "alert");
    await expect(errCard).toHaveAttribute("aria-live", "assertive");
    await expect(errCard).toHaveAttribute("aria-atomic", "true");
    await expect(errCard).toHaveAttribute("aria-labelledby", "funnel-export-error-title");
    await expect(errCard).toHaveAttribute("aria-describedby", "funnel-export-error-desc");

    // O conteúdo referenciado existe, está visível e tem texto — é
    // isso que leitores de tela lerão quando a região for anunciada.
    const title = page.locator("#funnel-export-error-title");
    const desc = page.locator("#funnel-export-error-desc");
    await expect(title).toBeVisible();
    await expect(desc).toBeVisible();
    await expect(title).not.toHaveText("");
    await expect(desc).not.toHaveText("");
    // Mensagem inclui o motivo simulado da falha.
    await expect(desc).toContainText("simulated CSV failure");

    // Dismiss → card sai do DOM (não mais anunciável).
    await page.getByTestId("funnel-export-error-dismiss").click();
    await expect(errCard).toHaveCount(0);
    await expect(page.locator("#funnel-export-error-title")).toHaveCount(0);
    await expect(page.locator("#funnel-export-error-desc")).toHaveCount(0);

    // Novo erro → região aria-live é recriada e re-anunciada.
    await expect(btn).toBeFocused();
    await btn.click();
    const errCard2 = page.getByTestId("funnel-export-error");
    await expect(errCard2).toBeVisible();
    await expect(errCard2).toHaveAttribute("aria-live", "assertive");
    await expect(errCard2).toHaveAttribute("aria-labelledby", "funnel-export-error-title");
    await expect(page.locator("#funnel-export-error-desc")).toContainText(
      "simulated CSV failure",
    );
  });
});
