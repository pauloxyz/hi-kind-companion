#!/usr/bin/env bash
# Renders the per-spec section of a Playwright job's GitHub Actions
# summary from a TSV produced by collect-spec-artifacts.sh.
#
# Expected TSV columns (tab-separated), schema v3:
#   slug  has_trace  has_video  has_screenshot  has_report  attempt  \
#         trace_size  video_size  trace_reason  video_reason
#
# Older TSVs without the last six columns are still accepted — the
# missing fields default to sane values so the renderer stays
# backward-compatible with the v1 4-column format.
#
# Output structure (Markdown, written to STDOUT):
#   1. "Run summary" aggregate table: ok / below_min / empty / absent
#      counts for trace+video, plus report and screenshot totals.
#   2. "Top problem specs" table: the specs with the most missing or
#      truncated artifacts — quick-glance triage for failure clusters.
#   3. <details> per-spec block: every spec lists every artifact type.
#      Missing artifacts include WHY (absent / empty / below_min) AND
#      the size + threshold so the reviewer doesn't have to guess.
#
# Environment overrides:
#   MIN_TRACE_BYTES   — threshold used for trace.zip      (default 1024)
#   MIN_VIDEO_BYTES   — threshold used for video.webm     (default 4096)
#   TOP_PROBLEM_LIMIT — max rows in the ranking table     (default 5)
#   AGGREGATE_OUT_JSON / AGGREGATE_OUT_CSV — if set, ALSO write the
#     aggregate counters to that file so a later step can persist
#     them across runs for trend comparison. Caller is responsible
#     for shipping the file as an artifact.
#   RUN_LABEL / RUN_PHASE / RUN_ATTEMPT — propagated into the JSON/CSV
#     so a follow-up job can stitch many runs together.
#
# Usage:
#   render-spec-summary.sh <tsv> <artifact_url> <header_label>
set -euo pipefail

tsv="${1:?usage: render-spec-summary.sh <tsv> <artifact_url> <label>}"
artifact_url="${2:-}"
label="${3:-spec results}"

MIN_TRACE_BYTES="${MIN_TRACE_BYTES:-1024}"
MIN_VIDEO_BYTES="${MIN_VIDEO_BYTES:-4096}"
TOP_PROBLEM_LIMIT="${TOP_PROBLEM_LIMIT:-5}"

if [ ! -s "$tsv" ]; then
  exit 0
fi

count="$(grep -c . "$tsv" 2>/dev/null || echo 0)"

# Aggregate counters — populated in a single pre-scan pass so we can
# render the aggregate block BEFORE the per-spec <details>.
total=0
trace_ok=0; trace_below=0; trace_empty=0; trace_absent=0
video_ok=0; video_below=0; video_empty=0; video_absent=0
reports=0; screenshots=0

# Score table for the "top problem specs" ranking — each entry is
# "<deficit>\t<slug>\t<trace_reason>\t<video_reason>" so we can sort
# numerically descending on column 1 with `sort -k1,1nr`.
ranking_lines=""

bump_reason() {
  case "$1" in
    ok)        eval "${2}_ok=\$((${2}_ok + 1))" ;;
    below_min) eval "${2}_below=\$((${2}_below + 1))" ;;
    empty)     eval "${2}_empty=\$((${2}_empty + 1))" ;;
    absent|*)  eval "${2}_absent=\$((${2}_absent + 1))" ;;
  esac
}

deficit_for() {
  # Higher score = bigger problem. absent=2 (nothing to debug with),
  # empty=2 (file shipped but useless), below_min=1 (probably truncated
  # but might still be partially viewable), ok=0.
  case "$1" in
    absent|empty) echo 2 ;;
    below_min)    echo 1 ;;
    *)            echo 0 ;;
  esac
}

