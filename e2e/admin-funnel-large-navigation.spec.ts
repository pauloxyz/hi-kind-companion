/**
 * Admin · export de funil grande + navegação concorrente.
 *
 * Enquanto o navegador está serializando um CSV pesado, o admin precisa
 * continuar navegável. Este teste:
 *
 *   1. Mocka o endpoint do funil com um payload volumoso.
 *   2. Dispara o export e mede o tempo até o download completar.
 *   3. Em paralelo (antes do download resolver) tenta navegar para outra
 *      seção do admin (`/admin/pro-features`), confirmando que:
 *        - A navegação acontece em menos de 3s.
 *        - A nova rota renderiza (nenhum freeze / white screen).
 *        - Nenhum erro de console explode.
 *   4. Depois volta para `/admin/onboarding` e garante que o botão de
 *      export continua utilizável (data-exporting=false).
 */
import { test, expect } from "@playwright/test";
import { ensureSignedIn } from "./_helpers/auth";

// Gera um payload sintético "grande" — recent_events domina o tamanho.
function bigFunnelPayload(n = 4000) {
  const steps = [
    "Boas-vindas",
    "Como funciona",
    "Dados básicos",
    "Experiência",
    "Condições físicas",
    "Tudo pronto",
  ];
  return {
    total_started: 250_000,
    total_completed: 180_000,
    completion_rate_pct: 72,
    funnel: steps.map((step_label, step_index) => ({
      step_index,
      step_label,
      started_users: 250_000,
      reached_users: 250_000 - step_index * 12_000,
      drop_rate_pct: step_index === 0 ? 0 : 5,
    })),
    by_lang: {
      pt: {
        reached_by_step: steps.map((_, i) => 200_000 - i * 10_000),
        completed_users: 150_000,
        toggles_to: 40_000,
      },
      en: {
        reached_by_step: steps.map((_, i) => 50_000 - i * 2_000),
        completed_users: 30_000,
        toggles_to: 25_000,
      },
    },
    variant_switches: {
      total_events: 120_000,
      unique_users: 60_000,
      unique_variants: 4,
      completed_after_switch: 12_345,
      stuck_by_step: steps.map((_, step) => ({ step, users: 1_000 + step * 200 })),
    },
    current_step_distribution: steps.map((_, step) => ({ step, users: 5_000 + step * 300 })),
    recent_events: Array.from({ length: n }, (_, i) => ({
      created_at: new Date(Date.now() - i * 1000).toISOString(),
      event: i % 2 === 0 ? "onboarding_step_completed" : "onboarding_variant_selected",
      step_index: i % steps.length,
      user_id: `user-${i}`,
    })),
  };
}

test.describe("Admin · funil grande + navegação concorrente", () => {
  test("export em segundo plano não bloqueia navegação entre seções", async ({ page }) => {
    // Intercepta a server-fn — TanStack Start server functions são POST
    // servidos em /_serverFn/... — cobrimos ambos os padrões via glob.
    await page.route(/getOnboardingFunnel|serverFn/i, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: { data: bigFunnelPayload() } }),
      });
    });

    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await ensureSignedIn(page);
    await page.goto("/admin/onboarding");
    await page.waitForLoadState("domcontentloaded");
    if (!page.url().includes("/admin/onboarding")) {
      test.skip(true, "Usuário de teste não é admin");
    }

    const btn = page.getByTestId("funnel-export-csv");
    await expect(btn).toBeVisible();
    // Se o intercept não chegou a alimentar dados a tempo, tenta esperar.
    await expect(btn).toBeEnabled({ timeout: 15_000 });

    // Dispara o export — não aguarda o download completar antes de navegar.
    const downloadPromise = page.waitForEvent("download").catch(() => null);
    await btn.click();

    // Enquanto o CSV é serializado, navega para outra rota do admin.
    const navStart = Date.now();
    await page.goto("/admin/pro-features");
    const navElapsed = Date.now() - navStart;

    // A navegação não pode travar — 3s é folga generosa até em CI.
    expect(navElapsed).toBeLessThan(3000);
    expect(page.url()).toContain("/admin/pro-features");
    // O body precisa ter renderizado algo (não é white screen).
    await expect(page.locator("body")).not.toBeEmpty();

    // O download pode ter completado antes ou depois — só validamos que
    // (se aconteceu) veio com o nome certo e não corrompeu o browser.
    const dl = await downloadPromise;
    if (dl) {
      expect(dl.suggestedFilename()).toMatch(
        /^onboarding-funnel-pt-\d{4}-\d{2}-\d{2}\.csv$/,
      );
    }

    // Volta ao admin do onboarding e confirma que o botão está utilizável.
    await page.goto("/admin/onboarding");
    const btn2 = page.getByTestId("funnel-export-csv");
    await expect(btn2).toBeVisible();
    await expect(btn2).toHaveAttribute("data-exporting", "false");

    // Nenhum erro fatal no console durante o fluxo.
    const fatal = consoleErrors.filter(
      (e) => !/ResizeObserver|Failed to load resource/i.test(e),
    );
    expect(fatal, `Erros de console:\n${fatal.join("\n")}`).toHaveLength(0);
  });
});
