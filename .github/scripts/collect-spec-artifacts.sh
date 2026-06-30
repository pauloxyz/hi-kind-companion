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
MIN_REPORT_INDEX_BYTES="${MIN_REPORT_INDEX_BYTES:-1024}"
ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"

# Report consistency check — a healthy Playwright HTML report has:
#   - playwright-report/index.html, non-trivial size (> MIN_REPORT_INDEX_BYTES)
#   - at least one supporting asset (the JS bundle, trace/, data/, …)
# Anything less is a broken/partial report and gets surfaced via
# `report_reason` so the summary doesn't link to an empty page.
report_reason="absent"
has_report=0
if [ -f playwright-report/index.html ]; then
  _idx_size="$(stat -c%s playwright-report/index.html 2>/dev/null || stat -f%z playwright-report/index.html 2>/dev/null || echo 0)"
  if [ "${_idx_size:-0}" -lt "$MIN_REPORT_INDEX_BYTES" ]; then
    report_reason="index_too_small"
  else
    # `-mindepth 1 -not -name index.html` finds anything else under the
    # report dir — bundled JS, screenshots, the trace viewer, etc.
    _extra="$(find playwright-report -mindepth 1 -not -name index.html -print -quit 2>/dev/null || true)"
    if [ -z "${_extra:-}" ]; then
      report_reason="no_assets"
    else
      report_reason="ok"
      has_report=1
    fi
  fi
fi

# Portable file-size helper (GNU stat on Linux, BSD stat on macOS).
filesize() {
  if [ ! -f "$1" ]; then echo 0; return; fi
  stat -c%s "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null || echo 0
}

# Largest file matching a glob, or empty string if none. We use the
# biggest match because retries may leave multiple traces/videos in the
# same folder and the freshest/largest one is the most useful.
# Largest file matching a glob, or empty string if none. We use the
# biggest match because retries may leave multiple traces/videos in the
# same folder and the freshest/largest one is the most useful. Empty
# files (0 B) still count as "found" so the renderer can classify them
# as `empty` instead of mislabeling them `absent` — initial sentinel
# is -1 so the first match wins regardless of size.
largest_match() {
  local best=""
  local best_size=-1
  shopt -s nullglob
  for f in "$@"; do
    [ -e "$f" ] || continue
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

# Reason codes for trace/video flags. Stored in TSV so the renderer can
# explain WHY a link was suppressed instead of silently hiding it:
#   ok         — file present and ≥ threshold
#   absent     — no matching file in the spec folder
#   empty      — file exists but is 0 bytes
#   below_min  — file exists, has content, but is under MIN_*_BYTES
classify() {
  local file="$1" size="$2" threshold="$3"
  if [ -z "$file" ]; then echo "absent"; return; fi
  if [ "$size" -eq 0 ]; then echo "empty"; return; fi
  if [ "$size" -lt "$threshold" ]; then echo "below_min"; return; fi
  echo "ok"
}

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

    trace_reason="$(classify "$trace_file" "$trace_size" "$MIN_TRACE_BYTES")"
    video_reason="$(classify "$video_file" "$video_size" "$MIN_VIDEO_BYTES")"

    has_trace=0; [ "$trace_reason" = "ok" ] && has_trace=1
    has_video=0; [ "$video_reason" = "ok" ] && has_video=1
    has_screenshot=0; [ -n "$screenshot_file" ] && has_screenshot=1

    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$slug" "$has_trace" "$has_video" "$has_screenshot" \
      "$has_report" "$ATTEMPT" "$trace_size" "$video_size" \
      "$trace_reason" "$video_reason" >> "$out"

    rows+=("$slug" "$has_trace" "$has_video" "$has_screenshot" \
           "$has_report" "$ATTEMPT" "$trace_size" "$video_size" \
           "$trace_reason" "$video_reason")
  done < <(find test-results -mindepth 1 -maxdepth 1 -type d | sort -u)
fi

count="$(wc -l < "$out" | tr -d ' ')"

if [ -n "$out_json" ]; then
  # Build JSON without depending on jq — keys are fixed, values are
  # already safe (slugs come from Playwright and contain no quotes;
  # reasons are constrained to the classify() enum above).
  {
    printf '{\n'
    printf '  "schema_version": 2,\n'
    printf '  "attempt": %s,\n' "$ATTEMPT"
    printf '  "has_report": %s,\n' "$has_report"
    printf '  "min_trace_bytes": %s,\n' "$MIN_TRACE_BYTES"
    printf '  "min_video_bytes": %s,\n' "$MIN_VIDEO_BYTES"
    printf '  "count": %s,\n' "$count"
    printf '  "specs": [\n'
    n=${#rows[@]}
    stride=10
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
      tr="${rows[$((i+8))]}"
      vr="${rows[$((i+9))]}"
      sep=","
      [ "$((i + stride))" -ge "$n" ] && sep=""
      esc_slug="${slug//\\/\\\\}"
      esc_slug="${esc_slug//\"/\\\"}"
      printf '    {"slug":"%s","has_trace":%s,"has_video":%s,"has_screenshot":%s,"has_report":%s,"attempt":%s,"trace_size":%s,"video_size":%s,"trace_reason":"%s","video_reason":"%s"}%s\n' \
        "$esc_slug" "$ht" "$hv" "$hs" "$hr" "$at" "$ts" "$vs" "$tr" "$vr" "$sep"
      i=$((i + stride))
    done
    printf '  ]\n'
    printf '}\n'
  } > "$out_json"

  # Also drop the manifest inside test-results/ so it ships in the
  # uploaded artifact bundle without needing the upload `path:` list to
  # learn about an extra location. Downstream steps (consolidated
  # summary, post-mortem scripts) can read it directly from the bundle.
  if [ -d test-results ]; then
    cp -f "$out_json" test-results/_spec-manifest.json 2>/dev/null || true
  fi
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "count=${count}" >> "$GITHUB_OUTPUT"
  echo "has_report=${has_report}" >> "$GITHUB_OUTPUT"
else
  echo "count=${count} has_report=${has_report}" >&2
fi
