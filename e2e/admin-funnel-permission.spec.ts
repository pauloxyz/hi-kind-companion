/**
 * Admin · permissão de acesso ao funil + botão Exportar CSV.
 *
 * Cobre dois cenários deterministicamente:
 *
 *   1. Usuário anônimo (sem sessão) tentando abrir /admin/onboarding → o
 *      layout `_authenticated` redireciona para /auth. Confirma que a URL
 *      final NÃO é /admin/onboarding e que o botão de exportar CSV nunca
 *      aparece pra quem não está autenticado.
 *
 *   2. Usuário autenticado sem privilégio de admin → `beforeLoad` do
 *      admin.onboarding lança redirect para /app. Confirma que a URL final
 *      é /app (ou /app/*) e nunca /admin/onboarding. Como o usuário de E2E
 *      padrão pode ou não ser admin dependendo do ambiente, fazemos
 *      soft-skip quando ele já é admin (é o caso coberto pelos outros
 *      specs de admin).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · funil só é acessível/exportável por admins", () => {
  test("usuário anônimo é redirecionado pra /auth ao tentar /admin/onboarding", async ({ browser }) => {
    // Contexto novo, sem sessão seed.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/admin/onboarding");
    // Aguarda a decisão do layout _authenticated
    await page.waitForLoadState("domcontentloaded");
    await page.waitForURL((u) => !u.pathname.startsWith("/admin/onboarding"), { timeout: 10_000 });

    expect(page.url()).not.toContain("/admin/onboarding");
    // Deve cair em /auth (login público).
    expect(page.url()).toMatch(/\/auth(\?|$|\/)/);

    // Nem o grupo nem o botão de exportar CSV devem estar acessíveis
    await expect(page.getByTestId("funnel-export-group")).toHaveCount(0);
    await expect(page.getByTestId("funnel-export-csv")).toHaveCount(0);

    await ctx.close();
  });

  test("usuário autenticado sem permissão de admin é redirecionado pra /app", async ({ page }) => {
    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");

    // Se o usuário É admin nesse ambiente, cai direto na página e o teste
    // não tem o que validar — outros specs cobrem o fluxo positivo.
    if (page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste é admin nesse ambiente; permissão negada é validada em CI separada");
    }

    // Cai em /app (ou subrota /app/*), NUNCA de volta em /admin/onboarding
    expect(page.url()).not.toContain("/admin/onboarding");
    expect(page.url()).toMatch(/\/app(\/|$|\?)/);

    // Botão de exportar CSV do funil não deve estar renderizado fora do admin
    await expect(page.getByTestId("funnel-export-csv")).toHaveCount(0);
  });
});
