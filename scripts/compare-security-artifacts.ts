#!/usr/bin/env bun
/**
 * Compare two vitest JSON reports (previous artifact vs current run) and
 * emit a Markdown delta highlighting:
 *   - regressed test names (was passing, now failing)
 *   - newly-passing tests (fixed)
 *   - any of the TARGET_INTERNAL_IDS that reappear in the failure set
 *     (matched by substring against test names — the regression tests
 *     encode the finding they cover in their describe/it strings)
 *
 * Usage:
 *   bun scripts/compare-security-artifacts.ts \
 *     --previous prev/regression-results.json \
 *     --current  security-report/regression-results.json \
 *     --out      security-report/delta.md
 *
 * Exit codes:
 *   0 → no drift (all currently-passing, no regressions)
 *   1 → regressions detected (fail the CI step / trigger Slack alert)
 *   2 → invalid input
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { TARGET_INTERNAL_IDS } from "../src/config/security-internal-ids";

type VitestAssertion = { title: string; fullName: string; status: "passed" | "failed" | "skipped"; failureMessages?: string[] };
type VitestFile = { name: string; assertionResults: VitestAssertion[] };
type VitestReport = { testResults: VitestFile[] };

function parseArgs(): { previous?: string; current: string; out: string; verbose: boolean; dryRun: boolean } {
  const argv = process.argv.slice(2);
  const has = (flag: string) => argv.includes(flag);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const current = get("--current");
  const out = get("--out") ?? "security-report/delta.md";
  if (!current) {
    console.error("Missing --current <path>");
    console.error("Flags: --previous <path> --out <path> [--verbose] [--dry-run]");
    process.exit(2);
  }
  return { previous: get("--previous"), current, out, verbose: has("--verbose"), dryRun: has("--dry-run") };
}


/**
 * Flattens a vitest JSON reporter file into `Map<testFullName → assertion>`.
 *
 * We key by `fullName` (with `title` as fallback) because vitest guarantees
 * `fullName` is stable across runs even when the containing file is
 * renamed — this is what lets us diff runs meaningfully across PRs.
 */
function loadReport(path: string): Map<string, VitestAssertion> {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as VitestReport;
  const map = new Map<string, VitestAssertion>();
  for (const f of raw.testResults ?? []) {
    for (const a of f.assertionResults ?? []) {
      map.set(a.fullName || a.title, a);
    }
  }
  return map;
}

/**
 * Buckets every test in `curr` against `prev`:
 *   - regressed:    was `passed` before, `failed` now → the critical drift signal.
 *   - stillFailing: `failed` in both runs, or `failed` in current with no baseline.
 *   - newlyPassing: `failed` before, `passed` now → recorded so PR authors get credit for fixes.
 *   - newTests:     present in current but absent in previous → surfaces newly-added coverage.
 *
 * When `prev` is null (baseline mode / no previous artifact) nothing can be
 * classified as regressed by definition — see the "safe fallback" comment
 * near the CLI entrypoint at the bottom of this file.
 */
function classify(prev: Map<string, VitestAssertion> | null, curr: Map<string, VitestAssertion>) {
  const regressed: VitestAssertion[] = [];
  const stillFailing: VitestAssertion[] = [];
  const newlyPassing: string[] = [];
  const newTests: string[] = [];

  for (const [name, a] of curr) {
    const before = prev?.get(name);
    if (a.status === "failed") {
      if (before && before.status === "passed") regressed.push(a);
      else stillFailing.push(a);
    } else if (a.status === "passed" && before && before.status === "failed") {
      newlyPassing.push(name);
    }
    if (prev && !before) newTests.push(name);
  }
  return { regressed, stillFailing, newlyPassing, newTests };
}

/**
 * Maps failing assertions back to the `TARGET_INTERNAL_IDS` they cover.
 *
 * Two matching strategies, in order:
 *   1. Substring match on the test's `fullName` + failure message. This
 *      catches tests that mention the internal_id verbatim in their
 *      describe/it strings (the convention in security-regression tests).
 *   2. Heuristic regex map for tests whose names describe the *symptom*
 *      instead of the finding id (e.g. `my_profile.birth_date` → the
 *      `my_profile_anon_sensitive_columns` finding).
 *
 * The synthetic id `CRON_SECRET_enforcement` is emitted for hooks that
 * regress on cron-secret verification — it isn't in TARGET_INTERNAL_IDS
 * because it's a bespoke control, not a Supabase linter finding.
 */
