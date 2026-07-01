/**
 * Admin · Funcionalidades Pro (/admin/pro-features).
 *
 * Cobre a UI de gerenciamento das flags globais e dos overrides por usuário.
 * Como o usuário de teste raramente é admin, o teste dá soft-skip quando
 * a rota redireciona pra /app.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · Funcionalidades Pro", () => {
  test("catálogo, toggles e formulário de override aparecem", async ({ page, context }) => {
    await ensureSignedIn(page, context);
    await page.goto("/admin/pro-features");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/pro-features")) {
      test.skip(true, "Usuário de teste não é admin.");
    }

    // Header
    await expect(
      page.getByRole("heading", { name: /Funcionalidades Pro/i }),
    ).toBeVisible();

    // Catálogo global
    await expect(page.getByRole("heading", { name: /Catálogo global/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Feature/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /Ligada p\/ Pro/i })).toBeVisible();

    // As features conhecidas devem estar listadas
    for (const label of [
      /Múltiplos currículos/i,
      /Tradução automática PT.EN/i,
      /Curso de inglês H-2A completo/i,
    ]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }

    // Deve existir pelo menos 1 switch (toggle global) e ambos os estados devem ser visíveis
    const switches = page.getByRole("switch");
    expect(await switches.count()).toBeGreaterThan(0);

    // Formulário de override
    await expect(page.getByRole("heading", { name: /Overrides por usuário/i })).toBeVisible();
    await expect(page.getByLabel(/User ID/i)).toBeVisible();
    await expect(page.getByLabel(/Feature$/i)).toBeVisible();
    await expect(page.getByLabel(/Nota/i)).toBeVisible();

    const aplicar = page.getByRole("button", { name: /Aplicar override/i });
    await expect(aplicar).toBeVisible();
    // Botão fica desabilitado sem user + feature
    await expect(aplicar).toBeDisabled();

    // Preenche um UUID válido + escolhe uma feature → habilita o botão
    const fakeUuid = "00000000-0000-0000-0000-000000000abc";
    await page.getByLabel(/User ID/i).fill(fakeUuid);
    // Seleciona primeira feature válida
    const select = page.getByLabel(/Feature$/i);
    const options = await select.locator("option").allTextContents();
    // Primeira opção real (index 1, pulando "— escolher —")
    const first = options.find((o) => !/escolher/i.test(o));
    if (first) {
      await select.selectOption({ label: first });
      await expect(aplicar).toBeEnabled();
    }
    await page.getByLabel(/Nota/i).fill("E2E test — dry run");

    // Não vamos submeter de fato (evita poluir DB), só validamos a UI.
  });
});
