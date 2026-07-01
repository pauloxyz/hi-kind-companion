/**
 * Integration tests against the live Supabase publishable (anon) endpoint.
 *
 * These guard the contract that public views (`public_profiles`,
 * `public_jobs`) **must not** become a backdoor around the RLS we put on
 * the base tables (`my_profile`, `jobs`).
 *
 * Why "integration" and not unit:
 *  - The thing being tested IS the Postgres RLS + view definitions. A unit
 *    test against a mock proves nothing. The whole point is to catch a
 *    future migration that drops `security_invoker = true` or widens an
 *    anon grant.
 *
 * Skip behavior: if the env doesn't expose VITE_SUPABASE_URL +
 * VITE_SUPABASE_PUBLISHABLE_KEY, the suite skips with a clear message
 * instead of failing — keeps `bun test` green in environments that don't
 * have backend creds (a fresh clone, a worker without secrets, etc).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

const hasCreds = Boolean(URL && KEY);

// PII columns that MUST NOT appear in any public surface, regardless of RLS.
// If a view selects these by mistake, the test below proves it.
const FORBIDDEN_PUBLIC_COLUMNS = [
  "phone",
  "birth_date",
  "email",
  "owner_id", // resolvable to auth.users.id — also leaks identity
] as const;

describe.runIf(hasCreds)("public views do not bypass RLS", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = createClient(URL!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
  });

  it("anon cannot read the base table my_profile directly", async () => {
    // Should either return zero rows (if a 'TO anon SELECT' policy exists
    // and matches nothing) OR explicitly error. What it MUST NOT do is
    // return rows with phone/birth_date populated.
    const { data, error } = await anon.from("my_profile").select("phone,birth_date,public_slug").limit(5);
    if (error) {
      // permission denied → ideal outcome
      expect(error.message).toMatch(/permission|policy|denied|RLS/i);
      return;
    }
    // If grants/policies allow reading, the rows must not expose PII.
    for (const row of data ?? []) {
      expect((row as Record<string, unknown>).phone).toBeFalsy();
      expect((row as Record<string, unknown>).birth_date).toBeFalsy();
    }
  });

  it("public_profiles view exposes only safe columns", async () => {
    const { data, error } = await anon.from("public_profiles").select("*").limit(1);
    // The view may legitimately return zero rows if no candidate enabled
    // their public page; that's still a passing assertion for the schema
    // check. What matters is the column shape, which Supabase serializes
    // as the keys present in the row.
    expect(error?.message ?? "").not.toMatch(/internal|server/i);
    if (data && data.length > 0) {
      const row = data[0] as Record<string, unknown>;
      for (const col of FORBIDDEN_PUBLIC_COLUMNS) {
        expect(
          col in row,
          `public_profiles must NOT expose '${col}'`,
        ).toBe(false);
      }
    }
  });

  it("public_profiles is filtered by public_page_enabled (no draft leaks)", async () => {
    // Anti-leak assertion — passes for EITHER of two secure outcomes:
    //   1. anon receives permission-denied (42501/PGRST202) → the view is
    //      fully locked down; no data can escape at all.
    //   2. anon receives rows, but every row has a non-null public_slug
    //      (the same gate `public_page_enabled = true` enforces in the view).
    // The only failure mode is: rows returned AND at least one has a null
    // public_slug (a draft leak).
    const { data, error } = await anon.from("public_profiles").select("public_slug").limit(50);
    if (error) {
      const code = error.code ?? "";
      const denied = code === "42501" || code === "PGRST202" || /permission denied|not find/i.test(error.message ?? "");
      expect(denied, `unexpected error shape from public_profiles: ${error.message}`).toBe(true);
      return; // denial ⇒ nothing leaked, test passes
    }
    for (const row of data ?? []) {
      expect(
        (row as { public_slug: string | null }).public_slug,
        "public_profiles returned a row with null public_slug — draft leak",
      ).toBeTruthy();
    }
  });

  it("anon cannot read internal audit/security tables", async () => {
    const forbidden = ["security_audit_log", "security_scan_runs", "user_roles", "subscriptions"];
    for (const table of forbidden) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      // Either permission error or zero rows is acceptable. Returning a
      // populated row would be a critical leak.
      if (!error) {
        expect(
          (data ?? []).length,
          `anon got ${data?.length} rows from ${table} — RLS or grants broken`,
        ).toBe(0);
      }
    }
  });
});

describe.runIf(!hasCreds)("public views RLS — skipped (no creds in env)", () => {
  it("skipped because VITE_SUPABASE_URL/PUBLISHABLE_KEY are not set", () => {
    expect(true).toBe(true);
  });
});
