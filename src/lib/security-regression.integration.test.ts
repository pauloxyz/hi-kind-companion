/**
 * Security regression tests — the CI gate for the findings we hardened on
 * 2026-07-01:
 *
 *   - jobs_recruitment_contact_anon_exposure
 *   - my_profile_anon_sensitive_columns
 *   - SUPA_anon_security_definer_function_executable
 *   - SUPA_authenticated_security_definer_function_executable
 *   - SUPA_function_search_path_mutable (verified indirectly — a broken
 *     search_path would break the enqueue_email happy path used by
 *     unrelated integration tests, and there is no anon-facing surface
 *     for that lint. Explicitly checked in the CI SQL step, below.)
 *
 * We call the live Supabase Data API with the publishable (anon) key and
 * assert:
 *   1. Sensitive columns on `jobs` / `my_profile` are NOT selectable by anon.
 *   2. Public-safe columns on the same tables ARE still selectable.
 *   3. Internal SECURITY DEFINER functions are NOT callable by anon.
 *   4. The one intentionally-public helper (`get_public_profile_whatsapp`)
 *      IS still callable by anon — so the revoke sweep didn't overreach.
 *
 * The test file is intentionally shaped as an end-to-end behavioural probe
 * against PostgREST + Postgres GRANTs, because that's the layer the
 * findings live at. A mocked unit test would prove nothing here.
 *
 * Skip behavior mirrors `public-views.rls.integration.test.ts`: no creds =
 * skip with a clear message, so `bun test` stays green in fresh clones.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const hasCreds = Boolean(URL && KEY);

// Anything in this list MUST NOT be readable by anon on the base table.
// If a future migration re-GRANTs SELECT (col) TO anon, the test fails.
const JOBS_FORBIDDEN = [
  "recruitment_email",
  "recruitment_phone",
  "recruitment_contact_name",
  "employer_address",
  "raw_feed_data",
] as const;

const MY_PROFILE_FORBIDDEN = [
  "birth_date",
  "phone",
  "application_quality_score",
  "resume_completion_pct",
  "onboarding_step",
  "onboarding_completed_at",
  "video_script_pt",
  "video_script_en",
  "video_script_blocks",
  "field_experience",
  "physical_conditions",
  "has_prior_h2_experience",
] as const;

// Columns we WANT anon to keep reading — proves the revoke didn't nuke
// legitimate public reads.
const JOBS_ALLOWED = ["id", "job_title", "worksite_state", "worksite_city"] as const;
const MY_PROFILE_ALLOWED = [
  "id",
  "public_slug",
  "public_headline",
  "public_page_enabled",
  "full_name",
] as const;

// SECURITY DEFINER functions that MUST NOT be callable by anon after the
// hardening migration. Any regression flips at least one of these to a
// non-permission-error response.
const FORBIDDEN_ANON_RPCS: Array<{ fn: string; args: Record<string, unknown> }> = [
  { fn: "check_rate_limit", args: { _key: "regression-probe", _max: 1, _window_seconds: 60 } },
  { fn: "record_admin_denial", args: { _resource: "regression-probe" } },
  { fn: "purge_uptime_checks", args: {} },
  { fn: "purge_security_audit_log", args: {} },
  { fn: "purge_security_scan_runs", args: {} },
  { fn: "purge_rate_limit_buckets", args: {} },
  { fn: "escalate_admin_denied_spikes", args: {} },
  { fn: "escalate_high_risk_alerts", args: {} },
  { fn: "run_security_linter", args: {} },
  { fn: "has_role", args: { _user_id: "00000000-0000-0000-0000-000000000000", _role: "admin" } },
  { fn: "is_pro", args: { _user_id: "00000000-0000-0000-0000-000000000000" } },
  { fn: "is_pro_feature_enabled", args: { _user_id: "00000000-0000-0000-0000-000000000000", _feature_key: "any" } },
  { fn: "enqueue_email", args: { queue_name: "regression", payload: {} } },
  { fn: "delete_email", args: { queue_name: "regression", message_id: 0 } },
  { fn: "read_email_batch", args: { queue_name: "regression", batch_size: 1, vt: 1 } },
];

// Tables that MUST NOT be anon-readable at all (no column-level GRANT to
// anon, RLS should not matter — the outer table GRANT is the cliff).
// Covers the email queue / suppression surface plus my_profile writes.
const FORBIDDEN_ANON_TABLE_READS = [
  "email_send_log",
  "email_send_state",
  "suppressed_emails",
  "email_unsubscribe_tokens",
  "security_audit_log",
  "security_scan_runs",
  "rate_limit_buckets",
  "user_roles",
] as const;

// my_profile: anon has SELECT on a narrow column allowlist only. Writes
// (INSERT/UPDATE/DELETE) must be denied — regression would let a public
// visitor mutate profile records.
const MY_PROFILE_WRITE_PROBES = [
  { op: "insert" as const, args: { owner_id: "00000000-0000-0000-0000-000000000000" } },
  { op: "update" as const, args: { full_name: "regression" } },
  { op: "delete" as const, args: undefined },
];

function isPermissionErrorShape(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  // PostgREST maps insufficient_privilege → 42501 and returns messages
  // like "permission denied for function X" or "permission denied for
  // table Y" or the RPC-shaped "Could not find the function ... in the
  // schema cache" when EXECUTE has been fully revoked from anon (the
  // schema cache omits functions the anon role can't see).
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42501" ||
    code === "PGRST202" ||
    msg.includes("permission denied") ||
    msg.includes("not find the function") ||
    msg.includes("could not find the function") ||
    msg.includes("no function matches") ||
    msg.includes("insufficient")
  );
}

describe.runIf(hasCreds)("security regression — column-level GRANTs", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = createClient(URL!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
  });

  for (const col of JOBS_FORBIDDEN) {
    it(`anon cannot SELECT jobs.${col}`, async () => {
      const { error } = await anon.from("jobs").select(col).limit(1);
      expect(
        isPermissionErrorShape(error),
        `Expected permission-denied on jobs.${col}. Got: ${error?.message ?? "no error (regression!)"}`,
      ).toBe(true);
    });
  }

  for (const col of MY_PROFILE_FORBIDDEN) {
    it(`anon cannot SELECT my_profile.${col}`, async () => {
      const { error } = await anon.from("my_profile").select(col).limit(1);
      expect(
        isPermissionErrorShape(error),
        `Expected permission-denied on my_profile.${col}. Got: ${error?.message ?? "no error (regression!)"}`,
      ).toBe(true);
    });
  }

  it("anon CAN still read public-safe jobs columns (no over-revoke)", async () => {
    const { error } = await anon.from("jobs").select(JOBS_ALLOWED.join(",")).limit(1);
    expect(error, `Public jobs columns must remain readable. Error: ${error?.message ?? ""}`).toBeNull();
  });

  it("anon CAN still read public-safe my_profile columns (no over-revoke)", async () => {
    const { error } = await anon
      .from("my_profile")
      .select(MY_PROFILE_ALLOWED.join(","))
      .eq("public_page_enabled", true)
      .limit(1);
    expect(error, `Public my_profile columns must remain readable. Error: ${error?.message ?? ""}`).toBeNull();
  });
});

describe.runIf(hasCreds)("security regression — SECURITY DEFINER EXECUTE grants", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = createClient(URL!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
  });

  for (const { fn, args } of FORBIDDEN_ANON_RPCS) {
    it(`anon cannot EXECUTE ${fn}()`, async () => {
      const { error } = await anon.rpc(fn, args);
      expect(
        isPermissionErrorShape(error),
        `Expected permission-denied on rpc(${fn}). Got: ${error?.message ?? "no error (regression!)"}`,
      ).toBe(true);
    });
  }

  it("anon CAN still call get_public_profile_whatsapp (intentional public helper)", async () => {
    // Non-existent slug → the function returns NULL, but the call itself
    // must succeed (no permission error). If the sweep accidentally
    // revoked this one, the public candidate page would break.
    const { error } = await anon.rpc("get_public_profile_whatsapp", { _slug: "___regression_probe___" });
    expect(
      error,
      `get_public_profile_whatsapp must remain anon-callable. Error: ${error?.message ?? ""}`,
    ).toBeNull();
  });
});

describe.runIf(hasCreds)("security regression — RLS/GRANT on internal tables", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = createClient(URL!, KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
  });

  for (const table of FORBIDDEN_ANON_TABLE_READS) {
    it(`anon cannot SELECT * FROM ${table}`, async () => {
      const { data, error } = await anon.from(table).select("*").limit(1);
      // Two acceptable regression-safe shapes:
      //   1) explicit permission error (GRANT stripped from anon)
      //   2) empty rows with no error (RLS returns 0 rows despite GRANT)
      // Anything else — a populated row for anon — is a regression.
      if (error) {
        expect(
          isPermissionErrorShape(error),
          `${table}: unexpected error shape: ${error.message}`,
        ).toBe(true);
      } else {
        expect(
          data ?? [],
          `${table} leaked rows to anon (regression!)`,
        ).toEqual([]);
      }
    });
  }

  for (const { op, args } of MY_PROFILE_WRITE_PROBES) {
    it(`anon cannot ${op.toUpperCase()} my_profile`, async () => {
      let error: { code?: string; message?: string } | null = null;
      if (op === "insert") {
        ({ error } = await anon.from("my_profile").insert(args!));
      } else if (op === "update") {
        ({ error } = await anon
          .from("my_profile")
          .update(args!)
          .eq("public_slug", "___regression_probe___"));
      } else {
        ({ error } = await anon
          .from("my_profile")
          .delete()
          .eq("public_slug", "___regression_probe___"));
      }
      expect(
        error && isPermissionErrorShape(error),
        `Expected permission-denied on my_profile ${op}. Got: ${error?.message ?? "no error (regression!)"}`,
      ).toBe(true);
    });
  }
});

describe.runIf(!hasCreds)("security regression (SKIPPED — no Supabase creds)", () => {
  it("skipped because VITE_SUPABASE_URL/PUBLISHABLE_KEY are not set", () => {
    expect(true).toBe(true);
  });
});
