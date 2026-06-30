#!/usr/bin/env bun
/**
 * Pre-deploy security check for Supabase migrations.
 *
 * Scans `supabase/migrations/*.sql` for the three patterns that have bitten
 * us before — none of them get caught by typecheck or by the runtime
 * Postgres linter early enough:
 *
 *  1. CREATE TABLE public.X without a matching GRANT block in the SAME
 *     migration → table is invisible to the Data API at runtime.
 *  2. CREATE TABLE public.X without ENABLE ROW LEVEL SECURITY → anyone
 *     with the anon grant can read everything.
 *  3. CREATE [OR REPLACE] VIEW public.X without `security_invoker = true`
 *     → view runs as creator (postgres), bypassing the RLS of its base
 *     tables. THIS is what flagged as "critical" in our last publish.
 *
 * Exit codes:
 *   0 — no issues
 *   1 — one or more migrations have issues; publish should be blocked
 *
 * Usage:
 *   bun run scripts/check-migration-security.ts
 *   bun run scripts/check-migration-security.ts --since 20260630
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";

type Issue = {
  file: string;
  level: "error" | "warn";
  rule: string;
  object: string;
  hint: string;
};

function loadMigrations(sinceArg?: string): string[] {
  let files: string[] = [];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch {
    console.log(`No ${MIGRATIONS_DIR}/ directory — nothing to check.`);
    return [];
  }
  if (sinceArg) {
    files = files.filter((f) => f.localeCompare(sinceArg) >= 0);
  }
  files.sort();
  return files.map((f) => join(MIGRATIONS_DIR, f));
}

function stripComments(sql: string): string {
  // Strip -- line comments and /* */ block comments before regex matching,
  // so a commented-out CREATE TABLE doesn't false-positive.
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

function checkFile(path: string): Issue[] {
  const raw = readFileSync(path, "utf8");
  const sql = stripComments(raw);
  const issues: Issue[] = [];

  // 1+2) CREATE TABLE public.X
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z0-9_]+)/gi;
  for (const m of sql.matchAll(tableRe)) {
    const name = m[1];
    const grantRe = new RegExp(`GRANT\\s+[\\w\\s,]+\\s+ON\\s+(?:TABLE\\s+)?public\\.${name}\\b`, "i");
    if (!grantRe.test(sql)) {
      issues.push({
        file: path,
        level: "error",
        rule: "table_without_grants",
        object: `public.${name}`,
        hint: `Add: GRANT SELECT,INSERT,UPDATE,DELETE ON public.${name} TO authenticated; GRANT ALL ON public.${name} TO service_role;`,
      });
    }
    const rlsRe = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?public\\.${name}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
    if (!rlsRe.test(sql)) {
      issues.push({
        file: path,
        level: "error",
        rule: "table_without_rls",
        object: `public.${name}`,
        hint: `Add: ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY; CREATE POLICY ...`,
      });
    }
  }

  // 3) CREATE [OR REPLACE] VIEW public.X — must set security_invoker
  const viewRe = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+public\.([a-z0-9_]+)/gi;
  for (const m of sql.matchAll(viewRe)) {
    const name = m[1];
    // Either set inline via WITH (security_invoker=true) or via ALTER VIEW
    const inlineRe = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+public\\.${name}[\\s\\S]*?WITH\\s*\\([^)]*security_invoker\\s*=\\s*true`, "i");
    const alterRe = new RegExp(`ALTER\\s+VIEW\\s+public\\.${name}\\s+SET\\s*\\([^)]*security_invoker\\s*=\\s*true`, "i");
    if (!inlineRe.test(sql) && !alterRe.test(sql)) {
      issues.push({
        file: path,
        level: "error",
        rule: "view_without_security_invoker",
        object: `public.${name}`,
        hint: `Add: ALTER VIEW public.${name} SET (security_invoker = true);`,
      });
    }
  }

  return issues;
}

function main() {
  const sinceIdx = process.argv.indexOf("--since");
  const since = sinceIdx >= 0 ? process.argv[sinceIdx + 1] : undefined;

  const files = loadMigrations(since);
  if (files.length === 0) {
    console.log("No migrations to check.");
    return;
  }

  console.log(`Checking ${files.length} migration file(s)...`);
  const all: Issue[] = [];
  for (const f of files) {
    try { statSync(f); } catch { continue; }
    all.push(...checkFile(f));
  }

  if (all.length === 0) {
    console.log("✓ No migration security issues found.");
    return;
  }

  const errors = all.filter((i) => i.level === "error");
  console.error(`\n✗ ${all.length} security issue(s) in migrations:\n`);
  for (const i of all) {
    const tag = i.level === "error" ? "ERROR" : "WARN ";
    console.error(`  [${tag}] ${i.object}  (${i.rule})`);
    console.error(`         in ${i.file}`);
    console.error(`         fix: ${i.hint}\n`);
  }

  if (errors.length > 0) {
    console.error(`Blocking deploy: ${errors.length} critical migration issue(s) above must be fixed.`);
    process.exit(1);
  }
}

main();
