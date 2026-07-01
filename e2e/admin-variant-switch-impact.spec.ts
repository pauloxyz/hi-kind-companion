/**
 * Admin · impact card de troca de variante + botão exportar CSV.
 *
 * Não força seeding: se o admin de teste não tiver dados, os contadores
 * ficam em 0 e a tabela de "onde travaram" pode não aparecer — validamos
 * a estrutura do card (KPIs + botão CSV) que existe sempre.
 * Soft-skip quando o usuário não é admin (rota redireciona pra /app).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

test.describe("Admin · impacto de troca de variante e exportação CSV", () => {
  test("KPIs completed/stuck presentes e botão de exportar dispara download", async ({ page }) => {
    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin nesse ambiente");
    }

    // Card e KPIs
    const card = page.getByTestId("variant-switches");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("vs-completed-after")).toBeVisible();
    await expect(page.getByTestId("vs-stuck-total")).toBeVisible();
    for (const tid of ["vs-completed-after", "vs-stuck-total", "vs-events", "vs-users"]) {
      const txt = (await page.getByTestId(tid).innerText()).trim();
      // Sempre inteiro >= 0
      expect(txt).toMatch(/^\d+$/);
      expect(Number(txt)).toBeGreaterThanOrEqual(0);
    }

    // Tabela "onde travaram após trocar" só aparece se houver dados —
    // quando aparece, cada linha deve ter etapa numerada + count numérico.
    const stuckTable = page.getByTestId("vs-stuck-table");
    if (await stuckTable.isVisible().catch(() => false)) {
      const rows = stuckTable.locator("tbody tr");
      const n = await rows.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const cells = rows.nth(i).locator("td");
        await expect(cells.nth(0)).toContainText(/^\d+\.\s+/);
        const val = (await cells.nth(1).innerText()).trim();
        expect(Number(val)).toBeGreaterThan(0);
      }
    }

    // Exportação CSV: valida download com header e sumário esperados
    const btn = page.getByTestId("funnel-export-csv");
    await expect(btn).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      btn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^onboarding-funnel-(pt|en|es)-\d{4}-\d{2}-\d{2}\.csv$/);
    const path = await download.path();
    if (path) {
      const fs = await import("fs/promises");
      const csv = await fs.readFile(path, "utf8");
      expect(csv.split("\n")[0]).toBe(
        "step_index,step_label,reached_total,reached_pt,reached_en,stuck_after_variant_switch",
      );
      expect(csv).toContain("# summary");
      expect(csv).toContain("completed_after_variant_switch,");
      expect(csv).toContain("toggles_to_pt,");
      expect(csv).toContain("toggles_to_en,");
    }
  });
});
