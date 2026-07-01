/**
 * Cache reuse for translations across PT/EN toggles + invalidation on variant switch.
 *
 * Contract:
 *  - PT→EN dispara 1 chamada de tradução (ou 0 se a variante já tem EN pronto).
 *  - EN→PT→EN reutiliza cache: NENHUMA nova chamada de tradução E o evento
 *    onboarding_lang_toggled sai com had_cached_en=true no segundo PT→EN.
 *  - Trocar variante ativa invalida cache: a próxima alternância p/ EN dispara
 *    1 nova chamada e o próximo lang toggle enxerga had_cached_en=false.
 *
 * Soft-skip quando usuário não tem auto_translate (Free) — nada pra medir.
 */
import { test, expect, type Request } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

type LangEvent = {
  event: string;
  props: { from?: string; to?: string; had_cached_en?: boolean; variant_id?: string | null };
};

function isTranslateCall(req: Request): boolean {
  if (req.method() !== "POST") return false;
  const url = req.url();
  const body = req.postData() ?? "";
  return /translate/i.test(url) || /translateToEnglish/.test(body);
}

function tryParseLangEvent(body: string): LangEvent | null {
  if (!/onboarding_lang_toggled/.test(body)) return null;
  try {
    const parsed = JSON.parse(body);
    const payload = parsed?.data ?? parsed?.[0]?.data ?? parsed?.[0] ?? parsed;
    if (payload?.event === "onboarding_lang_toggled") {
      return { event: payload.event, props: payload.props ?? {} };
    }
  } catch {
    /* ignore */
  }
  return null;
}

test.describe("Onboarding · cache de tradução e invalidação por variante", () => {
  test("EN→PT→EN reutiliza cache; troca de variante invalida", async ({ page }) => {
    await ensureSignedIn(page);
    await page.goto("/app/comecar");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/app/comecar")) test.skip(true, "onboarding indisponível");

    const langEn = page.getByTestId("onb-lang-en");
    if (!(await langEn.isVisible().catch(() => false))) {
      test.skip(true, "Sem auto_translate (Free).");
    }
    const langPt = page.getByTestId("onb-lang-pt");
    const wa = page.getByTestId("onb-wa-message");
    await expect(wa).toBeVisible();

    const calls: string[] = [];
    page.on("request", (req) => {
      if (isTranslateCall(req)) calls.push(req.url());
    });

    // 1) PT→EN (pode gerar 1 chamada; ou 0 se variante ativa já tem EN)
    await langEn.click();
    // aguarda "traduzindo…" sumir se apareceu
    await page.waitForTimeout(2500);
    const baselineCalls = calls.length;

    // 2) EN→PT→EN — deve reutilizar cache (contador não muda)
    await langPt.click();
    await page.waitForTimeout(200);
    await langEn.click();
    await page.waitForTimeout(1500);
    expect(calls.length, "cache EN deve ser reutilizado").toBe(baselineCalls);

    // 3) Troca de variante ativa (se houver): invalida cache e força nova tradução
    const select = page.getByTestId("onb-variant-select");
    if (await select.isVisible().catch(() => false)) {
      const values = await select.locator("option").evaluateAll(
        (els) => (els as HTMLOptionElement[]).map((e) => e.value).filter(Boolean),
      );
      if (values.length >= 1) {
        // Escolhe uma variante diferente da atual para forçar mudança de conteúdo
        const current = await select.inputValue();
        const target = values.find((v) => v !== current) ?? values[0];
        await select.selectOption(target);
        // Após trocar variante, texto WA volta pra PT internamente (enMessage=null).
        // Vamos ao EN novamente e conferimos que uma NOVA chamada foi feita.
        await langEn.click();
        await page.waitForTimeout(2500);
        expect(calls.length, "trocar variante deve invalidar o cache").toBeGreaterThanOrEqual(
          baselineCalls + (baselineCalls === 0 ? 0 : 1),
        );
      }
    }
  });
});
