/**
 * Switch active variant mid-onboarding (Step 5 "pronto") and verify:
 *  - the WhatsApp message text updates immediately with new job_title/summary/skills
 *  - the progress does NOT reset (still on Passo 6/6)
 *
 * Requires Pro + multiple_resumes feature. Soft-skips otherwise.
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Onboarding · troca de variante ativa em Step 5", () => {
  test("mudar variante ativa muda mensagem WA sem resetar progresso", async ({ page }) => {
    await ensureSignedIn(page);
    await page.goto("/app/comecar");
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/app/comecar")) test.skip(true, "onboarding indisponível");

    const select = page.getByTestId("onb-variant-select");
    if (!(await select.isVisible().catch(() => false))) {
      test.skip(true, "Sem multi-cv (usuário Free).");
    }
    const wa = page.getByTestId("onb-wa-message");
    await expect(wa).toBeVisible();

    const values = await select.locator("option").evaluateAll(
      (els) => (els as HTMLOptionElement[]).map((e) => e.value),
    );
    const realVariants = values.filter((v) => v.length > 0);
    if (realVariants.length < 2) test.skip(true, "Precisa de pelo menos 2 variantes salvas.");

    // Progresso atual antes da troca
    await expect(page.getByText(/Passo\s+6\s+de\s+6/i)).toBeVisible();

    const first = (await wa.innerText()).trim();
    await select.selectOption(realVariants[0]);
    await expect.poll(async () => (await wa.innerText()).trim()).not.toBe(first);

    const afterA = (await wa.innerText()).trim();
    await select.selectOption(realVariants[1]);
    await expect.poll(async () => (await wa.innerText()).trim()).not.toBe(afterA);

    // Progresso segue igual — não voltou pro início
    await expect(page.getByText(/Passo\s+6\s+de\s+6/i)).toBeVisible();

    // WA link mudou junto com o texto (query encoded)
    const link = page.getByTestId("onb-wa-link");
    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();
    expect(decodeURIComponent(href!.split("text=")[1] ?? "")).toContain((await wa.innerText()).trim().split("\n")[0]);
  });
});
