---
pi: v1
session: eval-computed-replaces-typed
---

Score the three vendors in vendors.csv, price 40%, support 30%, uptime 30%.

<!-- pi -->

| Vendor | Score |
| --- | --- |
| Carrow | 7.4 |
| Mistral Works | 7.1 |
| Tidewell | 7.6 |

Tidewell leads on the weighted score.

<!-- you -->

Compute that from the file in a cell, with the weights as sliders, so I can change them.

<!-- pi:tool bash #toolu_01RnBgVDkUKqMzdJRWuddJZu -->

```json
{
  "command": "cat vendors.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_016oahuYrE1RSWzChKSpN83f -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 150
}
```

<!-- pi:result #toolu_01RnBgVDkUKqMzdJRWuddJZu -->

```
vendor,price,support,uptime
Carrow,6,9,8
Mistral Works,8,6,7
Tidewell,7,7,9
```

<!-- pi:result #toolu_016oahuYrE1RSWzChKSpN83f -->

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

I'm recomputing each total from its weights: Carrow comes to 7.5, Mistral 7.1, and Tidewell 7.6. That means my earlier 7.4 for Carrow was off, so I need to correct it with canvas_edit. Next I'll write the cells, sliders first and then the table, and I'm checking whether the weights need normalizing or can be used as given by dividing by their sum.

<!-- pi:block -->

<!-- pi:cell js #myMKzz -->

```js
const wPrice = view(Inputs.range([0, 100], {label: "Price weight %", step: 5, value: 40}))
```

<!-- pi:block -->

<!-- pi:cell js #DjDzh1 -->

```js
const wSupport = view(Inputs.range([0, 100], {label: "Support weight %", step: 5, value: 30}))
```

<!-- pi:block -->

<!-- pi:cell js #iGoS7K -->

```js
const wUptime = view(Inputs.range([0, 100], {label: "Uptime weight %", step: 5, value: 30}))
```

<!-- pi:block -->

<!-- pi:cell js #kQGHoE -->

```js
(() => {
  return FileAttachment("vendors.csv").csv({typed: true}).then(rows => {
    const t = (wPrice + wSupport + wUptime) || 1;
    const scored = rows.map(r => ({Vendor: r.vendor, Score: +((r.price*wPrice + r.support*wSupport + r.uptime*wUptime)/t).toFixed(2)}))
      .sort((a, b) => b.Score - a.Score);
    return htl.html`<div>${Inputs.table(scored, {rows: 3})}<p>Weights are normalised by their sum (${t}%). Leader: <b>${scored[0].Vendor}</b></p></div>`;
  });
})()
```

<!-- pi:tool canvas_edit #toolu_01AjabWwSj5ahfKgiKMGTWEc -->

```json
{
  "oldText": "| Carrow | 7.4 |",
  "newText": "| Carrow | 7.5 |"
}
```

<!-- pi:result #toolu_01AjabWwSj5ahfKgiKMGTWEc error -->

```
not applied: the page did not answer. No Piary page is open to apply this. Write the change in your answer and say you could not apply it; do not edit the conversation's file.
```

<!-- pi -->

I added three weight sliders and a scores table that reads `vendors.csv`. The cells have not been seen running yet. The weights start at 40/30/30 and are divided by their sum, so they don't have to total 100.

My first table had an error. Carrow's weighted score is 7.5, not 7.4 (6×0.4 + 9×0.3 + 8×0.3). Mistral Works is 7.1 and Tidewell is 7.6, so Tidewell still leads. I couldn't correct the earlier table because no page was open to apply the edit, so please change that cell to 7.5.

<!-- you -->

