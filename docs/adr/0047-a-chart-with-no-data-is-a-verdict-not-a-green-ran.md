# ADR 0047 — A chart with no data is a verdict, not a green ran

**Status:** accepted (2026-11-15). Extends ADR 0031 (the agent proposes, the app enforces) with one
more verdict, `empty`.

## Context

ADR 0031 made the page answer the `cell` tool with how the cell ran. "Ran" was as far as it saw. A
quality-control cell compared a parsed date with a string, kept no row, and drew its limit lines
over an empty plot: the verdict was `ok`, the artifact's chip went green, and the agent reported a
result nobody could see. Its user gave up. The prompt already told the agent to check the data a
cell reads, and it did, with `bash`, against the file rather than the cell.

The proposal that reported it asked for any empty declared value to count. Its own reproduction
says why that is wrong: a list of failing lots is rightly empty when no lot fails.

## Decision

- **The signal is the chart.** A `Plot.plot` chart is read before it is drawn
  (`src/notebook/plot-empty.ts`, pure): it has no data when it holds at least one mark that carries
  data and every such mark was given zero rows. A rule, a frame, a text, a tip, a crosshair, an
  axis and a grid are annotations, so a limit line does not stand in for what it limits.
- **An empty set that is an answer stays `ok`**: an empty mark beside marks with rows, and an empty
  value no chart draws.
- **The verdict follows the data.** The verdict on a cell covers the chart it shows and the charts
  of every cell that reads what it declares, once those have re-run. The cell that computes the
  rows is the one to fix, so its rewrite is judged by the chart it feeds.
- **`empty` is a failed write with a way out.** It is the tool's error result, names the cell
  showing the chart and the empty values by their declared names, and counts toward the
  three-per-cell bound of ADR 0031, so a run cannot loop on it. Its text says the way out: when no
  data is the true answer, tell the user so plainly.
- **The chip ends amber**, `ran · no data: NAME has no rows`, on the cell showing the chart. It
  outlasts later cells that ran, until a check that covers the chart finds data.
- **The prompt closes the other half of the report**, two answers on one page: a table a cell now
  computes replaces the hand-typed one above it, deleted with `canvas_edit` (ADR 0033). The edit
  fits the guidance budget as it stood (ADR 0030).

## Declined

- **Flagging every empty array or object a cell declares.** It fails the correct answer.
- **Counting marks in the drawn SVG.** It could see rows Plot's own `filter` removed, but it cannot
  name the empty value, which is what tells the agent where to look.
- **An amber tone while the run is still working.** The chip is blue for the whole run by rule
  (ADR 0031); its words say `no data` meanwhile.

## Consequences

- Not seen: an empty `Inputs.table`, a chart made by a mark's own `.plot()`, rows removed by a
  mark's `filter` option. Each is a place to extend the rule, with its own false positives to weigh.
- A chart that is rightly empty is reported again when a cell it reads from is rewritten, up to the
  bound.
- The eval runner never runs a cell (`evals/README.md`), so no eval can fail on an empty chart. The
  case `batch-qc-chart` holds the session's prompt and files and is tagged `known gap`; the
  behaviour is held by `tests/integration/cell-verdict.test.ts`.
