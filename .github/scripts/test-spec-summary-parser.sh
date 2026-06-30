#!/usr/bin/env bash
# Regression suite for the TSV → Markdown renderer in
# `render-spec-summary.sh`. We feed it deliberately tricky fixtures —
# missing columns, blank lines, junk flags, no artifact URL, mixed
# reasons — and assert the output stays well-formed, surfaces the
# correct "why skipped" reason text, and emits the aggregate counts
# table BEFORE the per-spec breakdown.
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
assert_contains "$out" '`specA-chromium`'                          "full: slug rendered"
assert_contains "$out" '_(attempt 3)_'                             "full: attempt label"
assert_contains "$out" '[trace.zip](https://example.com/art/42)'   "full: trace link"
assert_contains "$out" '[video.webm](https://example.com/art/42)'  "full: video link"
assert_contains "$out" '[playwright-report (HTML)]'                "full: report link"
assert_contains "$out" '<details><summary>Failed specs (1)</summary>' "full: details header"

# --- Fixture 2: legacy 4-column TSV (no report / attempt / sizes) ----
cat > "$tmp/legacy.tsv" <<EOF
specLegacy	1	0	1
EOF
out="$(bash "$renderer" "$tmp/legacy.tsv" "https://example.com/art/L" "Legacy")"
assert_contains "$out" '`specLegacy`'                              "legacy: slug rendered"
assert_contains "$out" '_(attempt 1)_'                             "legacy: attempt defaults to 1"
assert_contains "$out" '[trace.zip]'                               "legacy: trace link present"
assert_not_contains "$out" '[video.webm]'                          "legacy: video link absent"
assert_contains "$out" 'video.webm _skipped_'                      "legacy: video skip reason rendered"
assert_contains "$out" '[screenshot.png]'                          "legacy: screenshot link present"
assert_not_contains "$out" '[playwright-report'                    "legacy: report link absent"

# --- Fixture 3: skip reasons (below_min + empty) shown explicitly ----
cat > "$tmp/reasons.tsv" <<EOF
specBelow	0	0	0	0	2	64	0	below_min	empty
EOF
out="$(bash "$renderer" "$tmp/reasons.tsv" "https://example.com/art/R" "Reasons")"
assert_contains "$out" 'trace.zip _skipped_'                       "reasons: trace skip line"
assert_contains "$out" 'below minimum size threshold'              "reasons: below_min phrase"
assert_contains "$out" '(size: 64 B)'                              "reasons: trace size in skip line"
assert_contains "$out" 'video.webm _skipped_'                      "reasons: video skip line"
assert_contains "$out" 'empty (0 B) — recording started'           "reasons: empty phrase"
assert_contains "$out" '| trace.zip | 0 | 1 | 0 | 0 |'             "reasons: aggregate counts below_min"
assert_contains "$out" '| video.webm | 0 | 0 | 1 | 0 |'            "reasons: aggregate counts empty"
assert_contains "$out" '⚠️ One or more artifacts were skipped'    "reasons: warning callout"

# --- Fixture 4: absent reason explicit ------------------------------
cat > "$tmp/absent.tsv" <<EOF
specAbs	0	0	1	1	1	0	0	absent	absent
EOF
out="$(bash "$renderer" "$tmp/absent.tsv" "https://example.com/art/A" "Absent")"
assert_contains "$out" 'absent — Playwright did not write the file' "absent: absent phrase"
assert_contains "$out" '| trace.zip | 0 | 0 | 0 | 1 |'              "absent: aggregate trace absent"
assert_contains "$out" '| video.webm | 0 | 0 | 0 | 1 |'             "absent: aggregate video absent"
assert_not_contains "$out" '⚠️ One or more artifacts were skipped' "absent: no warning when no empties/below_min"

# --- Fixture 5: blank lines + junk flags mixed with real rows --------
printf 'specOK\t1\t0\t0\t1\t1\t9999\t0\tok\tabsent\n\n  \tjunk-row\nspecBad\tYES\tno\t??\t??\t??\t??\t??\tweird\twut\nspecMid\t0\t1\t0\t0\t2\t0\t512\tabsent\tok\n' > "$tmp/messy.tsv"
out="$(bash "$renderer" "$tmp/messy.tsv" "https://example.com/art/M" "Messy")"
assert_contains "$out" '`specOK`'                                  "messy: valid row 1 rendered"
assert_contains "$out" '`specBad`'                                 "messy: junk-flag row still rendered"
assert_contains "$out" '`specMid`'                                 "messy: valid row 2 rendered"
specbad_block="$(printf '%s\n' "$out" | awk '/`specBad`/{flag=1;print;next} /^- `/{flag=0} flag')"
assert_not_contains "$specbad_block" '[trace.zip](http'            "messy: junk flags do not render trace link"
assert_not_contains "$specbad_block" '[video.webm](http'           "messy: junk flags do not render video link"
assert_contains "$specbad_block" 'unknown (weird)'                  "messy: unknown reason surfaced"

# --- Fixture 6: empty TSV → no output at all (exit 0) ---------------
: > "$tmp/empty-file.tsv"
out="$(bash "$renderer" "$tmp/empty-file.tsv" "https://example.com/art/X" "Nothing")"
if [ -z "$out" ]; then
  pass=$((pass + 1)); echo "  ok    empty TSV: produces no output"
else
  fail=$((fail + 1)); echo "  FAIL  empty TSV: unexpected output: $out"
fi

# --- Fixture 7: artifact URL missing → links suppressed -------------
cat > "$tmp/nourl.tsv" <<EOF
specNoUrl	1	1	1	1	1	1024	4096	ok	ok
EOF
out="$(bash "$renderer" "$tmp/nourl.tsv" "" "NoUrl")"
assert_contains     "$out" '`specNoUrl`'                           "no-url: slug rendered"
assert_not_contains "$out" '[trace.zip]'                           "no-url: trace link suppressed"
assert_not_contains "$out" '[video.webm]'                          "no-url: video link suppressed"
assert_not_contains "$out" '[playwright-report'                    "no-url: report link suppressed"
assert_contains     "$out" 'trace.zip _skipped_'                   "no-url: skip line still rendered for trace"

echo
if [ "$fail" -gt 0 ]; then
  echo "FAILED: $fail assertion(s), $pass passed."
  exit 1
fi
echo "OK: all $pass assertions passed."
