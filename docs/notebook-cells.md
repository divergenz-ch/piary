# Reactive cells (the notebook integration)

A pi document can carry live code cells: fenced blocks that run in the
browser, reference each other's declarations, and re-run when a dependency
changes — Observable-notebook semantics inside the conversation. The
document stays a plain markdown file per
[document-format.md](./document-format.md); a cell is one `pi:cell` marker
plus one code fence, and everything below is how that text becomes a running
dataflow graph.

> **Note:** This integration builds on `@observablehq/notebook-kit`, a 2.x
> technology preview, pinned to an exact version.

Design goals, in priority order:

1. **The markdown document stays the source of truth.** Cells are text in
   the conversation file, not a separate notebook file.
2. **Source is text; the artifact frames it.** The fence stays the store, but
   related cells read as one thing: an artifact frame holds the live output
   and a code pane with every member's source, each editable in a small
   editor of its own. A cell nobody grouped is an artifact of one.
3. **Degrade honestly everywhere.** In any other markdown renderer a cell is
   a code fence. Unknown modes, broken markers, unclosed fences, and older
   parsers all fall back to visible, editable text — never an error state.
4. **Cell-free documents pay nothing.** The engine (parser + runtime) loads
   lazily on the first cell a document ever shows.

## Division of labor

notebook-kit supplies the hard, generic parts; Piary supplies everything the
user sees. The boundary is strict in both directions.

| Layer | Supplies |
| --- | --- |
| `@observablehq/notebook-kit` | cell transpiler (implicit dependencies, `viewof`/`mutable`, top-level `await`, `npm:` imports), reactive runtime, Inspector rendering, stdlib (`Inputs`, `Plot`, `d3`, `FileAttachment`, …) |
| Piary | document format (`pi:cell` markers), CodeMirror editing, cell chrome and states, theming, agent integration |

**Containment rule:** every import of `@observablehq/notebook-kit` lives in
`src/notebook/`. Nothing else in Piary may
import it — API churn in the preview package stops at that boundary.

The integration needs no bundler at runtime: the transpiler rewrites bare and
`npm:` imports to CDN URLs (jsdelivr `/+esm`) at *transpile* time. No Vite, no
build step in the loop.

## Data flow

One engine per document, one reactive module per engine. Source flows one
way, evaluation state flows back:

```
document text ──parse──▶ cells.ts ──debounced sync──▶ NotebookEngine
     ▲                  (pi:cell + fence)             (transpile → define)
     │                                                        │
  the user or the                                     Inspector renders
  agent edits text                                    into <pi-cell> widget
```

- `src/document/cells.ts` — pure parsing: finds `pi:cell` segments, extracts
  the first fence as source, and computes the output widget's anchor (end of
  the closing fence line). Unknown modes and unclosed fences yield no
  runnable cell.
- `DocumentChat.syncCells()` — a debounced (300 ms) reconciliation: upserts
  every parsed cell, retracts cells whose MARKERS left the document (branch
  switches included), and resolves duplicate ids. It never runs per
  keystroke — and in edit mode the user's keystrokes never reach it at all.
- `src/notebook/engine.ts` — wraps transpile + define + the runtime behind
  `upsertCell` / `removeCell` / `subscribe` / `snapshot`.
- `src/components/CellBlock.ts` — `<pi-cell>`, the output half: a status
  rail, a stable root the Inspector renders into, and the syntax-error
  banner. Inside an artifact it drops its rail — the frame carries status;
  among several members, one that failed says which it is (`cell #id`) above
  its output.
- `src/components/ArtifactBlock.ts` — `<pi-artifact>`, the frame: an output
  pane of member `<pi-cell>`s and a code pane of `CellEditor`s.
- `src/components/CellEditor.ts` — one nested CodeMirror per member.

## The engine

`NotebookEngine` (`src/notebook/engine.ts`) is the only module that touches
the runtime. Its contract encodes four decisions:

- **A syntax error never tears down a running cell.** `upsertCell` compiles
  before it touches the graph; bad source throws a typed `CellSyntaxError`
  and the previous definition stays live. Half-typed edits keep the old
  output under the error banner.
