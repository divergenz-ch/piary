I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:tool read #toolu_01Nu1YNt5QAxnS2FfyN7Gb1f -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_01Nu1YNt5QAxnS2FfyN7Gb1f -->

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
  changes. Hidden files (`.env`) are not served.
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

[46 more lines in file. Use offset=201 to continue.]
````

<!-- pi:thinking -->

I'm planning a dashboard with a data cell, KPI cards showing deltas, and a bar chart of daily opened items. I've checked that the Mon–Fri sum comes to 412. For the backlog, an increase is bad, so I'm weighing whether to avoid custom colors and rely on arrows and text to show direction instead, keeping it simple.

<!-- pi:block -->

<!-- pi:artifact @desk -->

<!-- pi:cell js #zPWw8W -->

```js
const kpis = [
  {name: "Opened", now: 412, prev: 380, unit: "", good: "neutral"},
  {name: "Closed", now: 398, prev: 371, unit: "", good: "up"},
  {name: "Median first reply", now: 2.4, prev: 3.1, unit: " h", good: "down"},
  {name: "CSAT", now: 91, prev: 88, unit: "%", good: "up"},
  {name: "Backlog", now: 57, prev: 43, unit: "", good: "down"}
];
const opened = [["Mon",96],["Tue",88],["Wed",79],["Thu",81],["Fri",68]].map(([day,n])=>({day,n}));
```

<!-- pi:cell js #LiMvBh -->

```js
htl.html`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
${kpis.map(k=>{
  const d = +(k.now-k.prev).toFixed(1), pct = Math.round(d/k.prev*100);
  const ok = k.good==="neutral" ? null : (k.good==="up") === (d>0);
  const mark = ok===null ? "" : ok ? "✓ better" : "✗ worse";
  return htl.html`<div style="border:1px solid #8884;border-radius:10px;padding:12px">
    <div style="opacity:.7;font-size:.85em">${k.name}</div>
    <div style="font-size:2em;font-weight:600">${k.now}${k.unit}</div>
    <div style="font-size:.85em">${d>0?"▲":"▼"} ${Math.abs(d)}${k.unit} (${pct>0?"+":""}${pct}%) vs ${k.prev}${k.unit} ${mark}</div>
  </div>`;})}
</div>
```

<!-- pi:cell js #zdhecb -->

```js
Plot.plot({title:"Tickets opened, Mon–Fri", height:200, y:{grid:true,label:null}, x:{label:null,domain:opened.map(d=>d.day)},
  marks:[Plot.barY(opened,{x:"day",y:"n"}), Plot.text(opened,{x:"day",y:"n",text:"n",dy:-6}), Plot.ruleY([0])]})
```

<!-- pi -->

Nested template likely tripped on the parser; use a map with string building.

<!-- pi:block -->

<!-- pi:artifact @desk -->

<!-- pi:cell js #LiMvBh -->

```js
(() => {
  const card = k => {
    const d = +(k.now-k.prev).toFixed(1), pct = Math.round(d/k.prev*100);
    const ok = k.good==="neutral" ? null : (k.good==="up") === (d>0);
    const mark = ok===null ? "" : ok ? "✓ better" : "✗ worse";
    const el = htl.html`<div style="border:1px solid #8884;border-radius:10px;padding:12px"></div>`;
    el.innerHTML = `<div style="opacity:.7;font-size:.85em">${k.name}</div>
      <div style="font-size:2em;font-weight:600">${k.now}${k.unit}</div>
      <div style="font-size:.85em">${d>0?"▲":"▼"} ${Math.abs(d)}${k.unit} (${pct>0?"+":""}${pct}%) vs ${k.prev}${k.unit} ${mark}</div>`;
    return el;
  };
  const grid = htl.html`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px"></div>`;
  kpis.forEach(k => grid.append(card(k)));
  return grid;
})()
```

<!-- pi -->

I built a dashboard with five KPI cards and a bar chart of tickets opened Mon–Fri. I haven't seen it render, so check that it displays. Each card shows this week's value, the change against last week, and whether that change is better or worse.

- **Better:** closed, median first reply, and CSAT.
- **Worse:** backlog is up 14 (+33%). Closed is up 27 against 32 more opened, so the queue grew.
- **Neutral:** opened is up 8%, which I don't score as good or bad.
- **Daily opened:** volume fell through the week, from 96 on Monday to 68 on Friday. The five days add up to the 412 you gave.

The numbers sit in one cell, `kpis`, plus the `opened` list. Next Monday, edit those values and the cards and chart update.

<!-- you -->

