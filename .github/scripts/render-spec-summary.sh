#!/usr/bin/env bash
# Renders the per-spec section of a Playwright job's GitHub Actions
# summary from a TSV produced by collect-spec-artifacts.sh.
#
# Expected TSV columns (tab-separated):
#   slug  has_trace  has_video  has_screenshot  has_report  attempt  \
#         trace_size  video_size
#
# Older TSVs without the last four columns are still accepted — the
# missing fields default to "0" / "1" so the renderer remains
# backward-compatible while we transition pipelines.
#
# For every spec slug the renderer emits one parent bullet plus child
# bullets for each artifact type that exists in the bundle (trace.zip,
# video.webm, screenshots, HTML report). All links point at the same
# artifact URL — GitHub doesn't expose per-file public URLs — but each
# child bullet labels the file the user must extract from the .zip, so
# the summary doubles as a "what's in the bundle for this spec" map.
#
# Lines missing the slug column are skipped silently; lines with the
# wrong number of fields keep the renderer alive (defaults applied)
# so a malformed TSV row never aborts the entire summary.
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
echo
echo "<details><summary>${label} (${count})</summary>"
echo

while IFS=$'\t' read -r slug has_trace has_video has_screenshot has_report attempt trace_size video_size _rest; do
  [ -z "${slug:-}" ] && continue
  # Defaults for short rows (legacy TSV / partial data).
  has_trace="${has_trace:-0}"
  has_video="${has_video:-0}"
  has_screenshot="${has_screenshot:-0}"
  has_report="${has_report:-0}"
  attempt="${attempt:-1}"
  trace_size="${trace_size:-0}"
  video_size="${video_size:-0}"

  # Coerce non-numeric junk to 0 so arithmetic in any downstream call
  # never explodes the surrounding `set -e` shell.
  case "$has_trace"      in 0|1) ;; *) has_trace=0 ;; esac
  case "$has_video"      in 0|1) ;; *) has_video=0 ;; esac
  case "$has_screenshot" in 0|1) ;; *) has_screenshot=0 ;; esac
  case "$has_report"     in 0|1) ;; *) has_report=0 ;; esac

  echo "- \`${slug}\` _(attempt ${attempt})_"
  if [ "$has_trace" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [trace.zip](${artifact_url}) — extract \`${slug}/trace.zip\` (${trace_size} B) and open at <https://trace.playwright.dev>"
  fi
  if [ "$has_video" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [video.webm](${artifact_url}) — extract \`${slug}/video.webm\` (${video_size} B) and play locally"
  fi
  if [ "$has_screenshot" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [screenshot.png](${artifact_url}) — extract \`${slug}/*.png\` to view failure state"
  fi
  if [ "$has_report" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [playwright-report (HTML)](${artifact_url}) — extract \`playwright-report/index.html\` and open in a browser"
  fi
  if [ "$has_trace" = "0" ] && [ "$has_video" = "0" ] && [ "$has_screenshot" = "0" ] && [ "$has_report" = "0" ]; then
    echo "  - _no trace/video/screenshot/report produced — Playwright may have stopped before recording, or files were below the minimum-size threshold_"
  fi
done < "$tsv"

echo
echo "</details>"