- **A new definition is pending by definition.** Redefinition reports
  `pending` immediately — the previous value never masquerades as current
  while the (possibly throttled) compute is in flight.
- **Stale observers are dropped by generation.** Deleting variables
  recomputes the graph, and observers of deleted variables can still fire; a
  per-cell generation counter discards those events.
- **Occluded windows still compute.** The runtime schedules computes on
  `requestAnimationFrame`, which Chrome parks for hidden windows — worse,
  the runtime's *constructor* schedules the first compute, so an engine
  created in a hidden window deadlocks (`_computing` holds a frame promise
  that never resolves and blocks all future scheduling). The engine races
  every frame against a 250 ms heartbeat and reschedules the
  constructor-parked compute. Visible pages win the race with the frame;
  hidden pages ride the (browser-throttled) timer.

Headless use (tests) requires two shims before import: a minimal
`globalThis.document` (the runtime's stdlib reads it at import time) and —
in `tests/integration/engine.test.ts` — a `requestAnimationFrame` that never fires, so
the whole suite hangs if the background pump ever regresses.

## Document integration

The write surface is one CodeMirror buffer, so the cell design follows the
editor's grain: decorations, not DOM ownership.

- **Widget identity is `(id, element)`, not source.** `CellWidget` adopts a
  long-lived `<pi-cell>` element from a registry keyed by cell id. Keystrokes
  in the fence never recreate the widget or the Inspector DOM inside it;
  source reaches the engine only through the debounced sync.
- **Anchors ride edits.** Widget positions live in a CodeMirror `StateField`
  and map across transactions between syncs, like branch pagers do.
- **Duplicate ids: the last definition wins.** A later `pi:cell` block with
  the same id supersedes the earlier one — that's how the agent updates a
  cell — and the superseded fence stays visible as honest history. Exactly
  one output widget renders per id, under the winning block.
- **A new document is a new graph.** `setDocument` (load, session switch)
  disposes the engine and its elements; the next sync builds a fresh module.
  Cells removed by a branch switch are retracted like any other deletion —
  their dependents reject with a missing-input error, which is true.
- **Artifacts gather cells.** `artifactsFrom` (`src/document/cells.ts`)
  collects the cells written under each `pi:artifact @NAME` marker; a cell
  nobody grouped is an artifact of one. Member fences are hidden in the flow
  — the frame is where the source lives — and superseded definitions are
  counted as history rather than shown three times over. Pure derivation per
  parse: no persisted state, and every edge (a deleted member, a
  redefinition landing in a later turn, a marker moved) re-derives rather
  than needing repair.
- **The frame sits where its first marker is.** Not at a computed anchor: an
  artifact has a position of its own, and that position is where it was
  made. A name may be declared many times — a turn that adds a cell cannot
  write into a block a hundred lines above, so it writes the marker again
  and the members gather under the first. Later turns add to the artifact;
  they do not move it.
- **A delete of the conversation is not a delete of the work.**
  `deleteBlockText` takes a block's prompt, reply, thinking and tool traffic
  and leaves its cells standing, with the markers that name them — the
  artifact is what the turn made, it outlives the sentence that asked for
  it, and it has a delete of its own on its own frame. The exception is a
  block that *is* an artifact (moved out of its turn, or written
  cells-first): there the rail entry names the artifact, and deleting it
  means what it says.
- **An artifact moves and goes whole.** One frame on the page, several spans
  in the text — so `moveCell`, `deleteCell` and `deleteSegment`
  (`src/document/run.ts`, `artifactRuns`) address *every* declaration of the
  name, not the marker
  under the cursor. Anything less split the two apart: a move that carried
  the first run left the rest behind as members of turns it had visibly left,
  and the marker it dropped — its name already declared above it — opened no
  block under `blocksFrom`'s repeat rule, so it belonged to whatever block it
  landed in and the next delete of that block took the artifact with it.
  Gathering leaves one name, one marker, one block, and a rail entry saying
  so.
- **Three deletes, three widths, and a head for each.** `deleteBlockText`
  takes a conversation, `deleteCell` takes a cell and the answer under it, and
  `deleteSegment` (`src/document/run.ts`) takes exactly the segment you
  pointed at — a reply, a thinking block, a tool call, a result, a view.
  Machine-written segments were unreachable before it: dropping a bad answer
  cost you the prompt that asked for it. Two things travel with the segment,
  both because leaving them would change a block nobody touched — the
  `pi:block` marker in front of an opener, whose only job is to fold *that*
  segment into the block above, and every other declaration of an artifact's
  name. The page's trailing prompt slot is the one thing that cannot go:
  `trailingPromptRepair` would put it straight back, so the refusal is
  explicit rather than silent. Half a turn is a shape the reader already
  survives (`documentMessages`): a call whose result went keeps its call and
  is told so, a result naming no call is dropped.
- **A `⋯` means a menu, on anything that is one segment.** Every head carries
  one now — `RoleWidget`, a `FoldedWidget` standing in for a folded step, a
  rendered view's own header. The dots are a button *inside* the head rather
  than a cue *on* it, because the head may already do something else: a folded
  step's label still expands, and the click stops at the dots so the page does
  not fold out from under the menu that just opened. Two heads keep their old
  meaning. The activity strip's `⋯` still expands, because a strip stands for
  N segments and not one. A block-opening prompt shows the block's dots and
  not a second pair — its narrow "delete the prompt, keep the answer" lives in
  that prompt's own `⠿` menu.
- **An artifact wears the document's chrome.** The same hairline rule down
  the left as every other block (the shared `::before` selector list in
  `document.css`, which `.doc-cell` joins), content at the shared text
  inset, and a `.doc-role` label — `cell @weather`, or `7 cells` for a run
  nobody grouped — that folds the source through the same `fold-toggle` →
  `toggleFoldEffect` path every other fold uses, under the key
  `artifact#<key>`. It was briefly a bordered card with `output | code`
  tabs, which said it was a different *kind* of thing; it is not, it is the
  answer's material. Status colours the rule rather than adding a dot.
- **Folded by default, open when broken.** The artifact reads as its
  output and the label says where the code went. A member in error opens it
  — a red string with the source behind a click is an artifact hiding the
  evidence for its own failure, which is how a page of unparseable React
  managed to look like nothing at all. The element derives that from its
  members' live status; the document only supplies the persisted fold bit.
- **The code pane is a nested editor.** One CodeMirror per member, inside
  the outer one. Three rules keep them from fighting: events stop at the
  widget boundary (`ignoreEvent` excuses only plugin handlers — the view's
  own live on its `contentDOM`, which is an ancestor); undo belongs to
  whoever owns the text (below); and `setSource` ignores the document merely
  echoing what the pane last wrote, so the debounced sync cannot rewind text
  under the caret. `⟨⟩ markdown` shows the whole artifact as the plain fences it is in the
  file, and each cell's label then carries `← Show result`, the way back.
- **Editing is a mode, and it buffers.** An idle pane is read-only; `✎ edit`
  makes the whole artifact writable at once. While it is on, keystrokes stay
  in the editors and reach neither the document nor the engine. **Apply**
  writes every changed member's fence in ONE transaction — one undo step, one
  sync, one recompile — and **Discard** drops the buffer and reloads the panes
  from the document. Dirty members are marked on their own row.

  It wrote through on every keystroke before, which meant the reactive graph
  recompiled against half-typed source on a 300 ms timer for as long as you
  were typing. Three separate defects met there and the artifact did not
  survive the meeting. `setCellSource` spliced the fence's CONTENT range and
  never re-fenced, so source containing a ``` line closed its own fence early
  (`fence`/`fenceTicks` in `document/format.ts` had the rule; the write-back
  path did not use it). `cellSource` then returned null, which it documents as
  "the cell neither runs nor unruns" — but `syncCells` read absent-from-the-parse
  as gone-from-the-document and retracted the cell, dropped its element and
  **destroyed the editor being typed in**. What came back had no editor, because
  `onWantCode` fired on the closed→open edge alone, so the pane rendered the
  pending placeholder for good. Editing broke the artifact and took away the
  means to fix it.

  All three are fixed underneath the mode rather than papered over by it:
  `cellWrite` (`document/cells.ts`) widens the fence when the source needs it,
  retraction is keyed off the cell's SEGMENT so an unclosed fence keeps its
  cell, and editors are built for any member that lacks one, not only on the
  edge. The mode is what makes them unnecessary in the common case; the fixes
  are what make Apply and the agent's own redefinitions safe.
- **Undo belongs to whoever owns the text.** Idle, a pane's keystrokes ARE
  document transactions, so Mod-Z delegates outward and the pane follows —
  a local stack would let you step the code back to a state the document
  never had. Buffered, they are not in the document, so delegating outward
  would undo something the user did not do: edit mode switches a `history()`
  into a compartment and Apply/Discard switches it out, which drops that
  stack. By then the document owns the change, as one step.
- **The buffer wins over an agent redefinition, and is never persisted.** If
  the agent rewrites a cell while the pane holds unsaved text, the pane keeps
  what the user typed. Only one of the two can be recovered afterwards: the
  document's version is still in the document and Discard reloads it, while
  the buffer exists nowhere else. It exists nowhere else on purpose — it is
  not part of the document, so no save, reload or session switch carries it.

### Persisting state

Outputs are never stored — the document carries only source. State reaches
the document three ways, in descending order of what you should reach for:

1. **`view()` inputs.** A `const x = view(Inputs.range(…))` cell's value is
   persisted by export name and pushed back into the widget on boot; an
   `ojs` cell's `viewof x = Inputs.range(…)` is the same thing, under `x`. A
   redefinition of the cell keeps it too: the value its widget holds is read
   before the old definition goes and pushed into the widget the new one
   renders, when the new definition still declares that name. A renamed
   export starts from its declared default. So does a value the new widget
   refuses, such as an option a select no longer offers. Only the cell's
   first widget is carried, the same limit the boot restore has.
2. **`state(key, initial)`.** A `view()` with no widget: a hidden element
   carrying a value plus `input` events, which is the only reactive-input
   shape the transpiler supports (`autoview` rewrites `const x = view(…)`
   into a generator-driven variable; a plain builtin is evaluated once and
   could never re-run dependents). `setState(key, value)` writes from an
   event handler. Values are keyed rather than named, so `seedStore` can run
   **before any cell defines** and a reload paints the saved state once
   instead of the default and then the saved state.
3. **Write-back.** The cell rewrites its own source — for state that should
   read as part of the code.

Widget state lives in the **transcript**, not the document — a
`pi-ui-cell-state` custom entry, the same mechanism the session's extension
set uses. `<document-chat>` takes it in as `.cellState` and emits
`cell-state-save` when it changes; the host reads and writes
`GET`/`POST /session/state`.

It was a `pi:view cell-state #state` block in the document, and that made the
`.md` the only home for the one thing a rebuild could not restore: rebuild a
session and the code came back at its *declared defaults*, so a Mandelbrot you
had navigated 1270x into reset to the whole set. `rebuildSession` carries the
latest entry of each custom type forward, so in the transcript it survives for
free — and the document goes back to being what the format says it is, a
rendering that is authoritative for nothing.

The payload is a versioned envelope:
`{ v: 2, views: {name: value}, store: {key: value} }`. A flat object still
reads as v1, so state written before the split restores. A legacy block still
sitting in a document is cut the first time state is saved.

`undefined` for `.cellState` means "not fetched yet" and `null` means "none
saved" — the restore waits for the difference, because latching it on a value
that has not arrived loses the state for good.

For write-back specifically: dispatch
`new CustomEvent("pi-cell-writeback", { detail: { id, source } })` on
`window`, and `DocumentChat.setCellSource(id, source)` splices the new source
into that cell's fence (last fence wins on duplicate ids, matching the
engine). Unchanged source is a no-op, which terminates the resulting re-run
after one cycle. Example — a checkbox list that persists:

