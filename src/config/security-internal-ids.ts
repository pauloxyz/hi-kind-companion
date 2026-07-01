/**
 * Single source of truth for the security findings we hardened on
 * 2026-07-01 and continue to gate in CI + nightly.
 *
 * Consumed by:
 *   - src/lib/security-regression.integration.test.ts
 *   - src/routes/api/public/hooks/cron-secret-regression.test.ts
 *   - scripts/compare-security-artifacts.ts (CI drift detection)
 *   - scripts/security-regression.sh          (local runner)
 *   - .github/workflows/ci.yml + nightly-security.yml (via the scripts above)
 *
 * Do not fork these constants — add to this file and re-import.
 */

/** Findings we explicitly hardened and must never see reappear. */
export const TARGET_INTERNAL_IDS = [
  "SUPA_anon_security_definer_function_executable",
  "SUPA_authenticated_security_definer_function_executable",
  "SUPA_function_search_path_mutable",
  "jobs_recruitment_contact_anon_exposure",
  "my_profile_anon_sensitive_columns",
] as const;

export type TargetInternalId = (typeof TARGET_INTERNAL_IDS)[number];

/** Columns on `public.jobs` that must NOT be selectable by anon. */
export const JOBS_FORBIDDEN_COLUMNS = [
  "recruitment_email",
  "recruitment_phone",
  "recruitment_contact_name",
  "employer_address",
  "raw_feed_data",
] as const;

/** Columns on `public.my_profile` that must NOT be selectable by anon. */
export const MY_PROFILE_FORBIDDEN_COLUMNS = [
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

/** Columns that MUST remain readable by anon (guards over-revoke). */
export const JOBS_ALLOWED_COLUMNS = ["id", "job_title", "worksite_state", "worksite_city"] as const;
export const MY_PROFILE_ALLOWED_COLUMNS = [
  "id",
  "public_slug",
  "public_headline",
  "public_page_enabled",
  "full_name",
] as const;

/**
 * SECURITY DEFINER functions that must NOT be callable by anon.
 *
 * Each entry pairs the function name with a set of `args` that will be
 * passed by the coherence probe. Args only need to be *type-valid* —
 * the goal is to trigger PostgREST's permission check before it ever
 * reaches the function body, so we intentionally use throwaway values
 * (zero UUIDs, placeholder keys) that can never match real data.
 *
 * Grouped by concern (in list order):
 *   1. Abuse guards — check_rate_limit / record_admin_denial
 *   2. Data-retention purges — purge_* (destructive, admin-only)
 *   3. Alert escalation jobs — escalate_* (called by pg_cron)
 *   4. Role & entitlement checks — has_role / is_pro / is_pro_feature_enabled
 *      (leaking these enables role probing across arbitrary user_ids)
 *   5. PGMQ email queue helpers — enqueue_email / delete_email / read_email_batch
 *      (an anon caller could flood the queue or drain unsent messages)
 */
export const FORBIDDEN_ANON_RPCS: ReadonlyArray<{ fn: string; args: Record<string, unknown> }> = [
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

/**
 * SECURITY DEFINER functions that MUST remain callable by anon.
 *
 * These are the deliberate escape hatches — features that unauthenticated
 * visitors legitimately need. Any regression here means an over-eager
 * REVOKE broke a public-facing feature and must be reverted.
 *
 * `get_public_profile_whatsapp` powers the WhatsApp CTA on the public
 * profile share page `/v/:slug`; the probe uses a nonsense slug that
 * cannot collide with real user data.
 */
export const ALLOWED_ANON_RPCS: ReadonlyArray<{ fn: string; args: Record<string, unknown> }> = [
  { fn: "get_public_profile_whatsapp", args: { _slug: "___regression_probe___" } },
];

/**
 * Tables that must NOT be anon-readable at all.
 *
 * Split by category:
 *   - email_* + suppressed_emails    → outbound queue / delivery metadata
 *                                      (would leak recipients + bounce state)
 *   - security_audit_log + scan_runs → internal audit trail (admin-only)
 *   - rate_limit_buckets             → would reveal traffic patterns
 *   - user_roles                     → role assignments (never expose to
 *                                      clients; roles must be resolved
 *                                      server-side via has_role())
 */
export const FORBIDDEN_ANON_TABLE_READS = [
  "email_send_log",
  "email_send_state",
  "suppressed_emails",
  "email_unsubscribe_tokens",
  "security_audit_log",
  "security_scan_runs",
  "rate_limit_buckets",
  "user_roles",
] as const;

/**
 * Public hooks (POST) that must enforce CRON_SECRET before any I/O.
 *
 * These live under `/api/public/hooks/*` — a path prefix that Lovable
 * exempts from auth for published sites. The CRON_SECRET header is the
 * only remaining gate; the regression tests confirm each of these hooks
 * calls `verifyCronSecret` before reading the request body, touching the
 * database or making outbound network calls.
 */
export const CRON_PROTECTED_HOOKS = [
  "uptime.ts",
  "check-replies.ts",
  "import-dol-feed.ts",
  "seo-scan.ts",
  "visa-reminders.ts",
] as const;

