import { test, expect } from "@playwright/test";

test.describe("landing / botões e navegação", () => {
  test("todos os links internos retornam 200 e âncoras existem", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByTestId("landing-page")).toBeVisible();

    const hrefs = await page.$$eval("a[href]", (as) =>
      Array.from(new Set(as.map((a) => a.getAttribute("href")).filter(Boolean))) as string[],
    );

    for (const href of hrefs) {
      if (href!.startsWith("#")) {
        const id = href!.slice(1);
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      } else if (href!.startsWith("/")) {
        const res = await request.get(href!);
        expect.soft(res.status(), `GET ${href}`).toBeLessThan(400);
      }
    }
  });

  test("botão 'Criar perfil grátis' (header) → /auth?mode=signup", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Criar perfil grátis" }).first().click();
    await expect(page).toHaveURL(/\/auth\?mode=signup/);
    // Sem hydration mismatch: SSR já mostra "Comece sua jornada"
    await expect(page.getByRole("heading", { name: "Comece sua jornada" })).toBeVisible();
  });

  test("botão 'Entrar' (header) → /auth (modo login)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Entrar", exact: true }).first().click();
    await expect(page).toHaveURL(/\/auth(\?|$)/);
    await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  });

  test("CTA hero 'Criar meu perfil gratuito' → /auth?mode=signup", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Criar meu perfil gratuito/i }).first().click();
    await expect(page).toHaveURL(/\/auth\?mode=signup/);
  });

  test("nav 'Vagas' → /vagas-h2a", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Vagas", exact: true }).click();
    await expect(page).toHaveURL(/\/vagas-h2a/);
  });

  test("âncoras do header rolam para as seções", async ({ page }) => {
    await page.goto("/");
    for (const [name, id] of [
      ["Por que usar", "por-que"],
      ["Como funciona", "como-funciona"],
      ["FAQ", "faq"],
    ] as const) {
      await page.getByRole("link", { name }).first().click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport({ ratio: 0.05 });
    }
  });

  test("sem hydration mismatch no /auth?mode=signup", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error" && /hydration/i.test(m.text())) errors.push(m.text());
    });
    await page.goto("/auth?mode=signup", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Comece sua jornada" })).toBeVisible();
    expect(errors.filter((e) => /hydration/i.test(e))).toEqual([]);
  });
});
