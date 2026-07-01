/**
 * Regression tests for scripts/compare-security-artifacts.ts —
 * specifically the "no previous artifact" fallback path.
 *
 * Guards the behaviour required by the CI compare step:
 *   1. When --previous is omitted → baseline mode, exit 0, emit delta files.
 *   2. When --previous points to a missing file → baseline mode + warning,
 *      exit 0, no crash, no masked failures.
 *   3. When current run has failed tests → exit still reflects real failures
 *      via the failing-tests channel (reappeared internal_ids in delta.json),
 *      even in baseline mode.
 *   4. When --current is missing → exit code 2 (invalid input), never 0.
 *   5. --dry-run must not write files.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = "scripts/compare-security-artifacts.ts";

function run(args: string[]) {
  const r = spawnSync("bun", ["run", SCRIPT, ...args], { encoding: "utf-8" });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

function makeReport(assertions: Array<{ name: string; status: "passed" | "failed" }>) {
  return JSON.stringify({
    testResults: [
      {
        name: "synthetic.test.ts",
        assertionResults: assertions.map((a) => ({
          title: a.name,
          fullName: a.name,
          status: a.status,
          failureMessages: a.status === "failed" ? ["mocked failure"] : [],
        })),
      },
    ],
  });
}

describe("compare-security-artifacts fallback behaviour", () => {
  let dir: string;
  let current: string;
  let out: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sec-compare-"));
    current = join(dir, "current.json");
    out = join(dir, "delta.md");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("exit 0 in baseline mode when --previous is omitted and all tests pass", () => {
    writeFileSync(current, makeReport([{ name: "ok test", status: "passed" }]));
    const r = run(["--current", current, "--out", out]);
    expect(r.code, r.stderr).toBe(0);
    expect(existsSync(out)).toBe(true);
    const json = JSON.parse(readFileSync(out.replace(/\.md$/, ".json"), "utf-8"));
    expect(json.baseline).toBe(true);
    expect(json.previous).toBeNull();
    expect(json.totals.regressed).toBe(0);
  });

  it("logs an explicit warning and stays in baseline mode when --previous file is missing", () => {
    writeFileSync(current, makeReport([{ name: "ok test", status: "passed" }]));
    const missing = join(dir, "does-not-exist.json");
    const r = run(["--previous", missing, "--current", current, "--out", out]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr + r.stdout).toMatch(/baseline mode|not found/i);
    const json = JSON.parse(readFileSync(out.replace(/\.md$/, ".json"), "utf-8"));
    expect(json.baseline).toBe(true);
  });

  it("does NOT mask real failures: reappeared internal_ids surface even in baseline mode", () => {
    // A failing test whose name matches one of the TARGET_INTERNAL_IDS
    // heuristic → comparator must classify it as reappeared and exit 1
    // regardless of whether a previous artifact existed.
    writeFileSync(
      current,
      makeReport([
        {
          name: "SUPA_function_search_path_mutable regression detected on has_role",
          status: "failed",
        },
      ]),
    );
    const r = run(["--current", current, "--out", out]);
    expect(r.code, r.stderr).toBe(1);
    const json = JSON.parse(readFileSync(out.replace(/\.md$/, ".json"), "utf-8"));
    expect(json.reappearedInternalIds).toContain("SUPA_function_search_path_mutable");
  });

  it("exit code 2 when --current is missing (invalid input, not a silent success)", () => {
    const r = run(["--out", out]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/Missing --current/);
    expect(existsSync(out)).toBe(false);
  });

  it("--dry-run does not write any files", () => {
    writeFileSync(current, makeReport([{ name: "ok test", status: "passed" }]));
    const r = run(["--current", current, "--out", out, "--dry-run"]);
    expect(r.code, r.stderr).toBe(0);
    expect(existsSync(out)).toBe(false);
    expect(existsSync(out.replace(/\.md$/, ".json"))).toBe(false);
    expect(r.stdout).toMatch(/dry-run/);
  });

  it("classifies a previously-passing test as regressed when it now fails", () => {
    const previous = join(dir, "prev.json");
    writeFileSync(previous, makeReport([{ name: "shared test", status: "passed" }]));
    writeFileSync(current, makeReport([{ name: "shared test", status: "failed" }]));
    const r = run(["--previous", previous, "--current", current, "--out", out]);
    expect(r.code, r.stderr).toBe(1);
    const json = JSON.parse(readFileSync(out.replace(/\.md$/, ".json"), "utf-8"));
    expect(json.baseline).toBe(false);
    expect(json.totals.regressed).toBe(1);
    expect(json.regressed).toEqual(["shared test"]);
  });
});
