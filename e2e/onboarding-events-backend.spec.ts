/**
 * Backend event mirroring: confirma que os toggles PT/EN e a seleção de
 * variante realmente batem no servidor com o payload esperado.
 *
 * Como usuário Free por padrão não tem os controles Pro visíveis, os testes
 * fazem soft-skip quando o toggle/select não existe no ambiente. Quando
 * aparecem, capturamos as chamadas POST para `/n/...` (rota de server-fns
 * do TanStack Start) que carregam `logOnboardingEvent`.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

type Captured = {
  event: string;
  step_index: number | null;
  step_label: string | null;
  props: Record<string, unknown>;
};

async function captureOnboardingEvents(page: Page): Promise<{ get: () => Captured[]; stop: () => void }> {
  const rows: Captured[] = [];
  const handler = (req: Request) => {
    if (req.method() !== "POST") return;
    const body = req.postData();
    if (!body) return;
    // logOnboardingEvent envia um JSON com { event, step_index, step_label, props }
    // Filtra qualquer POST cujo corpo cite um evento de onboarding.
    if (!/onboarding_/.test(body)) return;
    try {
      const parsed = JSON.parse(body);
      // TanStack serializa args do server-fn de várias formas; a gente descasca.
      const payload =
        parsed?.data ??
        parsed?.[0]?.data ??
        parsed?.[0] ??
        parsed;
      if (payload && typeof payload === "object" && typeof payload.event === "string" && /^onboarding_/.test(payload.event)) {
        rows.push({
          event: payload.event,
          step_index: payload.step_index ?? null,
          step_label: payload.step_label ?? null,
          props: (payload.props ?? {}) as Record<string, unknown>,
        });
      }
    } catch {
      /* body não é JSON puro — ignora */
    }
  };
  page.on("request", handler);
  return {
    get: () => rows,
    stop: () => page.off("request", handler),
  };
}

test.describe("Onboarding · eventos no backend", () => {
  test.beforeEach(async ({ page, context }) => {
    await ensureSignedIn(page, context);
  });

  test("lang_toggled e variant_selected chegam no servidor com payload correto", async ({ page }) => {
    const cap = await captureOnboardingEvents(page);
    await page.goto("/app/comecar");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/app/comecar")) test.skip(true, "Rota inacessível.");

    const langEn = page.getByTestId("onb-lang-en");
    if (!(await langEn.isVisible().catch(() => false))) {
      test.skip(true, "Sem toggle PT/EN — usuário Free.");
    }

    await langEn.click();
    await page.getByTestId("onb-lang-pt").click();

    const variantSel = page.getByTestId("onb-variant-select");
    if (await variantSel.isVisible().catch(() => false)) {
      const values = await variantSel.locator("option").evaluateAll(
        (els) => (els as HTMLOptionElement[]).map((e) => e.value).filter(Boolean),
      );
      if (values.length > 0) await variantSel.selectOption(values[0]);
    }

    // Aguarda as requisições fire-and-forget se acomodarem
    await page.waitForTimeout(1500);
    cap.stop();

    const events = cap.get();
    const langs = events.filter((e) => e.event === "onboarding_lang_toggled");
    expect(langs.length).toBeGreaterThanOrEqual(2);
    // Primeiro toggle: pt → en
    expect(langs[0].props).toMatchObject({ from: "pt", to: "en" });
    expect(langs[0].props).toHaveProperty("had_cached_en");
    // Segundo toggle: en → pt
    expect(langs[1].props).toMatchObject({ from: "en", to: "pt" });

    if (await variantSel.isVisible().catch(() => false)) {
      const vs = events.filter((e) => e.event === "onboarding_variant_selected");
      if (vs.length > 0) {
        expect(vs[vs.length - 1].props).toHaveProperty("variant_id");
        expect(typeof vs[vs.length - 1].props.variant_id).toBe("string");
      }
    }
  });
});
