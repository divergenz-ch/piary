Draw me an Archimedean spiral.

<!-- pi:tool read #call_2e837e23d6834bd48c2de5f15d9791af|fc_0234e29c791ea7f4016af04dcb424c87d2b5f83452551de6d0 -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 240
}
```

<!-- pi:result #call_2e837e23d6834bd48c2de5f15d9791af|fc_0234e29c791ea7f4016af04dcb424c87d2b5f83452551de6d0 -->

````
---
name: view-templates
description: Payload schemas for the `view` tool — render data as a visual block (diff, file-tree, table, cards, matches, properties) in the Piary document — and semantics for the `cell` tool, which writes reactive code cells that run in the document. Read before calling `view` or `cell`.
---

# View templates

`view(template, data)` renders `data` as a widget block in the Piary
document. The call is the artifact — it computes nothing and returns `ok`.
In any other markdown renderer the block degrades to a plain JSON code
fence, so only send data that also reads as JSON.

Pick the template whose shape fits. Payloads that don't fit render as the
raw fence (never an error), so match the shapes below exactly.

## diff — unified line diff

```json
{ "file": "optional/path.ts", "oldText": "before\n…", "newText": "after\n…" }
```

`oldText` and `newText` required (full multi-line strings); `file` optional.

## file-tree — collapsible path tree

```json
{ "paths": ["src/a.ts", "src/b/c.ts", "README.md"] }
```

Use for file listings (ls/find shaped output).

## table — column table

```json
{ "columns": ["PID", "CPU", "COMMAND"], "rows": [[312, 1.2, "node"], [7, 0.1, "sh"]] }
```

For ps/df-shaped output and arrays of records. Cells are strings, numbers,
booleans, or null; numeric columns right-align automatically.

## cards — result cards

```json
{ "results": [{ "title": "…", "url": "https://…", "age": "2d", "snippet": "…" }] }
```

For search-shaped results. `title` required per card; `url`, `age`,
`snippet` optional.

## matches — grouped match lines

```json
{ "matches": [{ "file": "src/a.ts", "lines": [{ "line": 12, "text": "const x = 1", "spans": [[6, 7]] }] }] }
```

For grep-shaped output, grouped by file. `spans` are optional
`[start, end)` character ranges within `text` to highlight.

## properties — key → value table

The payload IS the object:

```json
{ "name": "piary", "version": "0.1.0", "files": 42 }
```

For one small structured object. Nested values render as inline JSON —
prefer `table` for arrays of records.

# Reactive cells

`cell(source, mode?, id?, group?)` writes a live code cell into the document. The
call is the cell — it returns `ok` immediately ("written", not "ran"); the
code executes in the document's dataflow graph and re-runs whenever a cell
it references changes. In any other markdown renderer a cell degrades to a
plain code fence.

**This is not React.** JSX does not parse, `className` and Tailwind classes do
nothing, and there is no component model — a cell is a value, not a component.
Build markup with `htl.html` and ordinary `class=`:

```js
htl.html`<div class="card" style="padding:12px;border-radius:12px;background:#eef">
  <h1>${city.name}</h1><p>${temp}°</p>
</div>`
```

Reach for `Plot` for charts and `Inputs` for controls before writing markup at
all. A cell written as a React component returns `NOT OK` from this tool and
renders nothing.

Semantics (Observable notebook style):

- Top-level declarations are the cell's exports: `const data = …` defines
  `data` for every other cell. A bare expression displays its value.
- Unlike observablehq.com, classic block cells (`{ …; return x; }`) are NOT
  supported — cells are plain JavaScript, so `return` fails to parse. Use an
  IIFE (`(() => { …; return x; })()`) for multi-statement display cells.
  Also unsupported: top-level `yield` (wrap in a generator IIFE:
  `(function* () { yield … })()`), classic `viewof`/`mutable` syntax, and
  assignment to undeclared names (`x = 1` → "Assignment to external
  variable"; always declare with `const`/`let`).
- The inverse is strict: a cell that starts with a declaration renders
  **nothing** — even when its value is a DOM node or a yielding generator.
  `const anim = (function* () { … yield canvas })()` animates invisibly.
  Put anything the user should see in its own bare-expression cell (or
  call `display(…)`); declaration cells are for data, not display.
- Reference other cells' names directly — no imports between cells. The
  runtime tracks dependencies and re-runs in topological order.
- `view(…)` wraps an input into a value: `const gain = view(Inputs.range([0, 10]))`
  renders a slider and gives dependents the live number.
- Interactive state belongs in the dataflow graph, not in DOM listeners:
  route it through `view()` (or a cell that re-exports it) so other cells,
  the host, and the agent can read it. A widget that keeps its state in raw
  DOM event handlers is invisible to everyone but the user's eyes.
  `view()`-routed state also survives reloads: the host persists it in the
  session transcript and restores it into the widgets on boot — you never
  write or read that yourself.
- State with no widget — a game board, a canvas, a drawing, anything the
  user changes by clicking your own DOM — goes through `state`, which is a
  `view()` that renders nothing:

  ```js
  const board = view(state("board", Array(9).fill(null)));   // reactive, persisted
  ```

  ```js
  setState("board", next);   // write from an event handler or another cell
  ```

  Dependents re-run on every `setState`, and the value is restored *before*
  the first paint on reload, so the artifact comes back as the user left it
  rather than flashing its default. Pick a key per artifact concern
  (`"board"`, `"turn"`), not per cell. Without this, everything the user did
  is gone on reload — the single most common complaint about a cell that
  keeps its state in a closure.
- When a user's change should become document text — a checklist's checked
  items, a constant the user scrubbed in a program — dispatch
  `dispatchEvent(new CustomEvent("pi-cell-writeback", {detail: {id, source}}))`
  to replace cell `id`'s source in the document.  An unchanged source is a
  no-op, which is what ends the re-run loop; prefer `state` for values that
  do not need to survive as editable document text.
- `display(…)` shows extra values; top-level `await` works; generators
  yield streams.
- Libraries: `d3`, `Plot`, `Inputs`, `htl`, `md`, `tex` are ambient. Import
  anything else from npm: `import {mean} from "npm:d3-array"`.
- Files: `FileAttachment("/path/from/repo/root.csv")` reads a workspace file
  over the local bridge — `.json()`, `.csv({typed: true})`, `.text()`,
  `.arrayBuffer()`. Prefer it over inlining data into the source.
- One shot per name: two cells must not declare the same top-level name.
  Shared helper names used across multiple artifacts (for example an
  `lp_`-prefixed function another artifact calls) must never be declared a
  second time — redefine that cell by id.

Redefinition: pass the `id` of an existing cell (yours from an earlier
call, or a `#id` visible in the document) to replace its definition — the
latest definition wins and dependents re-run. Omit `id` for a fresh cell.

