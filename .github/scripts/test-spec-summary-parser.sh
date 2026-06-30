#!/usr/bin/env bash
# Regression suite for the TSV → Markdown renderer in
# `render-spec-summary.sh`. Covers: aggregate counters, skip-reason
# phrasing with sizes + thresholds, the "Top problem specs" ranking,
# aggregate-stats JSON/CSV sidecars, blank/junk-row resilience, and
# legacy 4-column TSV back-compat.
#
# Run: `bash .github/scripts/test-spec-summary-parser.sh`
# Exit 0 = all assertions passed, 1 = regression.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
renderer="$here/render-spec-summary.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail=0
pass=0

assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
    pass=$((pass + 1)); echo "  ok    $label"
  else
    fail=$((fail + 1)); echo "  FAIL  $label"
    echo "        expected to find: $needle"
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2" label="$3"
  if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
    fail=$((fail + 1)); echo "  FAIL  $label"
    echo "        unexpected presence of: $needle"
  else
    pass=$((pass + 1)); echo "  ok    $label"
  fi
}

# --- Fixture 1: full happy-path row with every artifact (v2 columns) -
cat > "$tmp/full.tsv" <<EOF
specA-chromium	1	1	1	1	3	2048	8192	ok	ok
EOF
out="$(bash "$renderer" "$tmp/full.tsv" "https://example.com/art/42" "Failed specs")"
assert_contains "$out" '**Run summary** — 1 spec(s) processed'    "full: aggregate header"
assert_contains "$out" '| trace.zip | 1 | 0 | 0 | 0 |'             "full: aggregate trace row"
assert_contains "$out" '| video.webm | 1 | 0 | 0 | 0 |'            "full: aggregate video row"
assert_contains "$out" 'Reports found: **1**, screenshots: **1**'  "full: reports/screenshots count"
assert_contains "$out" 'Thresholds: trace ≥ **1024 B**'            "full: threshold footer"
assert_contains "$out" '`specA-chromium`'                          "full: slug rendered"
assert_contains "$out" '[trace.zip](https://example.com/art/42)'   "full: trace link"
assert_not_contains "$out" '**Top problem specs**'                 "full: no ranking when nothing wrong"

# --- Fixture 2: legacy 4-column TSV (no report / attempt / sizes) ----
cat > "$tmp/legacy.tsv" <<EOF
specLegacy	1	0	1
EOF
out="$(bash "$renderer" "$tmp/legacy.tsv" "https://example.com/art/L" "Legacy")"
assert_contains "$out" '`specLegacy`'                              "legacy: slug rendered"
assert_contains "$out" '_(attempt 1)_'                             "legacy: attempt defaults to 1"
assert_contains "$out" '[trace.zip]'                               "legacy: trace link present"
assert_contains "$out" 'video.webm _skipped_'                      "legacy: video skip reason rendered"

# --- Fixture 3: skip reasons (below_min + empty) include thresholds ---
cat > "$tmp/reasons.tsv" <<EOF
specBelow	0	0	0	0	2	64	0	below_min	empty
EOF
# Bash quirk: `FOO=bar out=$(...)` does NOT export FOO into the subshell,
# because variable assignments only propagate to *external* commands.
# `env FOO=bar` forces a real exec wrapper so the renderer sees the vars.
out="$(env MIN_TRACE_BYTES=2048 MIN_VIDEO_BYTES=8192 bash "$renderer" "$tmp/reasons.tsv" "https://example.com/art/R" "Reasons")"
assert_contains "$out" 'trace.zip _skipped_'                       "reasons: trace skip line"
assert_contains "$out" '(size: 64 B, min: 2048 B)'                 "reasons: trace size + threshold"
assert_contains "$out" 'video.webm _skipped_'                      "reasons: video skip line"
assert_contains "$out" '(min required: 8192 B)'                    "reasons: empty mentions threshold"
assert_contains "$out" '| trace.zip | 0 | 1 | 0 | 0 |'             "reasons: aggregate counts below_min"
assert_contains "$out" '| video.webm | 0 | 0 | 1 | 0 |'            "reasons: aggregate counts empty"
assert_contains "$out" 'Thresholds: trace ≥ **2048 B**, video ≥ **8192 B**' "reasons: footer reflects env"

# --- Fixture 4: ranking table appears + sort order ------------------
cat > "$tmp/ranking.tsv" <<EOF
specHealthy	1	1	0	0	1	4096	16384	ok	ok
specOneBad	1	0	0	0	1	4096	0	ok	below_min
specVeryBad	0	0	0	0	1	0	0	absent	absent
specMid	0	1	0	0	1	100	16384	below_min	ok
EOF
out="$(bash "$renderer" "$tmp/ranking.tsv" "https://example.com/art/K" "Mixed")"
assert_contains "$out" '**Top problem specs**'                     "ranking: section header"
assert_contains "$out" '| Spec | trace | video | deficit |'        "ranking: table header"
assert_contains "$out" '| `specVeryBad` | absent | absent | 4 |'   "ranking: worst spec first"
assert_contains "$out" '| `specOneBad` | ok | below_min | 1 |'     "ranking: lesser spec listed"
assert_contains "$out" '| `specMid` | below_min | ok | 1 |'        "ranking: another lesser spec"
assert_not_contains "$out" '`specHealthy` |'                       "ranking: healthy spec absent"
# Worst spec must appear BEFORE specOneBad in the output.
worst_line="$(printf '%s\n' "$out" | grep -n 'specVeryBad' | head -1 | cut -d: -f1)"
mid_line="$(printf '%s\n' "$out" | grep -n 'specOneBad' | head -1 | cut -d: -f1)"
if [ -n "$worst_line" ] && [ -n "$mid_line" ] && [ "$worst_line" -lt "$mid_line" ]; then
  pass=$((pass + 1)); echo "  ok    ranking: sorted by deficit desc"
