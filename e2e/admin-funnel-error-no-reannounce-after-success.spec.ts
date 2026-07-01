/**
 * Admin · após dismissar o funnel-export-error, um export bem-sucedido
 * NÃO deve reanunciar a mensagem de erro — a região aria-live não deve
 * conter mais o conteúdo do erro anterior nem reaparecer.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · funnel-export-error — sem re-anúncio após sucesso", () => {
  test("export com sucesso após dismiss não recria a região aria-live do erro", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      let calls = 0;
      URL.createObjectURL = ((blob: Blob) => {
        calls += 1;
        if (calls === 1) {
          throw new Error("simulated CSV failure — deveria NÃO ser re-anunciada");
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

    // 1) Falha → card aparece.
    await btn.click();
    const card = page.getByTestId("funnel-export-error");
    await expect(card).toBeVisible();
    await expect(page.locator("#funnel-export-error-desc")).toContainText(
      "deveria NÃO ser re-anunciada",
    );

    // 2) Dismiss explícito.
    await page.getByTestId("funnel-export-error-dismiss").click();
    await expect(card).toHaveCount(0);
    await expect(btn).toBeFocused();

    // 3) Instala observer para capturar qualquer aria-live que apareça
    //    contendo o texto do erro dismissado durante o retry.
    await page.evaluate(() => {
      const reannouncements: string[] = [];
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            const live = node.matches?.("[aria-live]")
              ? node
              : node.querySelector?.("[aria-live]");
            if (!live) continue;
            const text = (live.textContent ?? "").trim();
            if (text.includes("deveria NÃO ser re-anunciada")) {
              reannouncements.push(text);
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      (window as unknown as { __reannouncements: string[] }).__reannouncements =
        reannouncements;
      (window as unknown as { __reannouncementsObserver: MutationObserver }).__reannouncementsObserver =
        observer;
    });

    // 4) Retry com sucesso.
    const downloads: string[] = [];
    page.on("download", (dl) => downloads.push(dl.suggestedFilename()));
    await btn.click();
    await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 5000 });
    await page.waitForTimeout(400);

    expect(downloads).toHaveLength(1);

    // 5) Nenhum re-anúncio do erro antigo, nenhum card visível.
    await expect(page.getByTestId("funnel-export-error")).toHaveCount(0);
    const reannounced = await page.evaluate(
      () => (window as unknown as { __reannouncements: string[] }).__reannouncements,
    );
    expect(
      reannounced,
      `Erro antigo NÃO deve ser re-anunciado via aria-live. Capturado: ${reannounced.join(" | ")}`,
    ).toHaveLength(0);

    // 6) Nenhum elemento com aria-live no DOM ainda contém o texto do erro.
    const staleLive = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("[aria-live]"));
      return nodes
        .map((n) => (n.textContent ?? "").trim())
        .filter((t) => t.includes("deveria NÃO ser re-anunciada"));
    });
    expect(staleLive).toHaveLength(0);
  });
});
