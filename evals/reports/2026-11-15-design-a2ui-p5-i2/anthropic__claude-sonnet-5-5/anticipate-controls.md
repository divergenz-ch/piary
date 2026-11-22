Draw me an Archimedean spiral.

<!-- pi:tool read #toolu_016D2B6u8jRiog7jHorVJ6bw -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 120
}
```

<!-- pi:result #toolu_016D2B6u8jRiog7jHorVJ6bw -->

````
---
name: view-templates
description: Read before calling `cell`, `canvas_edit` or `view` — the semantics of reactive code cells (what parses, how controls and state work), how `canvas_edit` changes prose already in the document, the payload schemas of the view templates (diff, file-tree, table, cards, matches, properties), and how to compose an `a2ui` answer to look at (stat tiles, decision matrices, charts, explainers whose sliders recompute).
---

# View templates

`view(template, data)` renders `data` as a widget block in the Piary
document. The call is the artifact — it computes nothing and returns `ok`.
In any other markdown renderer the block degrades to a plain JSON code
fence, so only send data that also reads as JSON.

Pick the template whose shape fits; a payload that does not fit is refused
with the reason, so match the shapes below exactly. An answer to look at is
`a2ui` (below); the others show data as it is.

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

For ps/df-shaped output, shown as it came. Cells are strings, numbers,
booleans, or null; numeric columns right-align automatically. Figures you
worked out are an `a2ui` answer, not a table.

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

## a2ui — an answer to look at

The default for anything presentational: stat tiles, a comparison or a
decision, a chart, a table of figures, a form, an explainer to play with. The
app draws it in Piary's design, so the payload says what to show and never how
it looks. The `view` tool's description holds the shape, a complete example
and every component's props; this section is how to compose them.

- **Glance board** (KPIs, a week's numbers): a `## ` Text heading, a Row of
  `Stat`s (value, `delta` as a number, `note: "vs 380 last week"`, `good:
  "down"` for times, costs and backlogs, omitted when neither direction is
  news), then a `Chart` of the series, then a `Callout` with what to act on.
- **Decision** (vendors, plans, options): `Compare` with one option object
  per row of the ask, a criterion per attribute, `must` for the hard
  requirement (`{"oneOf": ["yes"]}`, `{"min": 60}`), `best` where lower or
  higher wins, and `pick` set to your recommendation; a `Callout` says why.
  A Callout is one or two short sentences; the rest is prose under the view.
- **Results to read** (benchmarks, a survey): a `Chart` and the `Table` it
  came from, or a Row of Stats for the headline numbers. Values spanning
  orders of magnitude take `yScale: "log"`. Several series come as long rows
  with `series` (`[{size: "1 KB", impl: "v1", ms: 0.08}, …]`) or as wide rows
  with `y` a list of keys (`[{answer: "Setup was easy", agree: 68, …}]`); bars
  of one category side by side take `layout: "group"`. Ordered series — a
  rating, disagree → neutral → agree — take `scheme: "diverging"` (a neutral
  middle) or `"sequential"`, in the order of the scale.
- **Scenarios** (a balance over time at three rates): a line `Chart` of the
  curve, one series per scenario, so the reader sees when it runs out or
  turns, and a Stat per scenario with the answer. Draw it with a `series`:
  a running balance starts in `start` and reads last step's value as
  `prev_<column>` (`"cash": "prev_cash + prev_revenue - burn"`), one column
  per scenario named in the Chart's `labels`. Check the figures with `bash`
  when it is more than arithmetic you are sure of.
- **Explainer** (compound interest, a loan): the inputs in `dataModel`, a
  `Slider` per input bound to it, `Stat`s whose `value` is a `calc`, a Chart
  or Table whose data is a `series` over the same paths, its `to` bound to
  the slider it runs to. Everything follows the sliders with no code. Give a slider a sensible `max` and `steps` (the
  number of divisions: 0–15 in 0.5s is `steps: 30`).

Rules a payload is refused for, one fault per refusal: an id with a hyphen;
a child id that no component has; a prop the component does not take (no
`color`, `style`, `variant: "h1"`); `good: null`; a Slider without `max`;
`Card` with `children` (it takes one `child`); ChoicePicker `value` not a list
of strings. A refusal names the fault at a JSON pointer
(`/components/3/good`): fix that one and call again.

A cell is the fallback, for what a surface cannot do: data read from a
workspace file (`FileAttachment`), a calculation the user asked to see or edit
as code, a drawing, a simulation or an animation, and any change to an
existing cell.

[184 more lines in file. Use offset=121 to continue.]
````

<!-- pi:thinking -->

