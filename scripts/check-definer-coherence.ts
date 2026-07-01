#!/usr/bin/env bun
/**
 * SECURITY DEFINER / GRANT coherence check.
 *
 * Asserts at CI time — independently of the vitest suite — that every
 * function in FORBIDDEN_ANON_RPCS is invisible to anon on the live Data API,
 * every function in ALLOWED_ANON_RPCS is still callable, and every table
 * in FORBIDDEN_ANON_TABLE_READS is either denied or empty for anon.
 *
 * Uses the publishable (anon) key only. Missing creds → skip (exit 0).
 *
 * Usage:  bun scripts/check-definer-coherence.ts [--verbose] [--dry-run]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  FORBIDDEN_ANON_RPCS,
  ALLOWED_ANON_RPCS,
  FORBIDDEN_ANON_TABLE_READS,
} from "../src/config/security-internal-ids";
import { parseCommonFlags, makeVerboseLogger } from "./lib/cli";
import { isPermissionErrorShape } from "./lib/permission-error";

const { verbose, dryRun } = parseCommonFlags();
const vlog = makeVerboseLogger(verbose);

if (dryRun) {
  console.log("[dry-run] Coherence probe plan:");
  console.log(`  FORBIDDEN_ANON_RPCS  (${FORBIDDEN_ANON_RPCS.length}):`);
  for (const r of FORBIDDEN_ANON_RPCS) console.log(`    · anon.rpc(${r.fn}) MUST be denied`);
  console.log(`  ALLOWED_ANON_RPCS   (${ALLOWED_ANON_RPCS.length}):`);
  for (const r of ALLOWED_ANON_RPCS) console.log(`    · anon.rpc(${r.fn}) MUST remain callable`);
  console.log(`  FORBIDDEN_ANON_TABLE_READS (${FORBIDDEN_ANON_TABLE_READS.length}):`);
  for (const t of FORBIDDEN_ANON_TABLE_READS) console.log(`    · anon.from(${t}).select() MUST be denied or empty`);
  process.exit(0);
}

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

if (!URL || !KEY) {
  console.warn("⚠ VITE_SUPABASE_URL/PUBLISHABLE_KEY not set — coherence check skipped.");
  process.exit(0);
}

const anon = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
});

// Collected across all three probe sections so we can report every
// violation in a single failure block instead of failing on the first hit.
const failures: string[] = [];

/**
 * Probe 1 — Internal SECURITY DEFINER functions must NOT be anon-callable.
 * Regression here is exactly SUPA_anon_security_definer_function_executable.
 */
async function probeForbiddenRpcs(client: SupabaseClient) {
  console.log("▶ SECURITY DEFINER EXECUTE grants (must be locked down for anon)");
  for (const { fn, args } of FORBIDDEN_ANON_RPCS) {
    const { error } = await client.rpc(fn, args);
    if (!isPermissionErrorShape(error)) {
      failures.push(`  ❌ rpc(${fn}) is callable by anon (regression!) — error=${error?.message ?? "none"}`);
    } else {
      vlog(`✓ ${fn} denied (${error?.code ?? "no-code"})`);
    }
  }
}

/**
 * Probe 2 — Public helpers that MUST stay anon-callable.
 * Guards against over-revoke breaking `get_public_profile_whatsapp` etc.
 */
async function probeAllowedRpcs(client: SupabaseClient) {
  console.log("\n▶ SECURITY DEFINER EXECUTE grants (must remain callable for anon)");
  for (const { fn, args } of ALLOWED_ANON_RPCS) {
    const { error } = await client.rpc(fn, args);
    if (error) {
      failures.push(`  ❌ rpc(${fn}) MUST remain anon-callable — error=${error.message}`);
    } else {
      vlog(`✓ ${fn} still allowed`);
    }
  }
}

/**
 * Probe 3 — Internal tables must be denied to anon OR return zero rows.
 * Unexpected error shapes are reported so infra bugs don't silently pass.
 */
async function probeForbiddenTableReads(client: SupabaseClient) {
  console.log("\n▶ Internal table anon reads (must be denied or empty)");
  for (const table of FORBIDDEN_ANON_TABLE_READS) {
    const { data, error } = await client.from(table).select("*").limit(1);
    if (error && !isPermissionErrorShape(error)) {
      failures.push(`  ❌ ${table} returned unexpected error shape: ${error.message}`);
    } else if (!error && (data?.length ?? 0) > 0) {
      failures.push(`  ❌ ${table} leaked rows to anon (regression!)`);
    } else {
      vlog(`✓ ${table} not readable by anon`);
    }
  }
}

await probeForbiddenRpcs(anon);
await probeAllowedRpcs(anon);
await probeForbiddenTableReads(anon);

console.log("");
if (failures.length > 0) {
  console.error(`✖ Coherence check FAILED (${failures.length}):`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log("✓ SECURITY DEFINER / GRANT coherence intact.");
