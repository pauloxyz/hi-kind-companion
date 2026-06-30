#!/usr/bin/env bash
# Renders the per-spec section of a Playwright job's GitHub Actions
# summary from a TSV produced by collect-spec-artifacts.sh.
#
# Expected TSV columns (tab-separated), schema v2:
#   slug  has_trace  has_video  has_screenshot  has_report  attempt  \
#         trace_size  video_size  trace_reason  video_reason
#
# Older TSVs without the last six columns are still accepted — the
# missing fields default to sane values so the renderer stays
# backward-compatible during the v1 → v2 transition.
#
# Output structure:
#   1. An aggregate "Run summary" block: # specs, # ok / below_min /
#      empty / absent for trace+video, # reports found. Always rendered
#      first so on-call engineers can triage the health of a run at a
#      glance without expanding the per-spec details.
#   2. A <details> per-spec block with one bullet per spec. Each spec
#      lists every artifact type that exists (trace, video, screenshot,
#      HTML report) and, when an artifact is missing, explains WHY
#      (absent / empty / below the size threshold) instead of silently
#      hiding the bullet.
#
# Usage:
#   render-spec-summary.sh <tsv> <artifact_url> <header_label>
# Writes Markdown to STDOUT — caller is expected to redirect into
# $GITHUB_STEP_SUMMARY.
set -euo pipefail

tsv="${1:?usage: render-spec-summary.sh <tsv> <artifact_url> <label>}"
artifact_url="${2:-}"
label="${3:-spec results}"

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

bump_reason() {
  case "$1" in
    ok)        eval "${2}_ok=\$((${2}_ok + 1))" ;;
    below_min) eval "${2}_below=\$((${2}_below + 1))" ;;
    empty)     eval "${2}_empty=\$((${2}_empty + 1))" ;;
    absent|*)  eval "${2}_absent=\$((${2}_absent + 1))" ;;
  esac
}

while IFS=$'\t' read -r slug has_trace has_video has_screenshot has_report attempt trace_size video_size trace_reason video_reason _rest; do
  [ -z "${slug:-}" ] && continue
  total=$((total + 1))
  # Backfill legacy rows: derive a best-effort reason from the boolean.
  trace_reason="${trace_reason:-$([ "${has_trace:-0}" = "1" ] && echo ok || echo absent)}"
  video_reason="${video_reason:-$([ "${has_video:-0}" = "1" ] && echo ok || echo absent)}"
  bump_reason "$trace_reason" trace
  bump_reason "$video_reason" video
  [ "${has_report:-0}" = "1" ] && reports=$((reports + 1))
  [ "${has_screenshot:-0}" = "1" ] && screenshots=$((screenshots + 1))
done < "$tsv"

echo
echo "**Run summary** — ${total} spec(s) processed"
echo
echo "| Artifact | ok | below min | empty | absent |"
echo "|---|---:|---:|---:|---:|"
echo "| trace.zip | ${trace_ok} | ${trace_below} | ${trace_empty} | ${trace_absent} |"
echo "| video.webm | ${video_ok} | ${video_below} | ${video_empty} | ${video_absent} |"
echo
echo "_Reports found: **${reports}**, screenshots: **${screenshots}**._"
if [ "$((trace_below + video_below + trace_empty + video_empty))" -gt 0 ]; then
  echo
  echo "> ⚠️ One or more artifacts were skipped (below minimum size or empty). See the per-spec breakdown below for the reason."
fi

echo
echo "<details><summary>${label} (${count})</summary>"
echo

reason_phrase() {
  case "$1" in
    ok)        echo "" ;;
    absent)    echo "absent — Playwright did not write the file" ;;
    empty)     echo "empty (0 B) — recording started but produced nothing" ;;
    below_min) echo "below minimum size threshold — likely truncated" ;;
    *)         echo "unknown ($1)" ;;
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
    echo "  - trace.zip _skipped_ — $(reason_phrase "$trace_reason") (size: ${trace_size} B)"
  fi
  if [ "$has_video" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [video.webm](${artifact_url}) — extract \`${slug}/video.webm\` (${video_size} B) and play locally"
  else
    echo "  - video.webm _skipped_ — $(reason_phrase "$video_reason") (size: ${video_size} B)"
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
