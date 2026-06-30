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
  // Defensivo: durante transições de query (invalidação após click) o
  // <Drawer> e a sidebar podem re-montar, deixando o elemento detached
  // entre a resolução do locator e o `evaluate`. Capturamos o erro e
  // devolvemos string vazia para `expect.poll` simplesmente tentar de novo.
  try {
    return await card.evaluate((el) => {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      const m = text.match(/Fase\s+·\s+\S+/);
      return m ? m[0] : "";
    });
  } catch {
    return "";
  }
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

      // (d) Live region polite existe na página para anúncios dinâmicos.
      const live = page.locator('[role="status"][aria-live="polite"]').first();
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

    /* --------------------------------------------------------------------- */
    /* 7) RECOVER: limpar drift + marcar contrato → DS-160 habilita e fase   */
    /*    da Jornada migra para "DS-160"                                     */
    /* --------------------------------------------------------------------- */

    test("limpar drift do DS-160 + marcar contrato habilita o checkbox e migra a Jornada", async ({
      page,
      request,
    }) => {
      // Estado inicial inconsistente: DS-160 marcado sem contrato. A UI
      // mostra banner + checkbox `disabled` (coberto no cenário 5).
      await patchStep(request, session.session.access_token, "ds160", true);
      await gotoVisto(page);

      const ds160 = rowByStepKey(page, "ds160");
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true");
      await expect(
        ds160.getByRole("checkbox", { name: /Marcar etapa:/i }),
      ).toBeDisabled();

      // Limpa o drift (DS-160 → false) — via PATCH, como faria uma rotina
      // de correção administrativa.
      await patchStep(request, session.session.access_token, "ds160", false);

      // Marca o contrato pelo UI (caminho real do usuário).
      const hiredCheckbox = rowByStepKey(page, "hired_by_employer").getByRole(
        "checkbox",
        { name: /Marcar etapa:/i },
      );
      await hiredCheckbox.click();

      // DS-160 perde o gate, banner some e checkbox volta a habilitar.
      await expect(ds160).not.toHaveAttribute("data-gate-blocked", "true", {
        timeout: 10_000,
      });
      await expect(ds160.locator('[id^="gate-"]')).toHaveCount(0);
      const ds160Checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });
      await expect(ds160Checkbox).toBeEnabled();
      await expect(ds160Checkbox).not.toBeChecked();

      // Jornada migra para "Fase · DS-160" (próxima após Contrato).
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      await expect
        .poll(() => readPhaseLabel(page), { timeout: 10_000 })
        .toMatch(/DS-?160/i);
    });

    /* --------------------------------------------------------------------- */
    /* 8) PERSIST: reload mantém banner + DS-160 disabled + aria-describedby */
    /* --------------------------------------------------------------------- */

    test("estado do gate sobrevive ao reload com aria-describedby correto", async ({
      page,
    }) => {
      await gotoVisto(page);

      const ds160 = rowByStepKey(page, "ds160");
      const banner = ds160.locator('[id^="gate-"]');
      const checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });

      // Estado de referência ANTES do reload.
      await expect(banner).toBeVisible();
      const bannerIdBefore = await banner.getAttribute("id");
      expect(bannerIdBefore).toMatch(/^gate-/);
      await expect(checkbox).toHaveAttribute("aria-describedby", bannerIdBefore!);
      await expect(checkbox).toBeDisabled();

      // Reload duro.
      await page.reload({ waitUntil: "commit" });
      await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });

      const ds160After = rowByStepKey(page, "ds160");
      const bannerAfter = ds160After.locator('[id^="gate-"]');
      const checkboxAfter = ds160After.getByRole("checkbox", {
        name: /Marcar etapa:/i,
      });

      await expect(ds160After).toHaveAttribute("data-gate-blocked", "true");
      await expect(bannerAfter).toBeVisible();
      await expect(bannerAfter).toContainText(/Oferta de trabalho aceita/i);
      await expect(checkboxAfter).toBeDisabled();

      // aria-describedby continua amarrado ao id do banner (estável dentro
      // da row porque deriva do item.id, que persiste no DB).
      const bannerIdAfter = await bannerAfter.getAttribute("id");
      expect(bannerIdAfter).toMatch(/^gate-/);
      await expect(checkboxAfter).toHaveAttribute(
        "aria-describedby",
        bannerIdAfter!,
      );
      expect(
        bannerIdAfter,
        "id do banner deriva do item.id e deve sobreviver ao reload",
      ).toBe(bannerIdBefore);
    });

    /* --------------------------------------------------------------------- */
    /* 9) ROUNDTRIP: navegar para outra rota e voltar mantém o gate          */
    /* --------------------------------------------------------------------- */

    test("voltar para /app/visto após visitar outras rotas mantém o gate ativo", async ({
      page,
    }) => {
      await gotoVisto(page);
      const ds160 = rowByStepKey(page, "ds160");
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true");

      // Visita rotas alternativas (perfil e dashboard). Usamos goto direto
      // — o objetivo é validar a invariante do gate no retorno, não o
      // clique no link específico do menu.
      for (const path of ["/app/perfil", "/app"]) {
        await page.goto(path, { waitUntil: "commit" });
        await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });

        // Em nenhuma rota a Jornada deve mostrar DS-160 — contrato segue
        // não-assinado, então a sidebar/drawer fica em Contrato.
        if (vp.name === "mobile") {
          await page.getByTestId("drawer-trigger").click();
          await expect(page.locator('[role="dialog"]')).toBeVisible();
        }
        const phase = await readPhaseLabel(page);
        expect(phase, `fase em ${path}: ${phase}`).not.toMatch(/DS-?160/i);
        expect(phase).toMatch(/Contrato/i);
        if (vp.name === "mobile") {
          // Fecha o drawer antes de navegar de novo para evitar overlay
          // bloqueando o próximo goto.
          await page.keyboard.press("Escape");
        }
      }

      // Volta para a Jornada do visto — gate continua ativo, banner
      // continua visível e checkbox segue disabled.
      await page.goto("/app/visto", { waitUntil: "commit" });
      await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });
      const ds160Back = rowByStepKey(page, "ds160");
      await expect(ds160Back).toHaveAttribute("data-gate-blocked", "true");
      await expect(ds160Back.locator('[id^="gate-"]')).toBeVisible();
      await expect(
        ds160Back.getByRole("checkbox", { name: /Marcar etapa:/i }),
      ).toBeDisabled();
    });

    /* --------------------------------------------------------------------- */
    /* 10) RE-LOCK pós-conclusão: desmarcar contrato com DS-160 já completo  */
    /*     vira drift inconsistente → banner volta, checkbox `disabled`,    */
    /*     Jornada cai para Contrato.                                        */
    /* --------------------------------------------------------------------- */

    test("desmarcar contrato com DS-160 já completo reativa o gate e volta a Jornada", async ({
      page,
    }) => {
      await gotoVisto(page);

      const ds160 = rowByStepKey(page, "ds160");
      const ds160Checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });
      const hiredCheckbox = rowByStepKey(page, "hired_by_employer").getByRole(
        "checkbox",
        { name: /Marcar etapa:/i },
      );

      // 1) Libera o DS-160 marcando o contrato e o conclui.
      await hiredCheckbox.click();
      await expect(ds160).not.toHaveAttribute("data-gate-blocked", "true", {
        timeout: 10_000,
      });
      await expect(ds160Checkbox).toBeEnabled();
      await ds160Checkbox.click();
      await expect(ds160Checkbox).toBeChecked();

      // 2) Confirma que a fase saiu de Contrato (DS-160 done → próxima
      //    fase é Entrevista; o importante é estar PASSADA do contrato).
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      await expect
        .poll(() => readPhaseLabel(page), { timeout: 10_000 })
        .not.toMatch(/Contrato/i);
      if (vp.name === "mobile") {
        await page.keyboard.press("Escape");
      }

      // 3) Desmarca o contrato → drift inconsistente.
      await hiredCheckbox.click();
      await expect(hiredCheckbox).not.toBeChecked();

      // 4) Gate volta sobre o DS-160 já completo.
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true", {
        timeout: 10_000,
      });
      await expect(ds160.locator('[id^="gate-"]')).toBeVisible();
      // Checkbox permanece marcado (espelha o DB) mas agora `disabled`.
      await expect(ds160Checkbox).toBeChecked();
      await expect(ds160Checkbox).toBeDisabled();

      // 5) Jornada na sidebar/drawer cai de volta para Contrato.
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      await expect
        .poll(() => readPhaseLabel(page), { timeout: 10_000 })
        .toMatch(/Contrato/i);
      const phase = await readPhaseLabel(page);
      expect(phase, `fase: ${phase}`).not.toMatch(/DS-?160/i);
    });

    /* --------------------------------------------------------------------- */
    /* 11) CTAs avançadas: TODOS os passos consulares ficam disabled +       */
    /*     mostram o banner ANTES de qualquer tentativa de clique.           */
    /* --------------------------------------------------------------------- */

    test("com gate ativo, todos os passos consulares aparecem disabled com banner visível", async ({
      page,
    }) => {
      await gotoVisto(page);

      // Conjunto de "CTAs de avanço" da Jornada — todos os passos que
      // exigem contrato assinado. Itera por step_label estável.
      const gated: Array<[string, RegExp]> = [
        ["ds160", /Formul[áa]rio DS-160 preenchido e enviado/i],
        ["mrv_paid", /Taxa MRV paga \(US\$ 190\)/i],
        ["interview_done", /Entrevista consular realizada/i],
      ];

      for (const [stepKey, re] of gated) {
        const row = page.locator('[id^="step-"]').filter({ hasText: re }).first();
        await expect(row, `row ${stepKey} precisa existir`).toBeVisible();

        // (a) data-attr de bloqueio.
        await expect(row).toHaveAttribute("data-gate-blocked", "true");

        // (b) banner visível com explicação ANTES de qualquer clique.
        const banner = row.locator('[id^="gate-"]');
        await expect(banner).toBeVisible();
        await expect(banner).toContainText(/Oferta de trabalho aceita/i);

        // (c) checkbox `disabled` (CTA bloqueada).
        const cb = row.getByRole("checkbox", { name: /Marcar etapa:/i });
        await expect(cb).toBeDisabled();

        // (d) aria-describedby do checkbox aponta para o id do banner —
        //     a explicação é lida no foco, sem precisar clicar.
        const bannerId = await banner.getAttribute("id");
        expect(bannerId).toMatch(/^gate-/);
        await expect(cb).toHaveAttribute("aria-describedby", bannerId!);
      }

      // (e) Tentativa forçada de clique em DS-160 não progride.
      const ds160Checkbox = rowByStepKey(page, "ds160").getByRole("checkbox", {
        name: /Marcar etapa:/i,
      });
      await ds160Checkbox.click({ force: true }).catch(() => {});
      await expect(ds160Checkbox).not.toBeChecked();
    });

    /* --------------------------------------------------------------------- */
    /* 12) RELOAD após múltiplas mudanças: gate, fase e DS-160 disabled      */
    /*     continuam consistentes.                                           */
    /* --------------------------------------------------------------------- */

    test("reload após múltiplas mudanças (DS-160 ↔ contrato) mantém o gate consistente", async ({
      page,
      request,
    }) => {
      const t = session.session.access_token;

      // Sequência de mudanças (simula um usuário hesitante + drift de DB):
      //   contrato:false → contrato:true → ds160:true → contrato:false
      // Estado final esperado: DS-160 marcado, contrato NÃO assinado.
      await patchStep(request, t, "hired_by_employer", true);
      await patchStep(request, t, "ds160", true);
      await patchStep(request, t, "hired_by_employer", false);

      await gotoVisto(page);

      const ds160 = rowByStepKey(page, "ds160");
      const checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });

      // Sanidade antes do reload.
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true");
      await expect(checkbox).toBeChecked();
      await expect(checkbox).toBeDisabled();
      await expect(ds160.locator('[id^="gate-"]')).toBeVisible();

      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      const phaseBefore = await readPhaseLabel(page);
      expect(phaseBefore).toMatch(/Contrato/i);
      expect(phaseBefore).not.toMatch(/DS-?160/i);

      // Reload duro.
      await page.reload({ waitUntil: "commit" });
      await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });

      const ds160After = rowByStepKey(page, "ds160");
      const checkboxAfter = ds160After.getByRole("checkbox", {
        name: /Marcar etapa:/i,
      });
      const bannerAfter = ds160After.locator('[id^="gate-"]');

      await expect(ds160After).toHaveAttribute("data-gate-blocked", "true");
      await expect(checkboxAfter).toBeChecked();
      await expect(checkboxAfter).toBeDisabled();
      await expect(bannerAfter).toBeVisible();
      await expect(bannerAfter).toContainText(/Oferta de trabalho aceita/i);

      // aria-describedby continua amarrado e id é o mesmo (deriva do
      // item.id, persistente no DB).
      const bannerIdAfter = await bannerAfter.getAttribute("id");
      await expect(checkboxAfter).toHaveAttribute(
        "aria-describedby",
        bannerIdAfter!,
      );

      // Fase exibida na sidebar/drawer continua em Contrato.
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      const phaseAfter = await readPhaseLabel(page);
      expect(phaseAfter, `fase após reload: ${phaseAfter}`).toMatch(/Contrato/i);
      expect(phaseAfter).not.toMatch(/DS-?160/i);
    });
    /* --------------------------------------------------------------------- */
    /* 13) TECLADO: Tab até o DS-160 + Enter/Space não progride o gate       */
    /* --------------------------------------------------------------------- */

    test("Tab+Enter no checklist com gate ativo não conclui DS-160 e mantém o banner", async ({
      page,
    }) => {
      await gotoVisto(page);

      const ds160 = rowByStepKey(page, "ds160");
      const checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });
      const banner = ds160.locator('[id^="gate-"]');

      await expect(ds160).toHaveAttribute("data-gate-blocked", "true");
      await expect(banner).toBeVisible();

      // Foca o checkbox do DS-160 via API DOM (equivalente ao destino final
      // de uma sequência de Tab; evita varrer N elementos focáveis e
      // garante que estamos exercitando keyboard activation, não mouse).
      await checkbox.focus().catch(() => {});

      // Mesmo `disabled`, Radix mantém o nó focável em alguns navegadores;
      // pressionar Enter/Space NUNCA pode disparar o toggle.
      await page.keyboard.press("Enter").catch(() => {});
      await page.keyboard.press("Space").catch(() => {});

      // Sem progressão: checkbox segue não-marcado, banner segue visível,
      // gate segue ativo. Aguardamos brevemente para descartar um toggle
      // assíncrono espúrio (~250ms é folga suficiente para qualquer
      // setState/refetch propagar antes da asserção).
      await page.waitForTimeout(250);
      await expect(checkbox).not.toBeChecked();
      await expect(banner).toBeVisible();
      await expect(ds160).toHaveAttribute("data-gate-blocked", "true");

      // E a Jornada segue em Contrato — Tab/Enter não burlam o gate.
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      const phase = await readPhaseLabel(page);
      expect(phase, `fase: ${phase}`).toMatch(/Contrato/i);
      expect(phase).not.toMatch(/DS-?160/i);
    });

    /* --------------------------------------------------------------------- */
    /* 14) DEEP-LINK: abrir direto a âncora #step-<ds160> não burla o gate   */
    /* --------------------------------------------------------------------- */

    test("navegar via URL direta para a âncora do DS-160 mantém banner e disabled", async ({
      page,
      request,
    }) => {
      // Descobre o id real do item DS-160 via PostgREST (autenticado) para
      // montar a âncora deep-link `/app/visto#step-<id>`.
      const lookup = await request.get(
        `${SUPABASE_URL}/rest/v1/visa_checklist_items?step_key=eq.ds160&select=id`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${session.session.access_token}`,
          },
        },
      );
      expect(lookup.ok(), `lookup DS-160 falhou: ${lookup.status()}`).toBeTruthy();
      const rows = (await lookup.json()) as Array<{ id: string }>;
      expect(rows.length, "DS-160 deve existir para o usuário e2e").toBeGreaterThan(0);
      const ds160Id = rows[0]!.id;

      // Deep-link direto para a row — simula um link compartilhado que
      // tentaria "pular" o usuário para a fase consular sem passar pelo
      // contrato. A aplicação NÃO redireciona (a página é a mesma), mas o
      // gate precisa permanecer 100% efetivo.
      await page.goto(`/app/visto#step-${ds160Id}`, { waitUntil: "commit" });
      await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });

      const row = page.locator(`#step-${ds160Id}`);
      await expect(row, "âncora deve resolver para a row do DS-160").toBeVisible();

      // Gate ainda ativo apesar da navegação direta.
      await expect(row).toHaveAttribute("data-gate-blocked", "true");
      const banner = row.locator('[id^="gate-"]');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(/Oferta de trabalho aceita/i);
      await expect(row.getByRole("checkbox", { name: /Marcar etapa:/i })).toBeDisabled();

      // Sidebar/drawer não foi enganada pela URL — Jornada segue em Contrato.
      if (vp.name === "mobile") {
        await page.getByTestId("drawer-trigger").click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();
      }
      const phase = await readPhaseLabel(page);
      expect(phase, `fase: ${phase}`).not.toMatch(/DS-?160/i);
      expect(phase).toMatch(/Contrato/i);
    });

    /* --------------------------------------------------------------------- */
    /* 15) NETWORK: clique forçado em CTA bloqueada NÃO dispara PATCH        */
    /* --------------------------------------------------------------------- */

    test("clique forçado nas CTAs bloqueadas não dispara request de transição", async ({
      page,
    }) => {
      await gotoVisto(page);

      // Captura QUALQUER request a visa_checklist_items que não seja GET —
      // PATCH/POST/DELETE indicaria que o gate foi burlado.
      const transitionRequests: string[] = [];
      page.on("request", (req) => {
        const url = req.url();
        if (!/\/rest\/v1\/visa_checklist_items/.test(url)) return;
        const method = req.method();
        if (method === "GET" || method === "OPTIONS") return;
        transitionRequests.push(`${method} ${url}`);
      });

      const gatedKeys = ["ds160", "mrv_paid", "interview_done"] as const;
      for (const k of gatedKeys) {
        const row = rowByStepKey(page, k);
        await expect(row).toHaveAttribute("data-gate-blocked", "true");
        const cb = row.getByRole("checkbox", { name: /Marcar etapa:/i });

        // Sanidade: a CTA está marcada como disabled no DOM (aria + prop).
        await expect(cb).toBeDisabled();
        // Radix expõe `data-disabled` quando `disabled=true`.
        await expect(cb).toHaveAttribute("data-disabled", "");

        // Clique forçado (Playwright pula `pointer-events: none` e o
        // estado disabled). Mesmo assim a UI não pode disparar PATCH.
        await cb.click({ force: true }).catch(() => {});
      }

      // Folga para qualquer request assíncrono (toast/announce) propagar
      // antes de validarmos que NADA foi para o backend.
      await page.waitForTimeout(500);

      expect(
        transitionRequests,
        `nenhum request de transição esperado, recebidos: ${transitionRequests.join(" | ")}`,
      ).toEqual([]);

      // Estado da UI também não mudou.
      for (const k of gatedKeys) {
        const row = rowByStepKey(page, k);
        await expect(row).toHaveAttribute("data-gate-blocked", "true");
        await expect(
          row.getByRole("checkbox", { name: /Marcar etapa:/i }),
        ).not.toBeChecked();
      }
    });
  });
}

