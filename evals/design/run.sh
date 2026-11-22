#!/usr/bin/env bash
# The design-language experiment (ADR 0043): answer the design persona cases REPS times on MODEL with
# this checkout's Piary package, render every answer in this checkout's app
# page, and summarise. Usage: [DRAW=free] evals/design/run.sh <arm> [reps]
# DRAW is the draw mode pi is started in (ADR 0044): a2ui unless it says free.
# Writes $DESIGN_OUT/<arm>/{docs,shots,reports}/ and metrics.json
# (DESIGN_OUT defaults to the main checkout's git-ignored recordings/design).
set -euo pipefail
ARM=${1:?arm name}; REPS=${2:-3}
MODEL=${MODEL:-anthropic/claude-sonnet-5-5}
DRAW=${DRAW:-a2ui}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MAIN=$(git -C "$ROOT" worktree list --porcelain | awk '/^worktree /{print $2; exit}')
OUT=${DESIGN_OUT:-$MAIN/recordings/design}/$ARM
rm -rf "$OUT"; mkdir -p "$OUT/docs" "$OUT/reports"
cd "$ROOT"
CASES=$(ls evals/cases | grep '^ui-' | sed 's/^/--case /' | tr '\n' ' ')
for r in $(seq 1 "$REPS"); do
  rep="$OUT/raw/r$r"
  pnpm -s eval $CASES --model "$MODEL" --draw "$DRAW" --out "$rep" | tail -3
  cp "$rep/report.json" "$OUT/reports/r$r.json"
  for f in "$rep"/*/*.md; do cp "$f" "$OUT/docs/$(basename "$f" .md)--r$r.md"; done
done
SHOTS_IN="$OUT/docs" SHOTS_OUT="$OUT/shots" npx playwright test -c playwright.app.config.ts e2e/design-shots-flows.spec.ts --reporter=line | grep -E 'passed|failed' || true
node evals/design/metrics.ts "$OUT" > "$OUT/metrics.json"
cat "$OUT/metrics.json"
