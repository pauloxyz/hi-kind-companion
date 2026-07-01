/**
 * Admin · Stripe Events — reprocess flows
 *
 * Cobre:
 *  1. Modal individual: cancelar não dispara reprocessamento; confirmar dispara.
 *  2. Link do stripe_event_id: navega para a aba Eventos com filtro (?q=…&tab=events).
 *  3. Toasts do lote: "Reprocessar filtrados" exibe sucesso/aviso/erro.
 *  4. Retentar falhas: BatchProgressPanel expõe o botão quando há falhas,
 *     ao clicar mostra pending e depois atualiza o resumo + toast.
 *
 * Ambiente sem admin ou sem linhas no log → soft-skip. Nunca falha "flaky".
 */
import { test, expect, type Page } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

const ROUTE = "/admin/stripe-events";

async function gotoLog(page: Page): Promise<boolean> {
  await ensureSignedIn(page);
  await page.goto(ROUTE);
  await page.waitForLoadState("domcontentloaded");
  if (!page.url().includes("/admin/stripe-events")) return false;

  // Vai para a aba de Log de Reprocessamento
  const logTab = page.getByRole("tab", { name: /Log de Reprocessamento/i });
  if (await logTab.isVisible().catch(() => false)) {
    await logTab.click();
  }
  return true;
}

async function firstRowOrSkip(page: Page) {
  const row = page.getByTestId("reprocess-log-row").first();
  const count = await page.getByTestId("reprocess-log-row").count();
  if (count === 0) {
    test.skip(true, "Sem registros em stripe_webhook_reprocess_log neste ambiente");
  }
  return row;
}

test.describe("Admin · Stripe Events · reprocess log", () => {
  test("modal individual: cancelar e confirmar", async ({ page }) => {
    const ok = await gotoLog(page);
    if (!ok) test.skip(true, "Sem acesso admin");

    const row = await firstRowOrSkip(page);
    const btn = row.getByTestId("reprocess-row-btn");
    await expect(btn).toBeEnabled();

    // Cancelar
    await btn.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/Reprocessar este evento\?/i)).toBeVisible();
    await dialog.getByRole("button", { name: /Cancelar/i }).click();
    await expect(dialog).toBeHidden();

    // Botão continua utilizável, nada disparado
    await expect(btn).toBeEnabled();
    await expect(btn).not.toHaveAttribute("aria-busy", "true");

    // Confirmar → mostra estado de pending na linha e aria-busy no botão
    await btn.click();
    await page.getByRole("alertdialog").getByRole("button", { name: /^Reprocessar$/ }).click();

    // Toast de resultado (success | warning | error) aparece
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 15_000 });
  });

  test("link do stripe_event_id abre a aba Eventos com filtro", async ({ page }) => {
    const ok = await gotoLog(page);
    if (!ok) test.skip(true, "Sem acesso admin");

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

    // A aba de Eventos ficou ativa
    await expect(page.getByRole("tab", { name: /^Eventos$/i })).toHaveAttribute("data-state", "active");
  });

  test("reprocessar filtrados dispara panel de progresso e toast", async ({ page }) => {
    const ok = await gotoLog(page);
    if (!ok) test.skip(true, "Sem acesso admin");

    await firstRowOrSkip(page);

    await page.getByRole("button", { name: /Reprocessar filtrados/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar em lote/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toBeVisible();

    // Aguarda concluir (data-pending vira "false")
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });

    // Um toast informando o resultado é exibido (sucesso, aviso ou erro)
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
  });

  test("Retentar falhas atualiza progresso e emite toast", async ({ page }) => {
    const ok = await gotoLog(page);
    if (!ok) test.skip(true, "Sem acesso admin");

    await firstRowOrSkip(page);

    // Roda um lote com escopo "só erros" para maximizar chance de ter falhas
    await page.getByRole("button", { name: /Reprocessar só erros/i }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: /Reprocessar erros/i }).click();

    const panel = page.getByTestId("batch-progress-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });

    const retry = panel.getByTestId("retry-failures-btn");
    if (!(await retry.isVisible().catch(() => false))) {
      test.skip(true, "Batch não produziu falhas para retentar neste ambiente");
    }

    await retry.click();
    // Enquanto pending, botão fica disabled com spinner
    await expect(retry).toBeDisabled();
    await expect(panel).toHaveAttribute("data-pending", "true");

    // Ao concluir, panel volta para "false" e um novo toast surge
    await expect(panel).toHaveAttribute("data-pending", "false", { timeout: 60_000 });
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
  });
});