/* ----------------------------------------------------------------------- */
/* 16) FOCO: foco permanece no checkbox DS-160 durante tentativa de        */
/*     progressão e pode ser re-aplicado após reload.                      */
/* ----------------------------------------------------------------------- */

test.describe("Visa gate ↔ Jornada — foco persistente", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  let session: E2ESession;

  test.beforeEach(async ({ page, request }) => {
    session = await ensureSignedIn(page);
    await resetState(request, session);
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
    await page.evaluate(() => window.localStorage.setItem("vaiprala_tour_done_v1", "1"));
  });

  test.afterEach(async ({ request }) => {
    if (session) await resetState(request, session);
  });

  test("foco fica no checkbox DS-160 ao tentar progredir e pode voltar após reload", async ({
    page,
  }) => {
    await gotoVisto(page);

    const ds160 = rowByStepKey(page, "ds160");
    const checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });
    const banner = ds160.locator('[id^="gate-"]');

    await expect(banner).toBeVisible();
    await checkbox.focus();

    // Confirma que o foco está realmente no checkbox bloqueado.
    const isFocusedBefore = await checkbox.evaluate((el) => el === document.activeElement);
    expect(isFocusedBefore, "foco precisa começar no checkbox DS-160").toBe(true);

    // Tentativa de progressão via teclado.
    await page.keyboard.press("Enter").catch(() => {});
    await page.keyboard.press("Space").catch(() => {});
    await page.waitForTimeout(200);

    // Foco continua no checkbox (não pulou para outro elemento) — o banner
    // segue como descrição via aria-describedby, sem roubar o foco.
    const stillFocused = await checkbox.evaluate((el) => el === document.activeElement);
    expect(stillFocused, "foco deve permanecer no checkbox bloqueado").toBe(true);
    await expect(checkbox).not.toBeChecked();
    await expect(banner).toBeVisible();

    // Reload — foco do navegador é perdido (comportamento esperado), mas a
    // estrutura para devolver o foco precisa continuar válida: o checkbox
    // resolve, é focável e a relação aria-describedby aponta para o banner.
    await page.reload({ waitUntil: "commit" });
    await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });

    const ds160After = rowByStepKey(page, "ds160");
    const checkboxAfter = ds160After.getByRole("checkbox", { name: /Marcar etapa:/i });
    const bannerAfter = ds160After.locator('[id^="gate-"]');
    await expect(bannerAfter).toBeVisible();
    await expect(checkboxAfter).toBeDisabled();

    // Re-focar o checkbox funciona (não está com tabindex=-1 nem oculto).
    await checkboxAfter.focus();
    const refocused = await checkboxAfter.evaluate((el) => el === document.activeElement);
    expect(refocused, "checkbox deve ser focável de novo após reload").toBe(true);

    // E aria-describedby continua apontando para o banner com o mesmo id.
    const bannerId = await bannerAfter.getAttribute("id");
    await expect(checkboxAfter).toHaveAttribute("aria-describedby", bannerId!);
  });
});

