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
  // Regex precisa ser específica o suficiente para não colidir com o texto
  // do banner de gate ("Disponível depois que você marcar 'Oferta...'"),
  // que aparece dentro de TODOS os rows bloqueados.
  const labels: Record<string, RegExp> = {
    hired_by_employer: /Oferta de trabalho aceita e contrato assinado em portugu[êe]s/i,
    ds160: /Formul[áa]rio DS-160 preenchido e enviado/i,
    mrv_paid: /Taxa MRV paga \(US\$ 190\)/i,
    interview_done: /Entrevista consular realizada/i,
  };
  const re = labels[stepKey];
  if (!re) throw new Error(`rowByStepKey: faltou regex para ${stepKey}`);
  return page.locator('[id^="step-"]').filter({ hasText: re }).first();
}

async function gotoVisto(page: Page) {
  await page.goto("/app/visto", { waitUntil: "commit" });
  await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[id^="step-"]').first()).toBeVisible({ timeout: 10_000 });
}

/** Card da Jornada visível no breakpoint atual (drawer no mobile, sidebar no desktop). */
function journeyCard(page: Page) {
  return page.getByTestId("journey-card").filter({ visible: true }).first();
}

async function readPhaseLabel(page: Page): Promise<string> {
  const card = journeyCard(page);
  // Lê o textContent do card e extrai "Fase · X". É mais resiliente do que
  // tentar um selector `text=/^Fase/` no DOM, porque o slot da fase é um
  // <div> dentro de outro <div> com text node "Olá!" no irmão — o regex
  // âncora pode não casar no escopo certo.
  return await card.evaluate((el) => {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const m = text.match(/Fase\s+·\s+\S+/);
    return m ? m[0] : "";
  });
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
      // observável de "loading". Atrasamos ~1500ms para dar tempo de
      // amostrar bounding box e ausência de "Fase · X" antes do response.
      const DELAY_MS = 1500;
      await page.route("**/rest/v1/visa_checklist_items*", async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await new Promise((r) => setTimeout(r, DELAY_MS));
        return route.continue();
      });

      // /app/perfil renderiza sem depender de visa_checklist_items, então
      // apenas o card da Jornada na sidebar fica em loading.
      await page.goto("/app/perfil", { waitUntil: "commit" });
      await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });

      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }

      const card = journeyCard(page);
      await expect(card).toBeVisible();

      // (a) Card começa em aria-busy="true".
      await expect(card).toHaveAttribute("aria-busy", "true");

      // (b) Durante o loading NÃO existe "Fase · X" no card — só skeleton.
      const phasesVisible = await card.evaluate((el) =>
        /Fase\s+·\s+\S+/.test((el.textContent ?? "").replace(/\s+/g, " ")),
      );
      expect(phasesVisible, "card não deve renderizar 'Fase · X' enquanto carrega").toBe(false);

      // (c) Progressbar interno expõe aria-valuetext="carregando" e
      //     aria-valuenow ausente — nunca um número falso (ex.: 0% ou 20%).
      const pb = card.getByRole("progressbar").first();
      await expect(pb).toBeVisible();
      expect(await pb.getAttribute("aria-valuetext")).toBe("carregando");
      expect(await pb.getAttribute("aria-valuenow")).toBeNull();

      // (d) Snapshot da altura ANTES da resposta.
      const boxLoading = await card.boundingBox();
      expect(boxLoading, "card precisa ter bounding box durante o loading").not.toBeNull();
      expect(boxLoading!.height).toBeGreaterThan(0);

      // (e) Aguarda o fim do loading lendo aria-busy direto, sem trocar de
      //     locator (o testid é estável). Usamos `expect.poll` em vez de
      //     `not.toHaveAttribute` para permanecer no mesmo nó do DOM.
      await expect
        .poll(() => card.getAttribute("aria-busy"), { timeout: 8_000 })
        .toBe("false");

      // (f) Depois do load, "Fase · X" aparece com um stage REAL — nunca
      //     DS-160 antes do contrato. Estado inicial determinístico.
      const phaseAfter = await readPhaseLabel(page);
      expect(phaseAfter, `fase após load: ${phaseAfter}`).toMatch(/^Fase\s+·\s+\S+/);
      expect(phaseAfter).toMatch(/Contrato/i);
      expect(phaseAfter).not.toMatch(/DS-?160/i);

      // (g) Sem layout shift: altura/largura permanecem ±2px (subpixel).
      const boxAfter = await card.boundingBox();
      expect(boxAfter).not.toBeNull();
      const dh = Math.abs(boxAfter!.height - boxLoading!.height);
      const dw = Math.abs(boxAfter!.width - boxLoading!.width);
      expect(dh, `Δheight ${dh}px (antes=${boxLoading!.height}, depois=${boxAfter!.height})`).toBeLessThanOrEqual(2);
      expect(dw, `Δwidth ${dw}px`).toBeLessThanOrEqual(2);
    });

    /* --------------------------------------------------------------------- */
    /* 4) RE-LOCK: desmarcar o contrato re-bloqueia DS-160 e volta a Jornada */
    /* --------------------------------------------------------------------- */

    test("desmarcar 'Oferta aceita' após liberar DS-160 volta para Contrato e re-bloqueia", async ({
      page,
    }) => {
      await gotoVisto(page);

      const ds160 = rowByStepKey(page, "ds160");
      const hired = rowByStepKey(page, "hired_by_employer");
      const hiredCheckbox = hired.getByRole("checkbox", { name: /Marcar etapa:/i });

      // Pré-condição: gate ativo.
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true");

      // 1) Marca contrato → DS-160 libera.
      await hiredCheckbox.click();
      await expect(ds160).not.toHaveAttribute("data-gate-blocked", "true", {
        timeout: 10_000,
      });
      await expect(ds160.locator('[id^="gate-"]')).toHaveCount(0);

      // 2) Desmarca contrato (sem ter completado DS-160).
      await expect(hiredCheckbox).toBeChecked();
      await hiredCheckbox.click();
      await expect(hiredCheckbox).not.toBeChecked();

      // 3) Gate volta: data-attr, banner e checkbox desabilitado.
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true", {
        timeout: 10_000,
      });
      const banner = ds160.locator('[id^="gate-"]');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/Oferta de trabalho aceita/i);
      await expect(ds160.getByRole("checkbox", { name: /Marcar etapa:/i })).toBeDisabled();

      // 4) Jornada da sidebar volta para Contrato (nunca DS-160).
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      await expect
        .poll(() => readPhaseLabel(page), { timeout: 10_000 })
        .toMatch(/Contrato/i);
      const phase = await readPhaseLabel(page);
      expect(phase, `fase final: ${phase}`).not.toMatch(/DS-?160/i);
    });

    /* --------------------------------------------------------------------- */
    /* 5) INCONSISTENT: DS-160 marcado mas contrato false → UI corrige       */
    /* --------------------------------------------------------------------- */

    test("dado inconsistente (DS-160=true, contrato=false) → sidebar fica em Contrato, banner aparece, checkbox disabled", async ({
      page,
      request,
    }) => {
      // Estado inconsistente injetado direto via PostgREST (simula DB drift).
      await patchStep(request, session.session.access_token, "hired_by_employer", false);
      await patchStep(request, session.session.access_token, "ds160", true);

      await gotoVisto(page);

      const ds160 = rowByStepKey(page, "ds160");

      // (a) Row está bloqueada mesmo com is_completed=true.
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true");

      // (b) Checkbox aparece marcado (espelha o DB) mas desabilitado —
      //     usuário não pode mexer aqui; precisa marcar o contrato.
      const checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toBeDisabled();

      // (c) Banner visível e com o texto correto.
      const banner = ds160.locator('[id^="gate-"]');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/Oferta de trabalho aceita/i);

      // (d) Sidebar Jornada NUNCA mostra DS-160 nesse estado.
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      const phase = await readPhaseLabel(page);
      expect(phase, `fase: ${phase}`).not.toMatch(/DS-?160/i);
      expect(phase).toMatch(/Contrato/i);
    });

    /* --------------------------------------------------------------------- */
    /* 6) A11Y: banner de bloqueio                                           */
    /* --------------------------------------------------------------------- */

    test("banner de bloqueio é acessível, persistente e aparece ANTES do clique no DS-160", async ({
      page,
    }) => {
      await gotoVisto(page);

      const ds160 = rowByStepKey(page, "ds160");
      const banner = ds160.locator('[id^="gate-"]');
      const checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });

      // (a) Banner está no DOM e visível ANTES de qualquer interação.
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(
        /Dispon[íi]vel depois que voc[êe] marcar.*Oferta de trabalho aceita e contrato assinado/i,
      );

      // (b) Banner tem id estável e o checkbox o referencia via
      //     aria-describedby — leitores de tela leem a explicação ao focar
      //     o checkbox bloqueado, sem precisar de clique.
      const bannerId = await banner.getAttribute("id");
      expect(bannerId, "banner precisa ter id estável").toMatch(/^gate-/);
      await expect(checkbox).toHaveAttribute("aria-describedby", bannerId!);

      // (c) Ícone do banner é puramente decorativo (aria-hidden).
      await expect(banner.locator("svg[aria-hidden]").first()).toBeAttached();

      // (d) Live region polite do <main> existe para anúncios dinâmicos.
      const live = page
        .locator('[role="status"][aria-live="polite"]')
        .filter({ visible: false })
        .first();
      await expect(live).toBeAttached();

      // (e) Tentativa de clique forçada NÃO progride e o banner permanece.
      await checkbox.click({ force: true }).catch(() => {});
      await expect(checkbox).not.toBeChecked();
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/Oferta de trabalho aceita/i);

      // (f) Persistência: o banner sobrevive a um reload da página.
      await page.reload({ waitUntil: "commit" });
      await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });
      const ds160After = rowByStepKey(page, "ds160");
      const bannerAfter = ds160After.locator('[id^="gate-"]');
      await expect(bannerAfter).toBeVisible();
      await expect(bannerAfter).toContainText(/Oferta de trabalho aceita/i);
      await expect(
        ds160After.getByRole("checkbox", { name: /Marcar etapa:/i }),
      ).toBeDisabled();
    });
  });
}