else
  fail=$((fail + 1)); echo "  FAIL  ranking: sort order wrong"
fi

# --- Fixture 5: TOP_PROBLEM_LIMIT trims the ranking -----------------
TOP_PROBLEM_LIMIT=1 out="$(bash "$renderer" "$tmp/ranking.tsv" "" "Trimmed")"
ranking_block="$(printf '%s\n' "$out" | awk '/Top problem specs/{flag=1;next} /<details>/{flag=0} flag' | grep -c '^| `' || true)"
if [ "$ranking_block" = "1" ]; then
  pass=$((pass + 1)); echo "  ok    ranking: TOP_PROBLEM_LIMIT honored"
else
  fail=$((fail + 1)); echo "  FAIL  ranking: expected 1 entry, got $ranking_block"
fi

# --- Fixture 6: AGGREGATE_OUT_JSON + CSV sidecars are emitted -------
cat > "$tmp/agg.tsv" <<EOF
specA	1	0	1	1	2	4096	0	ok	below_min
specB	0	1	0	1	2	0	16384	absent	ok
EOF
RUN_LABEL="full shard 2/4" RUN_PHASE="rerun" RUN_ATTEMPT="3" \
AGGREGATE_OUT_JSON="$tmp/agg.json" AGGREGATE_OUT_CSV="$tmp/agg.csv" \
  bash "$renderer" "$tmp/agg.tsv" "https://example.com/agg" "Agg" >/dev/null
if [ -f "$tmp/agg.json" ]; then
  pass=$((pass + 1)); echo "  ok    aggregate: JSON file created"
else
  fail=$((fail + 1)); echo "  FAIL  aggregate: JSON missing"
fi
json="$(cat "$tmp/agg.json")"
assert_contains "$json" '"label": "full shard 2/4"'                "aggregate.json: label propagated"
assert_contains "$json" '"phase": "rerun"'                         "aggregate.json: phase propagated"
assert_contains "$json" '"attempt": 3'                             "aggregate.json: attempt propagated"
assert_contains "$json" '"total_specs": 2'                         "aggregate.json: total"
assert_contains "$json" '"trace": {"ok": 1, "below_min": 0, "empty": 0, "absent": 1}' "aggregate.json: trace counters"
assert_contains "$json" '"video": {"ok": 1, "below_min": 1, "empty": 0, "absent": 0}' "aggregate.json: video counters"
assert_contains "$json" '"reports_found": 2'                       "aggregate.json: reports"
# Re-parse as JSON to confirm syntactic validity.
if node -e "JSON.parse(require('fs').readFileSync('$tmp/agg.json','utf8'))" 2>/dev/null; then
  pass=$((pass + 1)); echo "  ok    aggregate.json: parses as JSON"
else
  fail=$((fail + 1)); echo "  FAIL  aggregate.json: not valid JSON"
fi
# CSV: header present, one data row, correct column count.
csv_header="$(head -1 "$tmp/agg.csv")"
csv_row="$(sed -n '2p' "$tmp/agg.csv")"
assert_contains "$csv_header" 'label,phase,attempt,total_specs,trace_ok' "aggregate.csv: header line"
assert_contains "$csv_row" 'full shard 2/4,rerun,3,2,1,0,0,1,1,1,0,0,2,1' "aggregate.csv: data row matches"
# Run renderer again — CSV must append (header not re-emitted).
bash "$renderer" "$tmp/agg.tsv" "" "Agg2" >/dev/null
csv_lines="$(wc -l < "$tmp/agg.csv" | tr -d ' ')"
if [ "$csv_lines" = "3" ]; then
  pass=$((pass + 1)); echo "  ok    aggregate.csv: appends without duplicate header"
else
  fail=$((fail + 1)); echo "  FAIL  aggregate.csv: expected 3 lines, got $csv_lines"
fi

# --- Fixture 7: blank lines + junk flags don't crash the renderer ---
printf 'specOK\t1\t0\t0\t1\t1\t9999\t0\tok\tabsent\n\n  \tjunk-row\nspecBad\tYES\tno\t??\t??\t??\t??\t??\tweird\twut\n' > "$tmp/messy.tsv"
out="$(bash "$renderer" "$tmp/messy.tsv" "https://example.com/art/M" "Messy")"
assert_contains "$out" '`specOK`'                                  "messy: valid row rendered"
assert_contains "$out" 'unknown (weird)'                           "messy: unknown reason surfaced"

# --- Fixture 8: empty TSV → no output, no aggregate files -----------
: > "$tmp/empty-file.tsv"
AGGREGATE_OUT_JSON="$tmp/empty-agg.json" out="$(bash "$renderer" "$tmp/empty-file.tsv" "" "Nothing")"
if [ -z "$out" ] && [ ! -f "$tmp/empty-agg.json" ]; then
  pass=$((pass + 1)); echo "  ok    empty TSV: no output, no aggregate"
else
  fail=$((fail + 1)); echo "  FAIL  empty TSV: unexpected side effects"
fi

echo
if [ "$fail" -gt 0 ]; then
  echo "FAILED: $fail assertion(s), $pass passed."
  exit 1
fi
echo "OK: all $pass assertions passed."