/* ----------------------------------------------------------------------- */
/* 17) MOBILE: Tab/Enter no checklist com gate ativo não avança a Jornada  */
/* ----------------------------------------------------------------------- */

test.describe("Visa gate ↔ Jornada — teclado em mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  let session: E2ESession;

  test.beforeEach(async ({ page, request }) => {
    session = await ensureSignedIn(page);
    await resetState(request, session);
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
    await page.evaluate(() => window.localStorage.setItem("vaiprala_tour_done_v1", "1"));
  });

  test.afterEach(async ({ request }) => {
    if (session) await resetState(request, session);
  });

  test("Tab+Enter em mobile não avança a Jornada com gateBlocked ativo", async ({ page }) => {
    await gotoVisto(page);

    const ds160 = rowByStepKey(page, "ds160");
    const checkbox = ds160.getByRole("checkbox", { name: /Marcar etapa:/i });

    // Lê a fase inicial pelo drawer (mobile esconde o card da Jornada).
    await page.getByTestId("drawer-trigger").click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    const phaseBefore = await readPhaseLabel(page);
    expect(phaseBefore).toMatch(/Contrato/i);
    await page.keyboard.press("Escape");

    // Foca o checkbox bloqueado e tenta avançar via teclado.
    await checkbox.focus();
    await page.keyboard.press("Enter").catch(() => {});
    await page.keyboard.press("Space").catch(() => {});
    await page.waitForTimeout(250);

    // UI continua bloqueada — nada mudou.
    await expect(checkbox).not.toBeChecked();
    await expect(ds160).toHaveAttribute("data-gate-blocked", "true");
    await expect(ds160.locator('[id^="gate-"]')).toBeVisible();

    // Jornada no drawer NÃO transitou.
    await page.getByTestId("drawer-trigger").click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    const phaseAfter = await readPhaseLabel(page);
    expect(phaseAfter, `fase mobile: ${phaseAfter}`).toMatch(/Contrato/i);
    expect(phaseAfter).not.toMatch(/DS-?160/i);
  });
});

