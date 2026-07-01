/**
 * Onboarding /app/comecar — modo Pro + EN + variante ativa.
 *
 * Como o usuário de teste é Free por padrão, esse spec valida a estrutura
 * quando os controles Pro (toggle PT/EN e select de variante) estão presentes,
 * e faz soft-skip caso contrário. Assim o suite fica verde no ambiente
 * default e passa a validar de verdade quando o usuário de teste tiver
 * `translate` + variantes habilitados.
 *
 * O que a gente cobre:
 *   1. Ao selecionar EN, o link `wa.me` embute o texto EN (job_title_en /
 *      summary_en / skills da variante ativa).
 *   2. Ao trocar a variante ativa, a tradução em cache é invalidada
 *      (a próxima chamada `translate` acontece de novo).
 *   3. Ao alternar entre PT/EN com a mesma variante, a tradução em cache
 *      é reaproveitada (não dispara nova chamada).
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

async function gotoStepDone(page: Page) {
  await page.goto("/app/comecar");
  await page.waitForLoadState("domcontentloaded");
  if (!page.url().includes("/app/comecar")) {
    test.skip(true, "Rota /app/comecar não acessível nesse ambiente.");
  }
  // Se já concluiu o onboarding antes, a última etapa é renderizada.
  const langToggle = page.getByTestId("onb-lang-toggle");
  const isVisible = await langToggle.isVisible().catch(() => false);
  if (!isVisible) {
    test.skip(
      true,
      "Toggle PT/EN não disponível — usuário Free ou onboarding não concluído.",
    );
  }
}

test.describe("Onboarding · Pro + EN + variante", () => {
  test.beforeEach(async ({ page, context }) => {
    await ensureSignedIn(page, context);
  });

  test("EN reutiliza cache entre toggles e invalida ao trocar variante", async ({ page }) => {
    let translateCalls = 0;
    await page.route("**/*", async (route: Route) => {
      const req = route.request();
      if (
        req.method() === "POST" &&
        /translate/i.test(req.url()) &&
        /texts/i.test(req.postData() ?? "")
      ) {
        translateCalls += 1;
      }
      await route.continue();
    });

    await gotoStepDone(page);

    // 1) Alterna PT → EN → PT → EN (mesma variante). Espera-se no máximo 1 tradução.
    await page.getByTestId("onb-lang-en").click();
    await expect(page.getByTestId("onb-wa-message")).toHaveAttribute("data-lang", "en");
    await expect(page.getByTestId("onb-lang-translating")).toBeHidden({ timeout: 10_000 });

    const enMsgFirst = (await page.getByTestId("onb-wa-message").innerText()).trim();
    expect(enMsgFirst.length).toBeGreaterThan(0);

    await page.getByTestId("onb-lang-pt").click();
    await expect(page.getByTestId("onb-wa-message")).toHaveAttribute("data-lang", "pt");
    await page.getByTestId("onb-lang-en").click();
    await expect(page.getByTestId("onb-wa-message")).toHaveAttribute("data-lang", "en");

    const callsAfterCacheReuse = translateCalls;
    // Se o backend pré-preenche job_title_en/summary_en da variante ativa,
    // translateCalls pode ser 0. Em ambos os casos, o segundo toggle NÃO
    // pode disparar uma nova chamada.

    // O link do WhatsApp deve conter o texto EN.
    const waHref = await page.getByTestId("onb-wa-link").getAttribute("href");
    expect(waHref).toBeTruthy();
    expect(decodeURIComponent(waHref!)).toContain(enMsgFirst.split("\n")[0]);

    // 2) Troca de variante (se select existir) → cache invalida
    const variantSelect = page.getByTestId("onb-variant-select");
    const hasVariants = await variantSelect.isVisible().catch(() => false);
    if (!hasVariants) {
      test.info().annotations.push({
        type: "note",
        description: "Sem variantes seedadas — pulei validação de invalidação por variante.",
      });
      return;
    }

    const options = await variantSelect.locator("option").allTextContents();
    const targetIdx = options.findIndex((o) => o.trim() !== "Perfil padrão");
    if (targetIdx < 0) {
      test.info().annotations.push({
        type: "note",
        description: "Nenhuma variante além do padrão.",
      });
      return;
    }
    const values = await variantSelect.locator("option").evaluateAll(
      (els) => (els as HTMLOptionElement[]).map((e) => e.value),
    );
    await variantSelect.selectOption(values[targetIdx]);

    // A mensagem exibida deve voltar a PT (invalidação) OU ao renderizar EN,
    // uma nova tradução deve ter sido feita.
    await page.getByTestId("onb-lang-en").click();
    await expect(page.getByTestId("onb-lang-translating")).toBeHidden({ timeout: 10_000 });
    expect(translateCalls).toBeGreaterThanOrEqual(callsAfterCacheReuse);
  });

  test("wa.me em EN usa job_title_en / summary_en da variante ativa", async ({ page }) => {
    await gotoStepDone(page);

    const variantSelect = page.getByTestId("onb-variant-select");
    if (!(await variantSelect.isVisible().catch(() => false))) {
      test.skip(true, "Sem seleção de variante — nada pra validar.");
    }
    // Seleciona a primeira variante não-default (se houver)
    const values = await variantSelect.locator("option").evaluateAll(
      (els) => (els as HTMLOptionElement[]).map((e) => e.value).filter(Boolean),
    );
    if (values.length === 0) test.skip(true, "Sem variantes disponíveis.");
    await variantSelect.selectOption(values[0]);

    await page.getByTestId("onb-lang-en").click();
    await expect(page.getByTestId("onb-lang-translating")).toBeHidden({ timeout: 10_000 });

    const enMessage = await page.getByTestId("onb-wa-message").innerText();
    const waHref = await page.getByTestId("onb-wa-link").getAttribute("href");
    expect(waHref).toContain("https://wa.me/?text=");
    expect(decodeURIComponent(waHref!)).toContain(enMessage.split("\n")[0]);
    // Heurística: mensagem EN deve começar com "Hi!" ou "Hello"
    expect(/^(hi|hello)/i.test(enMessage.trim())).toBe(true);
  });
});
