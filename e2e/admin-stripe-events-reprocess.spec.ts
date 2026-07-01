/**
 * Admin · Stripe Events — reprocess flows (E2E autenticado)
 *
 * Cobertura:
 *   1. Modal individual: cancelar não dispara; confirmar dispara + toast.
 *   2. Link do stripe_event_id: navega para a aba Eventos com q/tab aplicados.
 *   3. Lote "Reprocessar filtrados": panel de progresso + toast com texto exato.
 *   4. Retentar falhas: atualiza panel, botão fica busy, toast final com texto exato.
 *   5. Bloqueio durante lote: botão de reprocessar individual e link do event_id
 *      ficam desabilitados/aria-busy enquanto o batch está pending.
 *   6. Export CSV/JSON do log filtrado: valida download e conteúdo == filtro atual.
 *   7. Restauração de URL (q/st/et/tab/p e l_oc/l_p/l_ps): compartilhar link e voltar
 *      renderiza a aba/filtros/paginação corretos.
 *
 * Ambiente sem admin ou sem linhas no log → soft-skip (mantém suite verde).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

const ROUTE = "/admin/stripe-events";

// Padrões dos toasts (mesmo texto que o app emite via sonner)
const T_OK_BATCH        = /^Lote reprocessado: \d+\/\d+ OK$/;
const T_PARTIAL_BATCH   = /^Lote parcial: \d+ OK · \d+ falharam de \d+$/;
const T_EMPTY_BATCH     = /^Nenhum evento (com status=error nos filtros atuais\.|encontrado para os filtros do log\.)$/;
const T_ERR_BATCH       = /Falha no reprocessamento em lote/;

const T_OK_RETRY        = /^Falhas reprocessadas: \d+\/\d+ OK$/;
const T_PARTIAL_RETRY   = /^Retentativa parcial: \d+ OK · \d+ falharam$/;
const T_ERR_RETRY       = /Falha ao retentar as falhas/;

const T_OK_ROW          = /^Reprocessado evt_[A-Za-z0-9]+: /;
const T_ERR_ROW         = /Falha ao reprocessar/;

const T_OK_EXPORT_CSV   = /^CSV exportado \(\d+ registros\)$/;
const T_OK_EXPORT_JSON  = /^JSON exportado \(\d+ registros\)$/;

/** Pega o toast mais recente e devolve seu texto. */
async function readLastToast(page: Page, timeout = 20_000): Promise<string> {
  const toast = page.locator("[data-sonner-toast]").last();
  await expect(toast).toBeVisible({ timeout });
  return (await toast.innerText()).trim();
}

async function expectToastMatchingAny(page: Page, patterns: RegExp[], timeout = 20_000) {
  const text = await readLastToast(page, timeout);
  const ok = patterns.some((p) => p.test(text));
  expect(ok, `Toast "${text}" não bateu com nenhum padrão ${patterns.map((p) => p.source).join(" | ")}`).toBe(true);
  return text;
}

async function gotoLog(page: Page): Promise<boolean> {
  await ensureSignedIn(page);
  await page.goto(ROUTE);
  await page.waitForLoadState("domcontentloaded");
  if (!page.url().includes("/admin/stripe-events")) return false;
  const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
  if (await logTab.isVisible().catch(() => false)) await logTab.click();
  return true;
}

async function firstRowOrSkip(page: Page): Promise<Locator> {
  const rows = page.getByTestId("reprocess-log-row");
  if ((await rows.count()) === 0) {
    test.skip(true, "Sem registros em stripe_webhook_reprocess_log neste ambiente");
  }
  return rows.first();
}

