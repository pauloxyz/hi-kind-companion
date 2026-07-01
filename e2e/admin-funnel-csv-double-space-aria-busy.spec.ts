/**
 * Admin · duplo Space no Exportar CSV enquanto aria-busy="true".
 *
 * Segundo Space durante o estado exporting não deve gerar novo
 * download nem nova requisição.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · Exportar CSV — duplo Space durante aria-busy", () => {
  test("Space extra com aria-busy=true não gera download nem request extra", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
        const start = performance.now();
        while (performance.now() - start < 600) {
          /* busy-wait para manter aria-busy=true */
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

    const requests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (/\.(css|js|png|jpg|svg|woff2?)(\?|$)/.test(url)) return;
      if (/\/@vite\/|\/__vite|\/@id\//.test(url)) return;
      requests.push(`${req.method()} ${url}`);
    });
    const downloads: string[] = [];
    page.on("download", (dl) => downloads.push(dl.suggestedFilename()));

    await btn.focus();
    await expect(btn).toBeFocused();

    // 1º Space dispara o export.
    await page.keyboard.press("Space");
    await expect(btn).toHaveAttribute("aria-busy", "true");

    // 2º Space enquanto aria-busy=true — deve ser ignorado.
    await page.keyboard.press("Space");
    await page.keyboard.press("Space");

    await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 5000 });
    await expect(btn).toHaveAttribute("aria-busy", "false");
    await page.waitForTimeout(300);

    expect(
      downloads,
      `Esperava exatamente 1 download, recebi ${downloads.length}`,
    ).toHaveLength(1);
    expect(downloads[0]).toMatch(/^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(
      requests,
      `Nenhuma requisição HTTP deveria ter sido feita.\n${requests.join("\n")}`,
    ).toHaveLength(0);

    await expect(btn).toBeEnabled();
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
  });
});
