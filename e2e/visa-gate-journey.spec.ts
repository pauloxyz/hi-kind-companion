import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ensureSignedIn, type E2ESession } from "./_helpers/auth";

/**
 * E2E para o gate "contrato assinado → DS-160" e para o skeleton da Jornada.
 *
 * Cobre 3 cenários distintos solicitados pelo usuário:
 *
 *  1) GATE — sem `hired_by_employer` marcado, tentar concluir DS-160 no
 *     checklist precisa ficar bloqueado: row com `data-gate-blocked="true"`,
 *     checkbox `disabled`, banner explicativo visível e a Jornada na sidebar
 *     continua em "Contrato" (nunca "DS-160").
 *
 *  2) UNBLOCK — marcar `hired_by_employer` no checklist deve, sem reload,
 *     liberar o DS-160 (banner some, checkbox vira clicável) e a Jornada
 *     avança automaticamente para "Fase · DS-160".
 *
 *  3) SKELETON — durante o carregamento (visa_checklist_items lento) o card
 *     da Jornada precisa preservar altura e NÃO exibir nenhuma fase real;
 *     verificamos em mobile e desktop comparando bounding boxes antes/depois
 *     e amostrando o texto da fase durante a janela de loading.
 *
 * Toda manipulação de estado usa PostgREST com a sessão real do usuário —
 * mesmo padrão de `journey-progression.spec.ts` — para que o teste exercite
 * a stack completa (RLS, trigger handle_new_user, gate no toggle).
 */

const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://lkvfvriexuxlvrufbqbf.supabase.co";
const SUPABASE_KEY =
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_wq43mYCRgxQ11IfBOkHi7w_Ihw2O_A3";

const GATED_STEP_KEYS = [
  "i129_filed",
  "ds160",
  "mrv_paid",
  "casv_scheduled",
  "interview_scheduled",
  "interview_done",
  "visa_issued",
  "passport_delivered",
] as const;

const HIRED_KEY = "hired_by_employer";
const ALL_RESET_KEYS = [HIRED_KEY, ...GATED_STEP_KEYS];

async function patchStep(
  request: APIRequestContext,
  accessToken: string,
  stepKey: string,
  done: boolean,
) {
  const url = `${SUPABASE_URL}/rest/v1/visa_checklist_items?step_key=eq.${encodeURIComponent(stepKey)}`;
  const res = await request.patch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    data: {
      is_completed: done,
      completed_at: done ? new Date().toISOString() : null,
    },
  });
  if (!res.ok()) {
    throw new Error(`patch ${stepKey}=${done} failed (${res.status()}): ${await res.text()}`);
  }
}

async function resetState(request: APIRequestContext, session: E2ESession) {
  for (const k of ALL_RESET_KEYS) {
    try {
      await patchStep(request, session.session.access_token, k, false);
    } catch {
      /* noop — best effort */
    }
  }
}

/** Linha do checklist filtrada pelo `step_key` via DOM (`step_label` é estável). */
function rowByStepKey(page: Page, stepKey: string) {
  // O step_label é definido pelo trigger handle_new_user e é parte do contrato
  // do banco; usamos o label porque é o que o usuário vê e também o que o
  // teste de regressão precisa proteger.
  const labels: Record<string, RegExp> = {
    hired_by_employer: /Oferta de trabalho aceita e contrato assinado/i,
    ds160: /Formul[áa]rio DS-160 preenchido e enviado/i,
    mrv_paid: /Taxa MRV paga/i,
    interview_done: /Entrevista consular realizada/i,
  };
  const re = labels[stepKey];
  if (!re) throw new Error(`rowByStepKey: faltou regex para ${stepKey}`);
  // O label vive dentro de um `div` filho do row `[id^="step-"]`. Subimos com
  // `locator('..').locator('..')` evitando dependência de markup interno.
  return page
    .locator('[id^="step-"]')
    .filter({ hasText: re })
    .first();
}

async function gotoVisto(page: Page) {
  await page.goto("/app/visto", { waitUntil: "commit" });
  await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });
  // Aguarda o primeiro row do checklist hidratar.
  await expect(page.locator('[id^="step-"]').first()).toBeVisible({ timeout: 10_000 });
}

