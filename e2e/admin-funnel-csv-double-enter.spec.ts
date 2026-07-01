/**
 * Admin · duplo Enter no Exportar CSV (fluxo sucesso).
 *
 * Pressionar Enter duas vezes rapidamente no botão focado não deve
 * gerar mais de um download nem enviar requisições extras ao backend.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · Exportar CSV — duplo Enter", () => {
  test("dois Enter rápidos disparam apenas um download e nenhuma requisição extra", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = ((blob: Blob) => {
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

    // Dois Enter em sequência praticamente simultâneos.
    await Promise.all([
      page.keyboard.press("Enter"),
      page.keyboard.press("Enter"),
    ]);

    await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 5000 });
    await page.waitForTimeout(300);

    expect(
      downloads,
      `Esperava exatamente 1 download, recebi ${downloads.length}: ${downloads.join(", ")}`,
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