function matchTargets(failed: VitestAssertion[]): string[] {
  const hits = new Set<string>();
  for (const a of failed) {
    const hay = (a.fullName + " " + (a.failureMessages ?? []).join(" ")).toLowerCase();
    for (const id of TARGET_INTERNAL_IDS) {
      if (hay.includes(id.toLowerCase())) hits.add(id);
    }
    // Heuristic map: describe blocks name the underlying finding.
    if (/jobs\.recruitment_|jobs\.raw_feed_data|jobs\.employer_address/i.test(hay))
      hits.add("jobs_recruitment_contact_anon_exposure");
    if (/my_profile\.(birth_date|phone|application_quality|video_script|onboarding_step)/i.test(hay))
      hits.add("my_profile_anon_sensitive_columns");
    if (/anon cannot EXECUTE/i.test(hay))
      hits.add("SUPA_anon_security_definer_function_executable");
    if (/verifyCronSecret|CRON_SECRET|x-cron-secret/i.test(hay)) hits.add("CRON_SECRET_enforcement");
  }
  return [...hits].sort();
}


const { previous, current, out, verbose, dryRun } = parseArgs();
if (!existsSync(current)) {
  console.error(`Current report not found at ${current}`);
  process.exit(2);
}

// Safe fallback: no previous artifact = baseline run. Emit a clean delta
// noting the baseline state, exit 0, and let the CI step continue without
// masking real failures — regressions are still caught when a previous
// artifact IS present on the next run.
const hasPrev = !!previous && existsSync(previous);
if (previous && !hasPrev) {
  console.warn(`⚠ Previous artifact ${previous} not found — falling back to baseline mode (no drift comparison).`);
}
if (verbose) {
  console.log(`[verbose] previous=${previous ?? "<none>"} exists=${hasPrev}`);
  console.log(`[verbose] current=${current} out=${out} dryRun=${dryRun}`);
}

const prev = hasPrev ? loadReport(previous!) : null;
const curr = loadReport(current);
const { regressed, stillFailing, newlyPassing, newTests } = classify(prev, curr);
const reappeared = matchTargets([...regressed, ...stillFailing]);

if (verbose) {
  console.log(`[verbose] curr=${curr.size} regressed=${regressed.length} stillFailing=${stillFailing.length} newlyPassing=${newlyPassing.length} newTests=${newTests.length}`);
  console.log(`[verbose] reappeared=${JSON.stringify(reappeared)}`);
}

const lines: string[] = [];
lines.push("# Security regression delta");
lines.push("");
lines.push(`- Previous artifact: ${hasPrev ? previous : "_none (baseline run — no drift comparison)_"}`);
lines.push(`- Current report:   \`${current}\``);
lines.push(`- Total tests:      ${curr.size}`);
lines.push(`- Regressed (was passing, now failing): **${regressed.length}**`);
lines.push(`- Still failing:    ${stillFailing.length}`);
lines.push(`- Newly passing:    ${newlyPassing.length}`);
lines.push(`- New tests added:  ${newTests.length}`);
lines.push("");
if (reappeared.length) {
  lines.push("## ⚠️ Targeted internal_ids that reappeared");
  lines.push("");
  lines.push("| internal_id | source |");
  lines.push("| --- | --- |");
  for (const id of reappeared) lines.push(`| \`${id}\` | regression suite |`);
  lines.push("");
}
if (regressed.length) {
  lines.push("## Regressions");
  lines.push("");
  lines.push("| test | failure preview |");
  lines.push("| --- | --- |");
  for (const a of regressed) {
    const preview = (a.failureMessages?.[0] ?? "").split("\n")[0].slice(0, 160).replace(/\|/g, "\\|");
    lines.push(`| ❌ \`${a.fullName}\` | ${preview} |`);
  }
  lines.push("");
}
if (newlyPassing.length) {
  lines.push("## Newly passing");
  for (const n of newlyPassing) lines.push(`- ✅ \`${n}\``);
  lines.push("");
}

const jsonSummary = {
  previous: hasPrev ? previous : null,
  current,
  baseline: !hasPrev,
  totals: {
    tests: curr.size,
    regressed: regressed.length,
    stillFailing: stillFailing.length,
    newlyPassing: newlyPassing.length,
    newTests: newTests.length,
  },
  regressed: regressed.map((a) => a.fullName),
  stillFailing: stillFailing.map((a) => a.fullName),
  newlyPassing,
  newTests,
  reappearedInternalIds: reappeared,
};

if (dryRun) {
  console.log("[dry-run] Would write:", out);
  console.log("[dry-run] Would write:", out.replace(/\.md$/, ".json"));
  console.log("[dry-run] Markdown preview (first 40 lines):");
  console.log(lines.slice(0, 40).join("\n"));
  console.log("[dry-run] JSON summary:");
  console.log(JSON.stringify(jsonSummary, null, 2));
} else {
  writeFileSync(out, lines.join("\n"));
  writeFileSync(out.replace(/\.md$/, ".json"), JSON.stringify(jsonSummary, null, 2));
  console.log(`Wrote delta to ${out}`);
}

// Exit non-zero when there are regressions OR any targeted id reappears.
// Baseline runs (no previous artifact) never regress by definition.
if (regressed.length > 0 || reappeared.length > 0) {
  console.error(`Drift detected: ${regressed.length} regressions, ${reappeared.length} targeted findings.`);
  process.exit(1);
}
process.exit(0);