// `Fase ·` na sidebar (DOM tem 2 — desktop hidden e drawer mobile fechado);
// pegamos a visível.
function fasePhraseLocator(page: Page) {
  return page.locator("text=/^Fase\\s+·/").filter({ visible: true }).first();
}

async function readPhaseLabel(page: Page): Promise<string> {
  const t = await fasePhraseLocator(page).textContent();
  return (t ?? "").trim();
}

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`Visa gate ↔ Jornada — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    let session: E2ESession;

    test.beforeEach(async ({ page, request }) => {
      session = await ensureSignedIn(page);
      // Estado conhecido: contrato e todos os gated OFF.
      await resetState(request, session);
      // Marca o onboarding como concluído para evitar redirects para /app/comecar
      // — o gate independe do onboarding, mas ele bloqueia a navegação para
      // /app/visto em fresh users.
      const profileUrl = `${SUPABASE_URL}/rest/v1/my_profile?owner_id=eq.${session.session.user.id}`;
      await request.patch(profileUrl, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.session.access_token}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        data: { onboarding_completed_at: new Date().toISOString() },
      });
      // Suprime tour cliente.
      await page.evaluate(() => window.localStorage.setItem("vaiprala_tour_done_v1", "1"));
    });

    test.afterEach(async ({ request }) => {
      if (session) await resetState(request, session);
    });

    /* --------------------------------------------------------------------- */
    /* 1) GATE: DS-160 fica bloqueado sem hired_by_employer                  */
    /* --------------------------------------------------------------------- */

    test("DS-160 está bloqueado quando contrato NÃO está marcado", async ({ page }) => {
      await gotoVisto(page);

      const ds160 = rowByStepKey(page, "ds160");
      await expect(ds160, "row DS-160 precisa estar no DOM").toBeVisible();

      // (a) DOM marca a linha como bloqueada.
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true");

      // (b) Banner explicativo visível, mencionando "Oferta de trabalho aceita".
      const banner = ds160.locator('[id^="gate-"]');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/Oferta de trabalho aceita/i);

      // (c) Checkbox desabilitado (Radix expõe `disabled` + data-disabled).
      const checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });
      await expect(checkbox).toBeDisabled();

      // (d) Clicar não muda nada — Playwright pula clicks em disabled; usamos
      //     `force` para garantir que mesmo um click forçado não progride.
      await checkbox.click({ force: true }).catch(() => {});
      await expect(checkbox).not.toBeChecked();
      // Banner continua visível (sem reload).
      await expect(banner).toBeVisible();

      // (e) Sidebar: Jornada NÃO transita para "DS-160".
      // No mobile a Fase fica no drawer fechado; abrimos via testid.
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      const phase = await readPhaseLabel(page);
      expect(phase, `fase atual: ${phase}`).not.toMatch(/DS-?160/i);
      expect(phase).toMatch(/Contrato/i);
    });

    /* --------------------------------------------------------------------- */
    /* 2) UNBLOCK: marcar hired_by_employer libera DS-160 e avança a Jornada */
    /* --------------------------------------------------------------------- */

    test("marcar 'Oferta aceita' libera DS-160 e avança a Jornada para DS-160", async ({
      page,
    }) => {
      await gotoVisto(page);

      // Pré-condição: DS-160 bloqueado.
      const ds160 = rowByStepKey(page, "ds160");
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true");

      // Marca o contrato pelo UI (caminho real do usuário) — não via PATCH.
      const hired = rowByStepKey(page, "hired_by_employer");
      const hiredCheckbox = hired.getByRole("checkbox", { name: /Marcar etapa:/i });
      await expect(hiredCheckbox).toBeEnabled();
      await hiredCheckbox.click();

      // Aguarda o refetch reativo da query "visa-checklist" e o re-render.
      // A linha DS-160 perde o atributo de gate quando os dados atualizam.
      await expect(ds160).not.toHaveAttribute("data-gate-blocked", "true", {
        timeout: 10_000,
      });

      // Banner sumiu e checkbox virou clicável.
      await expect(ds160.locator('[id^="gate-"]')).toHaveCount(0);
      const ds160Checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });
      await expect(ds160Checkbox).toBeEnabled();

      // Jornada da sidebar deve transitar para "DS-160" automaticamente.
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      await expect
        .poll(() => readPhaseLabel(page), { timeout: 10_000 })
        .toMatch(/DS-?160/i);

      // E o progressbar reflete >= 40% (Currículo + Contrato em 5 fases).
      const pb = page
        .getByRole("progressbar", { name: /Progresso da jornada h-2a/i })
        .filter({ visible: true })
        .first();
      const valueNow = Number(await pb.getAttribute("aria-valuenow"));
      expect(valueNow).toBeGreaterThanOrEqual(40);
    });

    /* --------------------------------------------------------------------- */
    /* 3) SKELETON: card preserva altura, nunca exibe fase errada            */
    /* --------------------------------------------------------------------- */

    test("card da Jornada preserva altura e não mostra fase errada durante o load", async ({
      page,
    }) => {
      // Throttle do GET de visa_checklist_items para forçar uma janela
      // observável de "loading". O AppShell faz esse fetch quando navega
      // para /app, então atrasamos a resposta em ~1200ms.
      await page.route("**/rest/v1/visa_checklist_items*", async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await new Promise((r) => setTimeout(r, 1200));
        return route.continue();
      });

      // Vai para qualquer rota dentro do AppShell — usamos /app/perfil porque
      // não depende de visa_checklist_items para renderizar a página em si,
      // então só o card da Jornada fica em loading.
      await page.goto("/app/perfil", { waitUntil: "commit" });
      await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });

      // Abre drawer no mobile para o card ficar visível.
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }

      const card = page
        .locator('[aria-busy="true"]')
        .filter({ has: page.getByRole("progressbar", { name: /Progresso da jornada h-2a/i }) })
        .first();
      await expect(card, "card da Jornada deveria estar em aria-busy").toBeVisible();

      // (a) Durante o loading, NÃO existe "Fase · <stage>" — só o skeleton.
      // O texto "Fase ·" também não aparece, pois o slot inteiro vira span.
      const phaseDuringLoad = await page.locator("text=/^Fase\\s+·/").count();
      expect(phaseDuringLoad, "não deve renderizar 'Fase · X' enquanto carrega").toBe(0);

      // (b) Progressbar tem aria-valuenow indefinido durante o loading
      //     (use aria-valuetext="carregando") — nunca um número falso.
      const pb = page
        .getByRole("progressbar", { name: /Carregando progresso da jornada/i })
        .filter({ visible: true })
        .first();
      await expect(pb).toBeVisible();
      const loadingValueNow = await pb.getAttribute("aria-valuenow");
      expect(loadingValueNow, "aria-valuenow deve ser nulo durante loading").toBeNull();

      // (c) Snapshot da altura ANTES da resposta.
      const boxLoading = await card.boundingBox();
      expect(boxLoading).not.toBeNull();

      // (d) Aguarda o fim do loading (aria-busy desaparece quando todos os
      //     queries do journey terminam).
      await expect(card).not.toHaveAttribute("aria-busy", "true", { timeout: 8_000 });

      // (e) Após o load, "Fase · X" aparece com um stage real.
      const phaseAfter = await readPhaseLabel(page);
      expect(phaseAfter).toMatch(/^Fase\s+·\s+\S+/);
      // Como acabamos de resetar (contractSigned=false, onboarding=true),
      // a fase tem que ser exatamente "Contrato" — comprovando que o estado
      // inicial é determinístico e nunca DS-160.
      expect(phaseAfter).toMatch(/Contrato/i);
      expect(phaseAfter).not.toMatch(/DS-?160/i);

      // (f) Sem layout shift: altura do card permanece idêntica (±2px de
      //     subpixel rounding). O card preserva min-h em todos os slots.
      const cardAfter = page
        .locator('[role="progressbar"][aria-label*="Progresso da jornada"]')
        .filter({ visible: true })
        .first()
        .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
      const boxAfter = await cardAfter.boundingBox();
      expect(boxAfter).not.toBeNull();
      expect(Math.abs((boxAfter!.height ?? 0) - (boxLoading!.height ?? 0))).toBeLessThanOrEqual(2);
      expect(Math.abs((boxAfter!.width ?? 0) - (boxLoading!.width ?? 0))).toBeLessThanOrEqual(2);
    });
  });
}
