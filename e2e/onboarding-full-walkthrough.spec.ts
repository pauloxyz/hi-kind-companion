/**
 * Full onboarding walkthrough: cria um usuário limpo, entra em /app/comecar
 * no passo 0 e caminha os 6 passos até "Tudo pronto", validando o conteúdo
 * de cada tela e o avanço do stepper. Ao final, valida que retornar a
 * /app/comecar redireciona para /app/perfil (onboarding concluído).
 *
 * Requer `email auto-confirm` habilitado — senão o helper de fresh user
 * lança com instruções.
 */
import { test, expect } from "@playwright/test";
import { signInFreshUser } from "./_helpers/auth";

test.describe("Onboarding · walkthrough completo", () => {
  test("6 passos até conclusão e redireciona pra /app/perfil", async ({ page }) => {
    let fresh;
    try {
      fresh = await signInFreshUser(page);
    } catch (e) {
      test.skip(true, `fresh user indisponível: ${(e as Error).message}`);
      return;
    }
    expect(fresh.email).toContain("@vplusa.test");

    await page.goto("/app/comecar");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/app\/comecar/);

    // Progresso inicial: Passo 1 de 6
    await expect(page.getByText(/Passo\s+1\s+de\s+6/i)).toBeVisible();

    // Step 0 — Boas-vindas
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/agro dos EUA/i);
    await page.getByRole("button", { name: /Sim, continuar/i }).click();

    // Step 1 — Como funciona
    await expect(page.getByRole("heading", { name: /Como vai funcionar/i })).toBeVisible();
    await expect(page.getByText(/Passo\s+2\s+de\s+6/i)).toBeVisible();
    await page.getByRole("button", { name: /^Começar/i }).click();

    // Step 2 — Dados básicos
    await expect(page.getByRole("heading", { name: /Seus dados básicos/i })).toBeVisible();
    await expect(page.getByText(/Passo\s+3\s+de\s+6/i)).toBeVisible();
    await page.getByLabel(/Nome completo/i).fill("Playwright Tester");
    await page.getByLabel(/^Idade$/i).fill("32");
    await page.getByLabel(/WhatsApp/i).fill("11900000000");
    await page.getByLabel(/^Cidade$/i).fill("Patos de Minas");
    await page.getByLabel(/Estado \(UF\)/i).fill("MG");
    await page.getByRole("button", { name: /Continuar/i }).click();

    // Step 3 — Experiência
    await expect(page.getByRole("heading", { name: /experiência no campo/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Passo\s+4\s+de\s+6/i)).toBeVisible();
    // Marca pelo menos duas opções
    const expOptions = page.locator('button[aria-pressed]');
    const expCount = await expOptions.count();
    expect(expCount).toBeGreaterThan(0);
    await expOptions.nth(0).click();
    await expOptions.nth(Math.min(1, expCount - 1)).click();
    await page.getByRole("button", { name: /^Continuar$/i }).click();

    // Step 4 — Condições físicas
    await expect(page.getByRole("heading", { name: /Condições físicas/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Passo\s+5\s+de\s+6/i)).toBeVisible();
    const physOptions = page.locator('button[aria-pressed]');
    await physOptions.nth(0).click();
    await page.getByRole("button", { name: /Finalizar perfil/i }).click();

    // Step 5 — Tudo pronto
    await expect(page.getByText(/Passo\s+6\s+de\s+6/i)).toBeVisible({ timeout: 15_000 });
    // Página deve exibir o link WhatsApp da apresentação
    await expect(page.getByTestId("onb-wa-message")).toBeVisible();
    await expect(page.getByTestId("onb-wa-link")).toBeVisible();

    // Voltar em /app/comecar após conclusão deve redirecionar pra /app/perfil
    // (o Step5Done grava onboarding_completed_at ao renderizar).
    await page.waitForTimeout(1500);
    await page.goto("/app/comecar");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/app\/perfil/);
  });
});
