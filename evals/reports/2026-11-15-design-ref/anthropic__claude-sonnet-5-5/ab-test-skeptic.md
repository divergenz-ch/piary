Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01To2SgFcD5Po2VP9S6SyUBX -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_019WLfa3JAtrLrGgfvkCBXuR -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 80
}
```

<!-- pi:result #toolu_01To2SgFcD5Po2VP9S6SyUBX -->

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

<!-- pi:result #toolu_019WLfa3JAtrLrGgfvkCBXuR -->

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

[224 more lines in file. Use offset=81 to continue.]
````

<!-- pi -->

Show the working as a cell.

<!-- pi:block -->

<!-- pi:cell js #YywyKd -->

```js
const rows = (await FileAttachment("caravel_ab.csv").csv({typed:true}));
const agg = v => { const r = rows.filter(d=>d.variant===v); return {n:d3.sum(r,d=>d.visitors), c:d3.sum(r,d=>d.conversions), days:r.length}; };
const A = agg("control"), B = agg("new_checkout");
const pA=A.c/A.n, pB=B.c/B.n, pp=(A.c+B.c)/(A.n+B.n);
const se=Math.sqrt(pp*(1-pp)*(1/A.n+1/B.n)), z=(pB-pA)/se;
const Phi=x=>0.5*(1+(()=>{const t=1/(1+0.3275911*Math.abs(x/Math.SQRT2));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x/2);return Math.sign(x)*y})());
const p2=2*(1-Phi(Math.abs(z)));
const seU=Math.sqrt(pA*(1-pA)/A.n+pB*(1-pB)/B.n);
const dates=[...new Set(rows.map(d=>d.date))];
return {A,B,pA,pB,relLift:pB/pA-1,absDiff:pB-pA,z,p_two_sided:p2,ci95_abs:[pB-pA-1.96*seU,pB-pA+1.96*seU],dates:dates.length,firstLast:[dates[0],dates.at(-1)], rowsCount:rows.length}
```

<!-- pi:cell js #YywyKd -->

```js
result = {
const rows = await FileAttachment("caravel_ab.csv").csv({typed:true});
const agg = v => { const r = rows.filter(d=>d.variant===v); return {n:d3.sum(r,d=>d.visitors), c:d3.sum(r,d=>d.conversions), days:r.length}; };
const A = agg("control"), B = agg("new_checkout");
const pA=A.c/A.n, pB=B.c/B.n, pp=(A.c+B.c)/(A.n+B.n);
const se=Math.sqrt(pp*(1-pp)*(1/A.n+1/B.n)), z=(pB-pA)/se;
const erf=x=>{const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return Math.sign(x)*y};
const p2=1-erf(Math.abs(z)/Math.SQRT2);
const seU=Math.sqrt(pA*(1-pA)/A.n+pB*(1-pB)/B.n);
const dates=[...new Set(rows.map(d=>d.date))];
return {A,B,pA,pB,relLift:pB/pA-1,absDiff:pB-pA,z,p_two_sided:p2,ci95_abs:[pB-pA-1.96*seU,pB-pA+1.96*seU],dates:dates.length,firstLast:[dates[0],dates.at(-1)],rows:rows.length};
}
```

<!-- pi -->

Use a plain IIFE.

<!-- pi:block -->

<!-- pi:cell js #YywyKd -->

```js
result = (async () => {
const rows = await FileAttachment("caravel_ab.csv").csv({typed:true});
const agg = v => { const r = rows.filter(d=>d.variant===v); return {n:d3.sum(r,d=>d.visitors), c:d3.sum(r,d=>d.conversions), days:r.length}; };
const A = agg("control"), B = agg("new_checkout");
const pA=A.c/A.n, pB=B.c/B.n, pp=(A.c+B.c)/(A.n+B.n);
const se=Math.sqrt(pp*(1-pp)*(1/A.n+1/B.n)), z=(pB-pA)/se;
const erf=x=>{const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return Math.sign(x)*y};
const p2=1-erf(Math.abs(z)/Math.SQRT2);
const seU=Math.sqrt(pA*(1-pA)/A.n+pB*(1-pB)/B.n);
const dates=[...new Set(rows.map(d=>d.date))];
return {A,B,pA,pB,relLift:pB/pA-1,absDiff:pB-pA,z,p_two_sided:p2,ci95_abs:[pB-pA-1.96*seU,pB-pA+1.96*seU],dates:dates.length,firstLast:[dates[0],dates.at(-1)],rows:rows.length};
})()
```

<!-- pi:tool bash #toolu_01HuKhyXcgHR9H4pYZcperpT -->

```json
{
  "command": "cd .; python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nfor v in('control','new_checkout'):\n  x=[d for d in r if d['variant']==v];print(v,len(x),sum(int(d['visitors']) for d in x),sum(int(d['conversions']) for d in x))\na=[d for d in r if d['variant']=='control'];b=[d for d in r if d['variant']=='new_checkout']\nna=sum(int(d['visitors']) for d in a);ca=sum(int(d['conversions']) for d in a);nb=sum(int(d['visitors']) for d in b);cb=sum(int(d['conversions']) for d in b)\npa,pb=ca/na,cb/nb;p=(ca+cb)/(na+nb);z=(pb-pa)/math.sqrt(p*(1-p)*(1/na+1/nb));print(pa,pb,pb/pa-1,z,math.erfc(abs(z)/2**.5))\nprint(sorted(set(d['date'] for d in r))[::13]); print([d for d in r if not d['visitors'] or not d['conversions']])\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01HuKhyXcgHR9H4pYZcperpT -->

```
control 14 14000 700
new_checkout 14 14000 742
0.05 0.053 0.05999999999999983 1.1356591192256702 0.2560992560993552
['2026-10-01', '2026-10-14']
[]
```

<!-- pi -->

**No, the test doesn't show a lift you can sign off on.** The summary's 12% and p = 0.004 don't match `caravel_ab.csv`.

I recomputed from the CSV with a short Python script, run in bash. It covers 14 days, 2026-10-01 to 2026-10-14, with 14,000 visitors per arm and no missing rows.

| | Visitors | Conversions | Rate |
|---|---|---|---|
| Control | 14,000 | 700 | 5.00% |
| New checkout | 14,000 | 742 | 5.30% |

- **Lift:** the relative lift is 6.0% (5.30 / 5.00 − 1), or +0.3 percentage points. The summary says 12%.
- **Significance:** a pooled two-proportion z-test gives z = 1.14 and a two-sided p = 0.256. The summary says p = 0.004. A p of 0.256 is well within what chance alone produces.
- **How the p-value follows from the data:**
  - The pooled rate is 1,442 / 28,000 = 5.15%.
  - The standard error is √(p(1−p)(1/14000 + 1/14000)) ≈ 0.264 pp.
  - z = 0.30 / 0.264 = 1.14.

The data is consistent with anything from a small loss to a decent gain. I'd hold off on shipping Monday. Either find where the 12% and 0.004 came from, or run longer. Detecting a true 6% relative lift at this baseline takes roughly 50,000 or more visitors per arm.

I also tried to put this in a reactive cell, but it failed three times and I stopped, so the working above is the bash script, not a cell in the page. The failure was an assignment error in my cell code, not a data problem. I can retry with a fixed cell if you want it live.

<!-- you -->

