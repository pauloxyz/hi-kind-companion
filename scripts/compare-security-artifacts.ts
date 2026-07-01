#!/usr/bin/env bun
/**
 * Compare two vitest JSON reports (previous artifact vs current run) and
 * emit a Markdown + JSON delta highlighting regressed tests, newly-passing
 * tests, and any TARGET_INTERNAL_IDS that reappear in the failure set.
 *
 * Shared helpers live in scripts/lib/vitest-report.ts and scripts/lib/cli.ts
 * so this file only owns argument wiring + report formatting.
 *
 * Usage:
 *   bun scripts/compare-security-artifacts.ts \
 *     --previous prev/regression-results.json \
 *     --current  security-report/regression-results.json \
 *     --out      security-report/delta.md
 *
 * Exit codes:
 *   0 → no drift (baseline runs or all-passing runs)
 *   1 → regressions detected (fail CI step / trigger Slack alert)
 *   2 → invalid input
 */
import { writeFileSync, existsSync } from "node:fs";
import { getFlag, hasFlag, makeVerboseLogger } from "./lib/cli";
import { loadReport, classify, matchTargets, type VitestAssertion } from "./lib/vitest-report";

function parseArgs() {
  const argv = process.argv.slice(2);
  const current = getFlag(argv, "--current");
  const out = getFlag(argv, "--out") ?? "security-report/delta.md";
  if (!current) {
    console.error("Missing --current <path>");
    console.error("Flags: --previous <path> --out <path> [--verbose] [--dry-run]");
    process.exit(2);
  }
  return {
    previous: getFlag(argv, "--previous"),
    current,
    out,
    verbose: hasFlag(argv, "--verbose"),
    dryRun: hasFlag(argv, "--dry-run"),
  };
}

function renderMarkdown(opts: {
  hasPrev: boolean;
  previous?: string;
  current: string;
  total: number;
  regressed: VitestAssertion[];
  stillFailing: VitestAssertion[];
  newlyPassing: string[];
  newTests: string[];
  reappeared: string[];
}): string {
  const lines: string[] = [];
  lines.push("# Security regression delta", "");
  lines.push(`- Previous artifact: ${opts.hasPrev ? opts.previous : "_none (baseline run — no drift comparison)_"}`);
  lines.push(`- Current report:   \`${opts.current}\``);
  lines.push(`- Total tests:      ${opts.total}`);
  lines.push(`- Regressed (was passing, now failing): **${opts.regressed.length}**`);
  lines.push(`- Still failing:    ${opts.stillFailing.length}`);
  lines.push(`- Newly passing:    ${opts.newlyPassing.length}`);
  lines.push(`- New tests added:  ${opts.newTests.length}`);
  lines.push("");
  if (opts.reappeared.length) {
    lines.push("## ⚠️ Targeted internal_ids that reappeared", "");
    lines.push("| internal_id | source |", "| --- | --- |");
    for (const id of opts.reappeared) lines.push(`| \`${id}\` | regression suite |`);
    lines.push("");
  }
  if (opts.regressed.length) {
    lines.push("## Regressions", "");
    lines.push("| test | failure preview |", "| --- | --- |");
    for (const a of opts.regressed) {
      const preview = (a.failureMessages?.[0] ?? "").split("\n")[0].slice(0, 160).replace(/\|/g, "\\|");
      lines.push(`| ❌ \`${a.fullName}\` | ${preview} |`);
    }
    lines.push("");
  }
  if (opts.newlyPassing.length) {
    lines.push("## Newly passing");
    for (const n of opts.newlyPassing) lines.push(`- ✅ \`${n}\``);
    lines.push("");
  }
  return lines.join("\n");
}

const { previous, current, out, verbose, dryRun } = parseArgs();
const vlog = makeVerboseLogger(verbose);

if (!existsSync(current)) {
  console.error(`Current report not found at ${current}`);
  process.exit(2);
}

// Safe fallback: no previous artifact = baseline run. Emit a clean delta,
// exit 0, and let CI continue without masking real failures — regressions
// are still caught when a previous artifact IS present on the next run.
const hasPrev = !!previous && existsSync(previous);
if (previous && !hasPrev) {
  console.warn(`⚠ Previous artifact ${previous} not found — falling back to baseline mode (no drift comparison).`);
}
vlog(`previous=${previous ?? "<none>"} exists=${hasPrev}`);
vlog(`current=${current} out=${out} dryRun=${dryRun}`);

const prev = hasPrev ? loadReport(previous!) : null;
const curr = loadReport(current);
const { regressed, stillFailing, newlyPassing, newTests } = classify(prev, curr);
const reappeared = matchTargets([...regressed, ...stillFailing]);

vlog(`curr=${curr.size} regressed=${regressed.length} stillFailing=${stillFailing.length} newlyPassing=${newlyPassing.length} newTests=${newTests.length}`);
vlog(`reappeared=${JSON.stringify(reappeared)}`);

const markdown = renderMarkdown({
  hasPrev,
  previous,
  current,
  total: curr.size,
  regressed,
  stillFailing,
  newlyPassing,
  newTests,
  reappeared,
});

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
  console.log(markdown.split("\n").slice(0, 40).join("\n"));
  console.log("[dry-run] JSON summary:");
  console.log(JSON.stringify(jsonSummary, null, 2));
} else {
  writeFileSync(out, markdown);
  writeFileSync(out.replace(/\.md$/, ".json"), JSON.stringify(jsonSummary, null, 2));
  console.log(`Wrote delta to ${out}`);
}

// Exit non-zero when there are regressions OR any targeted id reappears.
// Baseline runs never regress by definition (prev == null → regressed = []).
if (regressed.length > 0 || reappeared.length > 0) {
  console.error(`Drift detected: ${regressed.length} regressions, ${reappeared.length} targeted findings.`);
  process.exit(1);
}
process.exit(0);