I'm turning the drawing into a cell, so the controls need to cover the number of turns and the spacing a. I'll check how the cell's semantics should drive the sliders.

<!-- pi:tool bash #toolu_0117hToHKVbSpMtWxdGWm6be -->

```json
{
  "command": "grep -n -i -A12 \"reactive-cells\\|viewof\\|Inputs\\.\" <repo>/pi-extension/SKILL.md | head -90",
  "timeout": 10
}
```

<!-- pi:result #toolu_0117hToHKVbSpMtWxdGWm6be -->

````
153:  `(function* () { yield … })()`), classic `viewof`/`mutable` syntax, and
154-  assignment to undeclared names (`x = 1` → "Assignment to external
155-  variable"; always declare with `const`/`let`).
156-- The inverse is strict: a cell that starts with a declaration renders
157-  **nothing** — even when its value is a DOM node or a yielding generator.
158-  `const anim = (function* () { … yield canvas })()` animates invisibly.
159-  Put anything the user should see in its own bare-expression cell (or
160-  call `display(…)`); declaration cells are for data, not display.
161-- Reference other cells' names directly — no imports between cells. The
162-  runtime tracks dependencies and re-runs in topological order.
163:- `view(…)` wraps an input into a value: `const gain = view(Inputs.range([0, 10]))`
164-  renders a slider and gives dependents the live number.
165-- Interactive state belongs in the dataflow graph, not in DOM listeners:
166-  route it through `view()` (or a cell that re-exports it) so other cells,
167-  the host, and the agent can read it. A widget that keeps its state in raw
168-  DOM event handlers is invisible to everyone but the user's eyes.
169-  `view()`-routed state also survives reloads: the host persists it in the
170-  session transcript and restores it into the widgets on boot — you never
171-  write or read that yourself.
172-- State with no widget — a game board, a canvas, a drawing, anything the
173-  user changes by clicking your own DOM — goes through `state`, which is a
174-  `view()` that renders nothing:
175-
--
260:is its own `view(Inputs.*)` cell in the artifact's group, and its default draws
261-exactly what was asked:
262-
263-```js
264:const turns = view(Inputs.range([1, 20], {label: "Turns", step: 1, value: 6}))
265-```
266-
267-A few controls that matter beat one per constant. When a request changes a
268-property ("make it red", "thicker"), put that property on a control whose
269:default is the value asked for (`Inputs.color({label: "Colour", value: "#ff0000"})`)
270-rather than writing the value into the drawing, because the next request is
271-usually "a bit less".
272-
273-**Keep what the user set.** A control the user has moved keeps their value
274-when you redefine its cell, as long as the new definition declares the same
275-name. A changed range or label keeps it, but a renamed control starts again
276-from its default. So change the cell the request is about, and when a
277-control must change, keep its export name. Values set through
278-`state(key, …)` survive a redefinition the same way, by key. A prompt that opens
279-with `[cell values] {…}` carries what the user has set right now, by export
280-name. Read it before you change a control, and keep those values unless you
281-are asked to change them.
````

<!-- pi:artifact @spiral -->

<!-- pi:cell js #MyhZEC -->

```js
const turns = view(Inputs.range([1, 20], {label: "Turns", step: 1, value: 5}))
```

<!-- pi:cell js #s8dhqa -->

```js
const spacing = view(Inputs.range([2, 30], {label: "Spacing a (r = a·θ)", step: 1, value: 10}))
```

<!-- pi:cell js #ge9jpV -->

```js
const lineWidth = view(Inputs.range([0.5, 8], {label: "Line width", step: 0.5, value: 2}))
```

<!-- pi:cell js #YeasqF -->

```js
const stroke = view(Inputs.color({label: "Colour", value: "#3366cc"}))
```

<!-- pi:artifact @spiral -->

<!-- pi:cell js #xSW1fV -->

```js
{
  const n = Math.max(200, turns * 100), max = turns * 2 * Math.PI;
  const R = spacing * max + 10, S = 420;
  const pts = d3.range(n + 1).map(i => { const t = max * i / n, r = spacing * t; return [r * Math.cos(t), -r * Math.sin(t)]; });
  const d = "M" + pts.map(p => p[0].toFixed(2) + "," + p[1].toFixed(2)).join("L");
  return htl.html`<svg viewBox="${-R} ${-R} ${2*R} ${2*R}" width="${S}" height="${S}">
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${lineWidth * R / (S/2) / 1}" stroke-linecap="round"/></svg>`;
}
```

<!-- pi -->

I've drawn an Archimedean spiral, r = a·θ, with controls for the number of turns, the spacing a, the line width and the colour. I haven't looked at the rendered drawing, so I can't confirm it displays correctly.

<!-- you -->

