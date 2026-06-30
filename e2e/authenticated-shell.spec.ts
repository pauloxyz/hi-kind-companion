import { test, expect, type Page } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

/**
 * Suite de navegação autenticada: percorre as rotas principais do AppShell
 * em DESKTOP (1280) e MOBILE (375) e valida três contratos visuais que já
 * regrediram no passado:
 *
 *  1. Cabeçalho — toda rota renderiza exatamente um <h1>, dentro de um
 *     <header> (PageHeader ou hero documentado). Sem <h1> solto.
 *  2. Indicador de rota ativa — o link da sidebar correspondente ganha
 *     aria-current="page" (e, no caso da nossa AppShell, a barra lateral
 *     `before:` fica visível porque a classe `before:opacity-100` é
 *     aplicada). Validamos via aria-current — é o sinal acessível e
 *     resiliente a refatorações visuais.
 *  3. Jornada H-2A — o card da sidebar expõe o wordmark VaiPraLá, o
 *     título "Jornada H-2A" e um progressbar com aria-label estável.
 *
 * No mobile a sidebar vive num drawer (`data-testid="drawer-trigger"`); o
 * teste abre o drawer antes de validar os itens da Jornada e os links.
 */

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 375, height: 780 },
] as const;

// Rotas que precisam estar acessíveis a qualquer usuário autenticado.
// `linkId` mapeia o `id={`nav-${labelKey}`}` aplicado em AppShell.renderItem,
// que é o âncora estável para confirmar o aria-current após navegar.
// Rotas estáveis para o usuário E2E (sem perfil completo): rotas que NÃO
// redirecionam em `useEffect` quando `onboarding_completed_at` é nulo.
// `/app` e `/app/visto` redirecionam para `/app/comecar` / `/auth` em
// fresh users — testamos esse comportamento separadamente.
const ROUTES = [
  { path: "/app/vagas",        linkId: "nav-jobs" },
  { path: "/app/candidaturas", linkId: "nav-applications" },
  { path: "/app/perfil",       linkId: "nav-profile" },
  { path: "/app/ingles",       linkId: "nav-english_course" },
] as const;

async function gotoAuthenticated(page: Page, path: string) {
  // O `_authenticated` layout pode disparar bounce client-side enquanto
  // hidrata a sessão (race entre localStorage write e Supabase init).
  // Tentamos até 2 vezes — se cair em /auth ou /, recarregamos.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(path, { waitUntil: "commit" });
    try {
      await expect(page.getByTestId("app-main")).toBeVisible({ timeout: 12_000 });
      return;
    } catch (err) {
      const url = page.url();
      if (attempt === 1) throw err;
      // Sessão ainda não estava pronta — recarrega e tenta novamente.
      // eslint-disable-next-line no-console
      console.warn(`[e2e] auth bounce em ${url} — retry ${attempt + 1}/2 para ${path}`);
    }
  }
}

async function openSidebarIfMobile(page: Page, viewportName: string) {
  if (viewportName !== "mobile") return;
  const trigger = page.getByTestId("drawer-trigger");
  await expect(trigger).toBeVisible({ timeout: 5_000 });
  // Idempotente: se já aberto, o gatilho não fica visível porque o drawer
  // o sobrepõe; nesse caso a checagem acima falharia e abortaríamos cedo.
  await trigger.click();
  // Espera o drawer abrir. O DOM tem duas <nav> com mesmo aria-label (a do
  // desktop fica `hidden lg:block` mas continua no DOM), então pegamos a
  // primeira visível dentro do dialog.
  await expect(page.locator('[role="dialog"] nav[aria-label="Navegação principal"]')).toBeVisible();
}