while IFS=$'\t' read -r slug has_trace has_video has_screenshot has_report attempt trace_size video_size trace_reason video_reason _rest; do
  [ -z "${slug:-}" ] && continue
  total=$((total + 1))
  trace_reason="${trace_reason:-$([ "${has_trace:-0}" = "1" ] && echo ok || echo absent)}"
  video_reason="${video_reason:-$([ "${has_video:-0}" = "1" ] && echo ok || echo absent)}"
  bump_reason "$trace_reason" trace
  bump_reason "$video_reason" video
  [ "${has_report:-0}" = "1" ] && reports=$((reports + 1))
  [ "${has_screenshot:-0}" = "1" ] && screenshots=$((screenshots + 1))

  deficit=$(( $(deficit_for "$trace_reason") + $(deficit_for "$video_reason") ))
  if [ "$deficit" -gt 0 ]; then
    ranking_lines="${ranking_lines}${deficit}"$'\t'"${slug}"$'\t'"${trace_reason}"$'\t'"${video_reason}"$'\n'
  fi
done < "$tsv"

echo
echo "**Run summary** — ${total} spec(s) processed"
echo
echo "| Artifact | ok | below min | empty | absent |"
echo "|---|---:|---:|---:|---:|"
echo "| trace.zip | ${trace_ok} | ${trace_below} | ${trace_empty} | ${trace_absent} |"
echo "| video.webm | ${video_ok} | ${video_below} | ${video_empty} | ${video_absent} |"
echo
echo "_Reports found: **${reports}**, screenshots: **${screenshots}**. Thresholds: trace ≥ **${MIN_TRACE_BYTES} B**, video ≥ **${MIN_VIDEO_BYTES} B**._"
if [ "$((trace_below + video_below + trace_empty + video_empty))" -gt 0 ]; then
  echo
  echo "> ⚠️ One or more artifacts were skipped (below minimum size or empty). See the per-spec breakdown below for the reason."
fi

# --- Top problem specs ranking --------------------------------------
# Sort by deficit DESC then slug ASC, then take the top N.
# We pipe through `awk` instead of `sort | head | while read` because
# `head` closes its stdin early, which makes `sort` exit with SIGPIPE
# (141) and, under `set -euo pipefail`, aborts the whole renderer just
# as we're about to emit the per-spec block. `awk 'NR<=N'` reads the
# whole stream, so no upstream writer ever sees a broken pipe.
if [ -n "$ranking_lines" ]; then
  echo
  echo "**Top problem specs** (most missing / truncated artifacts)"
  echo
  echo "| Spec | trace | video | deficit |"
  echo "|---|---|---|---:|"
  printf '%s' "$ranking_lines" \
    | sort -t$'\t' -k1,1nr -k2,2 \
    | awk -F'\t' -v n="$TOP_PROBLEM_LIMIT" 'NR<=n { printf "| `%s` | %s | %s | %s |\n", $2, $3, $4, $1 }'
fi

echo
echo "<details><summary>${label} (${count})</summary>"
echo

reason_phrase() {
  local reason="$1" size="$2" threshold="$3"
  case "$reason" in
    ok)        echo "" ;;
    absent)    echo "absent — Playwright did not write the file (size: ${size} B, min: ${threshold} B)" ;;
    empty)     echo "empty — recording started but produced 0 B (min required: ${threshold} B)" ;;
    below_min) echo "below minimum size threshold — likely truncated (size: ${size} B, min: ${threshold} B)" ;;
    *)         echo "unknown (${reason}) — size: ${size} B, min: ${threshold} B" ;;
  esac
}

