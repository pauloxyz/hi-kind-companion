import { createClient, type Session } from "@supabase/supabase-js";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Sign in a test user via Supabase email+password and return the session +
 * the localStorage key the supabase-js client expects in the browser.
 *
 * Why not use the managed Lovable browser session?
 * The managed session (LOVABLE_BROWSER_SUPABASE_*) only exists after the
 * human user logs in once via the preview. We want a Playwright test that
 * provisions its own session every run with zero manual setup.
 *
 * Required env (set locally, in CI, or via a Playwright .env loader):
 *   E2E_TEST_EMAIL     — pre-created Supabase user
 *   E2E_TEST_PASSWORD  — that user's password
 *
 * The user only needs to be created once (sign up via /auth, confirm the
 * email, then store the credentials as env vars or repo secrets). After
 * that, every Playwright run mints a fresh access token automatically — no
 * "skipped" tests, no manual browser login.
 *
 * Optional overrides:
 *   E2E_SUPABASE_URL              — defaults to VITE_SUPABASE_URL
 *   E2E_SUPABASE_PUBLISHABLE_KEY  — defaults to VITE_SUPABASE_PUBLISHABLE_KEY
 */

const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://lkvfvriexuxlvrufbqbf.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_wq43mYCRgxQ11IfBOkHi7w_Ihw2O_A3";

// supabase-js v2 derives the storage key from the project ref: `sb-<ref>-auth-token`.
function storageKeyFromUrl(url: string): string {
  const host = new URL(url).host;            // lkvfvriexuxlvrufbqbf.supabase.co
  const ref = host.split(".")[0];            // lkvfvriexuxlvrufbqbf
  return `sb-${ref}-auth-token`;
}

export interface E2ESession {
  storageKey: string;
  session: Session;
  /** Serialized exactly as the browser client persists it. */
  storageValue: string;
}

/**
 * Sign in via the Auth REST API (no browser involvement) and return the
 * pieces needed to inject the session into localStorage.
 */
export async function signInTestUser(): Promise<E2ESession> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      [
        "E2E_TEST_EMAIL / E2E_TEST_PASSWORD are not set.",
        "Create a Supabase user once via /auth (confirm the email), then set:",
        "  export E2E_TEST_EMAIL='you+e2e@example.com'",
        "  export E2E_TEST_PASSWORD='<strong-password>'",
        "and re-run `npx playwright test`.",
      ].join("\n"),
    );
  }

  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: undefined,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(
      `signInWithPassword failed for ${email}: ${error?.message ?? "no session returned"}. ` +
        "Confirm the user exists, the email is confirmed, and the password is correct.",
    );
  }

  return {
    storageKey: storageKeyFromUrl(SUPABASE_URL),
    session: data.session,
    storageValue: JSON.stringify(data.session),
  };
}

/**
 * Inject the session into the page's localStorage. Caller must already have
 * navigated to the app origin so the write lands on the right Origin —
 * never use `addInitScript`, that would leak the token to every site the
 * browser later visits.
 */
export async function applySessionToPage(page: Page, s: E2ESession): Promise<void> {
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string);
    },
    [s.storageKey, s.storageValue],
  );
}

/** Convenience wrapper: sign in and seed the context's storage in one call. */
export async function ensureSignedIn(
  page: Page,
  _context?: BrowserContext,
): Promise<E2ESession> {
  const s = await signInTestUser();
  await page.goto("/");
  await applySessionToPage(page, s);
  return s;
}
