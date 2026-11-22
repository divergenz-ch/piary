Using batches.csv and spec.md: compute which furoic acid batches this quarter fail HPLC purity or Karl Fischer moisture limits. Plot both against the spec limits, flag failing lots, list failing lot IDs in a table. No paragraphs. Show the code.

<!-- pi:tool bash #toolu_01HG8Ej6azFWr7kUXw3vWX8Y -->

```json
{
  "command": "cat spec.md; head -5 batches.csv; wc -l batches.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_01DExkLsrFhHbjJA725c91be -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 150
}
```

<!-- pi:result #toolu_01HG8Ej6azFWr7kUXw3vWX8Y -->

```
# Furoic acid (2-furoic acid), release specification

A batch is released only if it meets every limit below.

| Test | Method | Limit |
|---|---|---|
| Purity | HPLC, area % | >= 99.0 % |
| Moisture | Karl Fischer | <= 0.50 % |

A value exactly at the limit is within spec.
batch,date,line,purity_pct,moisture_pct
B-2601,2026-08-03,L1,99.4,0.31
B-2602,2026-08-05,L2,99.2,0.28
B-2603,2026-08-07,L1,99.6,0.22
B-2604,2026-08-10,L2,99.3,0.35
      31 batches.csv
```

<!-- pi:result #toolu_01DExkLsrFhHbjJA725c91be -->

````
---
name: view-templates
description: Payload schemas for the `view` tool — render data as a visual block (diff, file-tree, table, cards, matches, properties) in the Piary document — semantics for the `cell` tool, which writes reactive code cells that run in the document, and the `canvas_edit` tool, which changes prose already in it. Read before calling `view`, `cell` or `canvas_edit`.
---

# View templates

`view(template, data)` renders `data` as a widget block in the Piary
document. The call is the artifact — it computes nothing and returns `ok`.
In any other markdown renderer the block degrades to a plain JSON code
fence, so only send data that also reads as JSON.

Pick the template whose shape fits; a payload that does not fit is refused
with the reason, so match the shapes below exactly.

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
- Files: `FileAttachment("data/sales.csv")` reads a workspace file, the path
  from the workspace root — `.json()`, `.csv({typed: true})`, `.text()`,
  `.arrayBuffer()`. Read data from its file this way rather than copying its
  values into the source: the cell then shows the file, and follows it when it

[97 more lines in file. Use offset=151 to continue.]
````

<!-- pi:thinking -->

I need to figure out what "this quarter" refers to, so I'm checking the dates and the range of the data.

<!-- pi:tool bash #toolu_011DxTeaeYsJLLCiVMXvz34b -->

```json
{
  "command": "cut -d, -f1-2 batches.csv | sed -n '2p;$p'; awk -F, 'NR>1&&($4<99.0||$5>0.5)' batches.csv; awk -F, 'NR>1{print substr($2,1,7)}' batches.csv|sort|uniq -c; grep -c '' batches.csv; awk -F, 'NF!=5||$4==\"\"||$5==\"\"' batches.csv",
  "timeout": 10
}
```

<!-- pi:result #toolu_011DxTeaeYsJLLCiVMXvz34b -->

```
B-2601,2026-08-03
B-2630,2026-10-09
B-2611,2026-08-26,L2,98.6,0.30
B-2619,2026-09-14,L1,99.3,0.62
B-2624,2026-09-25,L2,98.9,0.32
  13 2026-08
  13 2026-09
   4 2026-10
31
```

<!-- pi:thinking -->

I'm weighing whether "this quarter" means Q4, which would only cover four batches, or the whole dataset spanning August to October. Since the data is a single set, I'm leaning toward using all rows with a short label, and I'm considering whether a quarter dropdown would be worth adding or whether that's overkill.

I'm settling on a title that states the date range the data covers.

<!-- pi:block -->

<!-- pi:cell js #8CH3kR -->

```js
const rows = (await FileAttachment("batches.csv").csv({typed: true})).map(d => ({...d, date: new Date(d.date), failP: d.purity_pct < 99.0, failM: d.moisture_pct > 0.50, fail: d.purity_pct < 99.0 || d.moisture_pct > 0.50}));
const chart = (key, limit, label, failKey) => Plot.plot({
  title: `${label} (limit ${limit.t})`, width: 720, height: 260, grid: true, x: {label: null}, y: {label, domain: limit.dom},
  marks: [
    Plot.ruleY([limit.v], {stroke: "crimson", strokeDasharray: "6,4"}),
    Plot.line(rows, {x: "date", y: key, stroke: "#888"}),
    Plot.dot(rows, {x: "date", y: key, fill: d => d[failKey] ? "crimson" : "steelblue", r: d => d[failKey] ? 6 : 3.5, tip: true, title: d => `${d.batch} ${d[key]}`}),
    Plot.text(rows.filter(d => d[failKey]), {x: "date", y: key, text: "batch", dy: -12, fill: "crimson"})
  ]});
display(chart("purity_pct", {v: 99.0, t: "≥ 99.0 %", dom: [98.4, 100]}, "HPLC purity, area %", "failP"));
display(chart("moisture_pct", {v: 0.50, t: "≤ 0.50 %", dom: [0, 0.7]}, "Karl Fischer moisture, %", "failM"));
display(Inputs.table(rows.filter(d => d.fail).map(d => ({
  "Lot": d.batch, Date: d.date.toISOString().slice(0,10), Line: d.line, "Purity %": d.purity_pct, "Moisture %": d.moisture_pct,
  "Fails": [d.failP && "purity", d.failM && "moisture"].filter(Boolean).join(" + ")
}))));
```

<!-- pi -->

The cell above reads `batches.csv`, plots both tests against their limits, flags failing lots in red, and lists them in a table. I haven't seen it run.

I checked the data with awk. These three lots fail:
- **B-2611:** purity 98.6 (below 99.0)
- **B-2619:** moisture 0.62 (above 0.50)
- **B-2624:** purity 98.9 (below 99.0)

I used all 30 lots, which run 2026-08-03 to 2026-10-09, as "this quarter". If you mean calendar Q4 only, that is 4 lots (October) and none of them fail.

<!-- you -->

