#!/usr/bin/env bash
# The expression-signal experiment: answer the cases in ./cases REPS times per
# arm with a synthetic block of what a camera would have seen sent after each
# prompt, and the regression cases of evals/cases with and without one.
# Usage: [MODEL=provider/id] [THINKING=level] [ARMS="none expressive guided"] [REGRESSION=0]
#        evals/spikes/expressions/run.sh [reps]
# Writes $EXPR_OUT/<arm>/r<n>/ (EXPR_OUT defaults to the main checkout's
# git-ignored recordings/expressions). Not a test: answers are not deterministic.
set -euo pipefail
REPS=${1:-3}
MODEL=${MODEL:-anthropic/claude-sonnet-5-5}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk '/^worktree /{print $2; exit}')
OUT=${EXPR_OUT:-$MAIN/recordings/expressions}
THINKING=${THINKING:+--thinking $THINKING}
ARMS=${ARMS:-none floor neutral expressive labels guided}
mkdir -p "$OUT"
cd "$ROOT"
cat pi-extension/system-prompt.md "$HERE/guidance.md" > "$OUT/guided-prompt.md"

# arm, signal file, reps, prompt. The control runs twice over: its second half
# is the noise floor the other arms are read against.
one() {
  local arm=$1 signal=$2 reps=$3 prompt=$4 r
  for r in $(seq 1 "$reps"); do
    [ -f "$OUT/$arm/r$r/report.json" ] && continue
    node evals/run.ts --cases "$HERE/cases" --signals "$HERE/signals" --signal "$signal" \
      --model "$MODEL" $THINKING --prompt "$prompt" --jobs 7 --out "$OUT/$arm/r$r" | tail -1
  done
}
for arm in $ARMS; do
  case $arm in
    none) one none none "$REPS" pi-extension/system-prompt.md ;;
    floor) one none none $((REPS * 2)) pi-extension/system-prompt.md ;;
    guided) one guided expressive "$REPS" "$OUT/guided-prompt.md" ;;
    *) one "$arm" "$arm" "$REPS" pi-extension/system-prompt.md ;;
  esac
done
[ "${REGRESSION:-1}" = 0 ] && exit 0

# Cases that pass today, with a frown attached: does a block break work?
for arm in none frown guided-frown; do
  prompt=pi-extension/system-prompt.md; signal=$arm
  [ "$arm" = guided-frown ] && prompt="$OUT/guided-prompt.md" && signal=frown
  for r in $(seq 1 "$REPS"); do
    [ -f "$OUT/regression/$arm/r$r/report.json" ] && continue
    node evals/run.ts --case fix-typo-terse --case rename-symbol --case short-fact --case fix-and-run \
      --signals "$HERE/signals" --signal "$signal" --model "$MODEL" $THINKING --prompt "$prompt" \
      --out "$OUT/regression/$arm/r$r" | tail -1
  done
done
