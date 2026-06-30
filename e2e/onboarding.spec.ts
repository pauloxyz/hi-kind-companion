import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

/**
 * E2E para o fluxo de onboarding (/app/comecar).
 *
 * Valida:
 *  - Validação por tela (idade, UF, WhatsApp) com mensagens claras
 *  - Geração do link e mensagem do WhatsApp com os dados do perfil
 *  - Exibição correta da tela de confirmação pós envio
 *
 * Esses testes assumem que `ensureSignedIn` gera/loga um usuário de teste
 * e que `/app/comecar` permite refazer o onboarding (o passo é hidratado
 * do banco e o usuário pode retroceder).
 */

test.describe("Onboarding", () => {
  test.beforeEach(async ({ page, context }) => {
    await ensureSignedIn(page, context);
  });

  test("valida cidade, idade e WhatsApp antes de avançar", async ({ page }) => {
    await page.goto("/app/comecar");

    // Pula tela 0 (Boas-vindas) e 1 (Como funciona)
    const next1 = page.getByRole("button", { name: /Sim, continuar|Começar/i }).first();
    if (await next1.isVisible().catch(() => false)) await next1.click();
    const next2 = page.getByRole("button", { name: /Começar|Continuar/i }).first();
    if (await next2.isVisible().catch(() => false)) await next2.click();

    // Tela 2 (Dados básicos) — preenche inválido propositalmente
    await page.getByLabel(/Nome completo/i).fill("X"); // 1 letra, sem sobrenome
    await page.getByLabel(/Idade/i).fill("12");        // < 16
    await page.getByLabel(/Cidade/i).fill("");         // vazia
    await page.getByLabel(/Estado.*UF/i).fill("MGG");  // 3 letras (input limita a 2 → MG, mas se passar)
    await page.getByLabel(/WhatsApp/i).fill("12345");  // curto

    // Botão deve estar desabilitado
    const continuar = page.getByRole("button", { name: /Continuar/i });
    await expect(continuar).toBeDisabled();

    // E os erros devem aparecer ao perder o foco
    await page.getByLabel(/Idade/i).blur();
    await expect(page.getByText(/Mínimo de 16 anos/i)).toBeVisible();

    await page.getByLabel(/WhatsApp/i).blur();
    await expect(page.getByText(/Número curto demais/i)).toBeVisible();

    // Corrige tudo
    await page.getByLabel(/Nome completo/i).fill("João da Silva");
    await page.getByLabel(/Idade/i).fill("32");
    await page.getByLabel(/Cidade/i).fill("Patos de Minas");
    await page.getByLabel(/Estado.*UF/i).fill("MG");
    await page.getByLabel(/WhatsApp/i).fill("11987654321");

    // A máscara deve formatar o número
    await expect(page.getByLabel(/WhatsApp/i)).toHaveValue(/\(11\)\s?9\s?8765-4321|\(11\)\s?98765-4321/);

    // Agora deve permitir continuar
    await expect(continuar).toBeEnabled();
  });

  test("gera link e mensagem do WhatsApp e mostra a tela de confirmação", async ({ page }) => {
    await page.goto("/app/comecar");

    // Atalho: se já estiver na tela final, valida direto. Senão, avança rapidão.
    const enviarBtn = page.getByRole("button", { name: /Enviar via WhatsApp/i });

    // Avança até o fim quando necessário
    for (let i = 0; i < 8 && !(await enviarBtn.isVisible().catch(() => false)); i++) {
      const next = page
        .getByRole("button", { name: /Sim, continuar|Começar|Continuar|Finalizar perfil|Pular/i })
        .first();
      if (await next.isVisible().catch(() => false)) {
        if (await next.isEnabled()) {
          await next.click();
          await page.waitForTimeout(400);
        } else {
          // se está no Step2 com campos vazios, preenche
          if (await page.getByLabel(/Nome completo/i).isVisible().catch(() => false)) {
            await page.getByLabel(/Nome completo/i).fill("João da Silva");
            await page.getByLabel(/Idade/i).fill("32");
            await page.getByLabel(/Cidade/i).fill("Patos de Minas");
            await page.getByLabel(/Estado.*UF/i).fill("MG");
            await page.getByLabel(/WhatsApp/i).fill("11987654321");
            await next.click();
            await page.waitForTimeout(400);
          } else {
            break;
          }
        }
      }
    }

    // Tela final: deve mostrar a mensagem pré-gerada com o link
    await expect(enviarBtn).toBeVisible({ timeout: 10_000 });

    // O preview de mensagem deve conter o link público do perfil
    const previewText = page.locator("text=/Meu perfil completo: https?:\\/\\//");
    await expect(previewText).toBeVisible();

    // O href do botão deve apontar para wa.me com o texto encodado
    const waLink = page.locator('a[href*="wa.me/?text="]').first();
    await expect(waLink).toBeVisible();
    const href = await waLink.getAttribute("href");
    expect(href).toMatch(/wa\.me\/\?text=/);
    expect(decodeURIComponent(href!)).toContain("Meu perfil completo:");

    // Clica em Enviar — deve abrir nova aba (target=_blank) e mostrar tela de confirmação
    await enviarBtn.click();

    // Tela de confirmação
    await expect(page.getByText(/WhatsApp aberto/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /Copiar link do perfil/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Voltar e editar meu perfil/i })).toBeVisible();
  });
});
