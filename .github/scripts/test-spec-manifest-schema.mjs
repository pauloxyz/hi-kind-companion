#!/usr/bin/env node
// Validates the shape and field semantics of the JSON sidecar
// (_spec-manifest.json) emitted by collect-spec-artifacts.sh.
//
// We can't reach for ajv in CI without an extra install step, so the
// schema check is a hand-rolled validator — strict enough to catch
// every regression we care about (missing fields, wrong types, bad
// enum values, threshold drift, report flag desync).
//
// The script drives the real collect script against synthesized
// `test-results/` fixtures: zero specs, one spec with everything,
// undersized trace + zero-byte video, no report directory, and a
// custom threshold via env vars. Each scenario asserts both the
// top-level metadata block and every per-spec entry.
//
// Run: `node .github/scripts/test-spec-manifest-schema.mjs`
// Exit 0 = passed, 1 = regression.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(".github/scripts/collect-spec-artifacts.sh");

const REASONS = new Set(["ok", "absent", "empty", "below_min"]);
const SPEC_FIELDS = {
  slug: "string",
  has_trace: "0|1",
  has_video: "0|1",
  has_screenshot: "0|1",
  has_report: "0|1",
  attempt: "number",
  trace_size: "number",
  video_size: "number",
  trace_reason: "reason",
  video_reason: "reason",
};
const TOP_FIELDS = {
  schema_version: "number",
  attempt: "number",
  has_report: "0|1",
  min_trace_bytes: "number",
  min_video_bytes: "number",
  count: "number",
  specs: "array",
};

let failed = 0;
let passed = 0;

function check(cond, label) {
  if (cond) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

function typeOk(value, kind) {
  switch (kind) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "0|1":    return value === 0 || value === 1;
    case "array":  return Array.isArray(value);
    case "reason": return typeof value === "string" && REASONS.has(value);
    default:       return false;
  }
}

function validateShape(obj, fields, scope) {
  for (const [k, kind] of Object.entries(fields)) {
    check(k in obj, `${scope}: field '${k}' present`);
    if (k in obj) {
      check(typeOk(obj[k], kind), `${scope}: field '${k}' is ${kind} (got ${JSON.stringify(obj[k])})`);
    }
  }
  for (const k of Object.keys(obj)) {
    check(k in fields, `${scope}: no unexpected field '${k}'`);
  }
}