```js
const items = ["write while streaming", "visual cleanup"];
const done = view(Inputs.checkbox(items, {label: "TODO", value: ["visual cleanup"]}));
```

```js
dispatchEvent(new CustomEvent("pi-cell-writeback", {detail: {
  id: "todo",
  source: `const items = ${JSON.stringify(items)};\nconst done = view(Inputs.checkbox(items, {label: "TODO", value: ${JSON.stringify(done)}}));`
}}));
```

The second cell depends on `done`, so every check re-runs it and the new
`value:` lands in the document text — saved like any edit, honest markdown
everywhere else.

## The agent loop

The agent authors cells through the `cell` tool
(`pi-extension/cell.ts`), following the `view` tool's pattern: **the call is
the artifact.** Execution is a no-op returning `ok` ("written", not "ran");
Piary serializes the call as a `pi:cell` block, and the document runs it.
`cell(source, mode?, id?, group?)` with an `id` redefines an existing cell — the
agent's edit mechanism. A redefinition that names no `mode` keeps the mode the
cell has; one that names another changes it, and that is the cell's mode from
then on. A `group` declares artifact membership (the
`@GROUP` marker token). The semantics the agent needs (declarations as
exports, `view()`, ambient libraries, `npm:` imports, `FileAttachment`,
redefinition) live in the reactive-cells section of
`pi-extension/SKILL.md`.

