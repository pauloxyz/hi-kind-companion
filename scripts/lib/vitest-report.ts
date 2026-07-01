/**
 * Vitest JSON report utilities used by compare-security-artifacts.ts.
 *
 * Kept separate from the CLI so unit tests (see
 * src/scripts-tests/compare-security-artifacts.test.ts) can import
 * `loadReport` / `classify` / `matchTargets` directly without spawning
 * a subprocess.
 */
import { readFileSync } from "node:fs";
import { TARGET_INTERNAL_IDS } from "../../src/config/security-internal-ids";

export type VitestAssertion = {
  title: string;
  fullName: string;
  status: "passed" | "failed" | "skipped";
  failureMessages?: string[];
};
export type VitestFile = { name: string; assertionResults: VitestAssertion[] };
export type VitestReport = { testResults: VitestFile[] };

/**
 * Flattens a vitest JSON reporter file into `Map<testFullName → assertion>`.
 * Keyed by `fullName` (title fallback) — stable across file renames, which
 * is what lets us diff runs meaningfully across PRs.
 */
export function loadReport(path: string): Map<string, VitestAssertion> {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as VitestReport;
  const map = new Map<string, VitestAssertion>();
  for (const f of raw.testResults ?? []) {
    for (const a of f.assertionResults ?? []) {
      map.set(a.fullName || a.title, a);
    }
  }
  return map;
}

export type ClassifyResult = {
  regressed: VitestAssertion[];
  stillFailing: VitestAssertion[];
  newlyPassing: string[];
  newTests: string[];
};

/**
 * Buckets every test in `curr` against `prev`:
 *   - regressed:    was passed, now failed — the critical drift signal.
 *   - stillFailing: failed in both runs, or failed in current with no baseline.
 *   - newlyPassing: was failed, now passed — credits fixes.
 *   - newTests:     present in current but absent in previous.
 *
 * When `prev` is null (baseline mode / no previous artifact) nothing is
 * classified as regressed by definition.
 */
export function classify(
  prev: Map<string, VitestAssertion> | null,
  curr: Map<string, VitestAssertion>,
): ClassifyResult {
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
 * Maps failing assertions back to the TARGET_INTERNAL_IDS they cover.
 * Two strategies: substring match on fullName+failure message, then a
 * heuristic regex map for tests whose names describe the *symptom* rather
 * than the finding id. The synthetic `CRON_SECRET_enforcement` is emitted
 * for hooks that regress on cron-secret verification.
 */
export function matchTargets(failed: VitestAssertion[]): string[] {
  const hits = new Set<string>();
  for (const a of failed) {
    const hay = (a.fullName + " " + (a.failureMessages ?? []).join(" ")).toLowerCase();
    for (const id of TARGET_INTERNAL_IDS) {
      if (hay.includes(id.toLowerCase())) hits.add(id);
    }
    if (/jobs\.recruitment_|jobs\.raw_feed_data|jobs\.employer_address/i.test(hay))
      hits.add("jobs_recruitment_contact_anon_exposure");
    if (/my_profile\.(birth_date|phone|application_quality|video_script|onboarding_step)/i.test(hay))
      hits.add("my_profile_anon_sensitive_columns");
    if (/anon cannot EXECUTE/i.test(hay))
      hits.add("SUPA_anon_security_definer_function_executable");
    if (/verifyCronSecret|CRON_SECRET|x-cron-secret/i.test(hay))
      hits.add("CRON_SECRET_enforcement");
  }
  return [...hits].sort();
}
