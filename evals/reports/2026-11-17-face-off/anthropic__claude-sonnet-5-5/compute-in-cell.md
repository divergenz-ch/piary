What is the monthly payment on a 300 000 CHF mortgage at 1.8% a year over 25 years? Show the calculation so I can change the numbers.

<!-- pi:tool read #toolu_01Hk4bwBb5osehZekqtbHY1U -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 120
}
```

<!-- pi:result #toolu_01Hk4bwBb5osehZekqtbHY1U -->

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

[127 more lines in file. Use offset=121 to continue.]
````

<!-- pi -->

Inputs and result in cells.

<!-- pi:block -->

<!-- pi:cell js #zkxiu9 -->

```js
const principal = view(Inputs.range([10000, 2000000], {value: 300000, step: 5000, label: "Loan (CHF)"}))
```

<!-- pi:block -->

<!-- pi:cell js #Qe36eF -->

```js
const rate = view(Inputs.range([0, 8], {value: 1.8, step: 0.05, label: "Rate (% / year)"}))
```

<!-- pi:block -->

<!-- pi:cell js #zfBrfU -->

```js
const years = view(Inputs.range([1, 40], {value: 25, step: 1, label: "Years"}))
```

<!-- pi:cell js #4uEEPe -->

```js
(() => {
  const r = rate / 100 / 12, n = years * 12;
  // M = P·r / (1 − (1+r)^−n)
  const m = r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
  const f = d3.format(",.2f");
  return htl.html`<div><b>Monthly payment: CHF ${f(m)}</b><br>
  Total paid: CHF ${f(m * n)} · interest: CHF ${f(m * n - principal)}<br>
  <small>M = P·r / (1 − (1+r)^−n), r = rate/12, n = years×12</small></div>`;
})()
```

<!-- pi:tool bash #toolu_016kCw5xpXKCdxN1B2jefVwD -->

```json
{
  "command": "python3 -c \"r=.018/12;n=300;print(300000*r/(1-(1+r)**-n))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_016kCw5xpXKCdxN1B2jefVwD -->

```
1242.5556160205415
```

<!-- pi -->

The monthly payment is about **CHF 1,242.56**, assuming a standard annuity with equal monthly payments. I checked this figure separately with Python.

The calculation is in the cells above. Change the loan, rate or years with the sliders and the result updates. It uses M = P·r / (1 − (1+r)^−n), where r is the annual rate divided by 12 and n is the number of years times 12.

<!-- you -->

