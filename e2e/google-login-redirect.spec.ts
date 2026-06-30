import { test, expect } from "@playwright/test";

/**
 * E2E: confirm that once a Supabase session exists (the post-Google-OAuth
 * state), the landing page (`/`) auto-redirects to `/app` without any user
 * interaction — no "Abrir meu app" button click required.
 *
 * Driving a real Google consent screen from Playwright is not feasible in
 * this sandbox (the popup lives on accounts.google.com behind bot
 * protection). Instead, we reproduce the exact post-OAuth browser state by
 * injecting the managed Supabase session that Lovable mints for us into
 * localStorage — see the `browser-use` knowledge file, "Authenticating into
 * the user's app (Supabase)".
 *
 * If the session env vars are not present (LOVABLE_BROWSER_AUTH_STATUS !==
 * "injected", e.g. signed_out preview), the test is skipped instead of
 * failing — there is no way to materialize a session without them.
 */

const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const authStatus = process.env.LOVABLE_BROWSER_AUTH_STATUS;

test.describe("post-Google-login auto-redirect", () => {
  test.skip(
    !storageKey || !sessionJson,
    `No managed Supabase session injected (LOVABLE_BROWSER_AUTH_STATUS=${authStatus ?? "unset"}). Sign in once via the preview so the broker mints a session, then re-run.`,
  );

  test("landing redirects signed-in user to /app without a click", async ({ page }) => {
    // 1) Establish the localhost origin first so the localStorage write
    //    lands on the right origin (do NOT use add_init_script — it would
    //    leak the token to every page the browser visits).
    await page.goto("/");

    // 2) Inject the Supabase session exactly like the OAuth helper would
    //    after a successful Google sign-in.
    await page.evaluate(
      ([key, value]) => {
        window.localStorage.setItem(key as string, value as string);
      },
      [storageKey!, sessionJson!],
    );

    // 3) Re-open the landing page — this is the post-OAuth navigation
    //    (lovable.auth.signInWithOAuth returns the user to
    //    `redirect_uri: window.location.origin`).
    await page.goto("/");

    // 4) The landing component reads the session and must navigate to
    //    /app on its own. No button click, no manual nav.
    await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 15_000 });

    expect(new URL(page.url()).pathname).toMatch(/^\/app(\/|$)/);

    // Sanity: we're inside the protected shell, not still on the public
    // landing with the "Abrir meu app" CTA.
    await expect(
      page.getByRole("link", { name: /abrir meu app/i }),
    ).toHaveCount(0);
  });
});
