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

  // ---------------------------------------------------------------- (8)
  test("Export: body/params da requisição refletem o filtro atual", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Aplica filtro específico: outcome=error + sid parcial "evt_"
    const sid = page.getByPlaceholder(/evt_/).first();
    if (await sid.isVisible().catch(() => false)) {
      await sid.fill("evt_");
      await sid.blur();
    }
    const outcomeSelect = page.getByRole("combobox", { name: /Resultado/i });
    if (await outcomeSelect.isVisible().catch(() => false)) {
      await outcomeSelect.click();
      await page.getByRole("option", { name: /^Erro$/ }).click();
    }
    await page.waitForTimeout(400);

    if (await page.getByRole("button", { name: /^Exportar CSV$/ }).isDisabled()) {
      test.skip(true, "Filtro não retorna registros para validar body");
    }

    // Captura requests de server-fn (base `/n/`) durante o export
    const captured: Array<{ url: string; body: unknown }> = [];
    const listener = (req: import("@playwright/test").Request) => {
      const u = req.url();
      if (!/\/n\//.test(u)) return;
      let body: unknown = null;
      try { body = req.postDataJSON(); } catch { body = req.postData(); }
      captured.push({ url: u, body });
    };
    page.on("request", listener);

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /^Exportar CSV$/ }).click(),
    ]);
    await dl.path();
    page.off("request", listener);

    const exportReq = captured.find((c) => {
      const s = typeof c.body === "string" ? c.body : JSON.stringify(c.body ?? {});
      return /outcome/.test(s) && /error/.test(s);
    });
    expect(
      exportReq,
      `Nenhum request de export capturado com o filtro. URLs: ${captured.map((c) => c.url).join(", ")}`,
    ).toBeTruthy();
    const serialized = JSON.stringify(exportReq!.body ?? {});
    expect(serialized).toContain("\"outcome\"");
    expect(serialized).toContain("error");
    expect(serialized).toContain("evt_");
    // Export retorna o conjunto INTEIRO — não deve enviar offset paginado
    expect(serialized).not.toMatch(/"offset"\s*:\s*[1-9]/);
  });

  // ---------------------------------------------------------------- (9)
  test("Após lote: paginação/ordenação preservadas e toast bate com a página", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Toggle explícito na coluna "Duração" pra registrar sort na URL
    const durHead = page.getByRole("button", { name: /Duração/i }).first();
    if (await durHead.isVisible().catch(() => false)) {
      await durHead.click();
      await page.waitForTimeout(300);
    }
    const beforeUrl = new URL(page.url());
    const beforeSb = beforeUrl.searchParams.get("l_sb");
    const beforeSd = beforeUrl.searchParams.get("l_sd");
    const beforeP  = beforeUrl.searchParams.get("l_p") ?? "0";

    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    const toastText = await expectToastMatchingAny(page, [T_OK_BATCH, T_PARTIAL_BATCH, T_EMPTY_BATCH, T_ERR_BATCH]);

    const afterUrl = new URL(page.url());
    expect(afterUrl.searchParams.get("l_sb")).toBe(beforeSb);
    expect(afterUrl.searchParams.get("l_sd")).toBe(beforeSd);
    expect(afterUrl.searchParams.get("l_p") ?? "0").toBe(beforeP);
    expect(afterUrl.searchParams.get("tab")).toBe("reprocess-log");

    // Toast N/N ou "de N" nunca deve exceder o total do filtro visível
    const m = toastText.match(/(\d+)\/(\d+)\s+OK/) ?? toastText.match(/de\s+(\d+)/);
    if (m) {
      const attempted = Number(m[m.length - 1]);
      const counter = await page.getByText(/\d+ registro\(s\)/).first().innerText().catch(() => "");
      const total = Number(counter.replace(/\D+/g, ""));
      if (!Number.isNaN(total) && total > 0) {
        expect(attempted).toBeLessThanOrEqual(total);
      }
    }
  });

  // ---------------------------------------------------------------- (10)
  test("Filtro sem resultados: botões de export desabilitados; nenhum download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const sid = page.getByPlaceholder(/evt_/).first();
    if (!(await sid.isVisible().catch(() => false))) {
      test.skip(true, "Input de stripe_event_id ausente");
    }
    await sid.fill("evt_zzz_no_match_xyz_123");
    await sid.blur();
    await page.waitForTimeout(700);

    await expect(page.getByText(/Nenhum registro com os filtros atuais\.|^0 registro/i).first())
      .toBeVisible({ timeout: 5_000 });

    const csvBtn  = page.getByRole("button", { name: /^Exportar CSV$/ });
    const jsonBtn = page.getByRole("button", { name: /^Exportar JSON$/ });
    await expect(csvBtn).toBeDisabled();
    await expect(jsonBtn).toBeDisabled();

    let downloadFired = false;
    const onDl = () => { downloadFired = true; };
    page.on("download", onDl);
    await csvBtn.click({ force: true }).catch(() => {});
    await jsonBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1_000);
    page.off("download", onDl);
    expect(downloadFired).toBe(false);
    const toasts = await page.locator("[data-sonner-toast]").allInnerTexts();
    for (const t of toasts) expect(t).not.toMatch(/exportado \(0 registros\)/);
  });

  // ---------------------------------------------------------------- (11)
  test("Durante o lote: tentar abrir/cancelar/confirmar modal individual repetidamente segue bloqueado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const row = await firstRowOrSkip(page);
    const rowBtn = row.getByTestId("reprocess-row-btn");

    // Contador de chamadas ao server-fn individual (payload tem "id" mas não outcome/limit)
    const reprocessCalls: string[] = [];
    const listener = (req: import("@playwright/test").Request) => {
      const u = req.url();
      if (!/\/n\//.test(u)) return;
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      if (/"id"\s*:\s*"/.test(body) && !/outcome|limit|"ids"/.test(body)) {
        reprocessCalls.push(u);
      }
    };
    page.on("request", listener);

    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "true");

    for (let i = 0; i < 3; i++) {
      await expect(rowBtn).toBeDisabled();
      await rowBtn.click({ force: true }).catch(() => {});
      // Nenhum modal individual pode abrir
      await expect(
        page.getByRole("alertdialog").filter({ hasText: /Reprocessar este evento\?/ }),
      ).toHaveCount(0);
      // Tenta um ESC + segundo force-click "cancelar/confirmar" mesmo sem modal
      await page.keyboard.press("Escape").catch(() => {});
      await rowBtn.click({ force: true }).catch(() => {});
      await expect(
        page.getByRole("alertdialog").filter({ hasText: /Reprocessar este evento\?/ }),
      ).toHaveCount(0);
      await page.waitForTimeout(120);
    }

    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    page.off("request", listener);

    expect(
      reprocessCalls,
      `Requests individuais indevidas durante o lote:\n${reprocessCalls.join("\n")}`,
    ).toHaveLength(0);
  });

  // ---------------------------------------------------------------- (12)
  test("Export: payload não pagina (sem offset/limit) e toast bate com o total exportado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Força paginação l_ps=25 e navega até a página 2 se houver, pra provar que
    // o export ignora a paginação atual e devolve o conjunto INTEIRO filtrado.
    const url = new URL(page.url());
    url.searchParams.set("l_ps", "25");
    url.searchParams.set("l_p", "0");
    await page.goto(url.pathname + "?" + url.searchParams.toString());
    await page.waitForLoadState("domcontentloaded");

    if (await page.getByRole("button", { name: /^Exportar CSV$/ }).isDisabled()) {
      test.skip(true, "Sem registros para exportar");
    }

    const captured: Array<{ url: string; body: unknown }> = [];
    const listener = (req: import("@playwright/test").Request) => {
      const u = req.url();
      if (!/\/n\//.test(u)) return;
      let body: unknown = null;
      try { body = req.postDataJSON(); } catch { body = req.postData(); }
      captured.push({ url: u, body });
    };
    page.on("request", listener);

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /^Exportar JSON$/ }).click(),
    ]);
    const jsonText = await (await import("node:fs/promises")).readFile((await dl.path())!, "utf8");
    page.off("request", listener);

    const rows = JSON.parse(jsonText) as unknown[];
    const toast = await readLastToast(page);
    expect(toast).toMatch(T_OK_EXPORT_JSON);
    const toastCount = Number(toast.match(/\((\d+) registros\)/)?.[1] ?? "-1");
    expect(rows.length).toBe(toastCount);

    // Nenhum request de export deve ter enviado offset paginado (>0) nem "limit"
    // recortando o conjunto — o export cobre TODO o filtro.
    for (const c of captured) {
      const s = typeof c.body === "string" ? c.body : JSON.stringify(c.body ?? {});
      if (!/outcome|stripe_event_id|actor_user_id|since|until/.test(s)) continue;
      expect(s, `request suspeito com offset paginado: ${c.url}`).not.toMatch(/"offset"\s*:\s*[1-9]/);
      // Se houver "limit", tem que ser >= o total retornado (i.e. não recorta a página)
      const limitMatch = s.match(/"limit"\s*:\s*(\d+)/);
      if (limitMatch) {
        expect(Number(limitMatch[1])).toBeGreaterThanOrEqual(rows.length);
      }
    }
  });

  // ---------------------------------------------------------------- (13)
  test("Retentar falhas: paginação/ordenação preservadas e toast só cobre os retentados", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Aplica sort e page-size explícitos para poder comparar depois
    const durHead = page.getByRole("button", { name: /Duração/i }).first();
    if (await durHead.isVisible().catch(() => false)) {
      await durHead.click();
      await page.waitForTimeout(200);
    }

    // Roda o lote pra gerar (possíveis) falhas
    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();
    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    await expectToastMatchingAny(page, [T_OK_BATCH, T_PARTIAL_BATCH, T_EMPTY_BATCH, T_ERR_BATCH]);

    const retry = panel.getByTestId("retry-failures-btn");
    if (!(await retry.isVisible().catch(() => false))) {
      test.skip(true, "Batch não produziu falhas para retentar");
    }
    // Extrai contador de falhas do rótulo do próprio botão: "Retentar falhas (N)"
    const label = (await retry.innerText()).trim();
    const failedBefore = Number(label.match(/\((\d+)\)/)?.[1] ?? "0");
    expect(failedBefore).toBeGreaterThan(0);

    const urlBefore = new URL(page.url());
    const sb = urlBefore.searchParams.get("l_sb");
    const sd = urlBefore.searchParams.get("l_sd");
    const p  = urlBefore.searchParams.get("l_p") ?? "0";
    const ps = urlBefore.searchParams.get("l_ps");

    await retry.click();
    await expect(panel).toHaveAttribute("data-pending", "true");
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    const retryToast = await expectToastMatchingAny(page, [T_OK_RETRY, T_PARTIAL_RETRY, T_ERR_RETRY]);

    const urlAfter = new URL(page.url());
    expect(urlAfter.searchParams.get("l_sb")).toBe(sb);
    expect(urlAfter.searchParams.get("l_sd")).toBe(sd);
    expect(urlAfter.searchParams.get("l_p") ?? "0").toBe(p);
    expect(urlAfter.searchParams.get("l_ps")).toBe(ps);
    expect(urlAfter.searchParams.get("tab")).toBe("reprocess-log");

    // O toast da retentativa cobre APENAS o subconjunto de falhas do lote,
    // então o denominador nunca deve exceder failedBefore.
    const m = retryToast.match(/(\d+)\/(\d+)\s+OK$/) ?? retryToast.match(/de\s+(\d+)/);
    if (m) {
      const denom = Number(m[m.length - 1]);
      expect(denom).toBeLessThanOrEqual(failedBefore);
    }
  });

  // ---------------------------------------------------------------- (14)
  test("Ao término do lote: export e reprocessamento reabilitam; modal individual volta a abrir", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const row = await firstRowOrSkip(page);
    const rowBtn = row.getByTestId("reprocess-row-btn");

    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "true");
    // Enquanto pending: tudo bloqueado
    await expect(rowBtn).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Exportar CSV$/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Exportar JSON$/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Reprocessar filtrados/i })).toBeDisabled();

    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    await expectToastMatchingAny(page, [T_OK_BATCH, T_PARTIAL_BATCH, T_EMPTY_BATCH, T_ERR_BATCH]);

    // Após o lote: botões reabilitam
    await expect(rowBtn).toBeEnabled();
    await expect(page.getByRole("button", { name: /Reprocessar filtrados/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Exportar CSV$/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Exportar JSON$/ })).toBeEnabled();
    await expect(row).not.toHaveAttribute("aria-busy", "true");

    // Modal individual volta a abrir e cancelar funciona
    await rowBtn.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/Reprocessar este evento\?/i)).toBeVisible();
    await dialog.getByRole("button", { name: /^Cancelar$/i }).click();
    await expect(dialog).toBeHidden();
  });

  // ---------------------------------------------------------------- (15)
  test("Durante o lote: filtros e ordenação ficam travados; URL não muda", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();
    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "true");

    // Snapshot da URL enquanto pending
    const urlLocked = new URL(page.url());
    const snapshot = urlLocked.searchParams.toString();

    // Captura qualquer navegação/mudança de query enquanto pending
    let navChanged = false;
    const framenav = (frame: import("@playwright/test").Frame) => {
      if (frame === page.mainFrame()) navChanged = true;
    };
    page.on("framenavigated", framenav);

    // 1) Tentativa de mudar o Resultado (select) — deve estar disabled
    const outcomeSelect = page.getByRole("combobox", { name: /Resultado/i });
    if (await outcomeSelect.isVisible().catch(() => false)) {
      await expect(outcomeSelect).toBeDisabled();
      await outcomeSelect.click({ force: true }).catch(() => {});
      await expect(page.getByRole("option", { name: /^Erro$/ })).toHaveCount(0);
    }

    // 2) Tentativa de digitar no input de stripe_event_id — deve estar disabled
    const sid = page.getByPlaceholder(/evt_/).first();
    if (await sid.isVisible().catch(() => false)) {
      await expect(sid).toBeDisabled();
      await sid.fill("evt_should_be_blocked", { force: true }).catch(() => {});
    }

    // 3) Tentativa de reordenar clicando no header "Duração"
    const durHead = page.getByRole("button", { name: /Duração/i }).first();
    if (await durHead.isVisible().catch(() => false)) {
      await durHead.click({ force: true }).catch(() => {});
    }

    // 4) Reset filters também deve estar bloqueado
    const reset = page.getByRole("button", { name: /^Limpar$|^Resetar|Reset/ }).first();
    if (await reset.isVisible().catch(() => false)) {
      await expect(reset).toBeDisabled();
    }

    // Nada disso pode ter mudado a URL enquanto pending
    expect(new URL(page.url()).searchParams.toString()).toBe(snapshot);

    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    page.off("framenavigated", framenav);
    // Se navegou, precisa ter sido pra mesma URL (framenavigated dispara em pushState)
    if (navChanged) {
      expect(new URL(page.url()).searchParams.toString()).toBe(snapshot);
    }
  });
});
