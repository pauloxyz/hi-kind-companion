#!/usr/bin/env bun
/**
 * SECURITY DEFINER / GRANT coherence check.
 *
 * Runs at CI time to assert — independently of the vitest suite — that
 * every function in FORBIDDEN_ANON_RPCS is invisible to anon on the live
 * Data API, and every function in ALLOWED_ANON_RPCS is still callable.
 * This is a schema-level guard: if a future migration re-GRANTs EXECUTE
 * on an internal function to anon/authenticated, this script fails the
 * build with a targeted error message.
 *
 * Uses the publishable (anon) key only; no service role, no privileged
 * credentials. Missing creds → skip (exit 0) with a warning, matching the
 * existing integration-test skip behaviour on fresh clones.
 *
 * Usage:  bun scripts/check-definer-coherence.ts [--verbose] [--dry-run]
 *   --verbose : log every probe (denied + allowed), not just failures.
 *   --dry-run : print the probe plan (which rpcs/tables would be tested)
 *               and exit 0 without hitting the Data API.
 */
import { createClient } from "@supabase/supabase-js";
import {
  FORBIDDEN_ANON_RPCS,
  ALLOWED_ANON_RPCS,
  FORBIDDEN_ANON_TABLE_READS,
} from "../src/config/security-internal-ids";

const argv = process.argv.slice(2);
const VERBOSE = argv.includes("--verbose");
const DRY_RUN = argv.includes("--dry-run");

if (DRY_RUN) {
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

function isPermissionErrorShape(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42501" ||
    code === "PGRST202" ||
    msg.includes("permission denied") ||
    msg.includes("not find the function") ||
    msg.includes("no function matches") ||
    msg.includes("insufficient")
  );
}


const failures: string[] = [];

console.log("▶ SECURITY DEFINER EXECUTE grants (must be locked down for anon)");
for (const { fn, args } of FORBIDDEN_ANON_RPCS) {
  const { error } = await anon.rpc(fn, args);
  if (!isPermissionErrorShape(error)) {
    failures.push(`  ❌ rpc(${fn}) is callable by anon (regression!) — error=${error?.message ?? "none"}`);
  } else {
    console.log(`  ✓ ${fn} denied`);
  }
}

console.log("");
console.log("▶ SECURITY DEFINER EXECUTE grants (must remain callable for anon)");
for (const { fn, args } of ALLOWED_ANON_RPCS) {
  const { error } = await anon.rpc(fn, args);
  if (error) {
    failures.push(`  ❌ rpc(${fn}) MUST remain anon-callable — error=${error.message}`);
  } else {
    console.log(`  ✓ ${fn} still allowed`);
  }
}

console.log("");
console.log("▶ Internal table anon reads (must be denied or empty)");
for (const table of FORBIDDEN_ANON_TABLE_READS) {
  const { data, error } = await anon.from(table).select("*").limit(1);
  if (error && !isPermissionErrorShape(error)) {
    failures.push(`  ❌ ${table} returned unexpected error shape: ${error.message}`);
  } else if (!error && (data?.length ?? 0) > 0) {
    failures.push(`  ❌ ${table} leaked rows to anon (regression!)`);
  } else {
    console.log(`  ✓ ${table} not readable by anon`);
  }
}

console.log("");
if (failures.length > 0) {
  console.error(`✖ Coherence check FAILED (${failures.length}):`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log("✓ SECURITY DEFINER / GRANT coherence intact.");