/* ----------------------------------------------------------------------- */
/* 18) MULTI-ABA: drift em uma aba propaga banner+disabled na outra        */
/* ----------------------------------------------------------------------- */

test.describe("Visa gate ↔ Jornada — sincronização entre abas", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  let session: E2ESession;

  test.beforeEach(async ({ page, request }) => {
    session = await ensureSignedIn(page);
    await resetState(request, session);
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
    await page.evaluate(() => window.localStorage.setItem("vaiprala_tour_done_v1", "1"));
  });

  test.afterEach(async ({ request }) => {
    if (session) await resetState(request, session);
  });

  test("drift em uma aba atualiza banner e CTAs disabled na outra após refetch", async ({
    page,
    context,
    request,
  }) => {
    // Aba A: estado limpo, contrato ASSINADO → DS-160 habilitado.
    await patchStep(request, session.session.access_token, "hired_by_employer", true);
    await gotoVisto(page);

    const ds160A = rowByStepKey(page, "ds160");
    await expect(ds160A).not.toHaveAttribute("data-gate-blocked", "true");
    const checkboxA = ds160A.getByRole("checkbox", { name: /Marcar etapa:/i });
    await expect(checkboxA).toBeEnabled();

    // Aba B: nova page no mesmo contexto (compartilha a sessão Supabase
    // via localStorage). Carrega /app/visto com o estado consistente.
    const pageB = await context.newPage();
    await pageB.evaluate(() =>
      window.localStorage.setItem("vaiprala_tour_done_v1", "1"),
    ).catch(() => {});
    await pageB.goto("/app/visto", { waitUntil: "commit" });
    await expect(pageB.getByTestId("app-main")).toBeVisible({ timeout: 15_000 });
    await expect(pageB.locator('[id^="step-"]').first()).toBeVisible({ timeout: 10_000 });

    const ds160B = rowByStepKey(pageB, "ds160");
    await expect(ds160B).not.toHaveAttribute("data-gate-blocked", "true");

    // Provoca o drift via PATCH (simula correção externa / outra sessão):
    // contrato volta a false. Aba A está focada; aba B fica em background.
    await patchStep(request, session.session.access_token, "hired_by_employer", false);

    // Trazer aba B para o primeiro plano dispara o `refetchOnWindowFocus`
    // default do TanStack Query — em alguns ambientes `bringToFront` não
    // emite `focus`/`visibilitychange` consistentemente, então também
    // disparamos os dois eventos manualmente como fallback determinístico.
    await pageB.bringToFront();
    await pageB.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Aba B precisa convergir para o estado bloqueado: banner visível,
    // checkbox disabled, data-gate-blocked="true".
    await expect(ds160B).toHaveAttribute("data-gate-blocked", "true", { timeout: 10_000 });
    const bannerB = ds160B.locator('[id^="gate-"]');
    await expect(bannerB).toBeVisible();
    await expect(bannerB).toContainText(/Oferta de trabalho aceita/i);
    await expect(
      ds160B.getByRole("checkbox", { name: /Marcar etapa:/i }),
    ).toBeDisabled();

    // Sanity check: aba A, ao voltar para o primeiro plano, também
    // refletirá o drift — consistência cross-tab nas duas direções.
    await page.bringToFront();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(ds160A).toHaveAttribute("data-gate-blocked", "true", { timeout: 10_000 });
    await expect(ds160A.locator('[id^="gate-"]')).toBeVisible();

    await pageB.close();
  });
});






