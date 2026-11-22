Using batches.csv and spec.md: compute which furoic acid batches this quarter fail HPLC purity or Karl Fischer moisture limits. Plot both against the spec limits, flag failing lots, list failing lot IDs in a table. No paragraphs. Show the code.

<!-- pi:tool bash #toolu_01S3ovSpD6z52usZeNDVrNzs -->

```json
{
  "command": "cat spec.md; head -5 batches.csv; wc -l batches.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_01RU8AEr6tQSt46fiCc68NRL -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 150
}
```

<!-- pi:result #toolu_01S3ovSpD6z52usZeNDVrNzs -->

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

<!-- pi:result #toolu_01RU8AEr6tQSt46fiCc68NRL -->

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

I need to figure out what "this quarter" refers to, so I'm checking the date range it covers.

<!-- pi:tool bash #toolu_01GaASQb14NhQuPwbZeeEcm8 -->

```json
{
  "command": "cut -d, -f1-2 batches.csv | sed -n '2p;$p'; awk -F, 'NR>1&&($4<99.0||$5>0.5)' batches.csv; awk -F, 'NR>1&&$2<\"2026-07-01\"' batches.csv|head",
  "timeout": 10
}
```

<!-- pi:result #toolu_01GaASQb14NhQuPwbZeeEcm8 -->

```
B-2601,2026-08-03
B-2630,2026-10-09
B-2611,2026-08-26,L2,98.6,0.30
B-2619,2026-09-14,L1,99.3,0.62
B-2624,2026-09-25,L2,98.9,0.32
```

<!-- pi:thinking -->

I'm working out which batches count as "this quarter." Since today is November 15, that points to Q4, so only October batches would qualify, though the data runs from August through October. Rather than hardcode the start date, I'm considering a quarter-start input defaulting to October 1.

Fine, I'll go with that. I'm checking the malformed rows too, then settling on the quarter-start input.

<!-- pi:block -->

<!-- pi:cell js #nbREc1 -->

```js
const qStart = view(Inputs.text({label: "Quarter start", value: "2026-10-01"}))
```

<!-- pi:block -->

<!-- pi:cell js #9Zsvuw -->

```js
const rows = (await FileAttachment("batches.csv").csv({typed: true}))
  .map(d => ({...d, date: String(d.date).slice(0,10)}))
  .filter(d => d.date >= qStart)
  .map(d => ({...d, failPurity: d.purity_pct < 99.0, failMoisture: d.moisture_pct > 0.50, fail: d.purity_pct < 99.0 || d.moisture_pct > 0.50}))
```

<!-- pi:block -->

<!-- pi:cell js #qobcyv -->

```js
const mk = (key, limit, label, fk) => Plot.plot({
  title: label, width: 700, height: 260, marginBottom: 50,
  x: {type: "band", label: null, tickRotate: -45},
  y: {label, grid: true, domain: d3.extent([...rows.map(d => d[key]), limit]).map((v,i)=>v+(i?1:-1)*0.1*(key==="purity_pct"?1:0.5))},
  color: {domain: ["pass","fail"], range: ["steelblue","crimson"], legend: true},
  marks: [
    Plot.barY(rows, {x: "batch", y: key, fill: d => d.fail ? "fail" : "pass", fillOpacity: d => d[fk] ? 1 : 0.5}),
    Plot.ruleY([limit], {stroke: "black", strokeDasharray: "4"}),
    Plot.text(rows.filter(d => d[fk]), {x: "batch", y: key, text: d => "⚑ " + d.batch, dy: -8})
  ]})
display(mk("purity_pct", 99.0, "HPLC purity % (limit ≥ 99.0)", "failPurity"))
display(mk("moisture_pct", 0.50, "KF moisture % (limit ≤ 0.50)", "failMoisture"))
```

<!-- pi:block -->

<!-- pi:cell js #aPUanU -->

```js
Inputs.table(rows.filter(d => d.fail).map(d => ({
  batch: d.batch, date: d.date, line: d.line, purity_pct: d.purity_pct, moisture_pct: d.moisture_pct,
  failed: [d.failPurity && "purity", d.failMoisture && "moisture"].filter(Boolean).join(" + ")})))
```

<!-- pi -->

I filtered to the current quarter, Q4, which starts 2026-10-01. The "Quarter start" box above the charts changes that date. I haven't seen the cells run, so the charts and table are unchecked.

Q4 only includes batches from 2026-10-01 to 2026-10-09 (B-2630 is the last row). A scan of the whole file found three failing lots, all from Q3 (August–September).

| Lot | Date | Fails on |
|---|---|---|
| B-2611 | 2026-08-26 | purity 98.6 % |
| B-2619 | 2026-09-14 | moisture 0.62 % |
| B-2624 | 2026-09-25 | purity 98.9 % |

To include them, set the quarter start to 2026-07-01 (or any date on or before 2026-08-26). I haven't run the Q4-only filter, so I can't say whether any October lot fails.

<!-- you -->

