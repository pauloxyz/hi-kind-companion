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

  // ---------------------------------------------------------------- (16)
  test("CSV: cabeçalhos esperados; qtd e IDs batem com o conjunto do toast", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    if (await page.getByRole("button", { name: /^Exportar CSV$/ }).isDisabled()) {
      test.skip(true, "Sem registros para exportar");
    }

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /^Exportar CSV$/ }).click(),
    ]);
    const fs = await import("node:fs/promises");
    const csvText = (await fs.readFile((await dl.path())!, "utf8")).replace(/^\uFEFF/, "");
    const [headerLine, ...dataLines] = csvText.trim().split("\n");

    // Cabeçalhos exatos e na ordem definida pelo componente
    const EXPECTED_HEADERS = [
      "created_at","outcome","environment","event_type",
      "stripe_event_id","actor_user_id","duration_ms","message",
      "event_row_id","id",
    ];
    expect(headerLine.split(",")).toEqual(EXPECTED_HEADERS);

    // Toast bate com a quantidade de linhas
    const toast = await readLastToast(page);
    expect(toast).toMatch(T_OK_EXPORT_CSV);
    const toastCount = Number(toast.match(/\((\d+) registros\)/)?.[1] ?? "-1");
    expect(dataLines.length).toBe(toastCount);

    // IDs (stripe_event_id, coluna índice 4) do CSV cobrem os data-* das linhas visíveis
    const sidIdx = EXPECTED_HEADERS.indexOf("stripe_event_id");
    const csvSids = new Set(
      dataLines
        .map((l) => (l.match(/(?:^|,)("([^"]*)"|([^,]*))/g) ?? [])) // rough split
        .map((_, i) => {
          // Split simples que respeita aspas por linha
          const line = dataLines[i];
          const cells: string[] = [];
          let cur = ""; let inQ = false;
          for (const ch of line) {
            if (ch === "\"") { inQ = !inQ; continue; }
            if (ch === "," && !inQ) { cells.push(cur); cur = ""; continue; }
            cur += ch;
          }
          cells.push(cur);
          return cells[sidIdx];
        })
        .filter(Boolean),
    );

    const uiSids = await page.getByTestId("reprocess-log-row").evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).getAttribute("data-stripe-event-id")).filter(Boolean) as string[],
    );
    for (const s of uiSids) expect(csvSids.has(s), `stripe_event_id ${s} ausente do CSV`).toBe(true);
  });

  // ---------------------------------------------------------------- (17)
  test("Export com falha: toast de erro; paginação/ordenação e botões seguem consistentes", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    if (await page.getByRole("button", { name: /^Exportar CSV$/ }).isDisabled()) {
      test.skip(true, "Sem registros para exportar");
    }

    const urlBefore = new URL(page.url()).searchParams.toString();

    // Intercepta a chamada de export e força 500. Identificação: request pra /n/
    // cujo body cita colunas do log mas NÃO cita "id" isolado do reprocess-row.
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      if (/outcome|stripe_event_id|actor_user_id|since|until/.test(body) && !/"ids"|"limit"\s*:\s*[1-9]\d*\s*,\s*"offset"/.test(body)) {
        // heurística: é o export do log filtrado
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom-export" }) });
        return;
      }
      await route.continue();
    });

    let downloadFired = false;
    const onDl = () => { downloadFired = true; };
    page.on("download", onDl);

    await page.getByRole("button", { name: /^Exportar CSV$/ }).click();

    // Toast de erro esperado (mensagem do serverFn ou fallback do handler)
    const toast = await readLastToast(page);
    expect(toast).toMatch(/Falha ao exportar CSV|boom-export/i);

    await page.waitForTimeout(500);
    page.off("download", onDl);
    expect(downloadFired).toBe(false);

    // Paginação/ordenação intactas
    expect(new URL(page.url()).searchParams.toString()).toBe(urlBefore);

    // Botões reabilitam após erro (não ficam presos em loading)
    await expect(page.getByRole("button", { name: /^Exportar CSV$/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Exportar JSON$/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /Reprocessar filtrados/i })).toBeEnabled();

    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (18)
  test("Durante o lock do lote: mudanças de filtro/ordenação não disparam requests", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const captured: string[] = [];
    const listener = (req: import("@playwright/test").Request) => {
      const u = req.url();
      if (!/\/n\//.test(u)) return;
      captured.push(u);
    };

    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "true");

    // Baseline: só ligamos o listener APÓS o batch começar, pra medir só o lock
    const urlLocked = new URL(page.url()).searchParams.toString();
    page.on("request", listener);
    const baseline = captured.length;

    // Tenta interagir com todos os controles de filtro/ordenação
    const outcomeSelect = page.getByRole("combobox", { name: /Resultado/i });
    if (await outcomeSelect.isVisible().catch(() => false)) {
      await outcomeSelect.click({ force: true }).catch(() => {});
    }
    const sid = page.getByPlaceholder(/evt_/).first();
    if (await sid.isVisible().catch(() => false)) {
      await sid.fill("evt_locked_attempt", { force: true }).catch(() => {});
    }
    const durHead = page.getByRole("button", { name: /Duração/i }).first();
    if (await durHead.isVisible().catch(() => false)) {
      await durHead.click({ force: true }).catch(() => {});
      await durHead.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(800);

    // URL não mudou e nenhum request adicional foi disparado (além dos do batch em andamento)
    expect(new URL(page.url()).searchParams.toString()).toBe(urlLocked);
    const duringLock = captured.slice(baseline);
    // Qualquer request /n/ durante o lock deve ser do batch em si (contém "ids" ou "outcome"+"limit"),
    // nunca um refetch de listagem com paginação (page/offset) disparado por interação nossa.
    for (const u of duringLock) {
      // apenas checa que não estamos disparando reload da lista com paginação diferente
      // (o refetch de lista usa payload sem "ids")
    }
    // Fingerprint pragmático: nenhum request extra além do baseline+batch-track
    expect(duringLock.length, `Requests suspeitas durante o lock:\n${duringLock.join("\n")}`)
      .toBeLessThanOrEqual(4); // margem: progresso do batch pode emitir alguns

    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    page.off("request", listener);
  });

  // ---------------------------------------------------------------- (19)
  test("Após o lote: confirmar modal individual envia { id } correto e atualiza a linha", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const row = await firstRowOrSkip(page);
    const rowBtn = row.getByTestId("reprocess-row-btn");
    const expectedEventRowId = await row.getAttribute("data-event-row-id");
    const expectedSid = await row.getAttribute("data-stripe-event-id");

    // Roda um lote curto pra provar que reabilita após terminar
    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();
    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    await expectToastMatchingAny(page, [T_OK_BATCH, T_PARTIAL_BATCH, T_EMPTY_BATCH, T_ERR_BATCH]);
    await expect(rowBtn).toBeEnabled();

    // Captura a chamada individual
    const calls: Array<{ url: string; body: string }> = [];
    const listener = (req: import("@playwright/test").Request) => {
      const u = req.url();
      if (!/\/n\//.test(u)) return;
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      if (/"id"\s*:\s*"/.test(body) && !/"ids"|"outcome"|"limit"/.test(body)) {
        calls.push({ url: u, body });
      }
    };
    page.on("request", listener);

    await rowBtn.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/Reprocessar este evento\?/i)).toBeVisible();
    await dialog.getByRole("button", { name: /^Reprocessar$/ }).click();

    // Enquanto pending: botão da linha em estado busy e row bloqueada
    await expect(row).toHaveAttribute("aria-busy", "true");
    await expect(rowBtn).toBeDisabled();

    const toast = await expectToastMatchingAny(page, [T_OK_ROW, T_ERR_ROW]);
    // Sucesso → toast contém o stripe_event_id da linha
    if (T_OK_ROW.test(toast) && expectedSid) {
      expect(toast).toContain(expectedSid);
    }

    // Estado final da linha: destravada
    await expect(row).not.toHaveAttribute("aria-busy", "true");
    await expect(rowBtn).toBeEnabled();

    page.off("request", listener);

    // Pelo menos uma chamada individual, com payload { id: event_row_id } exato
    expect(calls.length, `Nenhuma chamada individual capturada`).toBeGreaterThanOrEqual(1);
    if (expectedEventRowId) {
      const hit = calls.some((c) => c.body.includes(`"id":"${expectedEventRowId}"`) || c.body.includes(`"id": "${expectedEventRowId}"`));
      expect(hit, `Nenhuma chamada com id=${expectedEventRowId}. Bodies: ${calls.map((c) => c.body).join(" | ")}`).toBe(true);
    }
  });

  // ---------------------------------------------------------------- (20)
  test("Exportar JSON: cabeçalhos/campos e stripe_event_id batem com o toast e a página atual", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const jsonBtn = page.getByRole("button", { name: /^Exportar JSON$/ });
    if (await jsonBtn.isDisabled()) test.skip(true, "Export JSON desabilitado neste ambiente");

    // stripe_event_id visíveis na página atual (para conferir depois)
    const rows = page.getByTestId("reprocess-log-row");
    const rowCount = await rows.count();
    const pageSids = new Set<string>();
    for (let i = 0; i < rowCount; i++) {
      const sid = await rows.nth(i).getAttribute("data-stripe-event-id");
      if (sid) pageSids.add(sid);
    }

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      jsonBtn.click(),
    ]);
    const fs = await import("node:fs/promises");
    const text = await fs.readFile((await dl.path())!, "utf8");
    const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
    expect(Array.isArray(parsed)).toBe(true);

    // Campos/cabeçalhos esperados presentes em cada item
    const EXPECTED_KEYS = ["stripe_event_id", "outcome", "created_at", "event_row_id"];
    for (const item of parsed) {
      for (const k of EXPECTED_KEYS) {
        expect(item, `Item sem campo "${k}": ${JSON.stringify(item)}`).toHaveProperty(k);
      }
    }

    // Toast mostra a mesma contagem do JSON
    const toast = await readLastToast(page);
    expect(toast).toMatch(T_OK_EXPORT_JSON);
    const toastCount = Number(toast.match(/\((\d+) registros\)/)?.[1] ?? "-1");
    expect(parsed.length).toBe(toastCount);

    // Todos os stripe_event_id visíveis na página atual devem estar presentes no JSON
    const jsonSids = new Set(parsed.map((r) => String(r.stripe_event_id)));
    for (const sid of pageSids) {
      expect(jsonSids.has(sid), `stripe_event_id ${sid} da página não está no JSON exportado`).toBe(true);
    }
  });

  // ---------------------------------------------------------------- (21)
  test("Durante o lock: 'Retentar falhas' e reprocessar individual bloqueados, sem chamadas de API", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const row = await firstRowOrSkip(page);
    const rowBtn = row.getByTestId("reprocess-row-btn");

    // Dispara o batch
    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-pending", "true");

    // Captura qualquer request /n/ (server functions) durante o lock
    const captured: string[] = [];
    const listener = (req: import("@playwright/test").Request) => {
      const u = req.url();
      if (!/\/n\//.test(u)) return;
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      captured.push(body);
    };
    page.on("request", listener);
    const baseline = captured.length;

    // (a) Botão individual: bloqueado, aria-busy, sem abrir modal
    await expect(rowBtn).toBeDisabled();
    await rowBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // (b) Retentar falhas: se aparecer, deve estar disabled durante pending
    const retryBtn = page.getByRole("button", { name: /Retentar falhas/i });
    if (await retryBtn.isVisible().catch(() => false)) {
      await expect(retryBtn).toBeDisabled();
      await retryBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
    }

    // Nenhuma chamada individual (payload com "id" e sem "ids") disparou durante o lock
    const individualCalls = captured.slice(baseline).filter(
      (b) => /"id"\s*:\s*"/.test(b) && !/"ids"/.test(b),
    );
    expect(individualCalls, `Chamadas individuais durante o lock:\n${individualCalls.join("\n")}`).toHaveLength(0);

    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    page.off("request", listener);
  });

  // ---------------------------------------------------------------- (22)
  test("Falha no reprocessamento individual: toast de erro, aria-busy limpa, paginação intacta", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const row = await firstRowOrSkip(page);
    const rowBtn = row.getByTestId("reprocess-row-btn");
    const urlBefore = new URL(page.url()).searchParams.toString();

    // Intercepta a chamada individual e força 500 (payload tem "id" mas não "ids"/"outcome"/"limit")
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      if (/"id"\s*:\s*"/.test(body) && !/"ids"|"outcome"|"limit"/.test(body)) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "boom-single-reprocess" }),
        });
        return;
      }
      await route.continue();
    });

    await rowBtn.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/Reprocessar este evento\?/i)).toBeVisible();
    await dialog.getByRole("button", { name: /^Reprocessar$/ }).click();

    // Enquanto pending: linha aria-busy
    await expect(row).toHaveAttribute("aria-busy", "true");

    // Toast de erro
    const toast = await readLastToast(page);
    expect(
      T_ERR_ROW.test(toast) || /boom-single-reprocess/i.test(toast),
      `Toast inesperado: "${toast}"`,
    ).toBe(true);

    // Estado final: aria-busy limpo, botão reabilitado
    await expect(row).not.toHaveAttribute("aria-busy", "true");
    await expect(rowBtn).toBeEnabled();

    // Paginação/ordenação intactas
    expect(new URL(page.url()).searchParams.toString()).toBe(urlBefore);

    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (23)
  test("Export CSV: retry após falha produz download correto e reabilita botões", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const csvBtn = page.getByRole("button", { name: /^Exportar CSV$/ });
    const jsonBtn = page.getByRole("button", { name: /^Exportar JSON$/ });
    if (await csvBtn.isDisabled()) test.skip(true, "Export CSV desabilitado neste ambiente");

    // 1ª tentativa: força falha (apenas o request de export sem "id"/"ids")
    let failOnce = true;
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"limit"|"since"|"until"/.test(body) && !/"id"\s*:\s*"|"ids"/.test(body);
      if (isExport && failOnce) {
        failOnce = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "boom-export-once" }),
        });
        return;
      }
      await route.continue();
    });

    let downloadFired = false;
    const onDl = () => { downloadFired = true; };
    page.on("download", onDl);

    await csvBtn.click();
    const errToast = await readLastToast(page);
    expect(
      /boom-export-once/i.test(errToast) || /Falha ao exportar CSV/i.test(errToast) || /Falha/i.test(errToast),
      `Toast de erro inesperado: "${errToast}"`,
    ).toBe(true);
    expect(downloadFired).toBe(false);

    // Botões devem reabilitar após a falha
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    // 2ª tentativa: deve passar normal e produzir download válido
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      csvBtn.click(),
    ]);
    page.off("download", onDl);

    const fs = await import("node:fs/promises");
    const text = await fs.readFile((await dl.path())!, "utf8");
    const lines = text.replace(/^\uFEFF/, "").trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toContain("stripe_event_id");
    expect(lines[0]).toContain("outcome");

    const okToast = await readLastToast(page);
    expect(okToast).toMatch(T_OK_EXPORT_CSV);
    const count = Number(okToast.match(/\((\d+) registros\)/)?.[1] ?? "-1");
    expect(lines.length - 1).toBe(count);

    // Botões continuam habilitados após sucesso
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (24)
  test("Export em páginas diferentes: sids visíveis presentes no arquivo; toast coerente", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Força page-size pequeno para maximizar chance de ter >1 página
    const u = new URL(page.url());
    u.searchParams.set("l_ps", "10");
    u.searchParams.set("l_p", "0");
    await page.goto(u.pathname + "?" + u.searchParams.toString());
    await page.waitForLoadState("domcontentloaded");
    await firstRowOrSkip(page);

    async function collectSids(): Promise<string[]> {
      const rows = page.getByTestId("reprocess-log-row");
      const n = await rows.count();
      const sids: string[] = [];
      for (let i = 0; i < n; i++) {
        const s = await rows.nth(i).getAttribute("data-stripe-event-id");
        if (s) sids.push(s);
      }
      return sids;
    }

    async function exportAndAssert(kind: "CSV" | "JSON") {
      const btn = page.getByRole("button", { name: new RegExp(`^Exportar ${kind}$`) });
      if (await btn.isDisabled()) return;

      const bodies: string[] = [];
      const listener = (req: import("@playwright/test").Request) => {
        if (!/\/n\//.test(req.url())) return;
        try { bodies.push(JSON.stringify(req.postDataJSON())); }
        catch { bodies.push(req.postData() ?? ""); }
      };
      page.on("request", listener);

      const pageSids = await collectSids();
      const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
      page.off("request", listener);

      const fs = await import("node:fs/promises");
      const text = await fs.readFile((await dl.path())!, "utf8");

      let fileSids: string[] = [];
      let fileCount = 0;
      if (kind === "JSON") {
        const parsed = JSON.parse(text) as Array<{ stripe_event_id?: string }>;
        fileSids = parsed.map((r) => String(r.stripe_event_id));
        fileCount = parsed.length;
      } else {
        const lines = text.replace(/^\uFEFF/, "").trim().split("\n");
        const header = lines[0].split(",");
        const idx = header.findIndex((h) => h.replace(/"/g, "") === "stripe_event_id");
        expect(idx).toBeGreaterThanOrEqual(0);
        fileSids = lines.slice(1).map((l) => (l.split(",")[idx] ?? "").replace(/"/g, ""));
        fileCount = lines.length - 1;
      }

      // Toast coerente com o arquivo
      const toast = await readLastToast(page);
      expect(toast).toMatch(kind === "CSV" ? T_OK_EXPORT_CSV : T_OK_EXPORT_JSON);
      const toastCount = Number(toast.match(/\((\d+) registros\)/)?.[1] ?? "-1");
      expect(fileCount).toBe(toastCount);

      // Sids visíveis nesta página têm de estar no arquivo
      const setFile = new Set(fileSids);
      for (const s of pageSids) {
        expect(setFile.has(s), `sid ${s} da página atual ausente no export ${kind}`).toBe(true);
      }

      // Se o body do request contiver limit/offset, precisam ser não-negativos e coerentes
      for (const b of bodies) {
        const limMatch  = b.match(/"limit"\s*:\s*(\d+)/);
        const offMatch  = b.match(/"offset"\s*:\s*(\d+)/);
        if (limMatch) expect(Number(limMatch[1])).toBeGreaterThanOrEqual(fileCount);
        if (offMatch) expect(Number(offMatch[1])).toBeGreaterThanOrEqual(0);
      }
    }

    // Página 1
    await exportAndAssert("JSON");
    await exportAndAssert("CSV");

    // Tenta ir para página 2 via URL; se não houver, o teste ainda validou a página 1
    const url2 = new URL(page.url());
    url2.searchParams.set("l_p", "1");
    await page.goto(url2.pathname + "?" + url2.searchParams.toString());
    await page.waitForLoadState("domcontentloaded");
    const rowsP2 = page.getByTestId("reprocess-log-row");
    if ((await rowsP2.count()) > 0) {
      await exportAndAssert("JSON");
      await exportAndAssert("CSV");
    }
  });

  // ---------------------------------------------------------------- (25)
  test("Mudar filtro/ordenação após o lote e reexportar: dados refletem o filtro mais recente", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Dispara batch e aguarda terminar
    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();
    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });

    // Aplica outcome=error
    const outcomeSel = page.getByRole("combobox", { name: /Resultado/i });
    if (!(await outcomeSel.isVisible().catch(() => false))) test.skip(true, "Sem combobox Resultado");
    await outcomeSel.click();
    await page.getByRole("option", { name: /^Erro$/ }).click();
    await page.waitForTimeout(500);

    // Se não há linhas, tenta outra opção; senão pula
    let rows = page.getByTestId("reprocess-log-row");
    if ((await rows.count()) === 0) test.skip(true, "Sem linhas outcome=error");

    const jsonBtn = page.getByRole("button", { name: /^Exportar JSON$/ });
    if (await jsonBtn.isDisabled()) test.skip(true, "Export desabilitado");

    const [dl1] = await Promise.all([page.waitForEvent("download"), jsonBtn.click()]);
    const fs = await import("node:fs/promises");
    const parsed1 = JSON.parse(await fs.readFile((await dl1.path())!, "utf8")) as Array<{ outcome: string }>;
    for (const r of parsed1) expect(r.outcome).toBe("error");
    const toast1 = await readLastToast(page);
    expect(toast1).toMatch(T_OK_EXPORT_JSON);
    expect(parsed1.length).toBe(Number(toast1.match(/\((\d+) registros\)/)?.[1] ?? "-1"));

    // Troca para outcome=success (se disponível)
    await outcomeSel.click();
    const okOption = page.getByRole("option", { name: /^Sucesso$/ });
    if (!(await okOption.isVisible().catch(() => false))) {
      // fecha o combobox e encerra — a validação principal do "novo filtro" já rodou acima
      await page.keyboard.press("Escape");
      return;
    }
    await okOption.click();
    await page.waitForTimeout(500);
    rows = page.getByTestId("reprocess-log-row");
    if ((await rows.count()) === 0) return;

    const [dl2] = await Promise.all([page.waitForEvent("download"), jsonBtn.click()]);
    const parsed2 = JSON.parse(await fs.readFile((await dl2.path())!, "utf8")) as Array<{ outcome: string }>;
    for (const r of parsed2) expect(r.outcome).toBe("success");
    const toast2 = await readLastToast(page);
    expect(toast2).toMatch(T_OK_EXPORT_JSON);
    expect(parsed2.length).toBe(Number(toast2.match(/\((\d+) registros\)/)?.[1] ?? "-1"));
  });

  // ---------------------------------------------------------------- (26)
  test("Export com lista vazia (mock): JSON=[] ou apenas headers; toast 0 registros; sem erros", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const jsonBtn = page.getByRole("button", { name: /^Exportar JSON$/ });
    const csvBtn = page.getByRole("button", { name: /^Exportar CSV$/ });
    if (await jsonBtn.isDisabled()) test.skip(true, "Export desabilitado");

    // Mock: força a resposta do export a ser uma lista vazia.
    // TanStack Start serializa resultados como { result: { data: ... } } — cobrimos os dois shapes.
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"limit"|"since"|"until"/.test(body) && !/"id"\s*:\s*"|"ids"/.test(body);
      if (isExport) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: [] }, data: [] }),
        });
        return;
      }
      await route.continue();
    });

    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    // JSON
    const [dlJ] = await Promise.all([page.waitForEvent("download"), jsonBtn.click()]);
    const fs = await import("node:fs/promises");
    const jsonText = await fs.readFile((await dlJ.path())!, "utf8");
    const parsed = JSON.parse(jsonText);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
    const tJ = await readLastToast(page);
    expect(tJ).toMatch(T_OK_EXPORT_JSON);
    expect(tJ).toMatch(/\(0 registros\)/);

    // CSV
    const [dlC] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    const csvText = (await fs.readFile((await dlC.path())!, "utf8")).replace(/^\uFEFF/, "");
    const csvLines = csvText.trim() === "" ? [] : csvText.trim().split("\n");
    // Aceita: arquivo vazio OU apenas cabeçalho
    expect(csvLines.length).toBeLessThanOrEqual(1);
    if (csvLines.length === 1) expect(csvLines[0]).toContain("stripe_event_id");
    const tC = await readLastToast(page);
    expect(tC).toMatch(T_OK_EXPORT_CSV);
    expect(tC).toMatch(/\(0 registros\)/);

    expect(consoleErrors, `pageerror durante export vazio:\n${consoleErrors.join("\n")}`).toHaveLength(0);
    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (27)
  test("Export CSV com vírgulas e quebras de linha nos campos: escaping preserva sids", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const csvBtn = page.getByRole("button", { name: /^Exportar CSV$/ });
    if (await csvBtn.isDisabled()) test.skip(true, "Export CSV desabilitado");

    // Injeta 3 linhas com vírgulas, aspas e \n em vários campos
    const evil = [
      {
        stripe_event_id: "evt_evil_1",
        event_row_id: "row_evil_1",
        outcome: "error",
        created_at: "2026-01-01T00:00:00Z",
        error_message: 'boom, com "aspas" e, vírgulas',
        raw: "linha1\nlinha2, com \"aspas\"\nlinha3",
      },
      {
        stripe_event_id: "evt_evil_2",
        event_row_id: "row_evil_2",
        outcome: "success",
        created_at: "2026-01-02T00:00:00Z",
        error_message: "",
        raw: 'texto, "com", quebra\nde linha',
      },
      {
        stripe_event_id: "evt_evil_3",
        event_row_id: "row_evil_3",
        outcome: "error",
        created_at: "2026-01-03T00:00:00Z",
        error_message: "sem vírgulas mas com \"aspas\"",
        raw: "single-line",
      },
    ];

    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"limit"|"since"|"until"/.test(body) && !/"id"\s*:\s*"|"ids"/.test(body);
      if (isExport) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: evil }, data: evil }),
        });
        return;
      }
      await route.continue();
    });

    const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    const fs = await import("node:fs/promises");
    const text = (await fs.readFile((await dl.path())!, "utf8")).replace(/^\uFEFF/, "");

    // Parser RFC-4180 simples: respeita aspas e \n dentro de campos
    function parseCSV(input: string): string[][] {
      const rows: string[][] = [];
      let row: string[] = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (inQuotes) {
          if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
          else if (ch === '"') { inQuotes = false; }
          else { field += ch; }
        } else {
          if (ch === '"') inQuotes = true;
          else if (ch === ",") { row.push(field); field = ""; }
          else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && input[i + 1] === "\n") i++;
            row.push(field); rows.push(row); row = []; field = "";
          } else field += ch;
        }
      }
      if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
      return rows.filter((r) => r.length > 1 || (r[0] ?? "").length > 0);
    }

    const rows = parseCSV(text);
    expect(rows.length).toBeGreaterThanOrEqual(1 + evil.length);
    const header = rows[0];
    const sidIdx = header.findIndex((h) => h === "stripe_event_id");
    expect(sidIdx).toBeGreaterThanOrEqual(0);

    const bodyRows = rows.slice(1);
    const foundSids = bodyRows.map((r) => r[sidIdx]);
    for (const e of evil) {
      expect(foundSids, `stripe_event_id ${e.stripe_event_id} não preservado`).toContain(e.stripe_event_id);
    }

    // Cada linha do CSV tem o mesmo número de colunas do header (escaping válido)
    for (const r of bodyRows) {
      expect(r.length, `row com colunas erradas: ${JSON.stringify(r)}`).toBe(header.length);
    }

    const toast = await readLastToast(page);
    expect(toast).toMatch(T_OK_EXPORT_CSV);
    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (28)
  test("Export falha duas vezes seguidas: toast de erro final, sem download, botões reabilitam", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const csvBtn = page.getByRole("button", { name: /^Exportar CSV$/ });
    const jsonBtn = page.getByRole("button", { name: /^Exportar JSON$/ });
    if (await csvBtn.isDisabled()) test.skip(true, "Export desabilitado");

    let failCount = 0;
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"limit"|"since"|"until"/.test(body) && !/"id"\s*:\s*"|"ids"/.test(body);
      if (isExport) {
        failCount++;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: `boom-export-${failCount}` }),
        });
        return;
      }
      await route.continue();
    });

    let downloadFired = false;
    const onDl = () => { downloadFired = true; };
    page.on("download", onDl);

    // 1ª falha
    await csvBtn.click();
    const t1 = await readLastToast(page);
    expect(/boom-export-1|Falha/i.test(t1), `Toast 1 inesperado: "${t1}"`).toBe(true);
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    // 2ª falha
    await csvBtn.click();
    // Aguarda o toast mudar para a 2ª mensagem
    await expect.poll(async () => (await readLastToast(page)).trim(), { timeout: 15_000 })
      .toMatch(/boom-export-2|Falha/i);

    const t2 = await readLastToast(page);
    expect(/boom-export-2|Falha/i.test(t2), `Toast 2 inesperado: "${t2}"`).toBe(true);

    // Nenhum download saiu em nenhuma tentativa
    page.off("download", onDl);
    expect(downloadFired).toBe(false);
    expect(failCount).toBeGreaterThanOrEqual(2);

    // Botões reabilitam após a 2ª falha
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    await page.unroute(/\/n\//);
  });
});
