/**
 * Fallback quando a tradução PT→EN falha.
 *
 * Intercepta o server-fn `translateToEnglish` (POST /n/... com corpo contendo
 * `"texts"`) e força um 500. Espera-se:
 *   - o toggle volta para PT (lang="pt" no data-attr),
 *   - o link do WhatsApp permanece em PT,
 *   - alternar de novo pra EN dispara nova tentativa (cache não foi
 *     "populado" com lixo).
 */
import { test, expect, type Route } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Onboarding · translate fallback", () => {
  test.beforeEach(async ({ page, context }) => {
    await ensureSignedIn(page, context);
  });

  test("EN falha → volta pra PT e cache não é envenenado", async ({ page }) => {
    let translateAttempts = 0;
    await page.route("**/*", async (route: Route) => {
      const req = route.request();
      const body = req.postData() ?? "";
      const isTranslate =
        req.method() === "POST" && /"texts"\s*:/.test(body) && /\/n\//.test(req.url());
      if (isTranslate) {
        translateAttempts += 1;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Falha na tradução: simulada pelo teste" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/app/comecar");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/app/comecar")) test.skip(true, "Rota inacessível.");

    const langEn = page.getByTestId("onb-lang-en");
    if (!(await langEn.isVisible().catch(() => false))) {
      test.skip(true, "Sem toggle PT/EN — usuário Free.");
    }

    const msg = page.getByTestId("onb-wa-message");
    const ptTextBefore = (await msg.innerText()).trim();
    expect(ptTextBefore.length).toBeGreaterThan(0);

    // 1ª tentativa: EN — deve falhar e voltar pra PT.
    await langEn.click();
    // Se a variante ativa já tem summary_en pronto, nem chama translate — nesse
    // caso o cenário de "falha" não se aplica. Pulamos.
    await page.waitForTimeout(1500);
    if (translateAttempts === 0) {
      test.skip(true, "Variante pré-traduzida — translate não é chamado.");
    }

    await expect(msg).toHaveAttribute("data-lang", "pt", { timeout: 5000 });
    const ptTextAfter = (await msg.innerText()).trim();
    expect(ptTextAfter).toBe(ptTextBefore);

    const waHref = await page.getByTestId("onb-wa-link").getAttribute("href");
    expect(waHref).toContain("wa.me");
    expect(decodeURIComponent(waHref!)).toContain(ptTextBefore.split("\n")[0]);

    // 2ª tentativa: alterna pra EN de novo — deve tentar traduzir de novo
    // (cache PT→EN NÃO foi populado com fallback), e voltar pra PT novamente.
    const attemptsBefore = translateAttempts;
    await langEn.click();
    await page.waitForTimeout(1500);
    expect(translateAttempts).toBeGreaterThan(attemptsBefore);
    await expect(msg).toHaveAttribute("data-lang", "pt", { timeout: 5000 });
  });
});
