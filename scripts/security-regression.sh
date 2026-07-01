#!/usr/bin/env bash
# Local runner mirroring the CI + nightly security regression gate.
#
# Usage:
#   bun run security:regression        # or: ./scripts/security-regression.sh
#
# Requires: CRON_SECRET, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
# in the environment. Falls back to the same non-prod placeholders CI uses
# when they are unset, so you can run it on a fresh clone.
#
# Output: security-report/regression-results.json + regression.log
set -euo pipefail

REPORT_DIR="${REPORT_DIR:-security-report}"
mkdir -p "$REPORT_DIR"

# CI-equivalent placeholders (safe to hardcode — publishable/anon keys).
export CRON_SECRET="${CRON_SECRET:-local-regression-cron-secret-placeholder}"
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://lkvfvriexuxlvrufbqbf.supabase.co}"
export VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_wq43mYCRgxQ11IfBOkHi7w_Ihw2O_A3}"
export SUPABASE_URL="${SUPABASE_URL:-$VITE_SUPABASE_URL}"
export SUPABASE_PUBLISHABLE_KEY="${SUPABASE_PUBLISHABLE_KEY:-$VITE_SUPABASE_PUBLISHABLE_KEY}"

echo "▶ Running security regression suite → $REPORT_DIR/"
set +e
bunx vitest run \
  src/lib/security-regression.integration.test.ts \
  src/lib/cron-auth.server.test.ts \
  src/routes/api/public/hooks/cron-secret-regression.test.ts \
  --reporter=verbose \
  --reporter=json --outputFile="$REPORT_DIR/regression-results.json" \
  2>&1 | tee "$REPORT_DIR/regression.log"
EXIT=${PIPESTATUS[0]}
set -e

echo ""
if [[ "${COMPARE_WITH:-}" != "" && -f "$COMPARE_WITH" ]]; then
  echo "▶ Comparing against previous report at $COMPARE_WITH"
  bun scripts/compare-security-artifacts.ts \
    --previous "$COMPARE_WITH" \
    --current "$REPORT_DIR/regression-results.json" \
    --out "$REPORT_DIR/delta.md" || EXIT=$?
  echo "Delta written to $REPORT_DIR/delta.md"
fi

echo ""
echo "▶ Report artifacts:"
ls -1 "$REPORT_DIR/"
exit $EXIT
