#!/usr/bin/env bash
# Regression suite for the TSV → Markdown renderer in
# `render-spec-summary.sh`. We feed it deliberately tricky fixtures —
# missing columns, blank lines, junk flags, no artifact URL — and
# assert the output stays well-formed and never aborts mid-summary.
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
    pass=$((pass + 1))
    echo "  ok    $label"
  else
    fail=$((fail + 1))
    echo "  FAIL  $label"
    echo "        expected to find: $needle"
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2" label="$3"
  if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
    fail=$((fail + 1))
    echo "  FAIL  $label"
    echo "        unexpected presence of: $needle"
  else
    pass=$((pass + 1))
    echo "  ok    $label"
  fi
}

# --- Fixture 1: full happy-path row with every artifact ---------------
cat > "$tmp/full.tsv" <<EOF
specA-chromium	1	1	1	1	3	2048	8192
EOF
out="$(bash "$renderer" "$tmp/full.tsv" "https://example.com/art/42" "Failed specs")"
assert_contains "$out" '`specA-chromium`'                 "full: slug rendered"
assert_contains "$out" '_(attempt 3)_'                    "full: attempt label"
assert_contains "$out" '[trace.zip](https://example.com/art/42)' "full: trace link"
assert_contains "$out" '(2048 B)'                         "full: trace size shown"
assert_contains "$out" '[video.webm](https://example.com/art/42)' "full: video link"
assert_contains "$out" '(8192 B)'                         "full: video size shown"
assert_contains "$out" '[screenshot.png]'                 "full: screenshot link"
assert_contains "$out" '[playwright-report (HTML)]'       "full: report link"
assert_contains "$out" '<details><summary>Failed specs (1)</summary>' "full: details header"

# --- Fixture 2: legacy 4-column TSV (no report / attempt / sizes) ----
cat > "$tmp/legacy.tsv" <<EOF
specLegacy	1	0	1
EOF
out="$(bash "$renderer" "$tmp/legacy.tsv" "https://example.com/art/L" "Legacy")"
assert_contains "$out" '`specLegacy`'                     "legacy: slug rendered"
assert_contains "$out" '_(attempt 1)_'                    "legacy: attempt defaults to 1"
assert_contains "$out" '[trace.zip]'                      "legacy: trace link present"
assert_not_contains "$out" '[video.webm]'                 "legacy: video link absent"
assert_contains "$out" '[screenshot.png]'                 "legacy: screenshot link present"
assert_not_contains "$out" '[playwright-report'           "legacy: report link absent"

# --- Fixture 3: empty-flag spec (file existed but under threshold) ---
cat > "$tmp/empty.tsv" <<EOF
specEmpty	0	0	0	0	2	0	0
EOF
out="$(bash "$renderer" "$tmp/empty.tsv" "https://example.com/art/E" "Empty")"
assert_contains "$out" '`specEmpty`'                      "empty: slug rendered"
assert_contains "$out" 'no trace/video/screenshot/report' "empty: fallback bullet"
assert_not_contains "$out" '[trace.zip]'                  "empty: no trace link"

# --- Fixture 4: blank lines + junk flags mixed with real rows --------
printf 'specOK\t1\t0\t0\t1\t1\t9999\t0\n\n  \tjunk-row\nspecBad\tYES\tno\t??\t??\t??\t??\t??\nspecMid\t0\t1\t0\t0\t2\t0\t512\n' > "$tmp/messy.tsv"
out="$(bash "$renderer" "$tmp/messy.tsv" "https://example.com/art/M" "Messy")"
assert_contains "$out" '`specOK`'                         "messy: valid row 1 rendered"
assert_contains "$out" '`specBad`'                        "messy: junk-flag row still rendered"
assert_contains "$out" '`specMid`'                        "messy: valid row 2 rendered"
# Junk flags must be coerced to 0 — none of trace/video/screenshot links
# should appear for specBad.
specbad_block="$(printf '%s\n' "$out" | awk '/`specBad`/{flag=1;print;next} /^- `/{flag=0} flag')"
assert_not_contains "$specbad_block" '[trace.zip]'        "messy: junk flags do not render trace"
assert_not_contains "$specbad_block" '[video.webm]'       "messy: junk flags do not render video"
assert_contains "$specbad_block" 'no trace/video/screenshot/report' "messy: junk row falls back"

# --- Fixture 5: empty TSV → no output at all (exit 0) ----------------
: > "$tmp/empty-file.tsv"
out="$(bash "$renderer" "$tmp/empty-file.tsv" "https://example.com/art/X" "Nothing")"
if [ -z "$out" ]; then
  pass=$((pass + 1)); echo "  ok    empty TSV: produces no output"
else
  fail=$((fail + 1)); echo "  FAIL  empty TSV: unexpected output: $out"
fi

# --- Fixture 6: artifact URL missing → links suppressed --------------
cat > "$tmp/nourl.tsv" <<EOF
specNoUrl	1	1	1	1	1	1024	4096
EOF
out="$(bash "$renderer" "$tmp/nourl.tsv" "" "NoUrl")"
assert_contains     "$out" '`specNoUrl`'                  "no-url: slug rendered"
assert_not_contains "$out" '[trace.zip]'                  "no-url: trace link suppressed"
assert_not_contains "$out" '[video.webm]'                 "no-url: video link suppressed"
assert_not_contains "$out" '[playwright-report'           "no-url: report link suppressed"

echo
if [ "$fail" -gt 0 ]; then
  echo "FAILED: $fail assertion(s), $pass passed."
  exit 1
fi
echo "OK: all $pass assertions passed."
