#!/usr/bin/env bash
# The face-format experiment: answer the cases of one split, REPS times per arm and model, with
# the arm's block (built by build.ts from each case's timeline) sent after the prompt.
# Usage: PHASE=<name> ARMS="none floor face@face2" [SPLIT=test] [CASES=<prefix>] [EXCEPT=<prefix>] [MODELS="…"]
#        [PROMPT=<file>] evals/spikes/face-format/run.sh [reps]
# `none` is the control; `floor` runs it REPS more times, for control against control. An arm
# named <a>@<prompt> sends arm <a>'s block under the system prompt guidance/<prompt>.md.
# Writes $FACE_OUT/<phase>/<model>/<arm>/r<n>/. Resumes: a rep with a report is skipped unless
# the report holds a turn that failed in transport, which is run again.
set -euo pipefail
REPS=${1:-3}
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../../.." && pwd)
OUT=${FACE_OUT:-$ROOT/recordings/face-format}/${PHASE:?phase}
SPLIT=${SPLIT:-test}; PREFIX=${CASES:-}
cd "$ROOT"
CASE_ARGS=""
for d in "$HERE"/cases/*/; do s=$(basename "$d")
  [ "$(cat "$d/split")" = "$SPLIT" ] || continue
  if [ -n "${EXCEPT:-}" ]; then case $s in "$EXCEPT"*) continue ;; esac; fi
  case $s in "$PREFIX"*) CASE_ARGS="$CASE_ARGS --case $s" ;; esac
done
mkdir -p "$OUT/prompts"
one() { # model arm signal reps prompt
  local model=$1 arm=$2 signal=$3 reps=$4 prompt=$5 r
  for r in $(seq 1 "$reps"); do
    local dir="$OUT/$model/$arm/r$r"
    if [ -f "$dir/report.json" ] && ! /usr/bin/grep -q '"error"' "$dir/report.json"; then continue; fi
    node evals/run.ts --cases "$HERE/cases" $CASE_ARGS --signals "$HERE/signals" --signal "$signal" \
      --model "anthropic/claude-$model" --thinking off --accept-edits --prompt "$prompt" --jobs 8 --out "$dir" 2>/dev/null | tail -1 | sed "s|^|$model $arm r$r: |"
  done
}
for model in ${MODELS:-haiku-5-5 sonnet-5-5 opus-5-5}; do
  ( for arm in ${ARMS:?arms}; do
      signal=${arm%@*}; prompt=pi-extension/system-prompt.md
      if [ "$arm" != "$signal" ] || [ -n "${PROMPT:-}" ]; then
        g=${PROMPT:-$HERE/guidance/${arm#*@}.md}; prompt="$OUT/prompts/$(basename "$g")"
        cat pi-extension/system-prompt.md "$g" > "$prompt"
      fi
      case $arm in
        none) one "$model" none none "$REPS" pi-extension/system-prompt.md ;;
        floor) one "$model" none none $((REPS * 2)) pi-extension/system-prompt.md ;;
        *) one "$model" "$arm" "$signal" "$REPS" "$prompt" ;;
      esac
    done ) &
done
wait
