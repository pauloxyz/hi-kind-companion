#!/usr/bin/env bash
# Preflight that verifies the expected Playwright bundle layout BEFORE
# any upload-artifact / summary step references those paths. Designed
# to never fail the workflow (observability only): it emits warnings
# via `::warning::` annotations and writes a deterministic OUTPUTS
# block to $GITHUB_OUTPUT so downstream steps can branch on it.
#
# Emitted outputs:
#   has_test_results   — 1/0  (any per-spec folder under test-results/)
#   has_report_html    — 1/0  (playwright-report/index.html exists, non-trivial)
#   has_report_assets  — 1/0  (at least one asset besides index.html)
#   has_traces         — 1/0  (any trace*.zip under test-results/)
#   has_videos         — 1/0  (any *.webm under test-results/)
#   has_screenshots    — 1/0  (any *.png under test-results/)
#   bundle_ok          — 1/0  (true when *something* worth uploading exists)
#
# Usage:
#   bash .github/scripts/preflight-bundle.sh [report_min_bytes]
set -euo pipefail

MIN_REPORT_INDEX_BYTES="${MIN_REPORT_INDEX_BYTES:-${1:-1024}}"

has_test_results=0
has_report_html=0
has_report_assets=0
has_traces=0
has_videos=0
has_screenshots=0

if [ -d test-results ]; then
  if find test-results -mindepth 1 -maxdepth 1 -type d -print -quit 2>/dev/null | grep -q .; then
    has_test_results=1
  fi
  find test-results -type f -name 'trace*.zip'  -print -quit 2>/dev/null | grep -q . && has_traces=1 || true
  find test-results -type f -name '*.webm'      -print -quit 2>/dev/null && find test-results -type f -name '*.webm' -print -quit 2>/dev/null | grep -q . && has_videos=1 || true
  find test-results -type f -name '*.png'       -print -quit 2>/dev/null | grep -q . && has_screenshots=1 || true
fi

if [ -f playwright-report/index.html ]; then
  idx_size="$(stat -c%s playwright-report/index.html 2>/dev/null || stat -f%z playwright-report/index.html 2>/dev/null || echo 0)"
  if [ "${idx_size:-0}" -ge "$MIN_REPORT_INDEX_BYTES" ]; then
    has_report_html=1
  else
    echo "::warning::playwright-report/index.html is suspiciously small (${idx_size} B < ${MIN_REPORT_INDEX_BYTES} B) — report link will be suppressed."
  fi
  if find playwright-report -mindepth 1 -not -name index.html -print -quit 2>/dev/null | grep -q .; then
    has_report_assets=1
  else
    echo "::warning::playwright-report/ has no supporting assets — report HTML will be unusable."
  fi
fi

bundle_ok=0
if [ "$has_test_results" = "1" ] || [ "$has_report_html" = "1" ]; then
  bundle_ok=1
else
  echo "::warning::Preflight: no test-results/ folders AND no playwright-report/index.html — nothing to upload."
fi

echo "Preflight bundle check:"
echo "  has_test_results=$has_test_results"
echo "  has_report_html=$has_report_html  (min=${MIN_REPORT_INDEX_BYTES} B)"
echo "  has_report_assets=$has_report_assets"
echo "  has_traces=$has_traces  has_videos=$has_videos  has_screenshots=$has_screenshots"
echo "  bundle_ok=$bundle_ok"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "has_test_results=$has_test_results"
    echo "has_report_html=$has_report_html"
    echo "has_report_assets=$has_report_assets"
    echo "has_traces=$has_traces"
    echo "has_videos=$has_videos"
    echo "has_screenshots=$has_screenshots"
    echo "bundle_ok=$bundle_ok"
  } >> "$GITHUB_OUTPUT"
fi
