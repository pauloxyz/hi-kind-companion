/**
 * Admin · após dismiss por clique no "Fechar", o Tab volta a seguir a
 * ordem natural de foco (o focus trap foi realmente liberado).
 *
 * Confere que N Tabs consecutivos passam por controles diferentes — se o
 * trap tivesse vazado, o foco ficaria preso em um único elemento.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · trap liberado após clicar em Fechar", () => {
  test("Tab sequencial visita múltiplos controles depois do dismiss", async ({ page }) => {
    await page.addInitScript(() => {
      URL.createObjectURL = (() => {
        throw new Error("simulated CSV failure for post-dismiss tab test");
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
    const card = page.getByTestId("funnel-export-error");
    const dismiss = page.getByTestId("funnel-export-error-dismiss");
    await expect(card).toBeVisible();

    // Sanidade: durante o trap, Tab prende o foco no Fechar.
    await expect(dismiss).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dismiss).toBeFocused();

    // Dismiss por click — foco volta ao Exportar CSV.
    await dismiss.click();
    await expect(card).toHaveCount(0);
    await expect(btn).toBeFocused();

    // Agora o Tab precisa seguir a ordem natural: 6 tabs devem visitar
    // ao menos 3 elementos distintos (senão o trap ainda estaria preso).
    const visited = new Set<string>();
    // ponto inicial: o próprio botão de export.
    visited.add((await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.outerHTML?.slice(0, 80) ?? "";
    })));

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.outerHTML?.slice(0, 80) ?? "";
      });
      visited.add(id);
    }

    expect(
      visited.size,
      `O Tab deveria passar por múltiplos elementos após o dismiss. Visitados:\n${[...visited].join("\n---\n")}`,
    ).toBeGreaterThanOrEqual(3);

    // O card não voltou a aparecer sozinho.
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
  });
});
