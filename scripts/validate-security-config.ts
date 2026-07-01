#!/usr/bin/env bun
/**
 * Static validator for src/config/security-internal-ids.ts — the single
 * source of truth consumed by regression tests, coherence probe, delta
 * comparator and CI/nightly workflows.
 *
 * Fails the CI when:
 *   - required exports are missing or the wrong shape
 *   - a list is empty (would silently disable checks)
 *   - duplicate ids/columns/functions/tables/hooks (drift risk)
 *   - JOBS_ALLOWED_COLUMNS overlaps JOBS_FORBIDDEN_COLUMNS (contradictory)
 *   - MY_PROFILE_ALLOWED_COLUMNS overlaps MY_PROFILE_FORBIDDEN_COLUMNS
 *   - a forbidden RPC also appears in the allowed set
 *   - a CRON_PROTECTED_HOOKS entry does not exist on disk
 *
 * Exit codes:
 *   0 → config is coherent
 *   1 → one or more violations (details on stderr)
 */
import { existsSync } from "node:fs";
import { z } from "zod";
import * as cfg from "../src/config/security-internal-ids";

const errors: string[] = [];
const warn = (m: string) => errors.push(m);

const rpcSchema = z.object({ fn: z.string().min(1), args: z.record(z.unknown()) });

const requiredLists: Array<[string, readonly unknown[] | undefined]> = [
  ["TARGET_INTERNAL_IDS", cfg.TARGET_INTERNAL_IDS],
  ["JOBS_FORBIDDEN_COLUMNS", cfg.JOBS_FORBIDDEN_COLUMNS],
  ["MY_PROFILE_FORBIDDEN_COLUMNS", cfg.MY_PROFILE_FORBIDDEN_COLUMNS],
  ["JOBS_ALLOWED_COLUMNS", cfg.JOBS_ALLOWED_COLUMNS],
  ["MY_PROFILE_ALLOWED_COLUMNS", cfg.MY_PROFILE_ALLOWED_COLUMNS],
  ["FORBIDDEN_ANON_RPCS", cfg.FORBIDDEN_ANON_RPCS],
  ["ALLOWED_ANON_RPCS", cfg.ALLOWED_ANON_RPCS],
  ["FORBIDDEN_ANON_TABLE_READS", cfg.FORBIDDEN_ANON_TABLE_READS],
  ["CRON_PROTECTED_HOOKS", cfg.CRON_PROTECTED_HOOKS],
];

for (const [name, list] of requiredLists) {
  if (!Array.isArray(list)) {
    warn(`❌ ${name} is missing or not an array`);
    continue;
  }
  if (list.length === 0) warn(`❌ ${name} is empty — checks would be silently disabled`);
  const seen = new Set<string>();
  for (const item of list) {
    const key = typeof item === "string" ? item : JSON.stringify(item);
    if (seen.has(key)) warn(`❌ ${name} has duplicate entry: ${key}`);
    seen.add(key);
  }
}

for (const rpc of cfg.FORBIDDEN_ANON_RPCS ?? []) {
  const r = rpcSchema.safeParse(rpc);
  if (!r.success) warn(`❌ FORBIDDEN_ANON_RPCS bad shape: ${JSON.stringify(rpc)} — ${r.error.message}`);
}
for (const rpc of cfg.ALLOWED_ANON_RPCS ?? []) {
  const r = rpcSchema.safeParse(rpc);
  if (!r.success) warn(`❌ ALLOWED_ANON_RPCS bad shape: ${JSON.stringify(rpc)} — ${r.error.message}`);
}

const overlap = <T>(a: readonly T[], b: readonly T[], label: string) => {
  const bs = new Set(b);
  for (const x of a) if (bs.has(x)) warn(`❌ ${label}: "${String(x)}" is in both allowed and forbidden lists`);
};
overlap(cfg.JOBS_ALLOWED_COLUMNS ?? [], cfg.JOBS_FORBIDDEN_COLUMNS ?? [], "jobs columns");
overlap(cfg.MY_PROFILE_ALLOWED_COLUMNS ?? [], cfg.MY_PROFILE_FORBIDDEN_COLUMNS ?? [], "my_profile columns");

const forbiddenFns = new Set((cfg.FORBIDDEN_ANON_RPCS ?? []).map((r) => r.fn));
for (const rpc of cfg.ALLOWED_ANON_RPCS ?? []) {
  if (forbiddenFns.has(rpc.fn)) warn(`❌ RPC "${rpc.fn}" is both allowed and forbidden for anon`);
}

for (const hook of cfg.CRON_PROTECTED_HOOKS ?? []) {
  const p = `src/routes/api/public/hooks/${hook}`;
  if (!existsSync(p)) warn(`❌ CRON_PROTECTED_HOOKS references missing file: ${p}`);
}

const knownTargets = new Set([
  "SUPA_anon_security_definer_function_executable",
  "SUPA_authenticated_security_definer_function_executable",
  "SUPA_function_search_path_mutable",
  "jobs_recruitment_contact_anon_exposure",
  "my_profile_anon_sensitive_columns",
]);
for (const id of cfg.TARGET_INTERNAL_IDS ?? []) {
  if (!knownTargets.has(id)) warn(`⚠️  TARGET_INTERNAL_IDS has unrecognized id "${id}" — update validator if intentional`);
}

if (errors.length) {
  console.error("Security config validation FAILED:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("✅ security-internal-ids.ts is coherent (" +
  `${cfg.TARGET_INTERNAL_IDS.length} targets, ` +
  `${cfg.FORBIDDEN_ANON_RPCS.length} forbidden RPCs, ` +
  `${cfg.CRON_PROTECTED_HOOKS.length} protected hooks)`);
