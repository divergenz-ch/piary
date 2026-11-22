---
pi: v1
session: eval-fix-conversation-pie
---

Draw a pie chart of our time split: meetings 30, coding 50, review 20.

<!-- pi -->

Here is the split as a pie chart.

<!-- pi:cell js #9f3e2a -->

```js
Plot.plot({
  marks: [
    Plot.arc([{ task: "meetings", hours: 30 }, { task: "coding", hours: 50 }, { task: "review", hours: 20 }], {
      value: "hour",
      fill: "task"
    })
  ]
})
```

<!-- you -->

The pie diagram doesn't render. Fix it.

<!-- pi:thinking -->

I'm reminding myself that the system prompt says to read the skill before using cell, which I skipped earlier, so I'll read it first. I'm also checking whether Plot.arc is a real mark, since Plot has no pie chart, and I think it exists in newer versions for drawing arcs.

I'm checking the arc detail against Plot's API and reading the skill file before going further.

<!-- pi -->

I'll read the skill first, since I skipped it the first time.

<!-- pi:tool read #toolu_0148ztBXmV84MMgJ7rBzR7ZH -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 400
}
```

<!-- pi:result #toolu_0148ztBXmV84MMgJ7rBzR7ZH -->

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
`[artifact] NAME — edit these cells by id, don't add new ones: #a, #b` — the
user is asking you to change *that* artifact. Redefine its cells by the ids
it lists and repeat their `group`.
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
workspace, not output. You do not see evaluation results directly. While
your turn is still running, the UI may steer a message shaped
`[cell report] #ID failed: ERROR` — treat it as ground truth from the
document runtime and redefine that cell by `id` with a fix. A message shaped
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

Use a cell when the user should *explore* the result (tweak a parameter,
filter data, drive a chart); use `view` for a fixed snapshot; use prose for
everything else.
````

<!-- pi:thinking -->

I spotted a typo in the value field, "hour," and realized Plot.arc isn't the right tool for a pie chart. I'll build the pie arcs with d3 and SVG instead, and redefine id 9f3e2a.

<!-- pi -->

The cause is a typo (`value: "hour"` should be `"hours"`). Also, `Plot.arc` doesn't make pie slices. I'll rebuild it with d3 and keep the same cell id.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
(() => {
  const data = [{ task: "meetings", hours: 30 }, { task: "coding", hours: 50 }, { task: "review", hours: 20 }];
  const w = 360, r = 150;
  const color = d3.scaleOrdinal().domain(data.map(d => d.task)).range(d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.hours)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.6).outerRadius(r * 0.6);
  const svg = d3.create("svg").attr("viewBox", [-w / 2, -w / 2, w, w]).attr("width", w).attr("height", w);
  svg.selectAll("path").data(arcs).join("path")
    .attr("d", arc).attr("fill", d => color(d.data.task)).attr("stroke", "white");
  svg.selectAll("text").data(arcs).join("text")
    .attr("transform", d => `translate(${label.centroid(d)})`)
    .attr("text-anchor", "middle").attr("fill", "white").attr("font-size", 13)
    .text(d => `${d.data.task} ${d.data.hours}%`);
  return svg.node();
})()
```

<!-- pi -->

I rebuilt the pie chart in the same cell (#9f3e2a). I can't see the rendered output, so I haven't confirmed it displays.

There were two problems:
- **Typo:** `value: "hour"` didn't match the `hours` field.
- **Wrong mark:** `Plot.arc` draws arcs, not pie slices. Observable Plot has no pie chart.

The new version uses d3's pie and arc functions to draw the three slices: coding 50%, meetings 30% and review 20%. Each slice is labeled with its name and percentage.

If it still doesn't show up, send me the error message and I'll fix it.

<!-- you -->

