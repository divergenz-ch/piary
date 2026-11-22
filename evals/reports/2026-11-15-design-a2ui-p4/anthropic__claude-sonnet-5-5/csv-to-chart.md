Show me monthly revenue from sales.csv as a chart I can paste in a deck. Last year, one point per month.

<!-- pi:tool bash #toolu_01DWSeUeGcn516CCbh6zoUo2 -->

```json
{
  "command": "head -5 sales.csv; wc -l sales.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_01BtGePp7hmAaryKk5s2SSGW -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 120
}
```

<!-- pi:result #toolu_01DWSeUeGcn516CCbh6zoUo2 -->

```
date,region,product,units,revenue
2025-01-01,West,Pallets,57,1876
2025-01-19,North,Drums,104,9615
2025-01-20,South,Pallets,155,5101
2025-01-21,South,Drums,134,12389
      73 sales.csv
```

<!-- pi:result #toolu_01BtGePp7hmAaryKk5s2SSGW -->

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
- **Results to read** (benchmarks, a survey): a `Chart` and the `Table` it
  came from, or a Row of Stats for the headline numbers. Values spanning
  orders of magnitude take `yScale: "log"`. Several series come as long rows
  with `series` (`[{size: "1 KB", impl: "v1", ms: 0.08}, …]`) or as wide rows
  with `y` a list of keys (`[{answer: "Setup was easy", agree: 68, …}]`); bars
  of one category side by side take `layout: "group"`.
- **Scenarios** (runway at three growth rates): compute the rows yourself (with
  `bash` when it is more than arithmetic you are sure of) and pass them as
  literal `data` and `rows`, one row per month or step, plus a Stat per
  scenario. `series` cannot read the previous row, so a running balance that
  depends on last month is a literal, unless it has a closed form.
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

# Reactive cells

`cell(source, mode?, id?, group?)` writes a live code cell into the document. The
call is the cell — it returns `ok` immediately ("written", not "ran"); the
code executes in the document's dataflow graph and re-runs whenever a cell

[178 more lines in file. Use offset=121 to continue.]
````

<!-- pi:thinking -->

The chart needs to pull its data from the file through a cell reference. Since it's 2026, "last year" means 2025, so I should check that the date range covers that year.

<!-- pi:tool bash #toolu_01D44JJrVdH7WkQDY4c5e62D -->

```json
{
  "command": "cut -c1-7 sales.csv | sort | uniq -c; awk -F, 'NR>1{print $1}' sales.csv | sort | sed -n '1p;$p'",
  "timeout": 10
}
```

<!-- pi:result #toolu_01D44JJrVdH7WkQDY4c5e62D -->

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
2025-01-01
2025-12-20
```

<!-- pi:cell js #yRHWkH -->

```js
const rows = await FileAttachment("sales.csv").csv({typed:true});
const by = d3.rollups(rows.filter(r=>new Date(r.date).getUTCFullYear()===2025), v=>d3.sum(v,r=>r.revenue), r=>String(r.date instanceof Date? r.date.toISOString():r.date).slice(0,7)).sort((a,b)=>d3.ascending(a[0],b[0]));
const data = by.map(([m,revenue])=>({month:new Date(m+"-01T00:00:00Z"),revenue}));
Plot.plot({
  title:"Monthly revenue, 2025",
  width:800, height:420, marginLeft:60,
  x:{type:"utc", tickFormat:"%b", label:null, ticks:"month"},
  y:{label:"Revenue ($)", grid:true, tickFormat:"s"},
  marks:[Plot.lineY(data,{x:"month",y:"revenue",strokeWidth:2.5}),
         Plot.dot(data,{x:"month",y:"revenue",r:4}),
         Plot.ruleY([0])]
})
```

<!-- pi:thinking -->

I'm noticing the const declaration is why the last expression isn't showing its value, so I'll split it into separate statements to make sure the output displays.

<!-- pi:block -->

<!-- pi:cell js #yRHWkH -->

```js
const rows = await FileAttachment("sales.csv").csv({typed:true});
const by = d3.rollups(rows.filter(r=>new Date(r.date).getUTCFullYear()===2025), v=>d3.sum(v,r=>r.revenue), r=>String(r.date instanceof Date? r.date.toISOString():r.date).slice(0,7)).sort((a,b)=>d3.ascending(a[0],b[0]));
const data = by.map(([m,revenue])=>({month:new Date(m+"-01T00:00:00Z"),revenue}));
```

<!-- pi:block -->

<!-- pi:cell js #bYyigd -->

```js
Plot.plot({
  title:"Monthly revenue, 2025",
  width:800, height:420, marginLeft:60,
  x:{type:"utc", tickFormat:"%b", label:null, ticks:"month"},
  y:{label:"Revenue ($)", grid:true, tickFormat:"s"},
  marks:[Plot.lineY(data,{x:"month",y:"revenue",strokeWidth:2.5}),
         Plot.dot(data,{x:"month",y:"revenue",r:4}),
         Plot.ruleY([0])]
})
```

<!-- pi -->

The chart above shows monthly revenue for 2025, which is last year since today is in November 2026. It has 12 points, January to December, summed from `sales.csv`. It's a clean 800×420 chart with a zero baseline, so you can copy or screenshot it into a deck.

I haven't checked how the chart looks on the page, so glance at it before you paste it.

<!-- you -->