for (const vp of VIEWPORTS) {
  test.describe(`AppShell autenticado — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await ensureSignedIn(page);
      // Suprime o OnboardingTour: o modal full-screen intercepta cliques
      // do drawer no mobile e cobre o conteúdo no desktop até o usuário
      // navegar pelas 4 etapas. O componente lê localStorage no mount, então
      // basta marcar a flag antes da primeira navegação para AppShell.
      await page.evaluate(() => {
        window.localStorage.setItem("vaiprala_tour_done_v1", "1");
      });
    });

    test("Jornada H-2A: wordmark, título e progressbar visíveis", async ({ page }) => {
      await gotoAuthenticated(page, "/app");
      await openSidebarIfMobile(page, vp.name);

      // O DOM tem 2 sidebars (desktop em `hidden lg:block` + drawer mobile)
      // com o mesmo conteúdo. Filtramos por visibilidade para isolar a única
      // renderizada no breakpoint atual.
      const visible = { visible: true } as const;

      // Wordmark "VaiPraLá" — `Vai` + <span>PraLá</span> → textContent concatena.
      await expect(page.getByText(/VaiPraLá/).filter(visible).first()).toBeVisible();

      await expect(
        page.getByRole("heading", { name: /jornada\s*h-2a/i }).filter(visible).first(),
      ).toBeVisible();

      const progress = page
        .getByRole("progressbar", { name: /progresso da jornada h-2a/i })
        .filter(visible)
        .first();
      await expect(progress).toBeVisible();
      const valueNow = await progress.getAttribute("aria-valuenow");
      expect(Number(valueNow)).toBeGreaterThanOrEqual(0);
      expect(Number(valueNow)).toBeLessThanOrEqual(100);
    });

    for (const route of ROUTES) {
      test(`rota ${route.path} — cabeçalho único e link ativo`, async ({ page }) => {
        await gotoAuthenticated(page, route.path);

        // (1) Cabeçalho: o conteúdo da rota é validado via <main>.
        const main = page.getByTestId("app-main");

        await expect(main).toBeVisible();
        const pageH1s = main.locator("h1");
        // O conteúdo da rota pode renderizar lazy/skeleton; toleramos render
        // assíncrono dando um pequeno waitFor antes de contar.
        await expect(pageH1s.first()).toBeVisible({ timeout: 10_000 });
        const h1Count = await pageH1s.count();
        expect(h1Count, `rota ${route.path} renderizou ${h1Count} <h1> no <main>`).toBe(1);

        // O h1 está dentro de <header> (PageHeader ou hero exceção).
        const h1InHeader = main.locator("header h1");
        await expect(h1InHeader.first()).toBeVisible();

        // (2) Indicador de rota ativa: o link da sidebar correspondente
        //     ganha aria-current="page". No mobile, abre o drawer antes.
        //     O DOM tem 2 sidebars (id duplicado entre desktop/mobile);
        //     filtramos por `visible: true` para pegar a renderizada.
        await openSidebarIfMobile(page, vp.name);
        const link = page.locator(`#${route.linkId}`).filter({ visible: true }).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("aria-current", "page");

        // Conferência da barra `before:` via opacidade computada. O CSS é
        // aplicado por uma classe condicional do Tailwind (`before:opacity-100`
        // quando ativo) que às vezes leva um tick para refletir após a SPA
        // re-renderizar — usamos `expect.poll` para tolerar o transitório.
        await expect
          .poll(
            async () =>
              await link.evaluate(
                (el) => Number(window.getComputedStyle(el, "::before").opacity || 0),
              ),
            { timeout: 5_000 },
          )
          .toBeGreaterThan(0.5);
      });
    }

    test("o link da rota atual é o único item de seção ativo", async ({ page }) => {
      // O `<Link to="/app">` (logo + item dashboard) é setado como ativo pelo
      // próprio TanStack Router em qualquer subrota /app/* — comportamento
      // padrão do componente. Por isso filtramos apenas itens de seção
      // (`[id^="nav-"]` exceto `nav-dashboard`) ao validar exclusividade.
      await gotoAuthenticated(page, "/app/vagas");
      await openSidebarIfMobile(page, vp.name);

      const sectionActives = page
        .locator(
          'nav[aria-label="Navegação principal"] a[id^="nav-"][aria-current="page"]:not(#nav-dashboard)',
        )
        .filter({ visible: true });
      await expect(sectionActives).toHaveCount(1);
      await expect(sectionActives.first()).toHaveAttribute("id", "nav-jobs");
    });
  });
}
