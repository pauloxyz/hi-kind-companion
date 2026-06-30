#!/usr/bin/env bash
# Renders the per-spec section of a Playwright job's GitHub Actions
# summary from a TSV produced by collect-spec-artifacts.sh.
#
# For every spec slug the renderer emits one parent bullet plus child
# bullets for each artifact type that ACTUALLY exists in the bundle
# (trace.zip, video.webm, screenshots). All links point to the same
# artifact URL — GitHub doesn't expose per-file public URLs — but each
# child bullet labels the file the user must extract from the .zip, so
# the summary doubles as a "what's in the bundle for this spec" map
# and prevents broken links when, e.g., a spec passed without a video.
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

count="$(wc -l < "$tsv" | tr -d ' ')"
echo
echo "<details><summary>${label} (${count})</summary>"
echo

while IFS=$'\t' read -r slug has_trace has_video has_screenshot; do
  [ -z "$slug" ] && continue
  echo "- \`${slug}\`"
  if [ "$has_trace" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [trace.zip](${artifact_url}) — extract \`${slug}/trace.zip\` and open at <https://trace.playwright.dev>"
  fi
  if [ "$has_video" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [video.webm](${artifact_url}) — extract \`${slug}/video.webm\` and play locally"
  fi
  if [ "$has_screenshot" = "1" ] && [ -n "$artifact_url" ]; then
    echo "  - [screenshot.png](${artifact_url}) — extract \`${slug}/*.png\` to view failure state"
  fi
  # If NONE of the three flags are set we deliberately skip child bullets
  # to avoid emitting a "click here, find nothing" experience.
  if [ "$has_trace" = "0" ] && [ "$has_video" = "0" ] && [ "$has_screenshot" = "0" ]; then
    echo "  - _no trace/video/screenshot produced — Playwright may have stopped before recording_"
  fi
done < "$tsv"

echo
echo "</details>"
