Show me monthly revenue from sales.csv as a chart I can paste in a deck. Last year, one point per month.

<!-- pi:tool bash #toolu_014CEHqT2y4PwoDBCPoT86Nn -->

```json
{
  "command": "head -5 sales.csv; wc -l sales.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_014bKwPEFeTVfwf3nSWPC3tT -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 120
}
```

<!-- pi:result #toolu_014CEHqT2y4PwoDBCPoT86Nn -->

```
date,region,product,units,revenue
2025-01-01,West,Pallets,57,1876
2025-01-19,North,Drums,104,9615
2025-01-20,South,Pallets,155,5101
2025-01-21,South,Drums,134,12389
      73 sales.csv
```

<!-- pi:result #toolu_014bKwPEFeTVfwf3nSWPC3tT -->

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

The data file is there, so I'll chart from it in a cell. Last year was 2025 since it's 2026 now, so I'll check the date range and aggregate accordingly.

<!-- pi:tool bash #toolu_012zEzJFZ9JYfA5hC1FCJbkR -->

```json
{
  "command": "cut -c1-7 sales.csv | sort | uniq -c; awk -F, 'NR>1{m[substr($1,1,7)]+=$5}END{for(k in m)print k,m[k]}' sales.csv | sort",
  "timeout": 10
}
```

<!-- pi:result #toolu_012zEzJFZ9JYfA5hC1FCJbkR -->

```
6 2025-01
   6 2025-02
   6 2025-03
   6 2025-04
   6 2025-05
   6 2025-06
   6 2025-07
   6 2025-08
   6 2025-09
   6 2025-10
   6 2025-11
   6 2025-12
   1 date,re
2025-01 40153
2025-02 32226
2025-03 43827
2025-04 34412
2025-05 66896
2025-06 62824
2025-07 92345
2025-08 45027
2025-09 43872
2025-10 35565
2025-11 29361
2025-12 69418
```

<!-- pi:cell js #Uv7bbQ -->

```js
{
const rows = await FileAttachment("sales.csv").csv({typed: true});
const by = d3.rollups(rows.filter(r => r.date.getUTCFullYear?.() === 2025 || String(r.date).startsWith("2025")), v => d3.sum(v, d => d.revenue), r => new Date(r.date).toISOString().slice(0,7)).sort((a,b)=>d3.ascending(a[0],b[0]));
const data = by.map(([m,v]) => ({month: new Date(m+"-01T00:00:00Z"), revenue: v}));
return Plot.plot({
  width: 800, height: 420, marginLeft: 60, style: {fontSize: "14px"},
  title: "Monthly revenue, 2025",
  x: {type: "band", tickFormat: d => d3.utcFormat("%b")(d), label: null},
  y: {grid: true, label: "Revenue ($)", tickFormat: "s"},
  marks: [Plot.barY(data, {x: "month", y: "revenue", fill: "steelblue"}), Plot.ruleY([0])]
});
}
```

<!-- pi -->

I charted 2025 revenue by month from `sales.csv`, one bar per month, January to December. I took "last year" as 2025, since today is Nov 2026 and the file only has 2025 data. I haven't looked at the rendered chart, only confirmed that the cell ran.

The bars are the sum of the `revenue` column for each month. I checked those sums separately. July is the peak at $92,345, and November is the low at $29,361.

You can copy the chart or screenshot it for your deck.

<!-- you -->