while IFS=$'\t' read -r slug has_trace has_video has_screenshot has_report attempt trace_size video_size trace_reason video_reason _rest; do
  [ -z "${slug:-}" ] && continue
  has_trace="${has_trace:-0}"
  has_video="${has_video:-0}"
  has_screenshot="${has_screenshot:-0}"
  has_report="${has_report:-0}"
  attempt="${attempt:-1}"
  trace_size="${trace_size:-0}"
  video_size="${video_size:-0}"
  trace_reason="${trace_reason:-$([ "$has_trace" = "1" ] && echo ok || echo absent)}"
  video_reason="${video_reason:-$([ "$has_video" = "1" ] && echo ok || echo absent)}"

  case "$has_trace"      in 0|1) ;; *) has_trace=0 ;; esac
  case "$has_video"      in 0|1) ;; *) has_video=0 ;; esac
  case "$has_screenshot" in 0|1) ;; *) has_screenshot=0 ;; esac
  case "$has_report"     in 0|1) ;; *) has_report=0 ;; esac

  echo "- \`${slug}\` _(attempt ${attempt})_"
  if [ "$has_trace" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [trace.zip](${artifact_url}) — extract \`${slug}/trace.zip\` (${trace_size} B) and open at <https://trace.playwright.dev>"
  else
    echo "  - trace.zip _skipped_ — $(reason_phrase "$trace_reason" "$trace_size" "$MIN_TRACE_BYTES")"
  fi
  if [ "$has_video" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [video.webm](${artifact_url}) — extract \`${slug}/video.webm\` (${video_size} B) and play locally"
  else
    echo "  - video.webm _skipped_ — $(reason_phrase "$video_reason" "$video_size" "$MIN_VIDEO_BYTES")"
  fi
  if [ "$has_screenshot" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [screenshot.png](${artifact_url}) — extract \`${slug}/*.png\` to view failure state"
  fi
  if [ "$has_report" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [playwright-report (HTML)](${artifact_url}) — extract \`playwright-report/index.html\` and open in a browser"
  fi
done < "$tsv"

echo
echo "</details>"

# --- Persist aggregate counts for cross-run trend analysis ----------
# JSON sidecar — single object, schema_version pinned so consumers can
# detect format drift. Always emitted when AGGREGATE_OUT_JSON is set,
# even on a "100% green" run (the counters are still informative).
if [ -n "${AGGREGATE_OUT_JSON:-}" ]; then
  cat > "$AGGREGATE_OUT_JSON" <<JSON
{
  "schema_version": 1,
  "label": "${RUN_LABEL:-${label}}",
  "phase": "${RUN_PHASE:-run1}",
  "attempt": ${RUN_ATTEMPT:-1},
  "total_specs": ${total},
  "trace": {"ok": ${trace_ok}, "below_min": ${trace_below}, "empty": ${trace_empty}, "absent": ${trace_absent}},
  "video": {"ok": ${video_ok}, "below_min": ${video_below}, "empty": ${video_empty}, "absent": ${video_absent}},
  "reports_found": ${reports},
  "screenshots": ${screenshots},
  "thresholds": {"min_trace_bytes": ${MIN_TRACE_BYTES}, "min_video_bytes": ${MIN_VIDEO_BYTES}}
}
JSON
fi

# CSV sidecar — flat row, easy to append to a long-running stats file
# across many workflow runs / shards. Header is emitted only when the
# target file does not exist yet, so subsequent appends stay clean.
if [ -n "${AGGREGATE_OUT_CSV:-}" ]; then
  if [ ! -f "$AGGREGATE_OUT_CSV" ]; then
    echo "label,phase,attempt,total_specs,trace_ok,trace_below_min,trace_empty,trace_absent,video_ok,video_below_min,video_empty,video_absent,reports_found,screenshots,min_trace_bytes,min_video_bytes" > "$AGGREGATE_OUT_CSV"
  fi
  printf '%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "${RUN_LABEL:-${label}}" "${RUN_PHASE:-run1}" "${RUN_ATTEMPT:-1}" \
    "$total" \
    "$trace_ok" "$trace_below" "$trace_empty" "$trace_absent" \
    "$video_ok" "$video_below" "$video_empty" "$video_absent" \
    "$reports" "$screenshots" \
    "$MIN_TRACE_BYTES" "$MIN_VIDEO_BYTES" \
    >> "$AGGREGATE_OUT_CSV"
fi
