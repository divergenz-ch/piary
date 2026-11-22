# ADR 0044 — How an answer is drawn is a mode

**Status:** accepted (2026-11-15). Builds on ADR 0043 (the agent draws an answer through an A2UI
catalog) and ADR 0030 (the prompt and tools ship with the app and answer to evals).

## Context

ADR 0043 made an `a2ui` view the way the agent draws an answer to look at, and left cells for
code. Some users will want the earlier behaviour: an answer drawn as a cell, code they can read
and change. ADR 0043 declined to teach both ways at once, because each way's guidance is paid on
every turn (about 4.8 k characters for a2ui) and two routes in one context are a choice the model
makes differently each time.

So the second way is offered as a mode the user opts in to, and the mode decides which guidance
pi is given.

## Decision

- **A mode picks the guidance, never the rendering.** There are two: `a2ui`, the default, and
  `free`. In `a2ui` the `view` and `cell` tools say what ADR 0043 left them saying. In `free` the
  `view` tool names no a2ui template and carries no guide, its description is the one it had
  before a2ui, and the `cell` description says a cell is the default for anything to look at.
  The page draws a2ui views and cells in both modes, so a document written in one opens in the
  other.
- **Neither mode carries the other's teaching.** `pi-extension/draw-mode.ts` builds every text
  that follows the mode (the two descriptions, the two prompt snippets, the `view` tool's two
  parameter hints) as pure functions of it. `tests/contract/guidance-budget.test.ts` holds that
  free drawing names no a2ui, that a2ui mode does not call a cell the default, and each mode's
  total to a ceiling.
- **The system prompt and the skill are the same in both modes.** They are static files, so they
  name no way of drawing (ADR 0043 already took a2ui out of them) and the same test holds that.
- **In free drawing a call to the a2ui template is refused,** before its payload is looked at:
  "The a2ui template is not enabled in this session; draw it with the `cell` tool." A model that
  sees a2ui views in a conversation's history tries one, and the refusal tells it what to draw
  with (`checkView` in `pi-extension/view-shapes.ts`).
- **The mode is read when pi starts.** pi takes a tool's description when the tool registers, so
  the two tools read `PIARY_DRAW` once, then. A change of mode takes effect at the next pi start.
  A conversation begun in one mode and continued in the other is told the new descriptions: pi
  compares each tool's declaration with the one its transcript holds and declares a changed one
  again.
- **The mode lives in the app's environment, and Rust passes it on.** The app reads `PIARY_DRAW`
  from its own environment, reduces it to `free` or `a2ui` (`session::draw_mode`: anything but
  `free` is `a2ui`) and sets it on every pi it starts (`Spawn.draw`, `session.rs`). The extension
  reduces it the same way, for a pi started anywhere else.

## Why not per turn

Switching per turn means pi holds both guidances and is told each turn which applies, which is the
cost the mode exists to avoid, plus a third text to say which is in force. It would also change
tool descriptions mid-conversation on every switch, and pi declares a changed tool again in the
transcript each time.

## Why Rust's environment and not the page

The page starts pi from nine modules (`piStart`), and a subsession must draw the way its parent
does. A value the page held would have to ride through every one of those calls. A variable set in
Rust where pi is spawned reaches all of them, and a pi nobody thought of gets the mode too.
The page's own switches are not the place: the page does not make pi's environment.

## What free drawing costs, as measured

Always-on characters (both tools' texts and the system prompt): 9,886 in `a2ui`, 5,159 in `free`,
so free drawing carries 4,727 fewer on every turn.

On the six design cases, three times each (`anthropic/claude-sonnet-5-5`, 18 answers), free
drawing against the cells of before a2ui (the `baseline` arm):

| | free | baseline |
| --- | --- | --- |
| answers broken on the page | 0 | 2 as stored, 3 once a cell that does not compile counts |
| colour literals per answer | 0.9 | 2.9 |
| answers with a cell | 6 | 8 |
| answers with a table view | 5 | 6 |
| answers with neither (a markdown table in prose) | 7 | 4 |
| a2ui views tried and refused | 0 | n/a |
| median answer | 13.4 s | 15.2 s |

Free drawing is not a2ui by other means. Twelve of its 18 answers are a table and nothing else,
where every a2ui answer is a composed surface (18 of 18 in the run beside it). Its cells are in
Piary's type and their charts fill the column, but every one of the six cell answers still wrote
a colour of its own: green and red on a tile's delta, a hue per series. No free answer was broken
on the page and no cell write failed, where the baseline had broken answers; the count does not
see a cell that runs and displays nothing.

The eval's 31 cases on the same model, each mode against the reference report: 27 cases and 243
of 247 checks in `a2ui`, 28 and 244 in `free`, no check lost in either. In `free` no a2ui view was
called in 78 tool calls.

**A conversation that already holds a2ui views is where free drawing was weakest.** The real app
was driven twice through the same sequence: an explainer asked for in `a2ui`, the app quit and
started with `PIARY_DRAW=free` on the same documents, a change to the explainer asked for. Both
times the old surface drew as before, pi declared the two tools again with the free texts, and
the model still called the a2ui template once, was refused, and went to the `cell` tool. Both
times the cells it then wrote compiled after a failed write or two and showed no working widget:
once a cell that defined a value and displayed nothing, once `viewof` cells that drew
`undefined`. In neither run did the model read the skill before writing a cell, where the design
run's cell answers, on an empty history, read it first in five of six. A control, the same
sequence with both starts in `free`, read the skill, drew a working explainer in six cells and
made the change by redefining them, with no failed write. Three runs are an anecdote, but they
are the only three there are.

## The control that is not built

There is no control for the mode in the window. The seam for one is in Rust: `pi_start` fills
`Spawn.draw` from `draw_mode(env)`, and a control replaces "the app's environment" with "this
window's pick" there, then stops the window's pi the way a sign-in does (`app/login.ts`), so the
next send starts one that reads it. Nothing in the extension or the page's rendering changes.

## Limits

- **A `pi-ui-views` the user installed themselves ignores the variable** if it is older than this
  decision, and draws as it always did. The app passes no second copy of the extension beside it
  (two registering `cell` make pi exit), which is the limit sign-in has too (ADR 0034).
- **A Finder launch has no `PIARY_DRAW`,** so a packaged app is in `a2ui` until the control
  exists.
- **A running pi keeps its mode.** The environment is the app's, so the mode is one for the whole
  run of the app, every window and subsession alike.
- **History pulls toward the mode it was written in.** A refused a2ui call costs a turn of the
  model and stays in the document as a refused block with its reason under it.

## Consequences

- An eval or a design run names its mode (`pnpm eval --draw free`, `DRAW=free
  evals/design/run.sh`), writes it in its report, and defaults to `a2ui`.
- A change to either mode's texts answers to that mode's ceiling in the budget test, and a raised
  ceiling owes a design run in that mode.
- `checkView` takes the mode, so the refusal is held by a unit test and not by pi's runtime.
