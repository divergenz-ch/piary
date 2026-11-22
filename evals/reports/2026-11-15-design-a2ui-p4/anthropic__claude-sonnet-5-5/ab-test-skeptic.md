Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01TtG7oQCmKtgGU8Km9EimNJ -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_01NpiMZBXLSzEFortqeWUcng -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 120
}
```

<!-- pi:result #toolu_01TtG7oQCmKtgGU8Km9EimNJ -->

```
# Caravel checkout test: summary

Test ran 2026-10-01 to 2026-10-14, 50/50 split.

**Result: the new checkout lifts conversion by 12% (p = 0.004).**

Recommendation: ship to 100% on Monday.

Data: caravel_ab.csv
date,variant,visitors,conversions
2026-10-01,control,980,48
2026-10-01,new_checkout,1005,55
2026-10-02,control,1010,52
2026-10-02,new_checkout,990,51
      29 caravel_ab.csv
```

<!-- pi:result #toolu_01NpiMZBXLSzEFortqeWUcng -->

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

<!-- pi:tool bash #toolu_01JiT5aAdCkauzvBMcrHstHz -->

```json
{
  "command": "cat caravel_ab.csv; sed -n 121,298p <repo>/pi-extension/SKILL.md | grep -i -A8 FileAttachment | head -40",
  "timeout": 10
}
```

<!-- pi:result #toolu_01JiT5aAdCkauzvBMcrHstHz -->

```
date,variant,visitors,conversions
2026-10-01,control,980,48
2026-10-01,new_checkout,1005,55
2026-10-02,control,1010,52
2026-10-02,new_checkout,990,51
2026-10-03,control,995,49
2026-10-03,new_checkout,1010,54
2026-10-04,control,1005,51
2026-10-04,new_checkout,995,52
2026-10-05,control,1020,53
2026-10-05,new_checkout,985,50
2026-10-06,control,990,47
2026-10-06,new_checkout,1015,56
2026-10-07,control,1000,50
2026-10-07,new_checkout,1000,53
2026-10-08,control,985,49
2026-10-08,new_checkout,1010,52
2026-10-09,control,1015,52
2026-10-09,new_checkout,990,54
2026-10-10,control,1000,50
2026-10-10,new_checkout,1000,53
2026-10-11,control,995,48
2026-10-11,new_checkout,1005,51
2026-10-12,control,1005,51
2026-10-12,new_checkout,995,55
2026-10-13,control,990,49
2026-10-13,new_checkout,1010,53
2026-10-14,control,1010,51
2026-10-14,new_checkout,990,53
- Files: `FileAttachment("data/sales.csv")` reads a workspace file, the path
  from the workspace root — `.json()`, `.csv({typed: true})`, `.text()`,
  `.arrayBuffer()`. Read data from its file this way rather than copying its
  values into the source: the cell then shows the file, and follows it when it
  changes. Hidden files (`.env`) are not served.
- One shot per name: two cells must not declare the same top-level name.
  Shared helper names used across multiple artifacts (for example an
  `lp_`-prefixed function another artifact calls) must never be declared a
  second time — redefine that cell by id.
```

<!-- pi:cell js #Ub9PQc -->

```js
rows = await FileAttachment("caravel_ab.csv").csv({typed: true});
agg = d3.rollup(rows, v => ({n: d3.sum(v, d=>d.visitors), x: d3.sum(v, d=>d.conversions)}), d => d.variant);
c = agg.get("control"); t = agg.get("new_checkout");
pc = c.x/c.n; pt = t.x/t.n;
pp = (c.x+t.x)/(c.n+t.n);
se = Math.sqrt(pp*(1-pp)*(1/c.n+1/t.n));
z = (pt-pc)/se;
erf = x => { const s=Math.sign(x); x=Math.abs(x); const t=1/(1+0.3275911*x);
  return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x)); };
Phi = x => 0.5*(1+erf(x/Math.SQRT2));
p = 2*(1-Phi(Math.abs(z)));
seu = Math.sqrt(pc*(1-pc)/c.n + pt*(1-pt)/t.n);
htl.html`<table>
<tr><td>control</td><td>${c.x}/${c.n} = ${(pc*100).toFixed(3)}%</td></tr>
<tr><td>new_checkout</td><td>${t.x}/${t.n} = ${(pt*100).toFixed(3)}%</td></tr>
<tr><td>relative lift</td><td>${((pt/pc-1)*100).toFixed(1)}%</td></tr>
<tr><td>abs diff (95% CI, pp)</td><td>${((pt-pc)*100).toFixed(3)} [${((pt-pc-1.96*seu)*100).toFixed(2)}, ${((pt-pc+1.96*seu)*100).toFixed(2)}]</td></tr>
<tr><td>pooled two-prop z</td><td>${z.toFixed(3)}</td></tr>
<tr><td>two-sided p</td><td>${p.toFixed(3)}</td></tr></table>`
```

<!-- pi:thinking -->

I'm going to check the output directly by running a bash command to verify it.

<!-- pi:tool bash #toolu_016Pnw6bPXeTezzAetnZ2TcH -->

```json
{
  "command": "python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\na={}\nfor d in r:\n  s=a.setdefault(d['variant'],[0,0]);s[0]+=int(d['visitors']);s[1]+=int(d['conversions'])\n(cn,cx),(tn,tx)=a['control'],a['new_checkout']\npc,pt=cx/cn,tx/tn;pp=(cx+tx)/(cn+tn)\nz=(pt-pc)/math.sqrt(pp*(1-pp)*(1/cn+1/tn))\nprint(a,pc,pt,pt/pc-1,z,math.erfc(abs(z)/2**.5))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_016Pnw6bPXeTezzAetnZ2TcH -->

```
{'control': [14000, 700], 'new_checkout': [14000, 742]} 0.05 0.053 0.05999999999999983 1.1356591192256702 0.2560992560993552
```

<!-- pi -->

The summary's claim doesn't hold up. The data shows a 6% relative lift, not 12%, and it isn't statistically significant (p ≈ 0.26, not 0.004). I wouldn't sign off on shipping based on this test.

The cell above reads `caravel_ab.csv` and shows each step. I re-checked the same numbers independently in Python.

1. **Totals:** I summed visitors and conversions per variant over the 14 days.
   - Control: 700 / 14,000 = 5.0%.
   - New checkout: 742 / 14,000 = 5.3%.
2. **Lift:** 5.3 / 5.0 − 1 = **6%** relative, or +0.3 percentage points. The summary's 12% is double that.
3. **Significance:** I ran a two-proportion z-test with a pooled rate of 5.15%.
   - z = 1.14, which gives two-sided **p ≈ 0.256**.
   - The 95% confidence interval on the difference is roughly −0.2 to +0.8 percentage points, so it includes zero.

The new checkout did convert slightly better, but a gap this size is well within normal noise for about 14,000 visitors per arm. The test would need far more traffic to detect a lift of this size. I can work out how much if you'd like.

I can't tell from the file where the 12% and p = 0.004 came from. They don't match the file, so the summary may have been written from a different dataset or a different cut.

<!-- you -->

