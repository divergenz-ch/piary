Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01PETGbzbcCas4CSpitbagVC -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_01AN69Q8APGWNVEUdTQFkNAG -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 80
}
```

<!-- pi:result #toolu_01PETGbzbcCas4CSpitbagVC -->

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

<!-- pi:result #toolu_01AN69Q8APGWNVEUdTQFkNAG -->

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

Show the working as a cell reading the file.

<!-- pi:block -->

<!-- pi:cell js #aeFGNK -->

```js
const rows = await FileAttachment("caravel_ab.csv").csv({typed:true});
const agg = v => { const r=rows.filter(d=>d.variant===v); return {n:d3.sum(r,d=>d.visitors), c:d3.sum(r,d=>d.conversions), days:r.length}; };
const A=agg("control"), B=agg("new_checkout");
const pA=A.c/A.n, pB=B.c/B.n, p=(A.c+B.c)/(A.n+B.n);
const se=Math.sqrt(p*(1-p)*(1/A.n+1/B.n)), z=(pB-pA)/se;
const erf=x=>{const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return x>=0?y:-y};
const pval=2*(1-(1+erf(Math.abs(z)/Math.SQRT2))/2);
const seU=Math.sqrt(pA*(1-pA)/A.n+pB*(1-pB)/B.n);
const dates=[...new Set(rows.map(d=>d.date))];
const issues={rowsTotal:rows.length,dates:dates.length,first:dates[0],last:dates.at(-1),
 dupes:rows.length-new Set(rows.map(d=>d.date+d.variant)).size,
 badConv:rows.filter(d=>d.conversions>d.visitors||d.visitors==null||d.conversions==null).length};
({A,B,pA,pB,relLift:pB/pA-1,absDiff:pB-pA,z,pval,ci95:[pB-pA-1.96*seU,pB-pA+1.96*seU],issues})
```

<!-- pi:thinking -->

I need to see the output first, and I'll run the computation in bash as well.

<!-- pi:tool bash #toolu_014mB19zBbdtpbx9jWvrMnCz -->

```json
{
  "command": "python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\na={}\nfor x in r:\n  k=x['variant'];a.setdefault(k,[0,0,0]);a[k][0]+=int(x['visitors']);a[k][1]+=int(x['conversions']);a[k][2]+=1\nprint(a)\n(n1,c1,_),(n2,c2,_)=a['control'],a['new_checkout']\np1,p2=c1/n1,c2/n2;p=(c1+c2)/(n1+n2)\nz=(p2-p1)/math.sqrt(p*(1-p)*(1/n1+1/n2))\nprint(p1,p2,p2/p1-1,z,math.erfc(abs(z)/2**.5))\n\"; sort caravel_ab.csv | awk -F, '{print $1}' | uniq -c | awk '$1!=2'",
  "timeout": 10
}
```

<!-- pi:result #toolu_014mB19zBbdtpbx9jWvrMnCz -->

```
{'control': [14000, 700, 14], 'new_checkout': [14000, 742, 14]}
0.05 0.053 0.05999999999999983 1.1356591192256702 0.2560992560993552
   1 date
```

<!-- pi:cell js #zzz -->

```js
aeFGNK = null; const _ = null;
```

<!-- pi:thinking -->

I realize the last cell was a mistake, since it created an extra cell I didn't need. Rather than just redefining it, I'll make this one display the result as a table. The first cell's top-level declarations are the rows and A, B, and so on, but my version defined a meaningless aeFGNK. I'm going to redefine zzz so it shows a table.

<!-- pi:block -->

<!-- pi:cell js #zzz -->

```js
({control:A, new_checkout:B, pA, pB, relLift:pB/pA-1, z, pval, ci95:[pB-pA-1.96*seU,pB-pA+1.96*seU], issues})
```

<!-- pi -->

**The summary overstates it. I don't think the test shows a lift, and I wouldn't sign off.**

I got these figures from `caravel_ab.csv`. The cell above reads the file and shows the working, and I re-checked the totals in Python.

| | Visitors | Conversions | Conversion rate |
|---|---|---|---|
| control | 14,000 | 700 | 5.0% |
| new_checkout | 14,000 | 742 | 5.3% |

- **Lift:** the relative lift is 5.3 / 5.0 − 1 = **6%**, not the 12% in the summary. The absolute difference is 0.3 percentage points.
- **Significance:** I used a two-proportion z-test with a pooled rate. That gives z ≈ 1.14 and **p ≈ 0.26**, not the 0.004 in the summary. The 95% confidence interval for the difference runs from about −0.2 to +0.8 points, so it includes zero.
- **Data checks:** the file has 14 days with both variants on every day, and no duplicate or malformed rows.

The data supports "5.3% vs 5.0%, not statistically distinguishable." I can't tell where 12% and p = 0.004 came from. They aren't reproducible from this file, so ask the author how they were calculated.

A real lift of this size would need roughly 5–10× more traffic to detect. I'd extend the test rather than ship to 100% on Monday.

<!-- you -->

