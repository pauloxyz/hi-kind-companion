/**
 * Admin · valida que cada linha do CSV tem todas as colunas em snake_case
 * e que os números batem com os KPIs renderizados na página.
 *
 * Soft-skip quando: usuário não é admin OU o ambiente está com funil zerado
 * (nesse caso o botão fica desabilitado e o CSV cobre outro cenário).
 */
import { test, expect, type Page } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

const EXPECTED_HEADER = [
  "step_index",
  "step_label",
  "reached_total",
  "reached_pt",
  "reached_en",
  "stuck_after_variant_switch",
] as const;

type Row = Record<(typeof EXPECTED_HEADER)[number], string>;

function parseCsv(csv: string): { rows: Row[]; summary: Record<string, string> } {
  // separa etapas do bloco `# summary`
  const lines = csv.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  const header = lines.shift()!;
  expect(header).toBe(EXPECTED_HEADER.join(","));
  const rows: Row[] = [];
  const summary: Record<string, string> = {};
  let inSummary = false;
  for (const l of lines) {
    if (l.startsWith("#")) {
      inSummary = true;
      continue;
    }
    if (!inSummary) {
      // parser simples de CSV c/ suporte a campos entre aspas
      const cells: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === '"') {
          if (inQ && l[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQ = !inQ;
          }
        } else if (ch === "," && !inQ) {
          cells.push(cur);
          cur = "";
        } else cur += ch;
      }
      cells.push(cur);
      const row = {} as Row;
      EXPECTED_HEADER.forEach((h, i) => ((row as Record<string, string>)[h] = cells[i] ?? ""));
      rows.push(row);
    } else {
      const [k, v] = l.split(",", 2);
      if (k && v !== undefined) summary[k] = v;
    }
  }
  return { rows, summary };
}

async function textInt(page: Page, testId: string): Promise<number> {
  const raw = (await page.getByTestId(testId).innerText()).trim().replace(/\D+.*$/, "");
  const n = Number(raw);
  expect(Number.isFinite(n)).toBe(true);
  return n;
}

test.describe("Admin · CSV do funil bate com KPIs exibidos", () => {
  test("todas as colunas snake_case + números batem com KPIs", async ({ page }) => {
    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin nesse ambiente");
    }

    const btn = page.getByTestId("funnel-export-csv");
    await expect(btn).toBeVisible();
    if (await btn.isDisabled()) {
      test.skip(true, "Funil vazio — cobertura em admin-funnel-empty-error.spec.ts");
    }

    const [download] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    const p = await download.path();
    if (!p) test.skip(true, "download.path() indisponível nesse ambiente");
    const fs = await import("fs/promises");
    const csv = await fs.readFile(p!, "utf8");
    const { rows, summary } = parseCsv(csv);

    // Estrutura: 6 etapas, cada uma com as 6 colunas preenchidas com valores válidos.
    expect(rows).toHaveLength(6);
    for (const [i, row] of rows.entries()) {
      // snake_case garantido pelo header check; validamos tipos por coluna
      expect(row.step_index).toBe(String(i));
      expect(row.step_label.length).toBeGreaterThan(0);
      for (const col of ["reached_total", "reached_pt", "reached_en", "stuck_after_variant_switch"] as const) {
        expect(row[col]).toMatch(/^\d+$/);
        expect(Number(row[col])).toBeGreaterThanOrEqual(0);
      }
      // consistência: PT + EN não podem exceder reached_total (usuários únicos
      // podem estar em ambos os idiomas em diferentes momentos, então só
      // garantimos >= 0 e <= reached_total * 2).
      const pt = Number(row.reached_pt);
      const en = Number(row.reached_en);
      const tot = Number(row.reached_total);
      expect(pt + en).toBeGreaterThanOrEqual(0);
      expect(Math.max(pt, en)).toBeLessThanOrEqual(tot);
    }

    // KPI: Total travados após trocar == soma da coluna stuck_after_variant_switch
    const stuckTotalKpi = await textInt(page, "vs-stuck-total");
    const stuckSum = rows.reduce((s, r) => s + Number(r.stuck_after_variant_switch), 0);
    expect(stuckSum).toBe(stuckTotalKpi);

    // KPI: Concluíram após trocar == summary completed_after_variant_switch
    const completedAfterKpi = await textInt(page, "vs-completed-after");
    expect(Number(summary.completed_after_variant_switch ?? "0")).toBe(completedAfterKpi);

    // Sumário PT/EN aparece nos cards lang-summary-*: os toggles_to devem ser
    // idênticos ao número exibido na linha "Toggles → PT/EN".
    const ptCard = (await page.getByTestId("lang-summary-pt").innerText()).replace(/\s+/g, " ");
    const enCard = (await page.getByTestId("lang-summary-en").innerText()).replace(/\s+/g, " ");
    expect(ptCard).toContain(`Toggles → PT: ${summary.toggles_to_pt ?? "0"}`);
    expect(enCard).toContain(`Toggles → EN: ${summary.toggles_to_en ?? "0"}`);
    expect(ptCard).toContain(`Conclusões: ${summary.completed_pt ?? "0"}`);
    expect(enCard).toContain(`Conclusões: ${summary.completed_en ?? "0"}`);
  });
});
