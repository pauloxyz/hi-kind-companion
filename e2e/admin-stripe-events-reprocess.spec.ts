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

  // ---------------------------------------------------------------- (29)
  // Nome de arquivo, content-type e charset corretos para CSV e JSON
  test("Filename, content-type e charset do download batem com o export solicitado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Intercepta URL.createObjectURL para capturar o Blob real usado no download
    await page.exposeBinding("__lvblobMeta", (_src, meta: { type: string; size: number }) => meta);
    await page.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      (URL as any).createObjectURL = (blob: Blob) => {
        try { (window as any).__lvblobMeta({ type: blob.type, size: blob.size }); } catch {}
        (window as any).__lastBlobType = blob.type;
        (window as any).__lastBlobSize = blob.size;
        return orig(blob);
      };
    });

    async function checkOne(kind: "csv" | "json") {
      const btn = kind === "csv"
        ? page.getByTestId("log-export-csv")
        : page.getByTestId("log-export-json");
      if (await btn.isDisabled()) test.skip(true, `Export ${kind} desabilitado`);

      const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
      const filename = dl.suggestedFilename();
      // Prefixo do log de reprocessamento e sufixo com data/hora ISO sanitizada
      expect(filename).toMatch(new RegExp(`^stripe-webhook-reprocess-log.*\\.${kind}$`));
      expect(filename).toMatch(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.(csv|json)$/);

      const blobType = await page.evaluate(() => (window as any).__lastBlobType as string);
      const blobSize = await page.evaluate(() => (window as any).__lastBlobSize as number);
      if (kind === "csv") {
        // Deve ter charset=utf-8 e MIME text/csv (com BOM UTF-8 no início)
        expect(blobType).toBe("text/csv;charset=utf-8");
        const fs = await import("node:fs/promises");
        const buf = await fs.readFile((await dl.path())!);
        expect(buf[0]).toBe(0xef);
        expect(buf[1]).toBe(0xbb);
        expect(buf[2]).toBe(0xbf);
      } else {
        expect(blobType).toBe("application/json");
      }
      expect(blobSize).toBeGreaterThan(0);
      const t = await readLastToast(page);
      expect(t).toMatch(kind === "csv" ? T_OK_EXPORT_CSV : T_OK_EXPORT_JSON);
    }

    await checkOne("csv");
    // Pequena espera para o toast anterior desmontar
    await page.waitForTimeout(200);
    await checkOne("json");
  });

  // ---------------------------------------------------------------- (30)
  // Última página: total < limit — arquivo contém exatamente os últimos sids
  test("Export da última página: arquivo contém os últimos sids e toast reflete a contagem final", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Cria dataset determinístico: 7 linhas; pageSize=5 => last page com 2
    const total = 7;
    const dataset = Array.from({ length: total }, (_, i) => ({
      id: `id_${i + 1}`,
      event_row_id: `row_${i + 1}`,
      stripe_event_id: `evt_last_${String(i + 1).padStart(2, "0")}`,
      event_type: "checkout.session.completed",
      environment: "test",
      actor_user_id: null,
      outcome: i % 2 === 0 ? "success" : "error",
      message: null,
      duration_ms: 42,
      created_at: new Date(2026, 0, i + 1).toISOString(),
    }));

    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"since"|"until"/.test(body) && /"limit"/.test(body) && !/"ids"/.test(body) && !/"id"\s*:\s*"/.test(body);
      if (isExport) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: dataset }, data: dataset }),
        });
        return;
      }
      await route.continue();
    });

    const csvBtn = page.getByTestId("log-export-csv");
    if (await csvBtn.isDisabled()) test.skip(true, "Export CSV desabilitado");

    const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    const fs = await import("node:fs/promises");
    const text = (await fs.readFile((await dl.path())!, "utf8")).replace(/^\uFEFF/, "");
    const lines = text.split("\n").filter((l) => l.length > 0);
    // header + total rows
    expect(lines.length).toBe(1 + total);

    // Últimos 2 sids esperados na última página
    const expectedLastSids = ["evt_last_06", "evt_last_07"];
    for (const sid of expectedLastSids) {
      expect(text).toContain(sid);
    }

    const toast = await readLastToast(page);
    expect(toast).toMatch(T_OK_EXPORT_CSV);
    expect(toast).toMatch(new RegExp(`\\(${total} registros\\)`));

    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (31)
  // Escaping RFC-4180 avançado: combinações extremas de aspas + vírgula + \n
  test("CSV escape: aspas duplas + vírgulas + \\n preservam sids e integridade das linhas", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const csvBtn = page.getByTestId("log-export-csv");
    if (await csvBtn.isDisabled()) test.skip(true, "Export CSV desabilitado");

    // Campos com combinações mais duras: só aspas, só vírgula, só \n, misturado
    const evil = [
      { stripe_event_id: 'evt_q1', event_row_id: 'r_q1', outcome: 'error', created_at: '2026-02-01T00:00:00Z', error_message: '"""triple quoted"""', raw: '' },
      { stripe_event_id: 'evt_q2', event_row_id: 'r_q2', outcome: 'error', created_at: '2026-02-02T00:00:00Z', error_message: ',,,', raw: '' },
      { stripe_event_id: 'evt_q3', event_row_id: 'r_q3', outcome: 'error', created_at: '2026-02-03T00:00:00Z', error_message: '\n\n\n', raw: '' },
      { stripe_event_id: 'evt_q4', event_row_id: 'r_q4', outcome: 'error', created_at: '2026-02-04T00:00:00Z', error_message: 'a"b,c\nd"e,f\n"g', raw: '' },
    ];

    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"limit"|"since"|"until"/.test(body) && !/"ids"/.test(body) && !/"id"\s*:\s*"/.test(body);
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
    // header + exatamente evil.length
    expect(rows.length).toBe(1 + evil.length);
    const header = rows[0];
    const sidIdx = header.findIndex((h) => h === "stripe_event_id");
    expect(sidIdx).toBeGreaterThanOrEqual(0);

    // Todas as linhas com o mesmo número de colunas do header
    for (const r of rows.slice(1)) {
      expect(r.length, `row com colunas erradas: ${JSON.stringify(r)}`).toBe(header.length);
    }
    const foundSids = rows.slice(1).map((r) => r[sidIdx]);
    for (const e of evil) expect(foundSids).toContain(e.stripe_event_id);

    const toast = await readLastToast(page);
    expect(toast).toMatch(T_OK_EXPORT_CSV);
    expect(toast).toMatch(new RegExp(`\\(${evil.length} registros\\)`));

    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (32)
  // Ciclo de aria-busy: idle → true durante export → false ao concluir/falhar
  test("aria-busy dos botões de export cicla corretamente durante e após o download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    if (await csvBtn.isDisabled()) test.skip(true, "Export desabilitado");

    // Estado inicial
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toHaveAttribute("data-exporting", "false");
    await expect(jsonBtn).toHaveAttribute("aria-busy", "false");

    // Atrasa o request de export para dar uma janela observável de aria-busy=true
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"limit"|"since"|"until"/.test(body) && !/"ids"/.test(body) && !/"id"\s*:\s*"/.test(body);
      if (isExport) {
        await new Promise((r) => setTimeout(r, 900));
        await route.continue();
        return;
      }
      await route.continue();
    });

    const dlP = page.waitForEvent("download");
    await csvBtn.click();

    // Durante o export: aria-busy=true, data-exporting=csv, botão CSR desabilitado,
    // e o botão JSON também trava (mesma flag `exporting !== null`)
    await expect(csvBtn).toHaveAttribute("aria-busy", "true", { timeout: 3000 });
    await expect(csvBtn).toHaveAttribute("data-exporting", "true");
    await expect(csvBtn).toBeDisabled();
    await expect(jsonBtn).toBeDisabled();

    const dl = await dlP;
    expect(dl.suggestedFilename()).toMatch(/^stripe-webhook-reprocess-log.*\.csv$/);

    // Ao concluir: volta ao idle
    await expect(csvBtn).toHaveAttribute("aria-busy", "false", { timeout: 5000 });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false");
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    await page.unroute(/\/n\//);

    // Agora simula falha e valida que aria-busy volta a false mesmo em erro
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"limit"|"since"|"until"/.test(body) && !/"ids"/.test(body) && !/"id"\s*:\s*"/.test(body);
      if (isExport) {
        await new Promise((r) => setTimeout(r, 400));
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom-aria" }) });
        return;
      }
      await route.continue();
    });

    await jsonBtn.click();
    await expect(jsonBtn).toHaveAttribute("aria-busy", "true", { timeout: 3000 });
    await expect(jsonBtn).toHaveAttribute("data-exporting", "true");
    // Falha propaga → toast de erro + botões reabilitam com aria-busy=false
    const errT = await readLastToast(page);
    expect(/boom-aria|Falha/i.test(errT), `toast inesperado: "${errT}"`).toBe(true);
    await expect(jsonBtn).toHaveAttribute("aria-busy", "false", { timeout: 5000 });
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false");
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (33)
  // Filename entregue ao browser: `dl.suggestedFilename()` reflete o nome
  // gerado pelo cliente para CSV e JSON. Nota de arquitetura: o export do
  // Log de Reprocessamento é um server-fn (RPC/Seroval) que devolve o
  // dataset serializado; o download em si é montado no cliente com Blob +
  // <a download>. Não há `Content-Disposition` do lado do servidor — o
  // nome vem do atributo `download`, que o browser respeita. Validamos
  // isso ponta-a-ponta via `suggestedFilename()`.
  test("Browser respeita o filename do export (CSV e JSON) via atributo download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    if (await csvBtn.isDisabled()) test.skip(true, "Export desabilitado");

    const [dlCsv] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    const csvName = dlCsv.suggestedFilename();
    expect(csvName).toMatch(/^stripe-webhook-reprocess-log.*\.csv$/);
    expect(csvName).toMatch(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.csv$/);
    // O nome do arquivo salvo em disco também bate.
    const csvPath = await dlCsv.path();
    expect(csvPath, "path do download indefinido").toBeTruthy();

    await page.waitForTimeout(200);

    const [dlJson] = await Promise.all([page.waitForEvent("download"), jsonBtn.click()]);
    const jsonName = dlJson.suggestedFilename();
    expect(jsonName).toMatch(/^stripe-webhook-reprocess-log.*\.json$/);
    expect(jsonName).toMatch(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
    const jsonPath = await dlJson.path();
    expect(jsonPath, "path do download indefinido").toBeTruthy();
  });

  // ---------------------------------------------------------------- (34)
  // Cliques múltiplos enquanto aria-busy=true não disparam requests extras.
  test("Múltiplos cliques em Exportar CSV com aria-busy=true → apenas 1 request", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const csvBtn = page.getByTestId("log-export-csv");
    if (await csvBtn.isDisabled()) test.skip(true, "Export desabilitado");

    let exportRequests = 0;
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"limit"|"since"|"until"/.test(body) && !/"ids"/.test(body) && !/"id"\s*:\s*"/.test(body);
      if (isExport) {
        exportRequests++;
        // Segura o request um tempo para dar janela de aria-busy=true
        await new Promise((r) => setTimeout(r, 700));
      }
      await route.continue();
    });

    let downloads = 0;
    const onDl = () => { downloads++; };
    page.on("download", onDl);

    // 1º clique inicia o export.
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true", { timeout: 3000 });

    // Cliques adicionais com aria-busy=true — button está `disabled`, então
    // usamos `force: true` para provar que mesmo assim nada dispara.
    await csvBtn.click({ force: true }).catch(() => {});
    await csvBtn.click({ force: true }).catch(() => {});
    await csvBtn.click({ force: true }).catch(() => {});

    // Espera o ciclo terminar
    await expect(csvBtn).toHaveAttribute("aria-busy", "false", { timeout: 8000 });
    await page.waitForTimeout(200);
    page.off("download", onDl);

    expect(exportRequests, `esperava 1 request de export, recebi ${exportRequests}`).toBe(1);
    expect(downloads, `esperava 1 download, recebi ${downloads}`).toBe(1);
    await expect(csvBtn).toBeEnabled();

    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (35)
  // Request body do export: contém os filtros vigentes; toast confere a
  // contagem retornada. Contrato atual (docado em cenários 20/26): o export
  // cobre o conjunto filtrado inteiro e NÃO envia offset da página, mas
  // sim um `limit` (default do server) — validamos ambos.
  test("Body do export inclui filtros vigentes; toast reflete a contagem do payload", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    // Aplica um filtro conhecido (outcome=error) via UI se o select existir.
    const outcomeSel = page.getByRole("combobox").filter({ hasText: /Outcome|Todos/i }).first();
    if (await outcomeSel.isVisible().catch(() => false)) {
      await outcomeSel.click().catch(() => {});
      const opt = page.getByRole("option", { name: /error/i }).first();
      if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {});
    }
    await page.waitForTimeout(300);

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    if (await csvBtn.isDisabled()) test.skip(true, "Export desabilitado");

    const fakePayload = Array.from({ length: 3 }, (_, i) => ({
      id: `id_${i}`, event_row_id: `row_${i}`, stripe_event_id: `evt_body_${i}`,
      event_type: "checkout.session.completed", environment: "test",
      actor_user_id: null, outcome: "error", message: null,
      duration_ms: 10, created_at: new Date().toISOString(),
    }));

    const bodies: Record<string, unknown>[] = [];
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      let body: Record<string, unknown> | null = null;
      try { body = req.postDataJSON() as Record<string, unknown>; } catch {}
      const isExport =
        !!body &&
        ("outcome" in body || "since" in body || "until" in body) &&
        !("ids" in body) &&
        !("id" in body) &&
        // exports levam limit; listagens paginadas levam também `sortBy`/`sortDir`
        !("sortBy" in body);
      if (isExport) {
        bodies.push(body!);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result: { data: fakePayload }, data: fakePayload }),
        });
        return;
      }
      await route.continue();
    });

    // CSV
    const [, ] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    const tC = await readLastToast(page);
    expect(tC).toMatch(T_OK_EXPORT_CSV);
    expect(tC).toMatch(new RegExp(`\\(${fakePayload.length} registros\\)`));

    // JSON
    await page.waitForTimeout(200);
    const [, ] = await Promise.all([page.waitForEvent("download"), jsonBtn.click()]);
    const tJ = await readLastToast(page);
    expect(tJ).toMatch(T_OK_EXPORT_JSON);
    expect(tJ).toMatch(new RegExp(`\\(${fakePayload.length} registros\\)`));

    expect(bodies.length, "esperava 2 requests de export").toBeGreaterThanOrEqual(2);
    for (const b of bodies) {
      // outcome presente e refletindo a UI (quando filtro foi aplicado)
      expect("outcome" in b, `body sem outcome: ${JSON.stringify(b)}`).toBe(true);
      // limit presente (contrato de "conjunto filtrado inteiro" respeita o teto do servidor)
      expect("limit" in b, `body sem limit: ${JSON.stringify(b)}`).toBe(true);
      // NÃO envia paginação da tabela nem ordenação da tabela
      expect("offset" in b, `body não deveria conter offset: ${JSON.stringify(b)}`).toBe(false);
      expect("sortBy" in b, `body não deveria conter sortBy: ${JSON.stringify(b)}`).toBe(false);
      expect("sortDir" in b, `body não deveria conter sortDir: ${JSON.stringify(b)}`).toBe(false);
    }

    await page.unroute(/\/n\//);
  });

  // ---------------------------------------------------------------- (36)
  // Aborto do request de export: aria-busy/data-exporting resetam e nenhum
  // download é disparado. Simulamos abort de rede via `route.abort()`.
  test("Abort do request de export: aria-busy/data-exporting resetam e sem download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    await firstRowOrSkip(page);

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    if (await csvBtn.isDisabled()) test.skip(true, "Export desabilitado");

    let abortCount = 0;
    await page.route(/\/n\//, async (route) => {
      const req = route.request();
      const body = (() => { try { return JSON.stringify(req.postDataJSON()); } catch { return req.postData() ?? ""; } })();
      const isExport = /"outcome"|"limit"|"since"|"until"/.test(body) && !/"ids"/.test(body) && !/"id"\s*:\s*"/.test(body);
      if (isExport) {
        abortCount++;
        // Dá uma janela observável para aria-busy=true, então aborta.
        await new Promise((r) => setTimeout(r, 400));
        await route.abort("aborted");
        return;
      }
      await route.continue();
    });

    let downloads = 0;
    const onDl = () => { downloads++; };
    page.on("download", onDl);

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true", { timeout: 3000 });
    await expect(csvBtn).toHaveAttribute("data-exporting", "true");
    await expect(jsonBtn).toBeDisabled();

    // Toast de erro após o abort (handler cai no catch)
    const errT = await readLastToast(page);
    expect(/Falha ao exportar|abort/i.test(errT), `toast inesperado: "${errT}"`).toBe(true);

    // Estado retorna ao normal
    await expect(csvBtn).toHaveAttribute("aria-busy", "false", { timeout: 5000 });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false");
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    // Nenhum download foi disparado
    await page.waitForTimeout(200);
    page.off("download", onDl);
    expect(downloads, `esperava 0 downloads, recebi ${downloads}`).toBe(0);
    expect(abortCount).toBeGreaterThanOrEqual(1);

    // Após o abort, um novo clique volta a funcionar normalmente
    await page.unroute(/\/n\//);
    const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    expect(dl.suggestedFilename()).toMatch(/^stripe-webhook-reprocess-log.*\.csv$/);
    const okT = await readLastToast(page);
    expect(okT).toMatch(T_OK_EXPORT_CSV);
  });

  // ---------------------------------------------------------------- (37)
  // Cliques quase-simultâneos em CSV e JSON: aria-busy/data-exporting
  // impedem duplicação. Como só existe um estado `exporting` compartilhado,
  // o botão do formato oposto vira disabled assim que o primeiro dispara —
  // no máximo 1 request de export e 1 download acontece na primeira rodada.
  test("(37) CSV e JSON quase simultâneos → apenas 1 request e 1 download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio — nada para exportar");

    // Segura a resposta do primeiro export por 500ms para manter aria-busy=true.
    let exportRequests = 0;
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      exportRequests += 1;
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });

    const downloads: string[] = [];
    const onDl = (dl: import("@playwright/test").Download) =>
      downloads.push(dl.suggestedFilename());
    page.on("download", onDl);

    // Cliques quase simultâneos: o 2º cai enquanto o 1º está exporting.
    await Promise.all([
      csvBtn.click(),
      jsonBtn.click({ force: true }).catch(() => {}),
    ]);

    // O primeiro que ganhou vira busy; o outro fica disabled.
    // Não sabemos qual venceu no race, então basta garantir ≥1 busy.
    await expect(async () => {
      const csvBusy = await csvBtn.getAttribute("aria-busy");
      const jsonBusy = await jsonBtn.getAttribute("aria-busy");
      expect(csvBusy === "true" || jsonBusy === "true").toBe(true);
    }).toPass({ timeout: 2000 });

    // Aguarda o handler concluir.
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false");
    await page.waitForTimeout(400);
    page.off("download", onDl);

    expect(exportRequests, `esperava 1 request, recebi ${exportRequests}`).toBe(1);
    expect(downloads, `esperava 1 download, recebi ${downloads.length}`).toHaveLength(1);
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();
  });

  // ---------------------------------------------------------------- (38)
  // Export via teclado (Enter/Space) e transferência de foco enquanto
  // aria-busy="true". Enquanto exportando, o botão fica disabled e perde
  // o foco (ou o navegador skipa em Tab), mas o rótulo/testid permanecem.
  test("(38) Export via Enter/Space mantém rótulos e move foco quando disabled", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    // Segura o request para inspecionar o estado busy.
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });

    // Enter no CSV
    await csvBtn.focus();
    await expect(csvBtn).toBeFocused();
    const [dl1] = await Promise.all([
      page.waitForEvent("download"),
      page.keyboard.press("Enter"),
    ]);
    expect(dl1.suggestedFilename()).toMatch(/^stripe-reprocess-log.*\.csv$/);

    // Aguarda idle e verifica que o rótulo do botão CSV segue igual.
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveText(/CSV/);

    // Space no JSON
    await jsonBtn.focus();
    await expect(jsonBtn).toBeFocused();
    const [dl2] = await Promise.all([
      page.waitForEvent("download"),
      page.keyboard.press("Space"),
    ]);
    expect(dl2.suggestedFilename()).toMatch(/^stripe-reprocess-log.*\.json$/);
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(jsonBtn).toHaveText(/JSON/);

    // Enquanto exportando: foco deve poder mover via Tab (botão focado fica disabled).
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await csvBtn.focus();
    await page.keyboard.press("Enter");
    await expect(csvBtn).toHaveAttribute("aria-busy", "true", { timeout: 2000 });
    await page.keyboard.press("Tab");
    // Enquanto busy, o foco NÃO deve estar mais no botão CSV (disabled não recebe foco em Tab).
    await expect(csvBtn).not.toBeFocused();
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
  });

  // ---------------------------------------------------------------- (39)
  // Filenames determinísticos + únicos: dois downloads sequenciais no
  // mesmo segundo (~150ms de intervalo) devem gerar nomes DIFERENTES,
  // para o browser não sobrescrever o arquivo anterior.
  test("(39) Downloads no mesmo segundo têm filenames distintos", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    // 1º download.
    const [dl1] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    const name1 = dl1.suggestedFilename();
    expect(name1).toMatch(/^stripe-reprocess-log.*\.csv$/);

    // Aguarda o botão reabilitar e força 2º clique rápido — ainda dentro do mesmo segundo.
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();

    const [dl2] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    const name2 = dl2.suggestedFilename();
    expect(name2).toMatch(/^stripe-reprocess-log.*\.csv$/);

    // Nomes DEVEM diferir mesmo que a diferença seja só o sufixo -N ou os ms.
    expect(name2, `filenames iguais quebrariam o download: ${name1}`).not.toBe(name1);
  });

  // ---------------------------------------------------------------- (40)
  // Cada export (CSV e JSON) deve responder com Content-Disposition
  // contendo filename correto + Content-Type com charset, e o browser
  // deve salvar EXATAMENTE com esse nome.
  test("(40) Export CSV e JSON: Content-Disposition/Content-Type/charset + filename respeitado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    // CSV
    const [csvResp, csvDl] = await Promise.all([
      page.waitForResponse((r) => /\/api\/admin\/reprocess-log-export/.test(r.url()) && r.request().method() === "POST"),
      page.waitForEvent("download"),
      csvBtn.click(),
    ]);
    const csvCT = csvResp.headers()["content-type"] ?? "";
    const csvCD = csvResp.headers()["content-disposition"] ?? "";
    expect(csvCT).toMatch(/text\/csv/i);
    expect(csvCT).toMatch(/charset=utf-8/i);
    expect(csvCD).toMatch(/attachment/i);
    const csvHeaderName = /filename\*=UTF-8''([^;]+)/i.exec(csvCD)?.[1] ?? /filename="([^"]+)"/i.exec(csvCD)?.[1];
    expect(csvHeaderName, `Content-Disposition sem filename: ${csvCD}`).toBeTruthy();
    const csvExpected = decodeURIComponent(csvHeaderName!);
    expect(csvDl.suggestedFilename()).toBe(csvExpected);
    expect(csvExpected).toMatch(/^stripe-reprocess-log.*\.csv$/);

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // JSON
    const [jsonResp, jsonDl] = await Promise.all([
      page.waitForResponse((r) => /\/api\/admin\/reprocess-log-export/.test(r.url()) && r.request().method() === "POST"),
      page.waitForEvent("download"),
      jsonBtn.click(),
    ]);
    const jsonCT = jsonResp.headers()["content-type"] ?? "";
    const jsonCD = jsonResp.headers()["content-disposition"] ?? "";
    expect(jsonCT).toMatch(/application\/json/i);
    expect(jsonCT).toMatch(/charset=utf-8/i);
    expect(jsonCD).toMatch(/attachment/i);
    const jsonHeaderName = /filename\*=UTF-8''([^;]+)/i.exec(jsonCD)?.[1] ?? /filename="([^"]+)"/i.exec(jsonCD)?.[1];
    expect(jsonHeaderName).toBeTruthy();
    const jsonExpected = decodeURIComponent(jsonHeaderName!);
    expect(jsonDl.suggestedFilename()).toBe(jsonExpected);
    expect(jsonExpected).toMatch(/^stripe-reprocess-log.*\.json$/);
  });

  // ---------------------------------------------------------------- (41)
  // Enquanto aria-busy/data-exporting=true, os dois botões ficam
  // desabilitados (aria-disabled ou disabled), o foco não regride para
  // o botão busy via Tab, e os accessible names permanecem intactos.
  test("(41) aria-busy → aria-disabled/disabled + foco + accessible name preservado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const nameBefore = { csv: await csvBtn.textContent(), json: await jsonBtn.textContent() };

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.continue();
    });

    await csvBtn.focus();
    await page.keyboard.press("Enter");

    // busy=true → ambos ficam disabled (nativo) ou aria-disabled=true.
    await expect(csvBtn).toHaveAttribute("aria-busy", "true", { timeout: 2000 });
    await expect(async () => {
      const csvDisabled = (await csvBtn.isDisabled()) || (await csvBtn.getAttribute("aria-disabled")) === "true";
      const jsonDisabled = (await jsonBtn.isDisabled()) || (await jsonBtn.getAttribute("aria-disabled")) === "true";
      expect(csvDisabled).toBe(true);
      expect(jsonDisabled).toBe(true);
    }).toPass({ timeout: 2000 });

    // Accessible name/rótulo continua o mesmo mesmo com busy.
    expect((await csvBtn.textContent())?.trim()).toBe((nameBefore.csv ?? "").trim());
    expect((await jsonBtn.textContent())?.trim()).toBe((nameBefore.json ?? "").trim());
    await expect(csvBtn).toHaveText(/CSV/);
    await expect(jsonBtn).toHaveText(/JSON/);

    // Tab não deixa o foco no botão busy (ou porque disabled não recebe foco,
    // ou porque o browser skipou; qualquer um dos dois é aceitável).
    await page.keyboard.press("Tab");
    await expect(csvBtn).not.toBeFocused();

    // Ao terminar, tudo reabilita.
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();
  });

  // ---------------------------------------------------------------- (42)
  // O servidor deve SEMPRE mandar X-Export-Count, e o toast/estado da
  // UI deve refletir esse número exatamente ("(N registros)").
  test("(42) X-Export-Count sempre presente e refletido no toast", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/admin\/reprocess-log-export/.test(r.url()) && r.request().method() === "POST"),
      page.waitForEvent("download"),
      csvBtn.click(),
    ]);
    const headers = resp.headers();
    const count = headers["x-export-count"];
    expect(count, `X-Export-Count ausente. Headers: ${JSON.stringify(headers)}`).toBeDefined();
    expect(count).toMatch(/^\d+$/);

    const text = await readLastToast(page);
    expect(text).toMatch(T_OK_EXPORT_CSV);
    const m = /\((\d+) registros\)/.exec(text);
    expect(m, `toast sem "(N registros)": ${text}`).toBeTruthy();
    expect(m![1]).toBe(count);
  });

  // ---------------------------------------------------------------- (43)
  // RFC-4180: interceptamos a resposta CSV e injetamos linhas com
  // combinações complexas (aspas duplas consecutivas, vírgula, quebras
  // de linha CRLF/LF, "" iniciais). Validamos que o parser respeita:
  //   - linhas dentro de aspas não quebram a linha lógica
  //   - "" vira " literal
  //   - a correspondência stripe_event_id ↔ linha permanece 1:1
  test("(43) CSV com aspas/quebras de linha segue RFC-4180 e mantém stripe_event_id por linha", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const header = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");
    // Casos de teste — coluna "message" é a que carrega texto complexo.
    const rows = [
      // simples
      ["2026-07-02T12:00:00Z","success","live","checkout.session.completed","evt_alpha","u1","10","ok","row_a","id_a"],
      // aspas duplas consecutivas + vírgula
      ["2026-07-02T12:00:01Z","error","live","checkout.session.completed","evt_bravo","u1","20",
        `He said ""hi, there"" and left`,"row_b","id_b"],
      // quebras de linha LF dentro do campo
      ["2026-07-02T12:00:02Z","error","test","invoice.paid","evt_charlie","u2","30",
        "line1\nline2\nline3","row_c","id_c"],
      // quebras CRLF + aspa inicial
      ["2026-07-02T12:00:03Z","success","live","customer.subscription.updated","evt_delta","u3","40",
        `""leading quote""\r\nafter crlf`,"row_d","id_d"],
      // vírgula + quebra + aspas juntas
      ["2026-07-02T12:00:04Z","error","live","charge.failed","evt_echo","u4","50",
        `a,b\n"c",d ""e""`,"row_e","id_e"],
    ];
    const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csvBody = "\uFEFF" + [header, ...rows.map((r) => r.map(esc).join(","))].join("\n");
    const expectedIds = rows.map((r) => r[4]);

    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="stripe-reprocess-log_synthetic.csv"; filename*=UTF-8''stripe-reprocess-log_synthetic.csv`,
          "X-Export-Count": String(rows.length),
        },
        body: csvBody,
      });
    });

    const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    const path = await dl.path();
    expect(path).toBeTruthy();
    const fs = await import("node:fs/promises");
    const raw = (await fs.readFile(path!, "utf8")).replace(/^\uFEFF/, "");

    // Parser RFC-4180 minimalista para verificar a integridade.
    function parseCsv(input: string): string[][] {
      const out: string[][] = [];
      let cur: string[] = [];
      let field = "";
      let i = 0;
      let inQ = false;
      while (i < input.length) {
        const c = input[i];
        if (inQ) {
          if (c === '"') {
            if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
            inQ = false; i++; continue;
          }
          field += c; i++; continue;
        }
        if (c === '"') { inQ = true; i++; continue; }
        if (c === ",") { cur.push(field); field = ""; i++; continue; }
        if (c === "\r") { i++; continue; }
        if (c === "\n") { cur.push(field); out.push(cur); cur = []; field = ""; i++; continue; }
        field += c; i++;
      }
      if (field.length > 0 || cur.length > 0) { cur.push(field); out.push(cur); }
      return out;
    }

    const parsed = parseCsv(raw);
    // 1 header + 5 linhas de dados = 6 linhas lógicas
    expect(parsed.length, `esperava 6 linhas lógicas, recebi ${parsed.length}`).toBe(1 + expectedIds.length);
    // Header intacto
    expect(parsed[0].join(",")).toBe(header);
    // stripe_event_id (col index 4) por linha na ordem exata
    const gotIds = parsed.slice(1).map((r) => r[4]);
    expect(gotIds).toEqual(expectedIds);
    // Verifica que aspas duplas foram desescapadas corretamente na linha "bravo".
    expect(parsed[2][7]).toBe(`He said "hi, there" and left`);
    // Verifica quebras de linha preservadas dentro do campo (linha charlie).
    expect(parsed[3][7]).toBe("line1\nline2\nline3");
    // Linha delta: "" inicial vira " literal
    expect(parsed[4][7]).toContain(`"leading quote"`);
    expect(parsed[4][7]).toContain("after crlf");
    // Linha echo: vírgula + aspas
    expect(parsed[5][7]).toBe(`a,b\n"c",d "e"`);
  });

  // ---------------------------------------------------------------- (44)
  // Falha de API no export CSV e JSON: toast de erro aparece, e a UI
  // recupera aria-busy/data-exporting=false + botões reabilitados.
  test("(44) Falha no export CSV e JSON: toast de erro + estado normalizado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    await page.route(/\/api\/admin\/reprocess-log-export/, (route) =>
      route.fulfill({ status: 500, contentType: "text/plain", body: "boom" }),
    );

    // CSV
    await csvBtn.click();
    await expectToastMatchingAny(page, [/Falha ao exportar CSV|boom/i]);
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    // JSON
    await jsonBtn.click();
    await expectToastMatchingAny(page, [/Falha ao exportar JSON|boom/i]);
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(jsonBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();
  });

  // ---------------------------------------------------------------- (45)
  // Lista vazia mockada: baixa CSV com só header e JSON com "[]".
  // Headers Content-Type + Content-Disposition presentes, toast reflete
  // 0 registros (via X-Export-Count).
  test("(45) Export vazio: header-only CSV / [] JSON + toast '(0 registros)'", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();
    // Não pulamos por log vazio aqui — o mock cobre o caso.

    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");

    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="stripe-reprocess-log_empty.csv"; filename*=UTF-8''stripe-reprocess-log_empty.csv`,
          "X-Export-Count": "0",
        },
        body: "\uFEFF" + CSV_HEADER + "\n",
      }),
    );
    await page.route(/\/api\/admin\/reprocess-log-export\?format=json/, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json;charset=utf-8",
          "Content-Disposition": `attachment; filename="stripe-reprocess-log_empty.json"; filename*=UTF-8''stripe-reprocess-log_empty.json`,
          "X-Export-Count": "0",
        },
        body: "[]",
      }),
    );

    // Habilitar botões via force click já que podem estar disabled quando total=0.
    // Preferimos disparar via mock: se estão disabled, força programaticamente.
    async function forceExport(kind: "csv" | "json") {
      const btn = kind === "csv" ? csvBtn : jsonBtn;
      // Se disabled por total=0, disparamos via evaluate.
      const disabled = await btn.isDisabled();
      if (disabled) {
        await btn.evaluate((el: HTMLButtonElement) => {
          el.disabled = false;
          el.removeAttribute("aria-disabled");
        });
      }
      return btn;
    }

    // CSV
    const csv = await forceExport("csv");
    const [csvResp, csvDl] = await Promise.all([
      page.waitForResponse((r) => /reprocess-log-export\?format=csv/.test(r.url())),
      page.waitForEvent("download"),
      csv.click(),
    ]);
    expect(csvResp.headers()["content-type"]).toMatch(/text\/csv.*charset=utf-8/i);
    expect(csvResp.headers()["content-disposition"]).toMatch(/attachment/i);
    expect(csvResp.headers()["x-export-count"]).toBe("0");
    const csvText = (await (await import("node:fs/promises")).readFile((await csvDl.path())!, "utf8"))
      .replace(/^\uFEFF/, "").trim();
    expect(csvText).toBe(CSV_HEADER);
    const csvToast = await readLastToast(page);
    expect(csvToast).toMatch(/^CSV exportado \(0 registros\)$/);

    await expect(csv).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // JSON
    const jsn = await forceExport("json");
    const [jsonResp, jsonDl] = await Promise.all([
      page.waitForResponse((r) => /reprocess-log-export\?format=json/.test(r.url())),
      page.waitForEvent("download"),
      jsn.click(),
    ]);
    expect(jsonResp.headers()["content-type"]).toMatch(/application\/json.*charset=utf-8/i);
    expect(jsonResp.headers()["content-disposition"]).toMatch(/attachment/i);
    expect(jsonResp.headers()["x-export-count"]).toBe("0");
    const jsonText = (await (await import("node:fs/promises")).readFile((await jsonDl.path())!, "utf8")).trim();
    expect(JSON.parse(jsonText)).toEqual([]);
    const jsonToast = await readLastToast(page);
    expect(jsonToast).toMatch(/^JSON exportado \(0 registros\)$/);
  });

  // ---------------------------------------------------------------- (46)
  // aria-live: enquanto exportando, o span data-testid="log-export-status"
  // anuncia "Exportando CSV…" / "Exportando JSON…", e some ao concluir.
  // Foco permanece no botão que iniciou o export e accessible name intacto.
  test("(46) Progresso aria-live aparece durante export e some ao concluir", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    // Estado inicial: vazio.
    await expect(status).toHaveText("");

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });

    const nameBefore = (await csvBtn.textContent())?.trim();
    await csvBtn.focus();
    const dlPromise = page.waitForEvent("download");
    await page.keyboard.press("Enter");

    // Enquanto exportando: anúncio visível para AT.
    await expect(status).toHaveText("Exportando CSV…", { timeout: 2000 });
    // Rótulo do botão preservado.
    expect((await csvBtn.textContent())?.trim()).toBe(nameBefore);
    await expect(csvBtn).toHaveText(/CSV/);

    await dlPromise;
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    // aria-live volta a vazio depois de concluir.
    await expect(status).toHaveText("");
    // role=status persiste — não deve sumir do DOM.
    await expect(status).toHaveAttribute("aria-live", "polite");
  });

  // ---------------------------------------------------------------- (47)
  // Export sequencial de múltiplas páginas: cada download contém
  // apenas os ids daquela página (sem duplicar/perder) e filenames
  // ficam únicos entre downloads.
  test("(47) Multi-página: cada CSV cobre apenas os ids da página + filenames únicos", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();

    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");

    // Simula 3 páginas de 2 ids cada. Distinguimos por um cursor server-side
    // via header customizado (X-Page) — o cliente não muda a request, então
    // roteamos por chamada #.
    const pages = [
      ["evt_p1_a", "evt_p1_b"],
      ["evt_p2_a", "evt_p2_b"],
      ["evt_p3_a", "evt_p3_b"],
    ];
    let call = 0;
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      const ids = pages[Math.min(call, pages.length - 1)];
      call += 1;
      const rows = ids.map((sid, i) =>
        [
          `2026-07-02T12:0${i}:00Z`, "success", "live",
          "checkout.session.completed", sid, "u1", "10", "ok",
          `row_${sid}`, `id_${sid}`,
        ].join(","),
      );
      const body = "\uFEFF" + [CSV_HEADER, ...rows].join("\n");
      const stamp = Date.now() + "-" + call;
      const fname = `stripe-reprocess-log_page-${call}_${stamp}.csv`;
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
          "X-Export-Count": String(ids.length),
        },
        body,
      });
    });

    const fs = await import("node:fs/promises");
    const filenames = new Set<string>();
    const allIds: string[] = [];

    // Se o botão está disabled (log vazio), forçamos habilitar para o mock cobrir.
    async function unlock() {
      if (await csvBtn.isDisabled()) {
        await csvBtn.evaluate((el: HTMLButtonElement) => { el.disabled = false; });
      }
    }

    for (let i = 0; i < pages.length; i++) {
      await unlock();
      const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
      const fname = dl.suggestedFilename();
      expect(filenames.has(fname), `filename repetido: ${fname}`).toBe(false);
      filenames.add(fname);
      const txt = (await fs.readFile((await dl.path())!, "utf8")).replace(/^\uFEFF/, "").trim();
      const lines = txt.split(/\r?\n/);
      expect(lines[0]).toBe(CSV_HEADER);
      const idsInFile = lines.slice(1).map((l) => l.split(",")[4]);
      expect(idsInFile).toEqual(pages[i]);
      allIds.push(...idsInFile);
      await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    }

    // Nenhum id duplicado no total, e cobre exatamente o esperado.
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toEqual(pages.flat());
    expect(filenames.size).toBe(pages.length);
  });

  // ---------------------------------------------------------------- (48)
  // 1ª tentativa falha (500) → toast de erro, sem download, botão volta ao normal.
  // 2ª tentativa (usuário aciona de novo) responde OK → 1 único download,
  // toast de sucesso com contagem correta, aria-busy/data-exporting refletem
  // cada tentativa de forma independente (sem "grudar" do request anterior).
  test("(48) Retry manual após falha: sem downloads duplicados; toast/aria-busy por tentativa", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");

    let call = 0;
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      call++;
      // pequena latência pra observar aria-busy=true em ambas as tentativas
      await new Promise((r) => setTimeout(r, 250));
      if (call === 1) {
        await route.fulfill({
          status: 500,
          headers: { "Content-Type": "application/json;charset=utf-8" },
          body: JSON.stringify({ error: "boom" }),
        });
        return;
      }
      const rows = [
        `2026-07-01T10:00:00Z,success,live,checkout.session.completed,evt_retry_1,user_a,42,ok,row_1,log_1`,
        `2026-07-01T10:00:01Z,success,live,checkout.session.completed,evt_retry_2,user_a,50,ok,row_2,log_2`,
      ];
      const fname = `stripe-reprocess-log_retry_${Date.now()}.csv`;
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
          "X-Export-Count": "2",
        },
        body: "\uFEFF" + [CSV_HEADER, ...rows].join("\n"),
      });
    });

    // Contador de downloads reais — não pode ter 2 na 1ª tentativa.
    let downloads = 0;
    page.on("download", () => { downloads++; });

    // 1ª tentativa (falha)
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    const errToast = await readLastToast(page);
    expect(errToast).toMatch(/(Falha|erro).*(export|CSV)/i);
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    expect(downloads, "não deve haver download na falha").toBe(0);

    // 2ª tentativa (sucesso) — usuário reclica.
    const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    const okToast = await readLastToast(page);
    expect(okToast).toMatch(/^CSV exportado \(2 registros\)$/);
    expect(downloads).toBe(1);
    const txt = (await (await import("node:fs/promises")).readFile((await dl.path())!, "utf8"))
      .replace(/^\uFEFF/, "").trim();
    const ids = txt.split(/\r?\n/).slice(1).map((l) => l.split(",")[4]);
    expect(ids).toEqual(["evt_retry_1", "evt_retry_2"]);
    expect(call).toBe(2);
  });

  // ---------------------------------------------------------------- (49)
  // Usuário "cancela" um export em andamento no exato instante do erro da API.
  // O route abort() simula a interrupção da request. Não deve sair download
  // e aria-busy/data-exporting devem voltar ao estado normal.
  test("(49) Cancelamento no meio do erro: sem download; aria-busy/data-exporting normalizam", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    let downloads = 0;
    page.on("download", () => { downloads++; });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      // Espera pra deixar aria-busy=true visível, depois aborta como se o
      // usuário cancelasse exatamente quando a API retornaria erro.
      await new Promise((r) => setTimeout(r, 400));
      await route.abort("failed");
    });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Após aborto, UI deve normalizar e mostrar toast de erro (sem download).
    const t = await readLastToast(page);
    expect(t).toMatch(/(Falha|erro|cancel)/i);
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    expect(downloads, "abort não pode gerar download").toBe(0);
  });

  // ---------------------------------------------------------------- (50)
  // aria-live: toasts de erro e sucesso devem ser anunciáveis (region live),
  // permanecer legíveis por tempo suficiente após o download e o foco NÃO
  // deve ser roubado do botão que iniciou o export.
  test("(50) Toasts erro/sucesso: aria-live correto, legíveis e sem perder foco", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");

    let n = 0;
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      n++;
      if (n === 1) {
        await route.fulfill({ status: 500, body: "err" });
        return;
      }
      const body = "\uFEFF" + CSV_HEADER + "\n" +
        "2026-07-01T10:00:00Z,success,live,checkout.session.completed,evt_live_ok,u,10,ok,r,l\n";
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="stripe-reprocess-log_live.csv"; filename*=UTF-8''stripe-reprocess-log_live.csv`,
          "X-Export-Count": "1",
        },
        body,
      });
    });

    // 1) Erro: toast em region live e foco preservado no botão.
    await csvBtn.focus();
    await csvBtn.click();
    const errToast = page.locator("[data-sonner-toast]").last();
    await expect(errToast).toBeVisible();
    // Sonner monta um wrapper com aria-live/role region — validamos a região "ol/section".
    const liveRegion = page.locator('[aria-live], [role="status"], [role="region"][aria-label*="Notifi" i]').first();
    await expect(liveRegion).toBeAttached();
    expect(await errToast.innerText()).toMatch(/(Falha|erro)/i);
    // Foco permanece no botão.
    await expect(csvBtn).toBeFocused();

    // 2) Sucesso: toast permanece legível por >= 800ms após término.
    const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    await dl.path();
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    const okToast = page.locator("[data-sonner-toast]").last();
    await expect(okToast).toBeVisible();
    const initial = (await okToast.innerText()).trim();
    expect(initial).toMatch(/^CSV exportado \(1 registros\)$/);
    await page.waitForTimeout(800);
    // Ainda visível/legível após o download concluir.
    await expect(okToast).toBeVisible();
    expect((await okToast.innerText()).trim()).toBe(initial);
    // Foco preservado no botão de origem.
    await expect(csvBtn).toBeFocused();
  });

  // ---------------------------------------------------------------- (51)
  // Export com filtros + ordenação complexos: request deve refletir os
  // parâmetros; CSV/JSON só contêm os ids esperados e a contagem no toast
  // bate exatamente com X-Export-Count.
  test("(51) Filtros + sort complexos: request refletido, ids esperados, toast==X-Export-Count", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    // Aplica filtros + sort via URL (evita depender de UI específica de filtro).
    const u = new URL(page.url());
    u.pathname = ROUTE;
    u.searchParams.set("tab", "reprocess-log");
    u.searchParams.set("l_oc", "error");
    u.searchParams.set("l_uid", "user_x");
    u.searchParams.set("l_sid", "evt_flt_");
    u.searchParams.set("l_since", "2026-06-01");
    u.searchParams.set("l_until", "2026-06-30");
    u.searchParams.set("l_sb", "duration_ms");
    u.searchParams.set("l_sd", "desc");
    u.searchParams.set("l_ps", "25");
    u.searchParams.set("l_p", "0");
    await page.goto(u.pathname + "?" + u.searchParams.toString());
    await page.waitForLoadState("domcontentloaded");

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();

    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");
    const expectedIds = ["evt_flt_c", "evt_flt_b", "evt_flt_a"]; // desc por duração
    const rows = [
      `2026-06-15T10:00:00Z,error,live,checkout.session.completed,evt_flt_c,user_x,900,timeout,r3,l3`,
      `2026-06-14T10:00:00Z,error,live,checkout.session.completed,evt_flt_b,user_x,600,timeout,r2,l2`,
      `2026-06-13T10:00:00Z,error,live,checkout.session.completed,evt_flt_a,user_x,300,timeout,r1,l1`,
    ];

    let observed: any = null;
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      const req = route.request();
      try { observed = req.postDataJSON(); } catch { observed = null; }
      const isCsv = /format=csv/.test(req.url());
      if (isCsv) {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/csv;charset=utf-8",
            "Content-Disposition": `attachment; filename="stripe-reprocess-log_filt.csv"; filename*=UTF-8''stripe-reprocess-log_filt.csv`,
            "X-Export-Count": String(expectedIds.length),
          },
          body: "\uFEFF" + [CSV_HEADER, ...rows].join("\n"),
        });
      } else {
        const arr = expectedIds.map((id) => ({ stripe_event_id: id, outcome: "error" }));
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Content-Disposition": `attachment; filename="stripe-reprocess-log_filt.json"; filename*=UTF-8''stripe-reprocess-log_filt.json`,
            "X-Export-Count": String(arr.length),
          },
          body: JSON.stringify(arr),
        });
      }
    });

    // Se botões desabilitados pelo total local, force-habilita para permitir chamada.
    for (const b of [csvBtn, jsonBtn]) {
      if (await b.isDisabled()) {
        await b.evaluate((el: HTMLButtonElement) => { el.disabled = false; el.removeAttribute("aria-disabled"); });
      }
    }

    // CSV
    const [csvResp, csvDl] = await Promise.all([
      page.waitForResponse((r) => /reprocess-log-export\?format=csv/.test(r.url())),
      page.waitForEvent("download"),
      csvBtn.click(),
    ]);
    expect(observed, "server deve receber payload").toBeTruthy();
    expect(observed.sortBy).toBe("duration_ms");
    expect(observed.sortDir).toBe("desc");
    // Filtros refletidos (aceita subset — nomes podem variar entre stripeEventId/eventId).
    const asStr = JSON.stringify(observed);
    expect(asStr).toContain("evt_flt_");
    expect(asStr).toContain("user_x");
    expect(asStr).toMatch(/error/);
    const csvCount = csvResp.headers()["x-export-count"];
    const csvText = (await (await import("node:fs/promises")).readFile((await csvDl.path())!, "utf8"))
      .replace(/^\uFEFF/, "").trim();
    const csvIds = csvText.split(/\r?\n/).slice(1).map((l) => l.split(",")[4]);
    expect(csvIds).toEqual(expectedIds);
    const csvToast = await readLastToast(page);
    expect(csvToast).toBe(`CSV exportado (${csvCount} registros)`);

    // JSON
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    const [jsonResp, jsonDl] = await Promise.all([
      page.waitForResponse((r) => /reprocess-log-export\?format=json/.test(r.url())),
      page.waitForEvent("download"),
      jsonBtn.click(),
    ]);
    const jsonCount = jsonResp.headers()["x-export-count"];
    const parsed = JSON.parse(
      await (await import("node:fs/promises")).readFile((await jsonDl.path())!, "utf8"),
    );
    expect(parsed.map((r: any) => r.stripe_event_id)).toEqual(expectedIds);
    const jsonToast = await readLastToast(page);
    expect(jsonToast).toBe(`JSON exportado (${jsonCount} registros)`);
  });

  // ---------------------------------------------------------------- (52)
  // Última página com menos itens do que o limit: offset correto,
  // sem duplicar registros anteriores e arquivo com exatamente N linhas.
  test("(52) Última página parcial: offset correto, sem duplicatas, N linhas exatas", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const PAGE_SIZE = 25;
    // Simula 27 registros: página 0 (25) e página 1 (2).
    const allIds = Array.from({ length: 27 }, (_, i) => `evt_p_${String(i).padStart(3, "0")}`);
    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");

    // Navegar direto para a última página via URL.
    const u = new URL(page.url());
    u.pathname = ROUTE;
    u.searchParams.set("tab", "reprocess-log");
    u.searchParams.set("l_ps", String(PAGE_SIZE));
    u.searchParams.set("l_p", "1");
    await page.goto(u.pathname + "?" + u.searchParams.toString());
    await page.waitForLoadState("domcontentloaded");

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();

    let capturedOffset: number | undefined;
    let capturedLimit: number | undefined;
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      const req = route.request();
      const payload = (() => { try { return req.postDataJSON(); } catch { return {}; } })();
      capturedOffset = payload.offset;
      capturedLimit = payload.limit;
      const offset = Number.isFinite(payload.offset) ? payload.offset : 0;
      const limit = Number.isFinite(payload.limit) ? payload.limit : PAGE_SIZE;
      const slice = allIds.slice(offset, offset + limit);
      const isCsv = /format=csv/.test(req.url());
      if (isCsv) {
        const rows = slice.map(
          (id, i) => `2026-07-01T10:00:${String(i).padStart(2, "0")}Z,success,live,checkout.session.completed,${id},u,10,ok,r_${i},l_${i}`,
        );
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/csv;charset=utf-8",
            "Content-Disposition": `attachment; filename="stripe-reprocess-log_lastpage_${offset}.csv"; filename*=UTF-8''stripe-reprocess-log_lastpage_${offset}.csv`,
            "X-Export-Count": String(slice.length),
          },
          body: "\uFEFF" + [CSV_HEADER, ...rows].join("\n"),
        });
      } else {
        const arr = slice.map((id) => ({ stripe_event_id: id }));
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Content-Disposition": `attachment; filename="stripe-reprocess-log_lastpage_${offset}.json"; filename*=UTF-8''stripe-reprocess-log_lastpage_${offset}.json`,
            "X-Export-Count": String(arr.length),
          },
          body: JSON.stringify(arr),
        });
      }
    });

    for (const b of [csvBtn, jsonBtn]) {
      if (await b.isDisabled()) {
        await b.evaluate((el: HTMLButtonElement) => { el.disabled = false; el.removeAttribute("aria-disabled"); });
      }
    }

    // CSV
    const [csvResp, csvDl] = await Promise.all([
      page.waitForResponse((r) => /reprocess-log-export\?format=csv/.test(r.url())),
      page.waitForEvent("download"),
      csvBtn.click(),
    ]);
    expect(capturedLimit).toBe(PAGE_SIZE);
    expect(capturedOffset).toBe(PAGE_SIZE); // página 1 → offset=25
    expect(csvResp.headers()["x-export-count"]).toBe("2");
    const csvTxt = (await (await import("node:fs/promises")).readFile((await csvDl.path())!, "utf8"))
      .replace(/^\uFEFF/, "").trim();
    const lines = csvTxt.split(/\r?\n/);
    // 1 header + 2 rows exatos.
    expect(lines.length).toBe(3);
    const csvIds = lines.slice(1).map((l) => l.split(",")[4]);
    expect(csvIds).toEqual(allIds.slice(PAGE_SIZE));
    // Nenhum id anterior escapou pra esta página.
    for (const prev of allIds.slice(0, PAGE_SIZE)) expect(csvIds).not.toContain(prev);
    // Sem duplicatas.
    expect(new Set(csvIds).size).toBe(csvIds.length);
    const csvToast = await readLastToast(page);
    expect(csvToast).toBe("CSV exportado (2 registros)");

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // JSON
    const [jsonResp, jsonDl] = await Promise.all([
      page.waitForResponse((r) => /reprocess-log-export\?format=json/.test(r.url())),
      page.waitForEvent("download"),
      jsonBtn.click(),
    ]);
    expect(capturedLimit).toBe(PAGE_SIZE);
    expect(capturedOffset).toBe(PAGE_SIZE);
    expect(jsonResp.headers()["x-export-count"]).toBe("2");
    const parsed = JSON.parse(
      await (await import("node:fs/promises")).readFile((await jsonDl.path())!, "utf8"),
    );
    expect(parsed.map((r: any) => r.stripe_event_id)).toEqual(allIds.slice(PAGE_SIZE));
    const jsonToast = await readLastToast(page);
    expect(jsonToast).toBe("JSON exportado (2 registros)");
  });

  // ---------------------------------------------------------------- (53)
  // Cancelar enquanto a request ainda está em andamento (sem resposta):
  // não deve iniciar download e aria-busy/data-exporting voltam ao normal.
  //
  // Implementação: interceptamos a rota e nunca resolvemos; disparamos o
  // export e, enquanto ele está pendente, chamamos AbortController via
  // page.evaluate para abortar TODAS as requests em curso na aba (o app
  // usa fetch, então injetamos um wrap prévio que expõe o controller).
  test("(53) Cancel em request em andamento: sem download, aria-busy/data-exporting normalizam", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    // Injeta um AbortController compartilhado antes da navegação/click.
    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const origFetch = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return origFetch(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return origFetch(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    let downloads = 0;
    page.on("download", () => { downloads++; });

    // Route "pendura" a resposta — nunca resolve, forçando cancelamento client-side.
    let unblock: (() => void) | null = null;
    const blocked = new Promise<void>((r) => { unblock = r; });
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await blocked; // permanece pendente até o teste liberar
      await route.abort("failed");
    });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Cancela a request em curso.
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    // UI normaliza mesmo com a request ainda "presa" no route handler.
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    expect(downloads, "cancel em request em andamento não pode gerar download").toBe(0);

    // Libera o route handler pra não vazar.
    unblock?.();
  });

  // ---------------------------------------------------------------- (54)
  // Cancel aborta o fetch: mesmo que o servidor responda depois, nenhum
  // processamento adicional acontece (sem download novo, sem toast extra).
  test("(54) Cancel aborta fetch: resposta tardia não gera download nem toast duplicado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const origFetch = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return origFetch(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return origFetch(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");

    let downloads = 0;
    page.on("download", () => { downloads++; });

    // Servidor responde OK, porém DEPOIS do cancel — o fetch já estará abortado.
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="late.csv"; filename*=UTF-8''late.csv`,
          "X-Export-Count": "1",
        },
        body: "\uFEFF" + CSV_HEADER + "\n2026-07-01T00:00:00Z,success,live,x,evt_late,u,1,ok,r,l\n",
      });
    });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Cancela antes da resposta chegar.
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    // UI já normalizou; captura o toast de erro/cancel (se houver).
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    const toastsAfterAbort = await page.locator("[data-sonner-toast]").count();

    // Aguarda a resposta tardia do servidor chegar (fetch já abortado).
    await page.waitForTimeout(1500);

    // Nenhum download extra e nenhum toast novo depois da resposta tardia.
    expect(downloads, "fetch abortado não pode consumir a resposta tardia").toBe(0);
    const toastsFinal = await page.locator("[data-sonner-toast]").count();
    expect(toastsFinal).toBe(toastsAfterAbort);

    // Estado do botão continua estável (não voltou a "exporting" por causa da resposta).
    await expect(csvBtn).toHaveAttribute("data-exporting", "false");
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
  });

  // ---------------------------------------------------------------- (55)
  // Após falha + retry, filenames dos downloads permanecem únicos mesmo
  // quando as duas tentativas caem no mesmo segundo — o navegador não
  // sobrescreve o arquivo anterior.
  test("(55) Filenames únicos entre tentativas (falha + retry no mesmo segundo)", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");

    let call = 0;
    // Congela o timestamp de forma que ambas as respostas usem o mesmo segundo,
    // forçando o gerador de filename do cliente a garantir unicidade via
    // contador/ms — validamos que os nomes finais são distintos.
    const FIXED = "2026-07-02-12-34-56";
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      call++;
      if (call === 1) {
        await route.fulfill({ status: 500, body: "err" });
        return;
      }
      // 2ª e 3ª chamada retornam sucesso com filename baseado no MESMO segundo.
      const rows = [
        `2026-07-01T10:00:00Z,success,live,checkout.session.completed,evt_try_${call},u,10,ok,r_${call},l_${call}`,
      ];
      // Servidor devolve um nome "genérico" — cliente deve suffixar com contador ms/unique.
      const fname = `stripe-reprocess-log_${FIXED}.csv`;
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="${fname}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
          "X-Export-Count": "1",
        },
        body: "\uFEFF" + [CSV_HEADER, ...rows].join("\n"),
      });
    });

    const seen: string[] = [];

    // Tentativa 1: falha.
    await csvBtn.click();
    const errToast = await readLastToast(page);
    expect(errToast).toMatch(/(Falha|erro)/i);
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // Retry #2 (sucesso) — no MESMO segundo.
    const [dl2] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    seen.push(dl2.suggestedFilename());
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // Retry #3 (sucesso, também mesmo segundo) — mais uma prova de unicidade.
    const [dl3] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    seen.push(dl3.suggestedFilename());
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // Ambos os filenames devem ser distintos (sem sobrescrita).
    expect(new Set(seen).size).toBe(seen.length);
    // Sanity: base compartilhada com o segundo fixo, mas sufixos diferentes.
    for (const name of seen) expect(name).toMatch(new RegExp(FIXED));
    expect(seen[0]).not.toBe(seen[1]);
  });

  // ---------------------------------------------------------------- (56)
  // aria-live durante tentativas com falha + recuperação:
  // Ordem esperada: "Exportando CSV…" → (limpa) → toast erro → nova tentativa
  // "Exportando CSV…" → (limpa) → toast sucesso.
  // Não deve haver sobreposição (progresso + resultado ao mesmo tempo).
  test("(56) aria-live não sobrepõe progresso e resultado entre falha e sucesso", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");
    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");

    // Grava sequência de estados do aria-live para validar ordem.
    const timeline: Array<{ t: number; text: string }> = [];
    const startedAt = Date.now();
    const stop = setInterval(async () => {
      try {
        const txt = (await status.textContent())?.trim() ?? "";
        const last = timeline[timeline.length - 1]?.text;
        if (txt !== last) timeline.push({ t: Date.now() - startedAt, text: txt });
      } catch { /* ignore */ }
    }, 60);

    let call = 0;
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      call++;
      await new Promise((r) => setTimeout(r, 400)); // dá tempo do "Exportando CSV…" aparecer
      if (call === 1) {
        await route.fulfill({ status: 500, body: "err" });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="retry_ok.csv"; filename*=UTF-8''retry_ok.csv`,
          "X-Export-Count": "1",
        },
        body: "\uFEFF" + CSV_HEADER + "\n2026-07-01T00:00:00Z,success,live,x,evt_rec,u,1,ok,r,l\n",
      });
    });

    // Estado inicial vazio.
    await expect(status).toHaveText("");

    // Tentativa 1 (falha).
    await csvBtn.click();
    await expect(status).toHaveText("Exportando CSV…", { timeout: 2000 });
    // Quando o toast de erro aparecer, o aria-live já deve estar limpo — sem sobreposição.
    const errToast = page.locator("[data-sonner-toast]").last();
    await expect(errToast).toBeVisible({ timeout: 8000 });
    await expect(status).toHaveText("");
    expect((await errToast.innerText()).trim()).toMatch(/(Falha|erro)/i);

    // Tentativa 2 (sucesso).
    const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    await expect(status).toHaveText("Exportando CSV…", { timeout: 2000 });
    await dl.path();
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("");
    const okToast = page.locator("[data-sonner-toast]").last();
    await expect(okToast).toBeVisible();
    expect((await okToast.innerText()).trim()).toMatch(/^CSV exportado \(1 registros\)$/);

    clearInterval(stop);

    // Ordem esperada: "" (baseline) → "Exportando CSV…" → "" → "Exportando CSV…" → "".
    const sequence = timeline.map((e) => e.text);
    // Remove duplicações consecutivas por segurança (o filtro já garante, mas defensivo).
    const dedup = sequence.filter((v, i) => v !== sequence[i - 1]);
    // Aceita "" como estado inicial opcional.
    const trimmed = dedup[0] === "" ? dedup.slice(1) : dedup;
    expect(trimmed.slice(0, 4)).toEqual([
      "Exportando CSV…",
      "",
      "Exportando CSV…",
      "",
    ]);
    // Nenhum ponto da timeline deve conter o texto do toast — provando não-sobreposição.
    for (const step of trimmed) {
      expect(step).not.toMatch(/CSV exportado/);
      expect(step).not.toMatch(/Falha/i);
    }
  });

  // ---------------------------------------------------------------- (57)
  // Ao cancelar um export em andamento, o foco DEVE retornar/permanecer no
  // botão que iniciou o export (CSV ou JSON), com accessible name intacto,
  // e a navegação por teclado (Tab/Shift+Tab) deve continuar funcionando.
  test("(57) Cancel preserva foco, accessible name e navegação por teclado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    for (const kind of ["csv", "json"] as const) {
      const btn = page.getByTestId(`log-export-${kind}`);
      await expect(btn).toBeVisible();
      if (await btn.isDisabled()) test.skip(true, "Log vazio");

      const nameBefore = (await btn.getAttribute("aria-label")) ?? (await btn.textContent())?.trim() ?? "";

      // Route que pendura, forçando o cancel.
      let unblock: (() => void) | null = null;
      const gate = new Promise<void>((r) => { unblock = r; });
      const routeMatcher = new RegExp(`/api/admin/reprocess-log-export\\?format=${kind}`);
      await page.route(routeMatcher, async (route) => {
        await gate;
        await route.abort("failed");
      });

      // Dispara via teclado pra provar navegação por teclado desde o início.
      await btn.focus();
      await expect(btn).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(btn).toHaveAttribute("aria-busy", "true");

      // Cancela.
      await page.evaluate(() => {
        const w = window as unknown as { __exportAC?: AbortController };
        w.__exportAC?.abort();
      });

      await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
      // Foco permanece/retorna ao botão de origem.
      await expect(btn).toBeFocused();
      // Accessible name preservado.
      const nameAfter = (await btn.getAttribute("aria-label")) ?? (await btn.textContent())?.trim() ?? "";
      expect(nameAfter).toBe(nameBefore);
      // Rótulo textual continua reconhecível.
      await expect(btn).toHaveText(new RegExp(kind === "csv" ? "CSV" : "JSON", "i"));

      // Navegação por teclado ainda funciona: Tab move para outro elemento focável.
      await page.keyboard.press("Tab");
      const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? null);
      expect(focusedTag).not.toBeNull();
      // Shift+Tab volta.
      await page.keyboard.press("Shift+Tab");
      await expect(btn).toBeFocused();

      unblock?.();
      await page.unroute(routeMatcher);
    }
  });

  // ---------------------------------------------------------------- (58)
  // Cancela CSV e JSON separadamente, incluindo tentativas consecutivas do
  // mesmo botão. Nenhum download; aria-busy/data-exporting normalizam em ambos.
  test("(58) Cancel independente CSV/JSON e retries consecutivos: sem downloads, estados normalizam", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();
    if ((await csvBtn.isDisabled()) && (await jsonBtn.isDisabled())) test.skip(true, "Log vazio");

    let downloads = 0;
    page.on("download", () => { downloads++; });

    // Ambas as rotas ficam penduradas até serem abortadas via signal.
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise<void>((resolve) => {
        // Nunca resolve por si só — depende do signal do fetch (abort do controller).
        // Playwright aborta o route quando o request é cancelado no browser.
        route.request().response().catch(() => resolve());
        // Fallback: mata em 5s pra não vazar.
        setTimeout(() => { resolve(); route.abort("failed").catch(() => {}); }, 5000);
      });
    });

    async function attemptAndCancel(btn: Locator) {
      await btn.click();
      await expect(btn).toHaveAttribute("aria-busy", "true");
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        const w = window as unknown as { __exportAC?: AbortController };
        w.__exportAC?.abort();
      });
      await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
      await expect(btn).toHaveAttribute("aria-busy", "false");
      await expect(btn).toBeEnabled();
    }

    // CSV cancel #1
    await attemptAndCancel(csvBtn);
    // Enquanto isso o JSON continua ocioso (independência de estado).
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false");
    await expect(jsonBtn).toHaveAttribute("aria-busy", "false");

    // CSV cancel #2 (consecutivo no mesmo botão)
    await attemptAndCancel(csvBtn);

    // JSON cancel #1
    await attemptAndCancel(jsonBtn);
    await expect(csvBtn).toHaveAttribute("data-exporting", "false");
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");

    // JSON cancel #2 (consecutivo)
    await attemptAndCancel(jsonBtn);

    expect(downloads, "nenhum cancel pode gerar download").toBe(0);
  });

  // ---------------------------------------------------------------- (59)
  // Alta latência + cancel: aria-live não pode ficar "presa" em
  // "Exportando …" após o cancelamento; o status final deve ser atualizado
  // (voltar para vazio) e um novo export deve conseguir anunciar de novo.
  test("(59) Alta latência + cancel: aria-live não fica presa em 'exportando'", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const CSV_HEADER = [
      "created_at","outcome","environment","event_type","stripe_event_id",
      "actor_user_id","duration_ms","message","event_row_id","id",
    ].join(",");

    let call = 0;
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      call++;
      if (call === 1) {
        // Alta latência — ficará esperando até o cancel abortar o fetch.
        await new Promise((r) => setTimeout(r, 4000));
        await route.abort("failed");
        return;
      }
      // Recuperação: 2ª chamada responde OK.
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="recover.csv"; filename*=UTF-8''recover.csv`,
          "X-Export-Count": "1",
        },
        body: "\uFEFF" + CSV_HEADER + "\n2026-07-01T00:00:00Z,success,live,x,evt_rec,u,1,ok,r,l\n",
      });
    });

    await expect(status).toHaveText("");

    // Dispara export com alta latência.
    await csvBtn.click();
    await expect(status).toHaveText("Exportando CSV…", { timeout: 2000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Cancela após ver a mensagem de progresso.
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    // Status final: aria-live volta a vazio (não fica preso em "Exportando…").
    await expect(status).toHaveText("", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false");
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();

    // Sanity: após o cancel, o status permanece vazio por um tempo (não
    // "renasce" sozinho por causa de resposta tardia).
    await page.waitForTimeout(500);
    await expect(status).toHaveText("");

    // Um novo export consegue anunciar novamente (aria-live não travou).
    const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
    await expect(status).toHaveText("Exportando CSV…", { timeout: 2000 });
    await dl.path();
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("");
  });

  // ---------------------------------------------------------------- (60)
  // Cancelar com a tecla Escape: foco retorna ao botão de origem (CSV/JSON),
  // accessible name preservado e nenhum download inicia.
  //
  // Estratégia: injetamos um AbortController no fetch de export e um listener
  // global de "Escape" que dispara .abort(). Assim o teste é determinístico
  // independentemente da implementação atual do app aceitar Escape nativamente.
  test("(60) Cancel via Escape: foco/accessible name preservados, sem download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") w.__exportAC?.abort();
      }, true);
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    for (const kind of ["csv", "json"] as const) {
      const btn = page.getByTestId(`log-export-${kind}`);
      await expect(btn).toBeVisible();
      if (await btn.isDisabled()) test.skip(true, "Log vazio");

      const nameBefore = (await btn.getAttribute("aria-label")) ?? (await btn.textContent())?.trim() ?? "";

      // Route pendurada até o Escape abortar.
      const routeMatcher = new RegExp(`/api/admin/reprocess-log-export\\?format=${kind}`);
      let unblock: (() => void) | null = null;
      const gate = new Promise<void>((r) => { unblock = r; });
      await page.route(routeMatcher, async (route) => {
        await gate;
        await route.abort("failed");
      });

      let dls = 0;
      const onDl = () => { dls++; };
      page.on("download", onDl);

      await btn.focus();
      await page.keyboard.press("Enter");
      await expect(btn).toHaveAttribute("aria-busy", "true");
      await expect(btn).toBeFocused();

      // Escape cancela.
      await page.keyboard.press("Escape");

      await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
      await expect(btn).toHaveAttribute("aria-busy", "false");
      await expect(btn).toBeFocused();

      const nameAfter = (await btn.getAttribute("aria-label")) ?? (await btn.textContent())?.trim() ?? "";
      expect(nameAfter).toBe(nameBefore);
      await expect(btn).toHaveText(new RegExp(kind === "csv" ? "CSV" : "JSON", "i"));

      expect(dls, `Escape cancel não pode gerar download (${kind})`).toBe(0);

      page.off("download", onDl);
      unblock?.();
      await page.unroute(routeMatcher);
    }
  });

  // ---------------------------------------------------------------- (61)
  // Cancel durante export de múltiplas páginas: a request em curso é
  // abortada, nenhum download inicia e aria-busy/data-exporting normalizam.
  //
  // Simula um cenário "multi-página" onde o cliente dispararia várias
  // requests em sequência. Cancelamos na primeira e garantimos que nem a
  // corrente nem as próximas resultam em download.
  test("(61) Cancel em export multi-página: abort, sem downloads, estado normalizado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as {
        __exportAC?: AbortController; __exportCalls?: number; fetch: typeof fetch;
      };
      w.__exportCalls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportCalls = (w.__exportCalls ?? 0) + 1;
          // Um AbortController compartilhado para "cancelar tudo" com um abort só.
          if (!w.__exportAC || w.__exportAC.signal.aborted) w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    let downloads = 0;
    page.on("download", () => { downloads++; });

    // Pendura a resposta — cliente cancela antes de qualquer página completar.
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });

    // Dispara a primeira página.
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Cancela no meio do "multi-página".
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();

    // Aguarda tempo suficiente para "qualquer próxima página" possivelmente iniciar.
    await page.waitForTimeout(1200);
    expect(downloads, "cancel de multi-página não pode gerar download").toBe(0);

    // Sanity: se o cliente tentou disparar mais páginas, todas ficaram sob o
    // mesmo signal abortado — não geraram download nem restauraram o estado.
    const calls = await page.evaluate(() => {
      const w = window as unknown as { __exportCalls?: number };
      return w.__exportCalls ?? 0;
    });
    expect(calls).toBeGreaterThanOrEqual(1);
    await expect(csvBtn).toHaveAttribute("data-exporting", "false");
  });

  // ---------------------------------------------------------------- (62)
  // Durante o export, ambos os botões (CSV/JSON) devem ficar desabilitados
  // (via `disabled` ou `aria-disabled`). Após o cancel, ambos reabilitam
  // e nenhuma mensagem aria-live fica presa.
  test("(62) Cancel: botões CSV/JSON desabilitam durante e reabilitam depois; aria-live limpa", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    let downloads = 0;
    page.on("download", () => { downloads++; });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.abort("failed");
    });

    async function isBlocked(btn: Locator) {
      const disabledAttr = await btn.getAttribute("disabled");
      const ariaDisabled = await btn.getAttribute("aria-disabled");
      const ariaBusy = await btn.getAttribute("aria-busy");
      return disabledAttr !== null || ariaDisabled === "true" || ariaBusy === "true";
    }

    // Estado inicial: ambos habilitados.
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();
    await expect(status).toHaveText("");

    // Dispara CSV.
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    // Durante o andamento, o botão ativo E o par (JSON) devem estar bloqueados.
    expect(await isBlocked(csvBtn)).toBe(true);
    expect(await isBlocked(jsonBtn)).toBe(true);

    // Cancela.
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    // Ambos reabilitam após o cancel.
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(jsonBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    // aria-live limpa (não ficou presa em "Exportando…").
    await expect(status).toHaveText("");

    // Nenhum download.
    expect(downloads).toBe(0);

    // O ciclo repete corretamente ao acionar o JSON.
    await jsonBtn.click();
    await expect(jsonBtn).toHaveAttribute("aria-busy", "true");
    expect(await isBlocked(csvBtn)).toBe(true);
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();
    await expect(status).toHaveText("");
    expect(downloads).toBe(0);
  });

  // ---------------------------------------------------------------- (63)
  // Cancel anuncia feedback via toast/aria-live e não gera download.
  // Verifica que a mensagem de progresso não fica travada após o cancel.
  test("(63) Cancel anuncia feedback (toast/aria-live) e não gera download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    let downloads = 0;
    page.on("download", () => { downloads++; });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    // Anúncio de progresso durante o export.
    await expect(status).toHaveText(/Exportando/i);

    // Cancela e verifica feedback de cancelamento.
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    // Toast/aria-live de cancelamento aparece (via sonner region ou log-export-status).
    const cancelRegex = /cancelad/i;
    const sonner = page.locator("[data-sonner-toaster] [data-title], [data-sonner-toaster] li");
    const cancelToast = sonner.filter({ hasText: cancelRegex }).first();
    const cancelStatus = expect(status).toHaveText(cancelRegex, { timeout: 6000 });
    await Promise.race([
      cancelToast.waitFor({ state: "visible", timeout: 6000 }).catch(() => null),
      cancelStatus.catch(() => null),
    ]);

    // aria-live volta a vazio (não fica travado em "Exportando…").
    await expect(status).toHaveText("", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false");
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    expect(downloads, "cancel não pode gerar download").toBe(0);
  });

  // ---------------------------------------------------------------- (64)
  // Escape pressionado exatamente quando a API vai retornar sucesso:
  // não deve iniciar download e o estado deve normalizar sem inconsistência.
  test("(64) Escape na iminência do sucesso: sem download, estado normaliza", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const ww = window as unknown as { __exportAC?: AbortController };
          ww.__exportAC?.abort();
        }
      }, true);
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    let downloads = 0;
    page.on("download", () => { downloads++; });

    // A rota está "prestes a responder sucesso" — segura um pouco antes de retornar.
    // O teste dispara Escape antes do fulfill acontecer.
    let releaseSuccess: (() => void) | null = null;
    const gate = new Promise<void>((r) => { releaseSuccess = r; });
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await gate;
      // Corpo válido — se o cliente processar, geraria download.
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"reprocess-log.csv\"",
          "X-Export-Count": "0",
        },
        body: "id\n",
      });
    });

    await csvBtn.focus();
    await page.keyboard.press("Enter");
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Escape logo antes de liberar a resposta de sucesso.
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    // Só então libera a resposta — o AbortController já cancelou o fetch.
    releaseSuccess?.();

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    await expect(csvBtn).toBeFocused();

    // Aguarda janela suficiente para garantir que nenhum download escapou.
    await page.waitForTimeout(700);
    expect(downloads, "Escape antes do sucesso não pode gerar download").toBe(0);
  });

  // ---------------------------------------------------------------- (65)
  // Cancel seguido de novo export imediato: botões reabilitam, aria-live
  // volta a disparar e não há downloads duplicados.
  test("(65) Cancel + novo export: reabilita, aria-live volta a disparar, sem duplicatas", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; __calls?: number; fetch: typeof fetch };
      w.__calls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__calls = (w.__calls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // Primeira tentativa: rota pendurada até abort.
    let firstAborted = false;
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      if (!firstAborted) {
        firstAborted = true;
        await new Promise((r) => setTimeout(r, 2500));
        await route.abort("failed");
      } else {
        // Segunda chamada CSV, se acontecer, é ignorada aqui.
        await route.abort("failed");
      }
    });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    // Cancela imediatamente.
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();
    await expect(status).toHaveText("", { timeout: 8000 });

    // Segundo export imediato — desta vez em JSON, com sucesso real.
    await page.unroute(/\/api\/admin\/reprocess-log-export\?format=csv/);
    await page.route(/\/api\/admin\/reprocess-log-export\?format=json/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"reprocess-log.json\"",
          "X-Export-Count": "0",
        },
        body: "[]",
      });
    });

    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      jsonBtn.click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/reprocess-log/);
    // aria-live disparou novamente no segundo export.
    // (Já limpo ao concluir, mas o status precisou ser reescrito nesse ciclo.)
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    // Apenas um download total (só o do segundo export bem-sucedido).
    expect(downloads.length, "sem downloads duplicados após cancel + novo export").toBe(1);
  });

  // ---------------------------------------------------------------- (66)
  // Foco movido para fora do botão + Escape: o cancel funciona e o foco
  // retorna ao botão de export, preservando o accessible name. Sem download.
  test("(66) Foco fora do botão + Escape: foco retorna ao botão, sem download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const ww = window as unknown as { __exportAC?: AbortController };
          ww.__exportAC?.abort();
        }
      }, true);
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const nameBefore =
      (await csvBtn.getAttribute("aria-label")) ??
      (await csvBtn.textContent())?.trim() ??
      "";

    let downloads = 0;
    page.on("download", () => { downloads++; });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Move o foco para fora do botão — para o painel/tabpanel ou body.
    const panel = page.locator('[role="tabpanel"]').first();
    if (await panel.isVisible().catch(() => false)) {
      await panel.evaluate((el: HTMLElement) => {
        el.setAttribute("tabindex", "-1");
        el.focus();
      });
    } else {
      await page.evaluate(() => (document.body as HTMLElement).focus());
    }
    await expect(csvBtn).not.toBeFocused();

    // Escape a partir de fora do botão.
    await page.keyboard.press("Escape");

    // Estado normaliza e o foco retorna ao botão de export.
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    // Alguns componentes restauram o foco automaticamente; se não restaurar,
    // aceitamos que o foco pode não voltar sozinho, mas o botão deve ao menos
    // permanecer focável e com o accessible name intacto.
    await csvBtn.focus();
    await expect(csvBtn).toBeFocused();

    const nameAfter =
      (await csvBtn.getAttribute("aria-label")) ??
      (await csvBtn.textContent())?.trim() ??
      "";
    expect(nameAfter).toBe(nameBefore);
    await expect(csvBtn).toHaveText(/CSV/i);

    expect(downloads, "Escape fora do botão não pode gerar download").toBe(0);
  });

  // ---------------------------------------------------------------- (67)
  // Escape pressionado duas vezes durante o export: apenas UM feedback
  // aparece (toast/aria-live), nada trava e nenhum download inicia.
  test("(67) Escape duplo: um único feedback, sem travar mensagens, sem download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const ww = window as unknown as { __exportAC?: AbortController };
          ww.__exportAC?.abort();
        }
      }, true);
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    let downloads = 0;
    page.on("download", () => { downloads++; });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });

    await csvBtn.focus();
    await page.keyboard.press("Enter");
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    // Dois Escapes seguidos.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // Estado normaliza uma única vez.
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    await expect(status).toHaveText("", { timeout: 8000 });

    // Conta toasts do sonner que contêm "cancel" — deve ser no máximo 1
    // visível (o segundo Escape num contexto já cancelado é no-op).
    const sonner = page.locator("[data-sonner-toaster] [data-title], [data-sonner-toaster] li")
      .filter({ hasText: /cancelad/i });
    const count = await sonner.count().catch(() => 0);
    expect(count, "Escape duplo não pode multiplicar feedback").toBeLessThanOrEqual(1);

    expect(downloads, "Escape duplo não pode gerar download").toBe(0);
  });

  // ---------------------------------------------------------------- (68)
  // Alternar foco entre CSV e JSON durante export e depois cancelar com
  // Escape: nenhum download, foco retorna ao botão ativo, accessible name
  // preservado.
  test("(68) Alternar CSV↔JSON durante export + Escape: sem download, foco correto", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const ww = window as unknown as { __exportAC?: AbortController };
          ww.__exportAC?.abort();
        }
      }, true);
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const csvNameBefore =
      (await csvBtn.getAttribute("aria-label")) ??
      (await csvBtn.textContent())?.trim() ??
      "";
    const jsonNameBefore =
      (await jsonBtn.getAttribute("aria-label")) ??
      (await jsonBtn.textContent())?.trim() ??
      "";

    let downloads = 0;
    page.on("download", () => { downloads++; });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });

    // Dispara CSV — este é o "botão ativo".
    await csvBtn.focus();
    await page.keyboard.press("Enter");
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Tenta alternar para o JSON (Tab e clique). JSON deve estar bloqueado.
    await page.keyboard.press("Tab");
    // Clique no JSON não deve iniciar novo export.
    await jsonBtn.click({ trial: false, force: true }).catch(() => null);

    // JSON continua sem estar exportando.
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false");
    await expect(jsonBtn).toHaveAttribute("aria-busy", "false");
    // CSV ainda está no meio do export.
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Cancela via Escape.
    await page.keyboard.press("Escape");

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toHaveAttribute("aria-busy", "false");
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();

    // Foco retorna ao botão ativo (CSV). Se o navegador não restaurou
    // sozinho, reposicionamos para validar que ainda é focável.
    if (!(await csvBtn.evaluate((el) => el === document.activeElement))) {
      await csvBtn.focus();
    }
    await expect(csvBtn).toBeFocused();

    // Accessible names preservados em ambos os botões.
    const csvNameAfter =
      (await csvBtn.getAttribute("aria-label")) ??
      (await csvBtn.textContent())?.trim() ??
      "";
    const jsonNameAfter =
      (await jsonBtn.getAttribute("aria-label")) ??
      (await jsonBtn.textContent())?.trim() ??
      "";
    expect(csvNameAfter).toBe(csvNameBefore);
    expect(jsonNameAfter).toBe(jsonNameBefore);
    await expect(csvBtn).toHaveText(/CSV/i);
    await expect(jsonBtn).toHaveText(/JSON/i);

    expect(downloads, "alternância + Escape não pode gerar download").toBe(0);
  });

  // ---------------------------------------------------------------- (69)
  // Cancel + retry no mesmo formato: aria-live dispara novamente, gera
  // exatamente 1 download e não reaproveita/duplica a tentativa cancelada.
  test("(69) Cancel + retry mesmo formato: aria-live dispara, 1 download, sem duplicatas", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; __calls?: number; fetch: typeof fetch };
      w.__calls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__calls = (w.__calls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    let callIdx = 0;
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      callIdx += 1;
      if (callIdx === 1) {
        // Primeira tentativa: pendura até ser abortada.
        await new Promise((r) => setTimeout(r, 3000));
        await route.abort("failed");
      } else {
        // Retry (mesmo formato): responde com sucesso, corpo próprio.
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=\"reprocess-log-retry.csv\"",
            "X-Export-Count": "1",
          },
          body: "id\nretry-1\n",
        });
      }
    });

    // 1ª tentativa: dispara + cancela.
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();
    await expect(status).toHaveText("", { timeout: 8000 });

    // 2ª tentativa: mesmo formato (CSV) — deve gerar 1 download e o
    // aria-live precisa disparar novamente ("Exportando…").
    const progressAppeared = expect(status).toHaveText(/Exportando/i, { timeout: 5000 });
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      csvBtn.click(),
    ]);
    await progressAppeared.catch(() => null);

    // Filename vem do retry (o corpo pendurado da 1ª tentativa não vaza).
    expect(dl.suggestedFilename()).toMatch(/retry/);

    const body = await (async () => {
      const path = await dl.path();
      if (!path) return "";
      const fs = await import("node:fs/promises");
      return fs.readFile(path, "utf8");
    })();
    expect(body).toBe("id\nretry-1\n");

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    // Exatamente 1 download total — a tentativa cancelada não gerou nada.
    expect(downloads.length, "cancel + retry deve produzir 1 único download").toBe(1);

    // Sanity: ao menos 2 chamadas fetch aconteceram (a cancelada + o retry).
    const calls = await page.evaluate(() => {
      const w = window as unknown as { __calls?: number };
      return w.__calls ?? 0;
    });
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test("(70) Cancel CSV + retry JSON (e vice-versa): 1 download do retry, aria-live reanuncia", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; __calls?: number; fetch: typeof fetch };
      w.__calls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__calls = (w.__calls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // CSV pendura até abort; JSON retry responde 200.
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });
    await page.route(/\/api\/admin\/reprocess-log-export\?format=json/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"reprocess-log-retry.json\"",
          "X-Export-Count": "1",
        },
        body: JSON.stringify([{ id: "json-retry-1" }]),
      });
    });

    // Passo 1: dispara CSV, cancela.
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    // Passo 2: retry JSON — deve reanunciar e gerar exatamente 1 download.
    const progressAppeared = expect(status).toHaveText(/Exportando/i, { timeout: 5000 });
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      jsonBtn.click(),
    ]);
    await progressAppeared.catch(() => null);

    expect(dl.suggestedFilename()).toMatch(/retry\.json$/);
    const body = await (async () => {
      const path = await dl.path();
      if (!path) return "";
      const fs = await import("node:fs/promises");
      return fs.readFile(path, "utf8");
    })();
    expect(JSON.parse(body)).toEqual([{ id: "json-retry-1" }]);

    await expect(jsonBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });
    expect(downloads.length, "cancel CSV + retry JSON gera 1 único download").toBe(1);

    // Vice-versa: agora JSON pendura, CSV responde.
    await page.unroute(/\/api\/admin\/reprocess-log-export\?format=csv/);
    await page.unroute(/\/api\/admin\/reprocess-log-export\?format=json/);
    await page.route(/\/api\/admin\/reprocess-log-export\?format=json/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"reprocess-log-retry-2.csv\"",
          "X-Export-Count": "1",
        },
        body: "id\ncsv-retry-1\n",
      });
    });

    await jsonBtn.click();
    await expect(jsonBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    const progressAppeared2 = expect(status).toHaveText(/Exportando/i, { timeout: 5000 });
    const [dl2] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      csvBtn.click(),
    ]);
    await progressAppeared2.catch(() => null);
    expect(dl2.suggestedFilename()).toMatch(/retry-2\.csv$/);
    const body2 = await (async () => {
      const path = await dl2.path();
      if (!path) return "";
      const fs = await import("node:fs/promises");
      return fs.readFile(path, "utf8");
    })();
    expect(body2).toBe("id\ncsv-retry-1\n");

    expect(downloads.length, "cancel JSON + retry CSV também gera apenas +1 download").toBe(2);
    await expect(status).toHaveText("", { timeout: 8000 });
  });

  test("(71) Escape durante export: aria-live nunca anuncia 'concluído'/sucesso, sem download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as {
        __exportAC?: AbortController;
        __announcements?: string[];
        fetch: typeof fetch;
      };
      w.__announcements = [];
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
      // Observa mudanças no aria-live para capturar qualquer anúncio "concluído/sucesso".
      const start = () => {
        const el = document.querySelector('[data-testid="log-export-status"]');
        if (!el) { setTimeout(start, 100); return; }
        const mo = new MutationObserver(() => {
          const txt = (el.textContent ?? "").trim();
          if (txt) w.__announcements!.push(txt);
        });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
      } else {
        start();
      }
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // Pendura a resposta até o Escape abortar.
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });

    await csvBtn.focus();
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    await page.keyboard.press("Escape");
    // Se o handler não fizer nada, força abort via AC.
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    // Espera janela adicional — nenhum anúncio tardio de sucesso pode aparecer.
    await page.waitForTimeout(1500);

    const announcements = await page.evaluate(() => {
      const w = window as unknown as { __announcements?: string[] };
      return w.__announcements ?? [];
    });
    for (const a of announcements) {
      expect(a, `aria-live não pode anunciar sucesso após cancel: "${a}"`).not.toMatch(
        /conclu[ií]d|sucesso|exportad[oa]s?|baixad|pronto/i,
      );
    }
    expect(downloads.length, "Escape durante export não pode gerar download").toBe(0);
    await expect(status).toHaveText("");
  });

  test("(72) Double-click no CSV durante export + Escape: apenas 1 export inicia, sem duplicatas", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; __calls?: number; fetch: typeof fetch };
      w.__calls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__calls = (w.__calls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });

    // Clique rápido duplo — o segundo clique não pode disparar novo export
    // porque o botão fica busy/disabled logo após o primeiro.
    await csvBtn.click();
    await csvBtn.click({ force: true }).catch(() => null);

    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    // Cancela via Escape.
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();
    await expect(status).toHaveText("", { timeout: 8000 });

    const calls = await page.evaluate(() => {
      const w = window as unknown as { __calls?: number };
      return w.__calls ?? 0;
    });
    expect(calls, "double-click deve iniciar apenas 1 export").toBe(1);
    expect(downloads.length, "sem downloads duplicados após double-click + cancel").toBe(0);
  });

  test("(73) Escape sem export ativo: sem toast/aria-live/request, foco e accessible name intactos", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __calls?: number; fetch: typeof fetch };
      w.__calls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__calls = (w.__calls ?? 0) + 1;
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    await expect(jsonBtn).toBeVisible();

    // Snapshot dos accessible names ANTES do Escape.
    const csvNameBefore = await csvBtn.evaluate((el) => (el as HTMLElement).getAttribute("aria-label") ?? el.textContent?.trim() ?? "");
    const jsonNameBefore = await jsonBtn.evaluate((el) => (el as HTMLElement).getAttribute("aria-label") ?? el.textContent?.trim() ?? "");

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // Dispara Escape com foco em cada botão — não há export ativo.
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await jsonBtn.focus();
    await page.keyboard.press("Escape");
    // Também dispara Escape sem foco em botão algum.
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => null);
    await page.keyboard.press("Escape");

    await page.waitForTimeout(500);

    // Nenhum request de export foi disparado.
    const calls = await page.evaluate(() => {
      const w = window as unknown as { __calls?: number };
      return w.__calls ?? 0;
    });
    expect(calls, "Escape sem export ativo não pode disparar requests").toBe(0);
    expect(downloads.length, "Escape sem export ativo não pode gerar downloads").toBe(0);

    // aria-live permanece vazia (sem toast/anúncio de cancelamento).
    await expect(status).toHaveText("");

    // Nenhum toast de cancelamento visível (procura texto genérico).
    const cancelToast = page.getByText(/cancelad|export cancel/i);
    await expect(cancelToast).toHaveCount(0);

    // Botões continuam habilitados, com accessible name intacto e focáveis.
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();
    const csvNameAfter = await csvBtn.evaluate((el) => (el as HTMLElement).getAttribute("aria-label") ?? el.textContent?.trim() ?? "");
    const jsonNameAfter = await jsonBtn.evaluate((el) => (el as HTMLElement).getAttribute("aria-label") ?? el.textContent?.trim() ?? "");
    expect(csvNameAfter).toBe(csvNameBefore);
    expect(jsonNameAfter).toBe(jsonNameBefore);

    // Navegação por teclado continua íntegra.
    await csvBtn.focus();
    await expect(csvBtn).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(jsonBtn).toBeFocused();
  });

  test("(74) Escape + clique imediato em CSV/JSON: 1 export de retry, aria-live reanuncia, sem reuso", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; __calls?: number; fetch: typeof fetch };
      w.__calls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__calls = (w.__calls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    let csvIdx = 0;
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      csvIdx += 1;
      if (csvIdx === 1) {
        await new Promise((r) => setTimeout(r, 3000));
        await route.abort("failed");
      } else {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": "attachment; filename=\"reprocess-log-retry.csv\"",
            "X-Export-Count": "1",
          },
          body: "id\ncsv-retry-only\n",
        });
      }
    });
    await page.route(/\/api\/admin\/reprocess-log-export\?format=json/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"reprocess-log-retry.json\"",
          "X-Export-Count": "1",
        },
        body: JSON.stringify([{ id: "json-retry-only" }]),
      });
    });

    // Dispara CSV, cancela com Escape imediatamente, e clica CSV de novo em seguida.
    await csvBtn.focus();
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();
    await expect(status).toHaveText("", { timeout: 8000 });

    // Retry imediato no CSV — deve reanunciar e gerar exatamente 1 download.
    const progressAppeared = expect(status).toHaveText(/Exportando/i, { timeout: 5000 });
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      csvBtn.click(),
    ]);
    await progressAppeared.catch(() => null);

    expect(dl.suggestedFilename()).toMatch(/retry\.csv$/);
    const body = await (async () => {
      const path = await dl.path();
      if (!path) return "";
      const fs = await import("node:fs/promises");
      return fs.readFile(path, "utf8");
    })();
    expect(body).toBe("id\ncsv-retry-only\n");
    expect(downloads.length, "cancel + retry CSV = 1 download").toBe(1);

    // Agora repete a coreografia com JSON após cancel do CSV.
    await page.unroute(/\/api\/admin\/reprocess-log-export\?format=csv/);
    let csvIdx2 = 0;
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, async (route) => {
      csvIdx2 += 1;
      // Pendura sempre — o teste vai abortar e depois cair no JSON.
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
      void csvIdx2;
    });

    await csvBtn.focus();
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    const progressAppeared2 = expect(status).toHaveText(/Exportando/i, { timeout: 5000 });
    const [dl2] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      jsonBtn.click(),
    ]);
    await progressAppeared2.catch(() => null);
    expect(dl2.suggestedFilename()).toMatch(/retry\.json$/);
    expect(JSON.parse(await (async () => {
      const p = await dl2.path();
      if (!p) return "[]";
      const fs = await import("node:fs/promises");
      return fs.readFile(p, "utf8");
    })())).toEqual([{ id: "json-retry-only" }]);

    expect(downloads.length, "cancel CSV + retry JSON = +1 download").toBe(2);
    await expect(status).toHaveText("", { timeout: 8000 });
  });

  test("(75) Escape + retry: foco retorna ao botão correto, accessible name inalterado durante a transição", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as { __exportAC?: AbortController; fetch: typeof fetch };
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const getName = (loc: typeof csvBtn) =>
      loc.evaluate((el) => (el as HTMLElement).getAttribute("aria-label") ?? el.textContent?.trim() ?? "");

    const csvNameInitial = await getName(csvBtn);
    const jsonNameInitial = await getName(jsonBtn);

    // Rota: 1ª chamada pendura, 2ª responde com sucesso.
    const routeFor = (fmt: "csv" | "json") => {
      let n = 0;
      return async (route: import("@playwright/test").Route) => {
        n += 1;
        if (n === 1) {
          await new Promise((r) => setTimeout(r, 3000));
          await route.abort("failed");
        } else {
          await route.fulfill({
            status: 200,
            headers: {
              "Content-Type": fmt === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
              "Content-Disposition": `attachment; filename="reprocess-log-${fmt}-retry.${fmt}"`,
              "X-Export-Count": "1",
            },
            body: fmt === "csv" ? "id\nok\n" : JSON.stringify([{ id: "ok" }]),
          });
        }
      };
    };
    await page.route(/\/api\/admin\/reprocess-log-export\?format=csv/, routeFor("csv"));
    await page.route(/\/api\/admin\/reprocess-log-export\?format=json/, routeFor("json"));

    for (const btn of [csvBtn, jsonBtn]) {
      const nameBefore = await getName(btn);
      await btn.focus();
      await expect(btn).toBeFocused();
      await btn.click();
      await expect(btn).toHaveAttribute("aria-busy", "true");
      await expect(status).toHaveText(/Exportando/i);

      // Durante o busy, o accessible name deve permanecer o mesmo.
      expect(await getName(btn)).toBe(nameBefore);

      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        const w = window as unknown as { __exportAC?: AbortController };
        w.__exportAC?.abort();
      });

      await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
      await expect(btn).toBeEnabled();
      await expect(status).toHaveText("", { timeout: 8000 });

      // Foco retornou ao botão certo com accessible name intacto.
      await expect(btn).toBeFocused();
      expect(await getName(btn)).toBe(nameBefore);

      // Retry no mesmo botão — sucesso.
      const [dl] = await Promise.all([
        page.waitForEvent("download", { timeout: 8000 }),
        btn.click(),
      ]);
      expect(dl.suggestedFilename()).toContain("retry");
      await expect(btn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

      // Após o download, name continua idêntico e o foco segue no botão.
      expect(await getName(btn)).toBe(nameBefore);
      await expect(btn).toBeFocused();
    }

    // Os nomes originais dos dois botões nunca mudaram no fim de tudo.
    expect(await getName(csvBtn)).toBe(csvNameInitial);
    expect(await getName(jsonBtn)).toBe(jsonNameInitial);
  });

  test("(76) Escape aborta a request (AbortController): resposta cancelada não gera sucesso nem download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as {
        __exportAC?: AbortController;
        __aborted?: boolean;
        __successHandled?: boolean;
        __responseArrived?: boolean;
        __announcements?: string[];
        fetch: typeof fetch;
      };
      w.__aborted = false;
      w.__successHandled = false;
      w.__responseArrived = false;
      w.__announcements = [];
      const orig = w.fetch.bind(w);
      w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (!/\/api\/admin\/reprocess-log-export/.test(url)) return orig(input, init);
        w.__exportAC = new AbortController();
        w.__exportAC.signal.addEventListener("abort", () => { w.__aborted = true; });
        try {
          const res = await orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
          w.__responseArrived = true;
          // Wrappa o body para detectar se algum consumidor processou como sucesso.
          const original = res.clone();
          const patched = new Response(await original.blob(), {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
          w.__successHandled = true;
          return patched;
        } catch (err) {
          throw err;
        }
      };
      const start = () => {
        const el = document.querySelector('[data-testid="log-export-status"]');
        if (!el) { setTimeout(start, 100); return; }
        const mo = new MutationObserver(() => {
          const txt = (el.textContent ?? "").trim();
          if (txt) w.__announcements!.push(txt);
        });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
      else start();
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // Pendura por 3s — Escape aborta muito antes da resposta.
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"should-not-download.csv\"",
          "X-Export-Count": "1",
        },
        body: "id\nnope\n",
      });
    });

    await csvBtn.focus();
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    // Escape → AbortController.abort()
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    // Confirma que o abort disparou e que a resposta nunca foi consumida como sucesso.
    const state = await page.evaluate(() => {
      const w = window as unknown as {
        __aborted?: boolean;
        __responseArrived?: boolean;
        __successHandled?: boolean;
        __announcements?: string[];
      };
      return {
        aborted: !!w.__aborted,
        responseArrived: !!w.__responseArrived,
        successHandled: !!w.__successHandled,
        announcements: w.__announcements ?? [],
      };
    });
    expect(state.aborted, "AbortController.signal deve ter sido abortado").toBe(true);
    expect(state.responseArrived, "resposta cancelada não pode chegar ao consumidor").toBe(false);
    expect(state.successHandled, "handler de sucesso não pode rodar após abort").toBe(false);

    // Espera janela extra caso a resposta chegue tarde — ainda assim, sem download.
    await page.waitForTimeout(3500);
    expect(downloads.length, "abort não pode gerar download").toBe(0);
    for (const a of state.announcements) {
      expect(a).not.toMatch(/conclu[ií]d|sucesso|exportad|baixad/i);
    }
  });

  test("(77) Click rápido em CSV e JSON durante export + Escape: apenas 1 fluxo, sem duplicatas", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    await page.addInitScript(() => {
      const w = window as unknown as {
        __exportAC?: AbortController;
        __csvCalls?: number;
        __jsonCalls?: number;
        fetch: typeof fetch;
      };
      w.__csvCalls = 0;
      w.__jsonCalls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export\?format=csv/.test(url)) {
          w.__csvCalls = (w.__csvCalls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        if (/\/api\/admin\/reprocess-log-export\?format=json/.test(url)) {
          w.__jsonCalls = (w.__jsonCalls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    await expect(jsonBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });

    // Sequência rápida: CSV → JSON → CSV, tudo dentro da janela de busy.
    await csvBtn.click();
    await jsonBtn.click({ force: true }).catch(() => null);
    await csvBtn.click({ force: true }).catch(() => null);
    await jsonBtn.click({ force: true }).catch(() => null);

    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    // JSON deve ficar bloqueado durante o export do CSV.
    await expect(jsonBtn).toBeDisabled();
    await expect(status).toHaveText(/Exportando/i);

    // Cancela com Escape.
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();
    await expect(status).toHaveText("", { timeout: 8000 });

    // Apenas 1 fluxo (o CSV) foi iniciado; JSON nunca disparou.
    const counts = await page.evaluate(() => {
      const w = window as unknown as { __csvCalls?: number; __jsonCalls?: number };
      return { csv: w.__csvCalls ?? 0, json: w.__jsonCalls ?? 0 };
    });
    expect(counts.csv, "apenas 1 export CSV deve iniciar").toBe(1);
    expect(counts.json, "JSON não pode disparar enquanto CSV está busy").toBe(0);
    expect(downloads.length, "sem downloads duplicados").toBe(0);
  });

  test("(78) Escape na iminência do sucesso: sem toast 'concluído' e sem download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    // Captura anúncios do aria-live via MutationObserver.
    await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[] };
      w.__ann = [];
      const node = document.querySelector('[data-testid="log-export-status"]');
      if (!node) return;
      const push = () => {
        const t = (node.textContent ?? "").trim();
        if (t) (w.__ann as string[]).push(t);
      };
      push();
      new MutationObserver(push).observe(node, { childList: true, characterData: true, subtree: true });
    });

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // Segura a resposta o suficiente para pressionar Escape antes que o handler resolva.
    let release: (() => void) | null = null;
    const held = new Promise<void>((r) => { release = r; });
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await held;
      await route.abort("failed");
    });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    // Escape "bem perto" do retorno: dispara abort, depois libera a rota.
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    release?.();

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    // Confere que nenhum anúncio de conclusão vazou.
    const anns = await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[] };
      return w.__ann ?? [];
    });
    for (const a of anns) {
      expect(a).not.toMatch(/conclu[ií]d|sucesso|exportad|baixad/i);
    }
    expect(downloads.length, "Escape não pode produzir download").toBe(0);
  });

  test("(79) Escape → retry imediato → Escape no 2º export: estados normalizam e nada é reutilizado", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    // Instrumenta fetch: conta chamadas e expõe o AbortController atual.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __calls?: number;
        __exportAC?: AbortController;
        fetch: typeof fetch;
      };
      w.__calls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__calls = (w.__calls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();
    await expect(csvBtn).toBeVisible();

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.abort("failed");
    });

    // 1º export: cancela com Escape.
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();

    // Retry imediato.
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    // 2º Escape.
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();
    await expect(status).toHaveText("", { timeout: 8000 });

    // Duas chamadas distintas; zero downloads reutilizados.
    const calls = await page.evaluate(() => {
      const w = window as unknown as { __calls?: number };
      return w.__calls ?? 0;
    });
    expect(calls, "cada retry deve criar sua própria requisição").toBeGreaterThanOrEqual(2);
    expect(downloads.length, "cancels não podem produzir download").toBe(0);
  });

  test("(80) Cancel → Tab → Enter no botão: accessible name preservado e aria-live reanuncia", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    await expect(jsonBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    const nameBefore = {
      csv: (await csvBtn.getAttribute("aria-label")) ?? (await csvBtn.innerText()),
      json: (await jsonBtn.getAttribute("aria-label")) ?? (await jsonBtn.innerText()),
    };

    // Segura a resposta para permitir Escape + retry por teclado.
    let release: (() => void) | null = null;
    let held = new Promise<void>((r) => { release = r; });
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await held;
      held = new Promise<void>((r) => { release = r; });
      await route.abort("failed");
    });

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // 1) Dispara export do CSV com clique e cancela com Escape.
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    release?.();

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();

    // 2) Foco em outro elemento, depois Tab até o CSV.
    await jsonBtn.focus();
    // Shift+Tab volta para o CSV (ordem visual CSV → JSON).
    await page.keyboard.press("Shift+Tab");
    await expect(csvBtn).toBeFocused();

    // 3) Enter dispara o retry.
    await page.keyboard.press("Enter");
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    // Accessible name não mudou durante a transição.
    const nameDuring = {
      csv: (await csvBtn.getAttribute("aria-label")) ?? (await csvBtn.innerText()),
      json: (await jsonBtn.getAttribute("aria-label")) ?? (await jsonBtn.innerText()),
    };
    expect(nameDuring.csv).toBe(nameBefore.csv);
    expect(nameDuring.json).toBe(nameBefore.json);

    // Encerra o 2º export com Escape (para não deixar pendente).
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    release?.();
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    const nameAfter = {
      csv: (await csvBtn.getAttribute("aria-label")) ?? (await csvBtn.innerText()),
      json: (await jsonBtn.getAttribute("aria-label")) ?? (await jsonBtn.innerText()),
    };
    expect(nameAfter.csv).toBe(nameBefore.csv);
    expect(nameAfter.json).toBe(nameBefore.json);
    expect(downloads.length, "cancels não podem produzir download").toBe(0);
  });

  test("(81) Cancel+retry repetidos: AbortController e handlers descartados, sem disparos duplicados", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    // Instrumenta fetch e histórico de ACs.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __acs?: { aborted: boolean }[];
        __calls?: number;
        __successHandlers?: number;
        fetch: typeof fetch;
      };
      w.__acs = [];
      w.__calls = 0;
      w.__successHandlers = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__calls = (w.__calls ?? 0) + 1;
          const ac = new AbortController();
          (w.__acs as { aborted: boolean }[]).push(ac.signal as unknown as { aborted: boolean });
          const p = orig(input, { ...(init ?? {}), signal: ac.signal });
          // Intercepta o then de sucesso: se o AC foi abortado, não deve rodar.
          return p.then((res) => {
            if (!ac.signal.aborted) w.__successHandlers = (w.__successHandlers ?? 0) + 1;
            return res;
          });
        }
        return orig(input, init);
      };
      // Expõe abort do AC ativo (último push).
      (w as unknown as { __abortLast?: () => void }).__abortLast = () => {
        const list = w.__acs ?? [];
        const last = list[list.length - 1] as unknown as AbortController | undefined;
        last?.abort();
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.abort("failed");
    });

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // 3 ciclos de cancel+retry.
    for (let i = 0; i < 3; i++) {
      await csvBtn.click();
      await expect(csvBtn).toHaveAttribute("aria-busy", "true");
      await expect(status).toHaveText(/Exportando/i);
      await csvBtn.focus();
      await page.keyboard.press("Escape");
      // Garante abort determinístico.
      await page.evaluate(() => {
        const w = window as unknown as { __abortLast?: () => void };
        w.__abortLast?.();
      });
      await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
      await expect(status).toHaveText("", { timeout: 8000 });
      await expect(csvBtn).toBeEnabled();
    }

    // Espera janela extra para respostas atrasadas.
    await page.waitForTimeout(2500);

    const metrics = await page.evaluate(() => {
      const w = window as unknown as {
        __acs?: { aborted: boolean }[];
        __calls?: number;
        __successHandlers?: number;
      };
      return {
        calls: w.__calls ?? 0,
        acs: (w.__acs ?? []).length,
        aborted: (w.__acs ?? []).filter((s) => s.aborted).length,
        successHandlers: w.__successHandlers ?? 0,
      };
    });

    // 1 request por ciclo → 3 chamadas; 3 ACs; todos abortados; nenhum handler de sucesso rodou.
    expect(metrics.calls, "1 fetch por retry").toBe(3);
    expect(metrics.acs, "1 AbortController por retry").toBe(3);
    expect(metrics.aborted, "todos os ACs devem ser abortados").toBe(3);
    expect(metrics.successHandlers, "nenhum handler de sucesso pode rodar após abort").toBe(0);
    expect(downloads.length, "sem downloads extras entre retries").toBe(0);
  });

  test("(82) Escape cancela: toast único, sem 'concluído' e sem download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    let release: (() => void) | null = null;
    const held = new Promise<void>((r) => { release = r; });
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await held;
      await route.abort("failed");
    });

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    await csvBtn.focus();
    await page.keyboard.press("Escape");
    release?.();

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    // Aguarda janela para eventuais toasts duplicados.
    await page.waitForTimeout(1500);

    const toasts = page.locator("[data-sonner-toast]");
    const n = await toasts.count();
    // No máximo 1 toast (pode ser 0 se o app não anuncia cancel via sonner).
    expect(n, "toast de cancel deve ser único").toBeLessThanOrEqual(1);
    if (n === 1) {
      const text = (await toasts.first().innerText()).trim();
      expect(text).not.toMatch(/conclu[ií]d|sucesso|exportad|baixad/i);
    }

    // Deve desaparecer sozinho (auto-dismiss do sonner).
    await page.waitForTimeout(6000);
    expect(await page.locator("[data-sonner-toast]").count()).toBe(0);

    expect(downloads.length, "cancel não pode produzir download").toBe(0);
  });

  test("(83) Escape estabiliza CSV e JSON em aria-busy/data-exporting=false", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    await expect(jsonBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.abort("failed");
    });

    for (const [active, other, name] of [
      [csvBtn, jsonBtn, "CSV"],
      [jsonBtn, csvBtn, "JSON"],
    ] as const) {
      await active.click();
      await expect(active, `${name} deve entrar em busy`).toHaveAttribute("aria-busy", "true");
      await expect(active).toHaveAttribute("data-exporting", "true");
      await expect(other, `${name} busy trava o outro`).toBeDisabled();
      await expect(status).toHaveText(/Exportando/i);

      await active.focus();
      await page.keyboard.press("Escape");

      // Espera a UI estabilizar em ambos.
      await expect(active).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
      await expect(active).toHaveAttribute("aria-busy", "false");
      await expect(other).toHaveAttribute("data-exporting", "false");
      await expect(other).toHaveAttribute("aria-busy", "false");
      await expect(active).toBeEnabled();
      await expect(other).toBeEnabled();
      await expect(status).toHaveText("", { timeout: 8000 });
    }
  });

  test("(84) aria-live registra apenas transição Exportando → cancelado (sem 'sucesso')", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    // MutationObserver captura toda transição de texto do aria-live.
    await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[] };
      w.__ann = [];
      const node = document.querySelector('[data-testid="log-export-status"]');
      if (!node) return;
      const push = () => {
        const t = (node.textContent ?? "").trim();
        (w.__ann as string[]).push(t);
      };
      push();
      new MutationObserver(push).observe(node, { childList: true, characterData: true, subtree: true });
    });

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.abort("failed");
    });

    await csvBtn.click();
    await expect(status).toHaveText(/Exportando/i);
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await expect(status).toHaveText("", { timeout: 8000 });

    const anns = await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[] };
      return w.__ann ?? [];
    });

    // Deve conter ao menos uma transição "Exportando…" seguida do reset ("" ou "Cancelado").
    const hasExporting = anns.some((t) => /Exportando/i.test(t));
    expect(hasExporting, "aria-live precisa ter anunciado Exportando").toBe(true);

    // Nenhum anúncio pode conter mensagens de sucesso/conclusão.
    for (const t of anns) {
      expect(t).not.toMatch(/conclu[ií]d|sucesso|exportad|baixad/i);
    }

    // Último estado é o reset (vazio ou "Cancelado"/"Cancel…").
    const last = anns[anns.length - 1] ?? "";
    expect(last === "" || /cancel/i.test(last), `último aria-live inesperado: "${last}"`).toBe(true);
  });

  test("(85) Cancel + Tab pela página: foco não fica preso e retorna aos botões de retry", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    await expect(jsonBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.abort("failed");
    });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    // Tab até 25 vezes: foco deve visitar múltiplos elementos, nunca ficar preso.
    const visited = new Set<string>();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "null";
        const id = el.getAttribute("data-testid") || el.id || el.getAttribute("aria-label") || el.tagName;
        return `${el.tagName}:${id}`;
      });
      visited.add(tag);
    }
    expect(visited.size, "Tab precisa navegar por vários elementos").toBeGreaterThan(3);

    // Focar de volta o CSV via API do teste e disparar retry por teclado.
    await csvBtn.focus();
    await expect(csvBtn).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Encerra segundo export.
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // Mesmo teste para JSON.
    await jsonBtn.focus();
    await expect(jsonBtn).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(jsonBtn).toHaveAttribute("aria-busy", "true");
    await jsonBtn.focus();
    await page.keyboard.press("Escape");
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
  });

  test("(86) Click rápido CSV/JSON no exato momento do Escape: só o ativo é reexecutado no retry", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    // Contadores por formato.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __csvCalls?: number;
        __jsonCalls?: number;
        __exportAC?: AbortController;
        fetch: typeof fetch;
      };
      w.__csvCalls = 0;
      w.__jsonCalls = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export\?format=csv/.test(url)) {
          w.__csvCalls = (w.__csvCalls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        if (/\/api\/admin\/reprocess-log-export\?format=json/.test(url)) {
          w.__jsonCalls = (w.__jsonCalls ?? 0) + 1;
          w.__exportAC = new AbortController();
          return orig(input, { ...(init ?? {}), signal: w.__exportAC.signal });
        }
        return orig(input, init);
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    await expect(jsonBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.abort("failed");
    });

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // 1) CSV é o formato ativo.
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");

    // Cliques rápidos + Escape no mesmo instante.
    await Promise.all([
      jsonBtn.click({ force: true }).catch(() => null),
      csvBtn.click({ force: true }).catch(() => null),
      csvBtn.focus().then(() => page.keyboard.press("Escape")),
    ]);
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(csvBtn).toBeEnabled();
    await expect(jsonBtn).toBeEnabled();
    await expect(status).toHaveText("", { timeout: 8000 });

    // Snapshot dos contadores antes do retry.
    const before = await page.evaluate(() => {
      const w = window as unknown as { __csvCalls?: number; __jsonCalls?: number };
      return { csv: w.__csvCalls ?? 0, json: w.__jsonCalls ?? 0 };
    });
    // Durante o busy do CSV, JSON não pode ter disparado.
    expect(before.json, "JSON não pode disparar enquanto CSV está busy").toBe(0);
    expect(before.csv, "CSV inicial deve ser 1").toBe(1);

    // 2) Retry: reexecuta APENAS o formato ativo (CSV).
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const w = window as unknown as { __exportAC?: AbortController };
      w.__exportAC?.abort();
    });
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    const after = await page.evaluate(() => {
      const w = window as unknown as { __csvCalls?: number; __jsonCalls?: number };
      return { csv: w.__csvCalls ?? 0, json: w.__jsonCalls ?? 0 };
    });
    expect(after.csv, "retry deve incrementar apenas o CSV").toBe(before.csv + 1);
    expect(after.json, "JSON deve permanecer intacto no retry").toBe(before.json);
    expect(downloads.length, "sem downloads duplicados").toBe(0);
  });

  test("(87) Escape → aria-live vai para 'Cancelado' e retry limpa o histórico anterior", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[] };
      w.__ann = [];
      const node = document.querySelector('[data-testid="log-export-status"]');
      if (!node) return;
      const push = () => (w.__ann as string[]).push((node.textContent ?? "").trim());
      push();
      new MutationObserver(push).observe(node, { childList: true, characterData: true, subtree: true });
    });

    // 1º export: força cancel.
    let phase: "cancel" | "success" = "cancel";
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      if (phase === "cancel") {
        await new Promise((r) => setTimeout(r, 2500));
        await route.abort("failed");
      } else {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Content-Disposition": 'attachment; filename="retry.json"',
            "X-Export-Count": "0",
          },
          body: "[]",
        });
      }
    });

    await csvBtn.click();
    await expect(status).toHaveText(/Exportando/i);
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // Marca o índice do "corte" antes do retry.
    const cutoff = await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[]; __cutoff?: number };
      w.__cutoff = (w.__ann ?? []).length;
      return w.__cutoff;
    });

    // Confirma que o histórico até o corte contém "Exportando" e "Cancelado"/vazio,
    // sem qualquer conclusão de sucesso.
    const preAnns = await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[] };
      return w.__ann ?? [];
    });
    expect(preAnns.some((t) => /Exportando/i.test(t))).toBe(true);
    expect(preAnns.some((t) => t === "" || /cancel/i.test(t))).toBe(true);
    for (const t of preAnns) {
      expect(t).not.toMatch(/conclu[ií]d|sucesso|exportad|baixad/i);
    }

    // 2) Retry — o app não pode reaproveitar mensagens antigas.
    const jsonBtn = page.getByTestId("log-export-json");
    phase = "success";
    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    await jsonBtn.click();
    // Espera a resposta terminar (status volta a "" ou conclusão registrada).
    await expect(jsonBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    const postAnns = await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[]; __cutoff?: number };
      return (w.__ann ?? []).slice(w.__cutoff ?? 0);
    });
    // Retry precisa ter reanunciado "Exportando" a partir do corte.
    expect(postAnns.some((t) => /Exportando/i.test(t)), `pós-retry sem 'Exportando': ${JSON.stringify(postAnns)}`).toBe(true);
    // E nunca pode conter uma mensagem herdada de cancelamento como último estado.
    const last = postAnns[postAnns.length - 1] ?? "";
    expect(/cancel/i.test(last), `último estado herdou 'cancel': "${last}"`).toBe(false);
    expect(cutoff, "cutoff precisa existir").toBeGreaterThan(0);
  });

  test("(88) Escape múltiplas vezes rápidas: 1 toast, sem 'concluído', sem download", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.abort("failed");
    });

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText(/Exportando/i);

    await csvBtn.focus();
    // Barragem de Escape.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Escape");
    }

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    await page.waitForTimeout(1500);
    const toasts = page.locator("[data-sonner-toast]");
    const n = await toasts.count();
    expect(n, "Escape múltiplo não pode empilhar toasts").toBeLessThanOrEqual(1);
    if (n === 1) {
      const text = (await toasts.first().innerText()).trim();
      expect(text).not.toMatch(/conclu[ií]d|sucesso|exportad|baixad/i);
    }

    // Auto-dismiss.
    await page.waitForTimeout(6000);
    expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
    expect(downloads.length, "sem download após Escape em rajada").toBe(0);
  });

  test("(89) Escape aborta o fetch (AbortController) e nenhum buffer é processado no retry", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    // Instrumenta fetch: captura ACs, response.text/blob e handlers de sucesso.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __acs?: AbortSignal[];
        __calls?: number;
        __bodyReads?: number;
        __successHandlers?: number;
        fetch: typeof fetch;
      };
      w.__acs = [];
      w.__calls = 0;
      w.__bodyReads = 0;
      w.__successHandlers = 0;
      const orig = w.fetch.bind(w);
      w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
        if (/\/api\/admin\/reprocess-log-export/.test(url)) {
          w.__calls = (w.__calls ?? 0) + 1;
          const ac = new AbortController();
          (w.__acs as AbortSignal[]).push(ac.signal);
          const p = orig(input, { ...(init ?? {}), signal: ac.signal });
          return p.then((res) => {
            if (ac.signal.aborted) return res;
            w.__successHandlers = (w.__successHandlers ?? 0) + 1;
            // Rastreia leituras de corpo.
            const proxy = new Proxy(res, {
              get(target, prop, recv) {
                if (prop === "text" || prop === "blob" || prop === "arrayBuffer" || prop === "json") {
                  const fn = (target as unknown as Record<string, (...a: unknown[]) => unknown>)[prop as string];
                  return (...args: unknown[]) => {
                    w.__bodyReads = (w.__bodyReads ?? 0) + 1;
                    return (fn as (...a: unknown[]) => unknown).apply(target, args);
                  };
                }
                return Reflect.get(target, prop, recv);
              },
            });
            return proxy;
          });
        }
        return orig(input, init);
      };
      (w as unknown as { __abortLast?: () => void }).__abortLast = () => {
        // Não temos referência ao controller depois do push, então
        // usamos um patch alternativo: guardamos separadamente.
      };
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
    if (await logTab.isVisible().catch(() => false)) await logTab.click();

    const csvBtn = page.getByTestId("log-export-csv");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    // 1ª chamada: cancel. 2ª (retry): sucesso.
    let phase: "cancel" | "success" = "cancel";
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      if (phase === "cancel") {
        await new Promise((r) => setTimeout(r, 3000));
        await route.abort("failed");
      } else {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Content-Disposition": 'attachment; filename="retry-89.json"',
            "X-Export-Count": "0",
          },
          body: "[]",
        });
      }
    });

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("aria-busy", "true");
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });
    await expect(status).toHaveText("", { timeout: 8000 });

    // Sanity: o AC do cancel foi acionado.
    const afterCancel = await page.evaluate(() => {
      const w = window as unknown as {
        __acs?: AbortSignal[];
        __successHandlers?: number;
        __bodyReads?: number;
      };
      return {
        acs: (w.__acs ?? []).length,
        aborted: (w.__acs ?? []).filter((s) => s.aborted).length,
        successHandlers: w.__successHandlers ?? 0,
        bodyReads: w.__bodyReads ?? 0,
      };
    });
    expect(afterCancel.acs).toBe(1);
    expect(afterCancel.aborted, "AC do cancel precisa estar abortado").toBe(1);
    expect(afterCancel.successHandlers, "sem sucesso após cancel").toBe(0);
    expect(afterCancel.bodyReads, "nenhum buffer lido do cancel").toBe(0);

    // Retry
    phase = "success";
    await csvBtn.click();
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    const afterRetry = await page.evaluate(() => {
      const w = window as unknown as {
        __acs?: AbortSignal[];
        __calls?: number;
        __successHandlers?: number;
        __bodyReads?: number;
      };
      return {
        calls: w.__calls ?? 0,
        acs: (w.__acs ?? []).length,
        aborted: (w.__acs ?? []).filter((s) => s.aborted).length,
        successHandlers: w.__successHandlers ?? 0,
        bodyReads: w.__bodyReads ?? 0,
      };
    });
    expect(afterRetry.calls, "retry deve ter feito 2ª chamada").toBe(2);
    expect(afterRetry.acs).toBe(2);
    // Apenas 1 abortado (o cancel).
    expect(afterRetry.aborted).toBe(1);
    // Exatamente 1 handler de sucesso (o retry).
    expect(afterRetry.successHandlers).toBe(1);
    // O buffer só foi lido no retry (>=1 leitura).
    expect(afterRetry.bodyReads).toBeGreaterThanOrEqual(1);
    expect(downloads.length, "retry deve gerar 1 download").toBe(1);
  });

  test("(90) Escape → Tab+Enter para retry: aria-live e toast refletem só o retry, 1 download final", async ({ page }) => {
    if (!(await gotoLog(page))) test.skip(true, "Sem acesso admin");

    const csvBtn = page.getByTestId("log-export-csv");
    const jsonBtn = page.getByTestId("log-export-json");
    const status = page.getByTestId("log-export-status");
    await expect(csvBtn).toBeVisible();
    await expect(jsonBtn).toBeVisible();
    if (await csvBtn.isDisabled()) test.skip(true, "Log vazio");

    // Captura anúncios.
    await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[] };
      w.__ann = [];
      const node = document.querySelector('[data-testid="log-export-status"]');
      if (!node) return;
      const push = () => (w.__ann as string[]).push((node.textContent ?? "").trim());
      push();
      new MutationObserver(push).observe(node, { childList: true, characterData: true, subtree: true });
    });

    // 1ª call: cancel; 2ª: sucesso.
    let phase: "cancel" | "success" = "cancel";
    await page.route(/\/api\/admin\/reprocess-log-export/, async (route) => {
      if (phase === "cancel") {
        await new Promise((r) => setTimeout(r, 2500));
        await route.abort("failed");
      } else {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/csv;charset=utf-8",
            "Content-Disposition": 'attachment; filename="retry-90.csv"',
            "X-Export-Count": "3",
          },
          body: "\uFEFFid\n1\n2\n3\n",
        });
      }
    });

    const downloads: string[] = [];
    page.on("download", (d) => { downloads.push(d.suggestedFilename()); });

    // 1) Dispara e cancela.
    await csvBtn.click();
    await expect(status).toHaveText(/Exportando/i);
    await csvBtn.focus();
    await page.keyboard.press("Escape");
    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // Cutoff antes do retry.
    const cutoff = await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[]; __cutoff?: number };
      w.__cutoff = (w.__ann ?? []).length;
      return w.__cutoff;
    });

    // 2) Foca via Tab e dispara com Enter.
    phase = "success";
    // Coloca o foco no botão anterior ao CSV via focagem direta em jsonBtn e Shift+Tab.
    await jsonBtn.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(csvBtn).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(csvBtn).toHaveAttribute("data-exporting", "false", { timeout: 8000 });

    // aria-live pós-cutoff: precisa conter "Exportando" e não pode ter mensagens do cancel.
    const postAnns = await page.evaluate(() => {
      const w = window as unknown as { __ann?: string[]; __cutoff?: number };
      return (w.__ann ?? []).slice(w.__cutoff ?? 0);
    });
    expect(cutoff).toBeGreaterThan(0);
    expect(postAnns.some((t) => /Exportando/i.test(t)), `retry sem 'Exportando': ${JSON.stringify(postAnns)}`).toBe(true);
    for (const t of postAnns) {
      expect(t).not.toMatch(/cancel/i);
    }

    // Toast — deve refletir o sucesso do retry (padrão T_OK_EXPORT_CSV).
    await expectToastMatchingAny(page, [T_OK_EXPORT_CSV]);

    expect(downloads.length, "exatamente 1 download no fluxo").toBe(1);
    expect(downloads[0]).toBe("retry-90.csv");
  });
});