Evaluation happens in the page, not in the tool. A cell is not finished until
it has run: started by the Piary app, the `cell` tool asks the page how the cell
it wrote ran and answers with that, so the agent fixes its own cell inside the
turn that wrote it (**the verdict**, below). Everything a verdict cannot see —
a dependent re-run that breaks, an artifact left showing nothing — reaches the
agent through the sweep. Feedback splits into mechanism and policy:

- **Mechanism (core).** `DocumentChat` attributes cells to the turn that
  authored them: while streaming, machine splices land between `turnAnchor`
  (where the turn opened) and `tailAnchor`, so a new or changed cell in that
  span belongs to the current turn. The lower bound matters because the page
  stays writable during a run — a cell the *writer* is editing above the turn
  is theirs, and reporting it as a failure of the agent's own would be a lie
  the agent then acts on. When such a cell fails, the component dispatches a
  `cell-failure` event — alongside the unconditional `cell-state` events and
  the `cellStates()` snapshot.

  **Failing has three doors, and one gate.** A cell can *reject* at runtime,
  never *compile* at all, or run clean and display nothing. All three are
  judged in one sweep (`reportSettledFailures`), and the gate is the same for
  each: has the turn finished writing this cell?

  **The settled gate** is that question's answer, stated as a rule. A cell is
  *settled* when no turn is streaming; while one is, a cell is settled exactly
  when its current definition — the last fence carrying its `#ID`, in document
  order — ends at or before `region.msgAnchor`, the end of the turn's last
  finalized message. Only a settled cell's verdict is read, and an artifact is
  judged to display nothing only once every member is settled. The gate is
  positional, never a delay: the sweep does wait briefly, but for the cascade
  of dependents to stop moving, not for the turn. It is also not the
  attribution gate (`turnCells`, "is this the agent's cell or the writer's?")
  — a report needs both. Held by the cell-failure tests in
  `tests/integration/editor.test.ts`, from "a cell still being streamed never reports its
  half-written source" through "a redefinition mid-stream cannot vouch for its
  own half-written source".

  That question has exactly one honest answer, and it is not a timer. A
  streaming turn splices a cell's source a chunk at a time and
  `serializeAssistant` fences each partial argument as if it were whole, so
  mid-stream the document holds a closed fence around half a string literal.
  A model pausing mid-cell is indistinguishable from one that has finished, so
  any debounce eventually reports garbage. `region.msgAnchor` sits at the end
  of the last FINALIZED message: a cell ending before it is written and done.
  Two further details are load-bearing — cells are deduped last-definition-wins
  first (or a superseded fence, safely behind the write head, vouches for the
  partial being typed right now), and every cell element's `updateComplete` is
  awaited before the sweep (`el.source = …` is a Lit property write that only
  *schedules* the recompile, so a synchronous sweep reads the previous
  partial's verdict).

  Half-written source that fails to parse is the obvious case. Half-written
  source that *parses* is the one that got through: `100 * normC` where the
  cell says `normCdf` compiles, runs, and throws `normC is not defined`. That
  reached the agent as ground truth and cost it a turn renaming a function to
  cure a bug that never existed. Which is why nothing reports from the engine's
  observer any more — a state change only asks the sweep to look again, once
  the cascade of dependents has stopped moving.

  **An artifact that displays nothing is reported as the artifact.** Naming one
  member for a whole artifact's condition is a lie the agent acts on: told
  `#TsLT2q failed`, it rewrote `#TsLT2q`, which was correct, instead of adding
  the display cell the artifact was missing.

- **The verdict (tool and host).** Once its call's message has ended, the
  `cell` tool asks the page an `input` dialog titled `piary:cell-verdict`, with
  `{"id": ID}` as its placeholder, and waits up to 15 s. The page judges the
  cell's *current* definition — the element holding the document's source, no
  update pending — once it has compiled and settled and stayed so through one
  sweep delay, and answers one of: `ok`; `failed` with the error (a compile
  failure or a rejection); `waiting` with a name, for a reference to a name no
  cell declares yet — the cell that will is usually the next one written, so
  it is not a failure; `running`, for a cell still pending after 10 s; or
  `empty`, for a cell that ran while a chart shows no data (below). A
  failure is the tool's **error result**, naming the attempt and the id to
  redefine. **The bound is the app's, not the agent's:** the third failed write
  of one cell in a run is answered `give-up`, which tells the agent to stop
  rewriting it and tell the user what is wrong.

  **A chart with no data is not `ok`.** A cell that filters its rows down to
  nothing still runs, and draws its limit lines over an empty plot: told `ok`,
  the agent reports a result nobody can see. So a `Plot.plot` chart is read
  before it is drawn (`src/notebook/plot-empty.ts`): it has no data when it
  holds at least one mark that carries data and every such mark was given zero
  rows. A rule, a frame, a text, a tip, a crosshair, an axis and a grid are
  annotations and carry none, so a limit line does not stand in for the lots
  it limits. An empty mark beside marks with rows is an answer (no lot failed)
  and is not flagged; nor is an empty value no chart draws, or a chart made by
  a mark's own `.plot()`, which the page does not see being made. The verdict
  on a cell covers the chart it shows and the charts of every cell that reads
  what it declares, transitively, once those have re-run: the cell that
  computes the data is the one to fix, and its rewrite is judged by the chart
  it feeds. `empty` names the cell showing the chart and the declared names of
  the empty values, is the tool's error result like a failure, counts toward
  the same bound, and says the way out: when no data is the true answer, tell
  the user so. The artifact's chip ends amber, `ran · no data: NAME has no
  rows`, never the green `ran`. A pi with no page to ask — in a
  terminal — is not told it has one (`PIARY_VERDICTS`
  is set only by the app), and its tool answers as written, marked not
  verified. A failure a verdict told is not steered again.

- **The lock (host).** The artifact holding the cell a run is working on
  takes no interaction: its outputs, its source pane and its controls (fold,
  fix, change…, edit, Apply, Discard, the source toggle) are `inert`, so no
  click, key or focus reaches them, and a widget in it cannot be moved. It
  lasts as long as the artifact's chip is `working`: from the `cell` call's
  start, through its verdict and every further attempt, until the run moves
  on to a cell in another artifact or ends, by finishing, failing or being
  stopped. It never outlasts the turn. Only the rendered artifact is locked.
  The chip stays readable, and the document's markdown stays the user's to
  edit, the cell's own fence included once it is shown as source. Focus that
  was inside the artifact when the lock took it goes to the document, from a
  source pane being typed in too, so Escape stops the run with no click; what
  is typed next lands at the document's caret, and the pane's buffer is there
  to Apply or Discard when the lock opens. A redraw that moves an artifact
  (a redefinition puts it under the newest answer) gives the focus back to
  whatever held it inside. A faint neutral wash breathes over the artifact
  meanwhile; the wash is a preference (`cellWorkPulse`) and the lock is not
  (ADR 0054).

- **Policy (host).** For what a verdict cannot see, the write surface steers a
  one-line `[cell report] #ID failed: ERROR`, or `[artifact report] @GROUP …`
  when a whole artifact ran and showed nothing. A cell whose verdict is being
  judged is not steered meanwhile. The steer becomes a visible user
  message in the transcript and the document — nothing is injected silently.
  Reports are capped at three per run and deduped on a **stable key** the
  document supplies, not on the message text: an artifact report used to list
  the names its cells declared, so the identical complaint one identifier later
  counted as new and spent another slot of the budget. A fresh prompt resets
  it, and the verdicts' per-cell count with it. Once the run is over, nothing
  is sent to pi on the app's own initiative — the red rail is the report, the
  agent's skill says so, and the source is one click away in the artifact's own
  pane.

## Files and build notes

`FileAttachment(name)` reads a workspace file: `name` is a path from the
workspace root, with or without a leading `/` (`"sales.csv"`,
`"/data/q1.json"`). The host hands the engine the URL of that root
(`NotebookEngine`'s `fileBase`), and without one `name` resolves against
`document.baseURI`, as notebook-kit's own does. In the desktop app the root is
`piary-workspace://localhost/`, which Rust answers read-only
(`src-tauri/src/workspace_files.rs`): a path that steps out of the workspace
(`..`, or a symlink leading out), a hidden file or directory (`.env`, `.git/`),
and a file over 50 MiB are refused as not found, the same answer a missing file
gets. A workspace that is the filesystem root or the home directory — what a
launch from Finder without `PI_CWD` resolves to — serves nothing. Nothing is
cached, so a cell that re-runs reads the file as it is now.

What this opens: cells run when a document opens and may reach the network, so
a cell in any document opened in a workspace can read that workspace's
non-hidden files and send them on. That is the same reach a cell's code has
wherever it runs, bounded here to the workspace; limiting what a cell may
fetch is a separate question.
Attachments come through their own scheme, `piary-file://` (ADR 0026).

Bundling note: the engine's stdlib imports the Observable Inputs stylesheet,
so a bundler emits a CSS file for it (the app's Vite build splits it into the
engine's chunk; the e2e harness links `demo/harness-app.css`). A page must load it, or
`Inputs` widgets render unstyled. `dist/styles.css` separately inlines the
Inspector stylesheet, remapped onto Piary theme tokens in
`src/styles/notebook.css`.

## Open decisions

These are choices deferred on purpose, not gaps:

- **Sandboxing.** Cells run in the page, consistent with pi's local trust
  model (the agent already runs tools locally). Iframe isolation is the
  in-page alternative for a host that shares a page between people.
- **Database-backed cells.** `sql` and data-loader cells need drivers outside
  the page; they currently import as inert text.

## Test map

Each suite pins one layer's invariants:

| Suite | Pins |
| --- | --- |
| `tests/integration/engine.test.ts` | reactivity, redefinition, typed syntax errors, stale-observer guard, background pump (dead-rAF suite), `npm:` CDN rewriting, `ojs` cells (named, block, unnamed, `viewof`, the names they declare and their readers) |
| `tests/integration/cell-errors.test.ts` | what a failed cell shows: a `viewof` cell under its source name, and which member of an artifact failed |
| `tests/integration/cell-lock.test.ts` | the lock on a cell a run is working on: by tone, with the wash off, released when the run moves to another artifact or the turn ends, the source pane inside it and the markdown outside, focus handed to the document, an edit buffer kept through it |
| `tests/unit/cells.test.ts` | marker round-trip, fences-in-fences, unclosed fences, unknown modes, widget anchors, `cell` tool serialization and fallbacks, artifact derivation and anchoring, the scope chip, short cell ids |
| `tests/integration/editor.test.ts` | the artifact frame in a real editor: hidden member fences, a pane edit reaching its fence, one shared undo, an agent redefinition reaching an open pane, the settled gate on all three failure doors — and edit mode: a read-only idle pane, buffered keystrokes, Apply as one transaction, Discard, the pane's own undo, a fenced source round trip, an unclosed fence keeping its editor, and a late member getting one |
| `tests/unit/delete-segment.test.ts` | removing ONE segment: every kind goes alone, a prompt keeps its answer (and `deleteCell` still does not), the fold marker that travels, an artifact's every declaration, the trailing slot refused, an emptied page handed back whole, and what the rebuilt transcript makes of half a turn |
| `tests/unit/transcript.test.ts`, `tests/unit/document-replay.test.ts` | replaying a document as a transcript: every `tool_use` answered, every `tool_result` behind its call, a redefinition still naming the cell it redefines |
