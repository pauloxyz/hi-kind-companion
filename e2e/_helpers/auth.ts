import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * Auth helper for Playwright E2E.
 *
 * Goal: every `npx playwright test` run must be able to obtain a valid
 * Supabase session WITHOUT manual browser sign-in.
 *
 * Resolution order:
 *
 *   1. If E2E_TEST_EMAIL / E2E_TEST_PASSWORD are both set → use them
 *      (pre-existing, fully confirmed user).
 *
 *   2. Otherwise → use a deterministic test account
 *      (`playwright+e2e-auto-confirm@vplusa.test` / `Playwright!E2E#2025`) and try:
 *        a. signInWithPassword  → success means the user already exists.
 *        b. signUp              → success WITH session means signups are
 *           auto-confirmed and the user is logged in immediately.
 *        c. signUp returns no session → email confirmation is required.
 *           Throw with actionable instructions instead of skipping.
 *
 * The helper never depends on LOVABLE_BROWSER_AUTH_STATUS, the managed
 * Supabase service-role key, or any browser-side OAuth flow.
 */

const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://lkvfvriexuxlvrufbqbf.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_wq43mYCRgxQ11IfBOkHi7w_Ihw2O_A3";

// Defaults used when E2E_TEST_EMAIL is not set. The `.test` TLD is reserved
// (RFC 2606) so it cannot collide with a real inbox.
const DEFAULT_EMAIL = "playwright+e2e-auto-confirm@vplusa.test";
const DEFAULT_PASSWORD = "Playwright!E2E#2025";
let cachedSession: Promise<E2ESession> | null = null;
let cachedSessionKey: string | null = null;

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function resolveTestCredentials(): { email: string; password: string; usedDefaults: boolean } {
  const email = getEnv("E2E_TEST_EMAIL");
  const password = getEnv("E2E_TEST_PASSWORD");

  if (!email && !password) {
    return { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, usedDefaults: true };
  }

  if (!email || !password) {
    throw new Error(
      "Set both E2E_TEST_EMAIL and E2E_TEST_PASSWORD, or omit both to use the deterministic E2E account.",
    );
  }

  return { email, password, usedDefaults: false };
}

// supabase-js v2 derives the storage key from the project ref:
// `sb-<ref>-auth-token`.
function storageKeyFromUrl(url: string): string {
  const host = new URL(url).host;            // lkvfvriexuxlvrufbqbf.supabase.co
  const ref = host.split(".")[0];            // lkvfvriexuxlvrufbqbf
  return `sb-${ref}-auth-token`;
}

function makeClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

export interface E2ESession {
  storageKey: string;
  session: Session;
  storageValue: string;
  email: string;
}

/**
 * Sign in (or create + sign in) the test user via the Auth REST API.
 * Returns the pieces needed to seed the browser's localStorage.
 */
export async function signInTestUser(): Promise<E2ESession> {
  const { email, password, usedDefaults } = resolveTestCredentials();
  const cacheKey = [SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, email, password].join("\0");

  if (cachedSession && cachedSessionKey === cacheKey) {
    return cachedSession;
  }

  cachedSessionKey = cacheKey;
  cachedSession = provisionTestUserSession({ email, password, usedDefaults });
  return cachedSession;
}

async function provisionTestUserSession({
  email,
  password,
  usedDefaults,
}: {
  email: string;
  password: string;
  usedDefaults: boolean;
}): Promise<E2ESession> {

  const client = makeClient();

  // Step 1 — try to sign in. If the user already exists (from a previous
  // run) this succeeds immediately.
  const signIn = await client.auth.signInWithPassword({ email, password });
  let session: Session | null = signIn.data.session ?? null;

  if (!session) {
    // Step 2 — user doesn't exist (or password mismatch). Provision via
    // signUp. Whether we get a session back depends on whether email
    // confirmation is required for this project.
    const signUp = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: undefined },
    });

    if (signUp.error) {
      // Race: another worker created it between our sign-in and sign-up.
      const retry = await client.auth.signInWithPassword({ email, password });
      session = retry.data.session ?? null;
      if (!session) {
        throw new Error(
          `E2E auth provisioning failed for ${email}: ` +
            `signIn=${signIn.error?.message ?? "no session"}, ` +
            `signUp=${signUp.error.message}.`,
        );
      }
    } else {
      session = signUp.data.session ?? null;
    }
  }

  if (!session) {
    // The user was created but no session was returned → email confirmation
    // is required and the test cannot proceed without it. Throw with the
    // exact remediation, do NOT skip.
    throw new Error(
      [
        `Created ${email} but the auth service did not return a session — email confirmation is required.`,
        "",
        "Pick ONE of the following to unblock the E2E test:",
        "",
        "  A) Enable email auto-confirm for this project (recommended for non-prod):",
        "     Backend → Users → Auth Settings → Email → toggle \"Auto-confirm\" ON.",
        "     Re-run `npx playwright test` — the helper will provision and sign in",
        "     automatically from then on.",
        "",
        "  B) Pre-create a confirmed user once and pin its credentials:",
        "       1. Sign up at /auth with an email you control, confirm the link.",
        "       2. Export the credentials before running tests:",
        "            export E2E_TEST_EMAIL='you+e2e@example.com'",
        "            export E2E_TEST_PASSWORD='<strong-password>'",
        usedDefaults
          ? "       3. Re-run `npx playwright test`."
          : "       3. Re-run `npx playwright test` (you already set E2E_TEST_EMAIL).",
      ].join("\n"),
    );
  }

  return {
    storageKey: storageKeyFromUrl(SUPABASE_URL),
    session,
    storageValue: JSON.stringify(session),
    email,
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

/** Convenience wrapper: provision/sign in and seed localStorage in one call. */
export async function ensureSignedIn(
  page: Page,
  _context?: BrowserContext,
): Promise<E2ESession> {
  const s = await signInTestUser();
  await page.goto("/");
  await applySessionToPage(page, s);
  return s;
}
