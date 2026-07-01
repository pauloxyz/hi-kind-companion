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

function parseArgs(): { previous?: string; current: string; out: string } {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const current = get("--current");
  const out = get("--out") ?? "security-report/delta.md";
  if (!current) {
    console.error("Missing --current <path>");
    process.exit(2);
  }
  return { previous: get("--previous"), current, out };
}

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

function matchTargets(failed: VitestAssertion[]): string[] {
  const hits = new Set<string>();
  for (const a of failed) {
    const hay = (a.fullName + " " + (a.failureMessages ?? []).join(" ")).toLowerCase();
    for (const id of TARGET_INTERNAL_IDS) {
      // Match either the exact id or an obvious keyword derived from it.
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

const { previous, current, out } = parseArgs();
if (!existsSync(current)) {
  console.error(`Current report not found at ${current}`);
  process.exit(2);
}
const prev = previous && existsSync(previous) ? loadReport(previous) : null;
const curr = loadReport(current);
const { regressed, stillFailing, newlyPassing, newTests } = classify(prev, curr);
const reappeared = matchTargets([...regressed, ...stillFailing]);

const lines: string[] = [];
lines.push("# Security regression delta");
lines.push("");
lines.push(`- Previous artifact: ${prev ? previous : "_none (baseline run)_"}`);
lines.push(`- Current report:   \`${current}\``);
lines.push(`- Total tests:      ${curr.size}`);
lines.push(`- Regressed (was passing, now failing): **${regressed.length}**`);
lines.push(`- Still failing:    ${stillFailing.length}`);
lines.push(`- Newly passing:    ${newlyPassing.length}`);
lines.push(`- New tests added:  ${newTests.length}`);
lines.push("");
if (reappeared.length) {
  lines.push("## ⚠️ Targeted internal_ids that reappeared");
  for (const id of reappeared) lines.push(`- \`${id}\``);
  lines.push("");
}
if (regressed.length) {
  lines.push("## Regressions");
  for (const a of regressed) {
    lines.push(`- ❌ \`${a.fullName}\``);
    for (const m of (a.failureMessages ?? []).slice(0, 1)) {
      lines.push(`  \`\`\`\n  ${m.split("\n").slice(0, 3).join("\n  ")}\n  \`\`\``);
    }
  }
  lines.push("");
}
if (newlyPassing.length) {
  lines.push("## Newly passing");
  for (const n of newlyPassing) lines.push(`- ✅ \`${n}\``);
  lines.push("");
}

writeFileSync(out, lines.join("\n"));
console.log(`Wrote delta to ${out}`);

// Also emit a compact JSON summary next to it for machine consumers.
writeFileSync(out.replace(/\.md$/, ".json"), JSON.stringify({
  regressed: regressed.map((a) => a.fullName),
  stillFailing: stillFailing.map((a) => a.fullName),
  newlyPassing,
  newTests,
  reappearedInternalIds: reappeared,
}, null, 2));

// Exit non-zero when there are regressions OR any targeted id reappears.
if (regressed.length > 0 || reappeared.length > 0) {
  console.error(`Drift detected: ${regressed.length} regressions, ${reappeared.length} targeted findings.`);
  process.exit(1);
}
process.exit(0);