test.describe("Admin · Stripe Events · reprocess log", () => {
  // ---------------------------------------------------------------- (1)
  test("modal individual: cancelar não dispara; confirmar emite toast", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const row = await firstRowOrSkip(page);
    const btn = row.getByTestId("reprocess-row-btn");

    // Cancelar
    await btn.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/Reprocessar este evento\?/i)).toBeVisible();
    await dialog.getByRole("button", { name: /^Cancelar$/i }).click();
    await expect(dialog).toBeHidden();
    // Nenhum toast surgiu no cancelamento
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);

    // Confirmar → toast success (texto exato) ou erro conhecido
    await btn.click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^Reprocessar$/ }).click();
    await expectToastMatchingAny(page, [T_OK_ROW, T_ERR_ROW]);
  });

  // ---------------------------------------------------------------- (2)
  test("link do stripe_event_id abre a aba Eventos com filtro", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const row = await firstRowOrSkip(page);
    const eid = await row.getAttribute("data-stripe-event-id");
    if (!eid) test.skip(true, "Linha sem stripe_event_id");

    await row.getByTestId("open-event-in-events").click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("tab") ?? "events")
      .toBe("events");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe(eid);
    await expect(page.getByRole("tab", { name: /^Eventos$/i }))
      .toHaveAttribute("data-state", "active");
  });

  // ---------------------------------------------------------------- (3)
  test("Reprocessar filtrados: panel + toast com texto exato", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });

    await expectToastMatchingAny(page, [T_OK_BATCH, T_PARTIAL_BATCH, T_EMPTY_BATCH, T_ERR_BATCH]);
  });

  // ---------------------------------------------------------------- (4)
  test("Retentar falhas: progresso + toast final com texto exato", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    await page.getByRole("button", { name: /Reprocessar só erros/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar erros/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    await expectToastMatchingAny(page, [T_OK_BATCH, T_PARTIAL_BATCH, T_EMPTY_BATCH, T_ERR_BATCH]);

    const retry = panel.getByTestId("retry-failures-btn");
    if (!(await retry.isVisible().catch(() => false))) {
      test.skip(true, "Batch não produziu falhas para retentar neste ambiente");
    }

    await retry.click();
    await expect(retry).toBeDisabled();
    await expect(panel).toHaveAttribute("data-pending", "true");
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    await expectToastMatchingAny(page, [T_OK_RETRY, T_PARTIAL_RETRY, T_ERR_RETRY]);
  });

  // ---------------------------------------------------------------- (5)
  test("Durante o lote, linha e link do event_id ficam bloqueados", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const row = await firstRowOrSkip(page);
    const rowBtn = row.getByTestId("reprocess-row-btn");
    const link = row.getByTestId("open-event-in-events");

    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "true");

    // Enquanto pending: linha marcada busy, botão desabilitado com rótulo "Em lote…",
    // link desabilitado — cliques não devem navegar nem abrir modal.
    await expect(row).toHaveAttribute("aria-busy", "true");
    await expect(rowBtn).toBeDisabled();
    await expect(rowBtn).toContainText(/Em lote…/);
    await expect(link).toBeDisabled();

    // Tenta clicar mesmo assim (force) — nada deve acontecer
    await rowBtn.click({ force: true }).catch(() => {});
    await link.click({ force: true }).catch(() => {});
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("tab") ?? "reprocess-log")
      .toBe("reprocess-log");

    // Aguarda concluir para não vazar estado para o próximo teste
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
  });

  // ---------------------------------------------------------------- (6)
  test("Exportar CSV/JSON do log filtrado reflete o filtro atual", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Aplica filtro de outcome=error para restringir o conjunto
    const outcomeSelect = page.getByRole("combobox", { name: /Resultado/i });
    if (await outcomeSelect.isVisible().catch(() => false)) {
      await outcomeSelect.click();
      await page.getByRole("option", { name: /^Erro$/ }).click();
      // se não houver linhas com erro, pula
      const rows = page.getByTestId("reprocess-log-row");
      await page.waitForTimeout(500);
      if ((await rows.count()) === 0) test.skip(true, "Sem linhas outcome=error para exportar");
    }

    // --- CSV
    const [csvDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /^Exportar CSV$/ }).click(),
    ]);
    const csvPath = await csvDownload.path();
    expect(csvPath, "download CSV sem path").toBeTruthy();
    const fs = await import("node:fs/promises");
    const csvText = await fs.readFile(csvPath!, "utf8");
    const csvLines = csvText.replace(/^\uFEFF/, "").trim().split("\n");
    expect(csvLines[0]).toContain("stripe_event_id");
    expect(csvLines[0]).toContain("outcome");
    // Todas as linhas de dados devem refletir o filtro (outcome=error)
    for (const line of csvLines.slice(1)) {
      expect(line).toMatch(/(^|,)error(,|$)/);
    }
    const csvToast = await readLastToast(page);
    expect(csvToast).toMatch(T_OK_EXPORT_CSV);
    const csvCount = Number(csvToast.match(/\((\d+) registros\)/)?.[1] ?? "-1");
    expect(csvLines.length - 1).toBe(csvCount);

    // --- JSON
    const [jsonDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /^Exportar JSON$/ }).click(),
    ]);
    const jsonText = await fs.readFile((await jsonDownload.path())!, "utf8");
    const rows = JSON.parse(jsonText) as Array<{ outcome: string; stripe_event_id: string }>;
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) expect(r.outcome).toBe("error");
    const jsonToast = await readLastToast(page);
    expect(jsonToast).toMatch(T_OK_EXPORT_JSON);
    expect(rows.length).toBe(Number(jsonToast.match(/\((\d+) registros\)/)?.[1] ?? "-1"));
  });

  // ---------------------------------------------------------------- (7)
  test("URL restaura filtros, paginação e aba (compartilhar link)", async ({ page }) => {
    await ensureSignedIn(page);

    // 7a) aba Eventos com q/st/et/p
    const eventsURL = `${ROUTE}?tab=events&q=evt_share_test&st=error&et=customer.subscription.created&p=2&ps=25`;
    await page.goto(eventsURL);
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/stripe-events")) test.skip(true, "Sem acesso admin");

    const evTab = page.getByRole("tab", { name: /^Eventos$/i });
    await expect(evTab).toHaveAttribute("data-state", "active");
    // Search input controlado por `q`
    const searchInput = page.getByPlaceholder(/evt_|Buscar|stripe_event/i).first();
    if (await searchInput.isVisible().catch(() => false)) {
      await expect(searchInput).toHaveValue("evt_share_test");
    }
    // URL preservada tal como veio
    const u1 = new URL(page.url());
    expect(u1.searchParams.get("tab")).toBe("events");
    expect(u1.searchParams.get("q")).toBe("evt_share_test");
    expect(u1.searchParams.get("st")).toBe("error");
    expect(u1.searchParams.get("et")).toBe("customer.subscription.created");
    expect(u1.searchParams.get("p")).toBe("2");

    // 7b) aba Log com l_oc/l_p/l_ps/l_sid
    const logURL = `${ROUTE}?tab=reprocess-log&l_oc=error&l_p=0&l_ps=25&l_sid=evt_abc`;
    await page.goto(logURL);
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    await expect(logTab).toHaveAttribute("data-state", "active");
    const sidInput = page.getByPlaceholder(/evt_/).first();
    if (await sidInput.isVisible().catch(() => false)) {
      await expect(sidInput).toHaveValue("evt_abc");
    }
    const u2 = new URL(page.url());
    expect(u2.searchParams.get("tab")).toBe("reprocess-log");
    expect(u2.searchParams.get("l_oc")).toBe("error");
    expect(u2.searchParams.get("l_sid")).toBe("evt_abc");
  });
});
