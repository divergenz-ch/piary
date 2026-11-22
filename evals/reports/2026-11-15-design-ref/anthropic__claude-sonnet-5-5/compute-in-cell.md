What is the monthly payment on a 300 000 CHF mortgage at 1.8% a year over 25 years? Show the calculation so I can change the numbers.

<!-- pi:tool read #toolu_01QrLGzkNPhVMusYxpAJbG9A -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 120
}
```

<!-- pi:result #toolu_01QrLGzkNPhVMusYxpAJbG9A -->

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

I want the calculation to be something the user can edit, so I'm putting it in a reactive cell. I'll keep the setup simple: one cell holding the constants and another cell computing the result. I'm not sure yet whether the inputs should be sliders via Inputs.range, so I'm leaning toward plain constants for now.

<!-- pi:block -->

<!-- pi:cell js #ESewVe -->

```js
principal = 300000   // CHF
rate = 1.8           // % per year
years = 25

{
  const i = rate / 100 / 12, n = years * 12;
  const pay = i === 0 ? principal / n : principal * i / (1 - Math.pow(1 + i, -n));
  return md`**Monthly payment: CHF ${pay.toFixed(2)}**

Formula: P·i / (1 − (1+i)^−n), with i = ${rate}%/12, n = ${n} months.
Total paid: CHF ${(pay*n).toFixed(0)}, interest: CHF ${(pay*n-principal).toFixed(0)}.`;
}
```

<!-- pi -->

Multiple declarations in one cell; split them.

<!-- pi:block -->

<!-- pi:cell js #ESewVe -->

```js
{
  const principal = 300000;  // CHF
  const rate = 1.8;          // % per year
  const years = 25;
  const i = rate / 100 / 12, n = years * 12;
  const pay = i === 0 ? principal / n : principal * i / (1 - Math.pow(1 + i, -n));
  return md`**Monthly payment: CHF ${pay.toFixed(2)}**

Formula: P·i / (1 − (1+i)^−n), with i = ${rate}%/12, n = ${n} months.
Total paid: CHF ${(pay*n).toFixed(0)}, interest: CHF ${(pay*n-principal).toFixed(0)}.`;
}
```

<!-- pi:tool bash #toolu_01NonqaZ8Q1VRs8efKrB5p4L -->

```json
{
  "command": "python3 -c \"\ni=.018/12;n=300;print(300000*i/(1-(1+i)**-n))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01NonqaZ8Q1VRs8efKrB5p4L -->

```
1242.5556160205415
```

<!-- pi -->

Use an expression-style block instead.

<!-- pi:block -->

<!-- pi:cell ojs #ESewVe -->

```ojs
calc = {
  const principal = 300000;  // CHF
  const rate = 1.8;          // % per year
  const years = 25;
  const i = rate / 100 / 12, n = years * 12;
  const pay = i === 0 ? principal / n : principal * i / (1 - Math.pow(1 + i, -n));
  return md`**Monthly payment: CHF ${pay.toFixed(2)}**

Formula: P·i / (1 − (1+i)^−n), with i = ${rate}%/12, n = ${n} months.
Total paid: CHF ${(pay*n).toFixed(0)}, interest: CHF ${(pay*n-principal).toFixed(0)}.`;
}
```

<!-- pi -->

The monthly payment is **CHF 1,242.56**. I checked this separately with Python, and it gave the same figure.

The cell above shows the calculation. To change the numbers, edit `principal`, `rate` and `years` at the top of the cell. I haven't seen the cell render, so I can't confirm it displays correctly.

The formula is the standard annuity one: P·i / (1 − (1+i)^−n). Here i is the annual rate divided by 12, and n is the number of months, 300 for 25 years.

<!-- you -->

