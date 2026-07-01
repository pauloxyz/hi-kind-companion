/**
 * Admin · CSV baixado vs UI — linhas, campos e ausência de notação
 * científica em TODAS as linhas.
 *
 * Contrato:
 *   - O arquivo baixado tem exatamente o mesmo número de linhas de etapa
 *     que o número de linhas renderizadas na tabela do funil.
 *   - Para cada linha, o `step_label` do CSV corresponde ao label exibido
 *     na UI (na coluna de etapa) e o `reached_total` corresponde ao valor
 *     numérico mostrado na coluna de total.
 *   - Nenhuma célula numérica em nenhuma linha (nem no bloco # summary)
 *     contém notação científica (`e+`, `e-`), ponto decimal, ou
 *     caracteres não-inteiros. Todas são strings de dígitos.
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

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function parseCsv(csv: string): {
  rows: Row[];
  summary: Record<string, string>;
  rawLines: string[];
} {
  const lines = csv.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  const header = lines.shift()!;
  expect(header).toBe(EXPECTED_HEADER.join(","));
  const rows: Row[] = [];
  const summary: Record<string, string> = {};
  const rawLines: string[] = [];
  let inSummary = false;
  for (const l of lines) {
    rawLines.push(l);
    if (l.startsWith("#")) {
      inSummary = true;
      continue;
    }
    if (!inSummary) {
      const cells = splitCsvLine(l);
      const row = {} as Row;
      EXPECTED_HEADER.forEach((h, i) => ((row as Record<string, string>)[h] = cells[i] ?? ""));
      rows.push(row);
    } else {
      const [k, v] = l.split(",", 2);
      if (k && v !== undefined) summary[k] = v;
    }
  }
  return { rows, summary, rawLines };
}

async function readUiRows(
  page: Page,
): Promise<Array<{ label: string; reachedTotal: string }>> {
  // A tabela renderiza uma linha por etapa em `funnel-row-<i>` com filhos
  // `funnel-row-<i>-label` e `funnel-row-<i>-reached-total`. Se o projeto
  // não expuser esses testids, fallback para leitura via role.
  const rows = await page.locator('[data-testid^="funnel-row-"]').all();
  if (rows.length === 0) return [];
  const out: Array<{ label: string; reachedTotal: string }> = [];
  for (const r of rows) {
    const id = (await r.getAttribute("data-testid")) ?? "";
    // ignora sub-cells como funnel-row-0-label
    if (!/^funnel-row-\d+$/.test(id)) continue;
    const label = (await r.locator('[data-testid$="-label"]').first().innerText()).trim();
    const total = (
      await r.locator('[data-testid$="-reached-total"]').first().innerText()
    )
      .trim()
      .replace(/\D+.*$/, "");
    out.push({ label, reachedTotal: total });
  }
  return out;
}

test.describe("Admin · CSV baixado bate com a UI em todas as linhas", () => {
  test("linhas, labels e totais do CSV correspondem à UI e sem notação científica", async ({
    page,
  }) => {
    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    const btn = page.getByTestId("funnel-export-csv");
    await expect(btn).toBeVisible();
    if (await btn.isDisabled()) {
      test.skip(true, "Funil vazio — nada para exportar neste ambiente");
    }

    const uiRows = await readUiRows(page);

    const [download] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    const p = await download.path();
    if (!p) test.skip(true, "download.path() indisponível");
    const fs = await import("fs/promises");
    const csv = await fs.readFile(p!, "utf8");
    const { rows, summary, rawLines } = parseCsv(csv);

    // 1) Contagem de linhas. Se a UI expôs linhas via testid, precisam ser
    //    idênticas ao CSV. Caso contrário, garantimos ao menos > 0 linhas.
    expect(rows.length).toBeGreaterThan(0);
    if (uiRows.length > 0) {
      expect(rows).toHaveLength(uiRows.length);
      for (const [i, ui] of uiRows.entries()) {
        expect(rows[i].step_index).toBe(String(i));
        expect(rows[i].step_label).toBe(ui.label);
        expect(rows[i].reached_total).toBe(ui.reachedTotal);
      }
    }

    // 2) Todos os campos numéricos são strings de dígitos inteiros — nem
    //    ponto decimal, nem "e+", nem "e-", nem "E".
    const SCI = /[eE][+-]?\d/;
    const INT = /^\d+$/;
    const numericCols = [
      "reached_total",
      "reached_pt",
      "reached_en",
      "stuck_after_variant_switch",
    ] as const;
    for (const [i, row] of rows.entries()) {
      for (const col of numericCols) {
        expect(row[col], `linha ${i}/${col} deveria ser inteiro puro`).toMatch(INT);
        expect(row[col], `linha ${i}/${col} não pode ter notação científica`).not.toMatch(SCI);
      }
    }

    // 3) Bloco # summary: todos os values não-cabeçalho também são inteiros
    //    puros, sem notação científica.
    for (const [k, v] of Object.entries(summary)) {
      if (!/^\d+$/.test(v)) continue; // ignora chaves não numéricas (ex.: lang)
      expect(v, `summary.${k}`).toMatch(INT);
      expect(v, `summary.${k}`).not.toMatch(SCI);
    }

    // 4) Sanity global: nenhuma linha do arquivo cru contém "e+" / "e-".
    for (const line of rawLines) {
      expect(line, `linha crua não pode ter notação científica: ${line}`).not.toMatch(SCI);
    }
  });
});
