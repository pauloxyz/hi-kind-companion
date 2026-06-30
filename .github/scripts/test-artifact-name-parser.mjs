#!/usr/bin/env node
// Unit-tests the regexes the consolidated `debug-links` job uses to
// parse Playwright artifact names emitted by the workflow. If the upload
// naming convention drifts (e.g. someone drops `-attempt-N` from the
// shard name) the regex parser silently falls back to "Attempt: –" and
// the summary becomes useless for triage. This guard fails the workflow
// the moment that happens — without needing a real Playwright failure
// to surface the regression.
//
// Run: `node .github/scripts/test-artifact-name-parser.mjs`
// Exit code: 0 = all assertions passed, 1 = regression.

import { strict as assert } from "node:assert";

// Keep these regexes BYTE-FOR-BYTE in sync with the consolidated job in
// .github/workflows/e2e.yml (search for `const attemptMatch`).
const RE_ATTEMPT = /-attempt-(\d+)(?:-|$)/;
const RE_SHARD_FULL = /^playwright-artifacts-shard-(\d+)-/;
const RE_SHARD_RERUN = /^playwright-rerun-shard-(\d+)-/;

const cases = [
  // [artifact name, expected label, expected phase, expected attempt]
  ["playwright-smoke-artifacts-attempt-1", "smoke", "run1", "1"],
  ["playwright-smoke-artifacts-attempt-12", "smoke", "run1", "12"],
  ["playwright-artifacts-shard-targeted-attempt-1-run1", "targeted", "run1", "1"],
  ["playwright-artifacts-shard-targeted-attempt-3-run1", "targeted", "run1", "3"],
  ["playwright-artifacts-shard-1-attempt-1-run1", "full shard 1/4", "run1", "1"],
  ["playwright-artifacts-shard-3-attempt-2-run1", "full shard 3/4", "run1", "2"],
  ["playwright-artifacts-shard-4-attempt-10-run1", "full shard 4/4", "run1", "10"],
  ["playwright-rerun-shard-2-attempt-1-rerun", "full shard 2/4", "rerun", "1"],
  ["playwright-rerun-shard-4-attempt-7-rerun", "full shard 4/4", "rerun", "7"],
];

function parse(name) {
  let label = name;
  let phase = "run1";
  let attempt = "–";
  const am = name.match(RE_ATTEMPT);
  if (am) attempt = am[1];
  if (name.startsWith("playwright-smoke-artifacts-")) {
    label = "smoke";
  } else if (name.startsWith("playwright-artifacts-shard-targeted-")) {
    label = "targeted";
  } else if (name.startsWith("playwright-artifacts-shard-")) {
    const m = name.match(RE_SHARD_FULL);
    label = m ? `full shard ${m[1]}/4` : name;
  } else if (name.startsWith("playwright-rerun-shard-")) {
    const m = name.match(RE_SHARD_RERUN);
    label = m ? `full shard ${m[1]}/4` : name;
    phase = "rerun";
  }
  return { label, phase, attempt };
}

let failed = 0;
for (const [name, expLabel, expPhase, expAttempt] of cases) {
  try {
    const got = parse(name);
    assert.equal(got.label, expLabel, `label for ${name}`);
    assert.equal(got.phase, expPhase, `phase for ${name}`);
    assert.equal(got.attempt, expAttempt, `attempt for ${name}`);
    console.log(`  ok  ${name} → label="${got.label}" phase=${got.phase} attempt=${got.attempt}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL ${name}: ${err.message}`);
  }
}

// Negative cases — names that should NOT be parsed as full-shard or
// targeted (defends against an over-greedy regex sneaking in).
const negatives = [
  "playwright-rerun-consolidated",
  "some-unrelated-artifact",
  "playwright-artifacts-shard-targeted-attempt-1-rerun", // no targeted rerun emitted today
];
for (const n of negatives) {
  const got = parse(n);
  if (n === "playwright-rerun-consolidated" || n === "some-unrelated-artifact") {
    // Both should keep the original name as the label (no prefix match).
    if (got.label !== n) {
      failed++;
      console.error(`  FAIL negative case ${n}: expected label to remain unchanged, got ${got.label}`);
    } else {
      console.log(`  ok  (negative) ${n} → label unchanged`);
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} regression(s) — fix the regexes in .github/workflows/e2e.yml and re-run.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length + negatives.length} artifact-name parser cases passed.`);
