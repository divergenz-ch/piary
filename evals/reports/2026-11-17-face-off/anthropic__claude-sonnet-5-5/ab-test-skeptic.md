Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01BqSLyjPhM3GxaCzvoiSWC2 -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_01KzSpe1WECB4CUVDgjfH9a6 -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 80
}
```

<!-- pi:result #toolu_01BqSLyjPhM3GxaCzvoiSWC2 -->

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

<!-- pi:result #toolu_01KzSpe1WECB4CUVDgjfH9a6 -->

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

[167 more lines in file. Use offset=81 to continue.]
````

<!-- pi:cell js #YXkgx9 -->

```js
{
const rows = await FileAttachment("caravel_ab.csv").csv({typed:true});
const agg = v => { const r = rows.filter(d=>d.variant===v); return {n:d3.sum(r,d=>d.visitors), c:d3.sum(r,d=>d.conversions), days:r.length}; };
const a = agg("control"), b = agg("new_checkout");
const pa=a.c/a.n, pb=b.c/b.n, p=(a.c+b.c)/(a.n+b.n);
const se=Math.sqrt(p*(1-p)*(1/a.n+1/b.n)), z=(pb-pa)/se;
const cdf=x=>{const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2);const q=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-q:q};
const pv=2*(1-cdf(Math.abs(z)));
const seu=Math.sqrt(pa*(1-pa)/a.n+pb*(1-pb)/b.n);
return htl.html`<div><table>
<tr><th>variant<th>days<th>visitors<th>conversions<th>rate</tr>
<tr><td>control<td>${a.days}<td>${a.n}<td>${a.c}<td>${(pa*100).toFixed(2)}%</tr>
<tr><td>new_checkout<td>${b.days}<td>${b.n}<td>${b.c}<td>${(pb*100).toFixed(2)}%</tr></table>
<p>Relative lift ${((pb/pa-1)*100).toFixed(1)}% · abs diff ${((pb-pa)*100).toFixed(2)} pts · z=${z.toFixed(2)} · two-sided p=${pv.toFixed(3)} · 95% CI diff [${((pb-pa-1.96*seu)*100).toFixed(2)}, ${((pb-pa+1.96*seu)*100).toFixed(2)}] pts</p>
<p>Rows: ${rows.length}; dates ${rows[0].date} to ${rows.at(-1).date}</p></div>`;
}
```

<!-- pi -->

Use a function-wrapped expression.

<!-- pi:block -->

<!-- pi:cell js #YXkgx9 -->

```js
(async () => {
const rows = await FileAttachment("caravel_ab.csv").csv({typed:true});
const agg = v => { const r = rows.filter(d=>d.variant===v); return {n:d3.sum(r,d=>d.visitors), c:d3.sum(r,d=>d.conversions), days:r.length}; };
const a = agg("control"), b = agg("new_checkout");
const pa=a.c/a.n, pb=b.c/b.n, p=(a.c+b.c)/(a.n+b.n);
const se=Math.sqrt(p*(1-p)*(1/a.n+1/b.n)), z=(pb-pa)/se;
const cdf=x=>{const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2);const q=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-q:q};
const pv=2*(1-cdf(Math.abs(z)));
const seu=Math.sqrt(pa*(1-pa)/a.n+pb*(1-pb)/b.n);
return htl.html`<div><table>
<tr><th>variant<th>days<th>visitors<th>conversions<th>rate</tr>
<tr><td>control<td>${a.days}<td>${a.n}<td>${a.c}<td>${(pa*100).toFixed(2)}%</tr>
<tr><td>new_checkout<td>${b.days}<td>${b.n}<td>${b.c}<td>${(pb*100).toFixed(2)}%</tr></table>
<p>Relative lift ${((pb/pa-1)*100).toFixed(1)}% · abs diff ${((pb-pa)*100).toFixed(2)} pts · z=${z.toFixed(2)} · two-sided p=${pv.toFixed(3)} · 95% CI diff [${((pb-pa-1.96*seu)*100).toFixed(2)}, ${((pb-pa+1.96*seu)*100).toFixed(2)}] pts</p>
<p>Rows: ${rows.length}; dates ${rows[0].date} to ${rows.at(-1).date}</p></div>`;
})()
```

<!-- pi -->

Let me verify independently.

<!-- pi:tool bash #toolu_01CucCxVxQadQzsrq7C2e55q -->

```json
{
  "command": "python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nd={}\nfor x in r:\n  v=d.setdefault(x['variant'],[0,0,0]);v[0]+=int(x['visitors']);v[1]+=int(x['conversions']);v[2]+=1\nprint(d)\n(n1,c1,_),(n2,c2,_)=d['control'],d['new_checkout']\np1,p2=c1/n1,c2/n2;p=(c1+c2)/(n1+n2)\nz=(p2-p1)/math.sqrt(p*(1-p)*(1/n1+1/n2));print(p1,p2,p2/p1-1,z,math.erfc(abs(z)/2**.5))\"\nawk -F, 'NR>1{print $1}' caravel_ab.csv | sort | uniq -c | awk '$1!=2'",
  "timeout": 10
}
```

<!-- pi:result #toolu_01CucCxVxQadQzsrq7C2e55q -->

```
{'control': [14000, 700, 14], 'new_checkout': [14000, 742, 14]}
0.05 0.053 0.05999999999999983 1.1356591192256702 0.2560992560993552
```

<!-- pi -->

**The summary's claim doesn't hold up. I don't see a lift that's distinguishable from noise.** The cell above recomputes everything from `caravel_ab.csv`. I cross-checked it in Python and got the same numbers.

| | Visitors | Conversions | Rate |
|---|---|---|---|
| control | 14,000 | 700 | 5.00% |
| new_checkout | 14,000 | 742 | 5.30% |

- **Lift:** the relative lift is **6.0%** (+0.30 points), not 12%. The summary's figure is double what the data gives.
- **Significance:** a two-proportion z-test gives z = 1.14 and **p ≈ 0.26**, not 0.004. A gap this size would appear about a quarter of the time with no real difference.
- **Data:** the file is clean. It covers 14 days, with one row per variant per day and equal traffic in each arm.

I can't tell where the 12% and p = 0.004 came from. They don't match this file, so the summary may have used different data or a different calculation.

**Recommendation:** don't sign off on "ship to 100% on Monday" based on this test. The result is inconclusive. A 0.3-point difference needs a much larger sample to detect reliably, or the test needs to run longer. Shipping may still be reasonable if the new checkout has other benefits, but this test doesn't show a conversion lift.

<!-- you -->

