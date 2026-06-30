#!/usr/bin/env bash
# Scans the Playwright `test-results/` directory and writes a TSV manifest
# (and optional JSON sidecar) describing every spec result folder.
#
# TSV columns (one row per spec slug, tab-separated):
#
#   slug  has_trace  has_video  has_screenshot  has_report  attempt  \
#         trace_size  video_size
#
# - `has_trace` / `has_video` / `has_screenshot` are literal `1` or `0`.
# - A trace/video that exists on disk but is smaller than the configured
#   minimum byte threshold (MIN_TRACE_BYTES / MIN_VIDEO_BYTES, defaults
#   1024 / 4096) is treated as ABSENT (flag = 0) so the summary never
#   renders a link to a 0-byte / truncated file.
# - `has_report` is `1` when `playwright-report/index.html` exists at
#   the job root — it is per-job, not per-spec, so the value is the same
#   on every row, but is denormalized into each row to keep downstream
#   consumers single-pass.
# - `attempt` is `${GITHUB_RUN_ATTEMPT:-1}`, propagated so per-spec
#   summary rows can label which workflow attempt produced them.
# - `trace_size` / `video_size` are raw byte counts (0 when missing).
#
# Usage:
#   collect-spec-artifacts.sh <out_tsv> [out_json]
#
# Echoes `count=<N>` to $GITHUB_OUTPUT when running inside a step that
# sets the env var; otherwise prints the count to stderr.
set -euo pipefail

out="${1:?usage: collect-spec-artifacts.sh <out_tsv> [out_json]}"
out_json="${2:-}"
: > "$out"

MIN_TRACE_BYTES="${MIN_TRACE_BYTES:-1024}"
MIN_VIDEO_BYTES="${MIN_VIDEO_BYTES:-4096}"
ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"

has_report=0
if [ -f playwright-report/index.html ]; then has_report=1; fi

# Portable file-size helper (GNU stat on Linux, BSD stat on macOS).
filesize() {
  if [ ! -f "$1" ]; then echo 0; return; fi
  stat -c%s "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null || echo 0
}

# Largest file matching a glob, or empty string if none. We use the
# biggest match because retries may leave multiple traces/videos in the
# same folder and the freshest/largest one is the most useful.
largest_match() {
  local best=""
  local best_size=0
  shopt -s nullglob
  for f in "$@"; do
    [ -f "$f" ] || continue
    local s
    s="$(filesize "$f")"
    if [ "$s" -gt "$best_size" ]; then
      best="$f"
      best_size="$s"
    fi
  done
  shopt -u nullglob
  echo "$best"
}

rows=()

if [ -d test-results ]; then
  while IFS= read -r dir; do
    slug="$(basename "$dir")"
    [ "$slug" = "$(basename "$out")" ] && continue

    trace_file="$(largest_match "$dir"/trace*.zip)"
    video_file="$(largest_match "$dir"/*.webm)"
    screenshot_file="$(largest_match "$dir"/*.png)"

    trace_size=0
    video_size=0
    [ -n "$trace_file" ] && trace_size="$(filesize "$trace_file")"
    [ -n "$video_file" ] && video_size="$(filesize "$video_file")"

    has_trace=0
    has_video=0
    has_screenshot=0
    if [ -n "$trace_file" ] && [ "$trace_size" -ge "$MIN_TRACE_BYTES" ]; then
      has_trace=1
    fi
    if [ -n "$video_file" ] && [ "$video_size" -ge "$MIN_VIDEO_BYTES" ]; then
      has_video=1
    fi
    if [ -n "$screenshot_file" ]; then
      has_screenshot=1
    fi

    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$slug" "$has_trace" "$has_video" "$has_screenshot" \
      "$has_report" "$ATTEMPT" "$trace_size" "$video_size" >> "$out"

    rows+=("$slug" "$has_trace" "$has_video" "$has_screenshot" \
           "$has_report" "$ATTEMPT" "$trace_size" "$video_size")
  done < <(find test-results -mindepth 1 -maxdepth 1 -type d | sort -u)
fi

count="$(wc -l < "$out" | tr -d ' ')"

if [ -n "$out_json" ]; then
  # Build JSON without depending on jq — keys are fixed, values are
  # already safe (slugs come from Playwright and contain no quotes).
  {
    printf '{\n'
    printf '  "attempt": %s,\n' "$ATTEMPT"
    printf '  "has_report": %s,\n' "$has_report"
    printf '  "min_trace_bytes": %s,\n' "$MIN_TRACE_BYTES"
    printf '  "min_video_bytes": %s,\n' "$MIN_VIDEO_BYTES"
    printf '  "count": %s,\n' "$count"
    printf '  "specs": [\n'
    n=${#rows[@]}
    i=0
    while [ "$i" -lt "$n" ]; do
      slug="${rows[$i]}"
      ht="${rows[$((i+1))]}"
      hv="${rows[$((i+2))]}"
      hs="${rows[$((i+3))]}"
      hr="${rows[$((i+4))]}"
      at="${rows[$((i+5))]}"
      ts="${rows[$((i+6))]}"
      vs="${rows[$((i+7))]}"
      sep=","
      [ "$((i + 8))" -ge "$n" ] && sep=""
      esc_slug="${slug//\\/\\\\}"
      esc_slug="${esc_slug//\"/\\\"}"
      printf '    {"slug":"%s","has_trace":%s,"has_video":%s,"has_screenshot":%s,"has_report":%s,"attempt":%s,"trace_size":%s,"video_size":%s}%s\n' \
        "$esc_slug" "$ht" "$hv" "$hs" "$hr" "$at" "$ts" "$vs" "$sep"
      i=$((i + 8))
    done
    printf '  ]\n'
    printf '}\n'
  } > "$out_json"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "count=${count}" >> "$GITHUB_OUTPUT"
  echo "has_report=${has_report}" >> "$GITHUB_OUTPUT"
else
  echo "count=${count} has_report=${has_report}" >&2
fi
