import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

/**
 * E2E do onboarding: se o usuário ainda não completou, valida o passo 1/5,
 * o stepper e a troca de idioma no AppShell (PT/EN/ES). Se já completou,
 * valida que /app/comecar redireciona para /app/perfil.
 */
test.describe("onboarding /app/comecar", () => {
  test("carrega onboarding ou redireciona, stepper e i18n funcionam", async ({ page }) => {
    await ensureSignedIn(page);
    await page.goto("/app/comecar");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("app-shell")).toBeVisible();
    const url = page.url();

    if (url.includes("/app/comecar")) {
      // Fluxo ativo: valida progresso "Passo 1 de 6" e stepper visível
      await expect(page.getByText(/Passo\s+\d+\s+de\s+\d+/i)).toBeVisible();
      // Barra de progresso do onboarding
      const progress = page.getByText(/Passo 1 de/i);
      await expect(progress).toBeVisible();
    } else {
      // Onboarding já concluído — deve cair no perfil
      await expect(page).toHaveURL(/\/app\/(perfil|$)/);
    }

    // Troca de idioma via radiogroup "Idioma" no AppShell (visível em desktop)
    // Se estiver em mobile drawer, abre-o primeiro
    const drawerTrigger = page.getByTestId("drawer-trigger");
    if (await drawerTrigger.isVisible().catch(() => false)) {
      await drawerTrigger.click();
    }

    const langGroup = page.getByRole("radiogroup", { name: "Idioma" }).first();
    await expect(langGroup).toBeVisible();

    for (const lang of ["PT", "EN", "ES"]) {
      const btn = langGroup.getByRole("radio", { name: new RegExp(`Idioma ${lang}`, "i") });
      await expect(btn).toBeVisible();
      await btn.click();
      await expect(btn).toHaveAttribute("aria-checked", "true");
    }
    // Volta pra PT ao final para não afetar próximos testes
    await langGroup.getByRole("radio", { name: /Idioma PT/i }).click();
  });
});