**Editing beats adding.** When the prompt opens with an artifact scope line —
`[artifact] NAME — edit by id` — the user is asking you to change *that*
artifact. Redefine its cells by the ids on their `pi:cell` markers above and
repeat their `group`.
Write a fresh cell only for material that genuinely did not exist before.
Ignoring this is what turns "make the card wider" into a second widget
sitting next to the first.

Artifact groups: cells composing one app or artifact should share a
`group` (single token, e.g. `group: "chess"`). Every member's output then
renders together as one artifact, under the answer of the turn that last
touched it — even members added many turns later — instead of scattering
through the transcript. Repeat `group` when redefining a member; only the
winning definition's group counts (omitting it ungroups the cell). A run of
cells you write back-to-back is treated as one artifact even without a
`group`, so prose belongs before or after the run, never between its cells.

The user sees the artifact as one block: its live output, with every member's
source one click away in a code pane below, editable in place.
A declaration cell shows nothing in the output pane — that is expected
inside an artifact, and no longer worth a note — but anything the user
should SEE still needs its own bare-expression cell. Treat cells as shared
workspace, not output. In Piary the `cell` call answers once the cell has
run: `ok — cell #ID ran.`, or a failed result carrying the runtime's error —
treat that as ground truth and redefine that cell by `id` with a fix before
going on. A cell `waiting on NAME` is fine if a cell you are about to write
defines `NAME`. After a few failed fixes the tool tells you to stop: then say
what is wrong and what you tried, rather than guessing again. Separately,
while your turn is still running, the UI may steer a message shaped
`[cell report] #ID failed: ERROR` about a cell that broke later — a
dependent re-run, say — and it is ground truth too. A message shaped
`[artifact report] @GROUP …` is about the whole artifact, not one cell:
usually it ran but every cell in it is a declaration, and the fix is to ADD a
bare-expression cell that returns what the user should see — not to rewrite a
cell that is already correct. Reports are capped per turn; if they stop, don't
retry blindly. After your turn ends, errors reach you only when the user
mentions them.

