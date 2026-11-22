# ADR 0031 — The agent proposes, the app enforces: cell verdicts and run limits

**Status:** accepted (2026-11-07). **Extended by [ADR 0047](0047-a-chart-with-no-data-is-a-verdict-not-a-green-ran.md)**:
a cell that ran over a chart with no data is answered `empty`. **Extended by
[ADR 0054](0054-a-cell-the-run-is-working-on-is-locked.md)**: the artifact whose chip is `working`
is locked.

## Context

In one conversation pi wrote a chart cell calling `Plot.arc`, which Observable
Plot does not have. The `cell` tool answered `ok` the moment the source was
written; the page judges a cell only after it settles, and steered a failure
only while the turn ran. The failing cell was the turn's last, pi's closing text
came a second later, and the report was dropped. Asked three times to fix the
chart, pi guessed three times and never touched `Plot.arc`.

The obvious repair — when a run ends with a failure, send pi one more turn — was
weighed and declined: it is the app speaking for the user, it costs a turn, and
it only moves the race. The deeper fault was that the tool said "done" about
code nobody had run.

Bounding the fix loop raised the general question. A run with no bound can loop
on a cell, or on anything, for as long as pi likes; a run bounded only by a long
hard limit leaves a simple task as free to run for half an hour as a hard one,
and a hard one free to run for hours before the user hears whether it is going
the right way. The model can say how long the work should take, but a model
asked to bound itself is the thing being bounded.

## Decision

- **A cell is not finished until it has run.** Started by the app, pi is told so
  (`PIARY_VERDICTS=1`), and the `cell` tool asks the page — an `input` dialog
  over pi's extension UI channel, the one rpc-mode request that carries a string
  back — how the cell it wrote ran, and answers with that: ok, a failed result
  with the error, waiting on a name no cell declares yet, or still running after
  10 s. A failed result is the tool's error, so pi fixes its own cell inside the
  turn that wrote it. The spec is `docs/notebook-cells.md` §Policy.
- **The agent proposes; the app enforces.** Every bound is a constant in the app
  and every check is code. The agent's one input is an estimate, and it is
  clamped:
  - per cell: three failed writes in a run, then the tool says stop and tell the
    user (`app/cell-verdicts.ts`);
  - per run, hard: 20 minutes and 60 tool calls, past which the run is stopped
    the way Escape stops it and the document says why (`app/run-limits.ts`);
  - per run, soft: pi estimates the work with the `budget` tool, clamped between
    a minute and the hard bound, five minutes when it gives none; when it passes,
    the app steers once — stop, report, ask whether to continue.
- **Nothing is sent to pi on the app's own initiative.** A verdict is a tool
  result pi asked for; the budget steer is a visible user message in the
  document, like every steer, and only during the run.

## Consequences

- The tool waits for the page, up to 15 s. A turn that writes many cells is
  slower by each cell's run time, which is the price of every cell having run.
- A pi outside the app — one run in a terminal — has no page to ask and
  is not told it has one; its `cell` answers as written, marked not verified.
- A declaration cell cannot know whether a display cell is coming, so a blank
  artifact is not a verdict; it stays the sweep's report.
- The limits' numbers are a starting point, each with its reason beside it, and
  they are expected to move with use. A change is a change to one module.
