#!/usr/bin/env bash
# Local runner mirroring the CI + nightly security regression gate.
#
# Usage:
#   bun run security:regression                # normal run
#   bun run security:regression -- --verbose   # tee vitest output verbatim
#   bun run security:regression -- --dry-run   # print the plan, no exec
#
# Requires: CRON_SECRET, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
# in the environment. Falls back to the same non-prod placeholders CI uses
# when they are unset, so you can run it on a fresh clone.
#
# Output: security-report/regression-results.json + regression.log
set -euo pipefail

VERBOSE=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --verbose) VERBOSE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
  esac
done

REPORT_DIR="${REPORT_DIR:-security-report}"

# CI-equivalent placeholders (safe to hardcode — publishable/anon keys).
export CRON_SECRET="${CRON_SECRET:-local-regression-cron-secret-placeholder}"
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://lkvfvriexuxlvrufbqbf.supabase.co}"
export VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_wq43mYCRgxQ11IfBOkHi7w_Ihw2O_A3}"
export SUPABASE_URL="${SUPABASE_URL:-$VITE_SUPABASE_URL}"
export SUPABASE_PUBLISHABLE_KEY="${SUPABASE_PUBLISHABLE_KEY:-$VITE_SUPABASE_PUBLISHABLE_KEY}"

TESTS=(
  src/lib/security-regression.integration.test.ts
  src/lib/cron-auth.server.test.ts
  src/routes/api/public/hooks/cron-secret-regression.test.ts
)

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] Would create report dir: $REPORT_DIR"
  echo "[dry-run] Env:"
  echo "  CRON_SECRET=***${#CRON_SECRET} chars***"
  echo "  VITE_SUPABASE_URL=$VITE_SUPABASE_URL"
  echo "  VITE_SUPABASE_PUBLISHABLE_KEY=***${#VITE_SUPABASE_PUBLISHABLE_KEY} chars***"
  echo "[dry-run] Would run:"
  printf '  bunx vitest run \\\n'
  for t in "${TESTS[@]}"; do printf '    %s \\\n' "$t"; done
  printf '    --reporter=verbose --reporter=json --outputFile=%s/regression-results.json\n' "$REPORT_DIR"
  if [[ "${COMPARE_WITH:-}" != "" ]]; then
    echo "[dry-run] Would compare with: $COMPARE_WITH"
  fi
  exit 0
fi

mkdir -p "$REPORT_DIR"
echo "▶ Running security regression suite → $REPORT_DIR/"
[[ $VERBOSE -eq 1 ]] && echo "[verbose] tests: ${TESTS[*]}"

set +e
bunx vitest run \
  "${TESTS[@]}" \
  --reporter=verbose \
  --reporter=json --outputFile="$REPORT_DIR/regression-results.json" \
  2>&1 | tee "$REPORT_DIR/regression.log"
EXIT=${PIPESTATUS[0]}
set -e

echo ""
if [[ "${COMPARE_WITH:-}" != "" ]]; then
  if [[ -f "$COMPARE_WITH" ]]; then
    echo "▶ Comparing against previous report at $COMPARE_WITH"
    COMPARE_FLAGS=()
    [[ $VERBOSE -eq 1 ]] && COMPARE_FLAGS+=(--verbose)
    bun scripts/compare-security-artifacts.ts \
      --previous "$COMPARE_WITH" \
      --current "$REPORT_DIR/regression-results.json" \
      --out "$REPORT_DIR/delta.md" \
      "${COMPARE_FLAGS[@]}" || EXIT=$?
    echo "Delta written to $REPORT_DIR/delta.md"
  else
    echo "⚠ COMPARE_WITH=$COMPARE_WITH not found — skipping delta (baseline mode)."
  fi
fi

echo ""
echo "▶ Report artifacts:"
ls -1 "$REPORT_DIR/"
exit $EXIT
