#!/usr/bin/env bash
# Scans the Playwright `test-results/` directory and writes a TSV manifest
# describing every spec result folder. One row per spec slug:
#
#   <slug>\t<has_trace>\t<has_video>\t<has_screenshot>
#
# where the boolean columns are literal `1` or `0`. Used by the per-shard
# summary renderer to decide whether a "trace.zip" / "video.webm" link is
# meaningful for that spec (Playwright skips writing those files when a
# test passes on first try even if `trace: on` is set under some
# project-level overrides).
#
# Usage:
#   collect-spec-artifacts.sh <out_tsv>
# Echoes `count=<N>` to $GITHUB_OUTPUT when running inside a step that
# sets the env var; otherwise prints the count to stderr.
set -euo pipefail

out="${1:?usage: collect-spec-artifacts.sh <out_tsv>}"
: > "$out"

if [ -d test-results ]; then
  # `-mindepth 1 -maxdepth 1` keeps us at the spec-folder level. Playwright
  # also writes `.last-run.json` and the html report copy at the root — we
  # ignore both because they aren't per-spec.
  while IFS= read -r dir; do
    slug="$(basename "$dir")"
    [ "$slug" = "$(basename "$out")" ] && continue
    # Look for the canonical filenames Playwright emits. We also accept
    # numbered variants (`trace-1.zip`, `video.webm` after a retry) so
    # the manifest stays accurate when retries kick in.
    has_trace=0
    has_video=0
    has_screenshot=0
    if compgen -G "$dir"/trace*.zip > /dev/null; then has_trace=1; fi
    if compgen -G "$dir"/*.webm    > /dev/null; then has_video=1; fi
    if compgen -G "$dir"/*.png     > /dev/null; then has_screenshot=1; fi
    printf '%s\t%s\t%s\t%s\n' "$slug" "$has_trace" "$has_video" "$has_screenshot" >> "$out"
  done < <(find test-results -mindepth 1 -maxdepth 1 -type d | sort -u)
fi

count="$(wc -l < "$out" | tr -d ' ')"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "count=${count}" >> "$GITHUB_OUTPUT"
else
  echo "count=${count}" >&2
fi