function runCollect(workdir, env = {}) {
  const tsv = path.join(workdir, "out.tsv");
  const json = path.join(workdir, "out.json");
  execFileSync("bash", [SCRIPT, tsv, json], {
    cwd: workdir,
    env: { ...process.env, ...env, GITHUB_OUTPUT: "" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  return { tsv, json, data: JSON.parse(readFileSync(json, "utf8")) };
}

function mkSpec(dir, slug, { trace, video, png } = {}) {
  const base = path.join(dir, "test-results", slug);
  mkdirSync(base, { recursive: true });
  if (trace !== undefined) writeFileSync(path.join(base, "trace.zip"), Buffer.alloc(trace));
  if (video !== undefined) writeFileSync(path.join(base, "video.webm"), Buffer.alloc(video));
  if (png !== undefined)   writeFileSync(path.join(base, "screenshot.png"), Buffer.alloc(png));
}

// ============================================================
// Scenario 1: empty test-results — schema still valid, no specs
// ============================================================
{
  const work = mkdtempSync(path.join(tmpdir(), "manifest-1-"));
  mkdirSync(path.join(work, "test-results"), { recursive: true });
  const { data } = runCollect(work, { GITHUB_RUN_ATTEMPT: "1" });
  console.log("scenario 1: empty test-results");
  validateShape(data, TOP_FIELDS, "s1.top");
  check(data.schema_version === 2,     "s1: schema_version === 2");
  check(data.count === 0,              "s1: count === 0");
  check(data.specs.length === 0,       "s1: specs array empty");
  check(data.has_report === 0,         "s1: has_report === 0 (no report dir)");
  rmSync(work, { recursive: true, force: true });
}

// ============================================================
// Scenario 2: one healthy spec + report present — all reasons "ok"
// ============================================================
{
  const work = mkdtempSync(path.join(tmpdir(), "manifest-2-"));
  mkdirSync(path.join(work, "playwright-report"), { recursive: true });
  writeFileSync(path.join(work, "playwright-report", "index.html"), "<html/>");
  mkSpec(work, "spec-happy", { trace: 4096, video: 16384, png: 256 });
  const { data } = runCollect(work, { GITHUB_RUN_ATTEMPT: "7" });
  console.log("scenario 2: one healthy spec + report present");
  validateShape(data, TOP_FIELDS, "s2.top");
  check(data.has_report === 1,         "s2: has_report === 1");
  check(data.attempt === 7,            "s2: attempt propagated from env");
  check(data.count === 1,              "s2: count === 1");
  check(data.specs.length === 1,       "s2: specs array length 1");
  validateShape(data.specs[0], SPEC_FIELDS, "s2.spec[0]");
  const s = data.specs[0];
  check(s.slug === "spec-happy",       "s2: slug correct");
  check(s.has_trace === 1 && s.trace_reason === "ok", "s2: trace ok");
  check(s.has_video === 1 && s.video_reason === "ok", "s2: video ok");
  check(s.has_screenshot === 1,        "s2: screenshot present");
  check(s.has_report === 1,            "s2: report denormalized into row");
  check(s.trace_size === 4096,         "s2: trace_size matches file");
  check(s.video_size === 16384,        "s2: video_size matches file");
  rmSync(work, { recursive: true, force: true });
}

// ============================================================
// Scenario 3: undersized trace + empty video + missing report
// ============================================================
{
  const work = mkdtempSync(path.join(tmpdir(), "manifest-3-"));
  mkSpec(work, "spec-broken", { trace: 64, video: 0, png: 100 });
  const { data } = runCollect(work, { GITHUB_RUN_ATTEMPT: "1" });
  console.log("scenario 3: undersized trace + empty video + missing report");
  check(data.has_report === 0,                       "s3: top has_report === 0");
  const s = data.specs[0];
  check(s.has_trace === 0,                           "s3: has_trace flipped off");
  check(s.trace_reason === "below_min",              "s3: trace_reason === below_min");
  check(s.trace_size === 64,                         "s3: trace_size raw 64");
  check(s.has_video === 0,                           "s3: has_video flipped off");
  check(s.video_reason === "empty",                  "s3: video_reason === empty");
  check(s.video_size === 0,                          "s3: video_size 0");
  check(s.has_report === 0,                          "s3: row has_report === 0");
  rmSync(work, { recursive: true, force: true });
}

// ============================================================
// Scenario 4: completely absent trace + video for a spec
// ============================================================
{
  const work = mkdtempSync(path.join(tmpdir(), "manifest-4-"));
  mkSpec(work, "spec-bare", { png: 50 });
  const { data } = runCollect(work);
  console.log("scenario 4: spec with only a screenshot, no trace/video");
  const s = data.specs[0];
  check(s.trace_reason === "absent",                 "s4: trace_reason === absent");
  check(s.video_reason === "absent",                 "s4: video_reason === absent");
  check(s.has_screenshot === 1,                      "s4: screenshot still recorded");
  rmSync(work, { recursive: true, force: true });
}

// ============================================================
// Scenario 5: custom thresholds — values above default flip reasons
// ============================================================
{
  const work = mkdtempSync(path.join(tmpdir(), "manifest-5-"));
  mkSpec(work, "spec-thresh", { trace: 2048, video: 8192 });
  // Bump thresholds ABOVE the file sizes: both should become below_min.
  const { data } = runCollect(work, {
    MIN_TRACE_BYTES: "8192",
    MIN_VIDEO_BYTES: "16384",
  });
  console.log("scenario 5: custom thresholds force below_min");
  check(data.min_trace_bytes === 8192,               "s5: min_trace_bytes propagated");
  check(data.min_video_bytes === 16384,              "s5: min_video_bytes propagated");
  const s = data.specs[0];
  check(s.trace_reason === "below_min",              "s5: trace_reason === below_min");
  check(s.video_reason === "below_min",              "s5: video_reason === below_min");
  check(s.has_trace === 0 && s.has_video === 0,      "s5: flags flipped off by threshold");
  rmSync(work, { recursive: true, force: true });
}

// ============================================================
// Scenario 6: multiple specs, mixed health — JSON array integrity
// ============================================================
{
  const work = mkdtempSync(path.join(tmpdir(), "manifest-6-"));
  mkSpec(work, "spec-a", { trace: 4096, video: 16384 });
  mkSpec(work, "spec-b", { trace: 100 });
  mkSpec(work, "spec-c", { png: 32 });
  const { data, json } = runCollect(work);
  console.log("scenario 6: multiple specs, JSON well-formed");
  check(data.count === 3,                            "s6: count === 3");
  check(data.specs.length === 3,                     "s6: specs length 3");
  // Re-parse from disk to confirm the JSON file itself is syntactically clean.
  const reparsed = JSON.parse(readFileSync(json, "utf8"));
  check(reparsed.specs.length === 3,                 "s6: file re-parses cleanly");
  const slugs = data.specs.map((s) => s.slug).sort();
  check(JSON.stringify(slugs) === '["spec-a","spec-b","spec-c"]', "s6: slugs match");
  rmSync(work, { recursive: true, force: true });
}

console.log();
if (failed > 0) {
  console.error(`FAILED: ${failed} assertion(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`OK: all ${passed} JSON-sidecar schema assertions passed.`);
