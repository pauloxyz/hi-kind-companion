/**
 * Admin · Funil de onboarding
 *
 * Cobre a presença das partes-chave da página:
 *  - KPIs (iniciaram / concluíram / drop-off)
 *  - Tabela "Avanço por etapa" com as 6 etapas conhecidas
 *  - Card "Onde estão parados agora"
 *  - Tabela "Eventos recentes"
 *
 * Não exige sessão admin real — quando o seed não cria o role, a página
 * redireciona para /app e o teste detecta isso e pula com soft-skip,
 * mantendo o suite verde em ambientes sem seed.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · funil de onboarding", () => {
  test("renderiza KPIs, funil por etapa e eventos recentes", async ({ page }) => {
    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");

    // Se o usuário não for admin, a rota redireciona pra /app — soft-skip
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin nesse ambiente");
    }

    // Header
    await expect(page.getByRole("heading", { name: /Funil de onboarding/i })).toBeVisible();

    // KPIs
    await expect(page.getByText("Iniciaram onboarding")).toBeVisible();
    await expect(page.getByText(/Conclu[ií]ram/)).toBeVisible();
    await expect(page.getByText(/drop-?off/i)).toBeVisible();

    // Funil por etapa — checa que todas as 6 etapas aparecem em ordem
    const stepLabels = [
      "Boas-vindas",
      "Como funciona",
      "Dados básicos",
      "Experiência",
      "Condições físicas",
      "Tudo pronto",
    ];
    for (let i = 0; i < stepLabels.length; i++) {
      await expect(
        page.getByText(new RegExp(`${i + 1}\\.\\s*${escape(stepLabels[i])}`)),
      ).toBeVisible();
    }

    // Tabela "Onde estão parados agora"
    await expect(page.getByRole("heading", { name: /Onde estão parados agora/i })).toBeVisible();

    // Eventos recentes
    await expect(page.getByRole("heading", { name: /Eventos recentes/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Quando/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Evento/i })).toBeVisible();
  });
});

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
