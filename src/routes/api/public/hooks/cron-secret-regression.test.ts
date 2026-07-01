/**
 * Regression gate for CRON_SECRET enforcement on every public hook route.
 *
 * The hooks under /api/public/* bypass Lovable's published-site auth, so
 * their only line of defence is `verifyCronSecret` at the top of each
 * POST handler. Any regression that removes/moves that check turns the
 * hook into an unauthenticated public endpoint — high impact:
 *   - uptime → free write-amplification against uptime_checks
 *   - visa-reminders / check-replies → mass email enqueue
 *   - seo-scan / import-dol-feed → external HTTP + row writes
 *
 * This file runs two complementary checks:
 *
 *  1. **Static** — every hook file is parsed and asserted to (a) import
 *     `verifyCronSecret` + `unauthorizedCronResponse` and (b) call the
 *     verify BEFORE any downstream I/O.
 *
 *  2. **Runtime** — the actual POST handler is invoked with a Request
 *     that lacks the cron header, and with one carrying a wrong secret.
 *     Both must resolve to 401 without touching Supabase or external
 *     services (verifyCronSecret short-circuits early).
 *
 * Both are cheap and run in CI without any live Supabase creds — this is
 * intentionally a unit-level gate so it stays green on fresh clones.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const HOOKS_DIR = join(__dirname);
// spike-alert.ts uses its own HMAC signature (webhook from Postgres),
// not CRON_SECRET — it is intentionally excluded from this gate.
const CRON_HOOKS = [
  "uptime.ts",
  "check-replies.ts",
  "import-dol-feed.ts",
  "seo-scan.ts",
  "visa-reminders.ts",
] as const;

describe("cron hooks — file inventory", () => {
  it("matches the expected inventory (adding a hook must update this list)", () => {
    const found = readdirSync(HOOKS_DIR)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .sort();
    // spike-alert is the only non-CRON_SECRET hook.
    const expected = [...CRON_HOOKS, "spike-alert.ts"].sort();
    expect(found).toEqual(expected);
  });
});

describe("cron hooks — static CRON_SECRET enforcement", () => {
  for (const file of CRON_HOOKS) {
    it(`${file} imports and calls verifyCronSecret before any I/O`, () => {
      const src = readFileSync(join(HOOKS_DIR, file), "utf-8");
      expect(src, `${file} must import verifyCronSecret`).toMatch(
        /import[^;]*verifyCronSecret[^;]*from\s+["']@\/lib\/cron-auth\.server["']/,
      );
      expect(src, `${file} must import unauthorizedCronResponse`).toMatch(
        /unauthorizedCronResponse/,
      );

      // Locate POST handler body and slice a prefix window; verifyCronSecret
      // must appear before any Supabase / fetch / external call.
      const postIdx = src.search(/POST\s*:\s*async/);
      expect(postIdx, `${file} must define a POST handler`).toBeGreaterThan(-1);
      const window = src.slice(postIdx, postIdx + 800);
      const verifyIdx = window.indexOf("verifyCronSecret(");
      expect(verifyIdx, `${file} must call verifyCronSecret in POST`).toBeGreaterThan(-1);

      const dangerousBefore = [
        /supabaseAdmin/, /createClient\(/, /\.from\(/, /\.rpc\(/,
        /fetch\(/, /enqueue_email/, /net\.http_post/,
      ];
      const preface = window.slice(0, verifyIdx);
      for (const re of dangerousBefore) {
        expect(
          re.test(preface),
          `${file}: ${re} runs BEFORE verifyCronSecret — regression!`,
        ).toBe(false);
      }
    });
  }
});

describe("cron hooks — runtime rejects without correct CRON_SECRET", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeAll(() => {
    // Set a known secret so verifyCronSecret enters the compare path
    // (missing_secret_env would also 401, but we want the mismatch/
    // missing_header code path exercised too).
    process.env.CRON_SECRET = "regression-cron-secret-" + "x".repeat(48);
    // Populate env vars the hook modules read at import time so module
    // evaluation does not crash. The 401 short-circuit means the values
    // themselves are never used.
    process.env.SUPABASE_URL ??= "http://localhost:54321";
    process.env.SUPABASE_PUBLISHABLE_KEY ??= "regression-placeholder-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "regression-placeholder-service-key";
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    if (originalService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  const importHook = async (file: string) => {
    const modulePath = "./" + file.replace(/\.ts$/, "");
    const mod = (await import(modulePath)) as { Route: { options: unknown } };
    const opts = mod.Route.options as {
      server?: { handlers?: { POST?: (ctx: { request: Request }) => Promise<Response> } };
    };
    const post = opts.server?.handlers?.POST;
    expect(typeof post, `${file} must expose a POST handler`).toBe("function");
    return post!;
  };

  for (const file of CRON_HOOKS) {
    it(`${file} → 401 when no auth header is sent`, async () => {
      const post = await importHook(file);
      const res = await post({
        request: new Request(`http://localhost/api/public/hooks/${file.replace(/\.ts$/, "")}`, {
          method: "POST",
        }),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("unauthorized");
    });

    it(`${file} → 401 when a wrong secret is sent`, async () => {
      const post = await importHook(file);
      const res = await post({
        request: new Request(`http://localhost/api/public/hooks/${file.replace(/\.ts$/, "")}`, {
          method: "POST",
          headers: { "x-cron-secret": "definitely-not-the-secret" },
        }),
      });
      expect(res.status).toBe(401);
    });
  }
});