Cells you give the same `group` become one artifact — a block of their own in
the document, with one frame around their combined output. The block is where
it lives: the user can drag it anywhere, and it stays there. Redefine a member
by `id` to change it; a new cell with the same `group` joins it.

**Controls before they are asked for.** A cell the user will look at (a chart,
a simulation, a drawing, a calculator) comes with controls for what they are
likely to change next: a range, a count, a colour, a speed, a threshold. Each
is its own `view(Inputs.*)` cell in the artifact's group, and its default draws
exactly what was asked:

```js
const turns = view(Inputs.range([1, 20], {label: "Turns", step: 1, value: 6}))
```

A few controls that matter beat one per constant. When a request changes a
property ("make it red", "thicker"), put that property on a control whose
default is the value asked for (`Inputs.color({label: "Colour", value: "#ff0000"})`)
rather than writing the value into the drawing, because the next request is
usually "a bit less".

**Keep what the user set.** A control the user has moved keeps their value
when you redefine its cell, as long as the new definition declares the same
name. A changed range or label keeps it, but a renamed control starts again
from its default. So change the cell the request is about, and when a
control must change, keep its export name. Values set through
`state(key, …)` survive a redefinition the same way, by key. A prompt that opens
with `[cell values] {…}` carries what the user has set right now, by export
name. Read it before you change a control, and keep those values unless you
are asked to change them.

Use a cell when the user should *explore* the result (tweak a parameter,
filter data, drive a chart); use `view` for a fixed snapshot; use prose for
everything else.
````

<!-- pi:artifact @archimedean-spiral -->

<!-- pi:cell js #c38f17 -->

```js
const spiralTurns = view(Inputs.range([1, 12], {label: "Turns", step: 0.5, value: 5}))
```

<!-- pi:artifact @archimedean-spiral -->

<!-- pi:cell js #8a0dd5 -->

```js
const spiralSpacing = view(Inputs.range([5, 50], {label: "Spacing", step: 1, value: 18}))
```

<!-- pi:artifact @archimedean-spiral -->

<!-- pi:cell js #4f808e -->

```js
const spiralColor = view(Inputs.color({label: "Colour", value: "#2563eb"}))
```

<!-- pi:artifact @archimedean-spiral -->

<!-- pi:cell js #df127a -->

```js
(() => { const w = 620, h = 620, cx = w / 2, cy = h / 2; const points = Array.from({length: 1400}, (_, i) => { const t = (i / 1399) * spiralTurns * 2 * Math.PI; const r = spiralSpacing * t / (2 * Math.PI); return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; }); const d = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" "); return htl.html`<svg viewBox="0 0 ${w} ${h}" width="620" height="620" style="max-width:100%;height:auto;background:#fff;border:1px solid #ddd;border-radius:12px"><path d=${d} fill="none" stroke=${spiralColor} stroke-width="3" stroke-linecap="round"/><circle cx=${cx} cy=${cy} r="4" fill=${spiralColor}/></svg>`; })()
```

<!-- you -->

