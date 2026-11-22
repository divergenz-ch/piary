Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_0118kuHEScRKTPb1VVdAsExK -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 20
}
```

<!-- pi:tool read #toolu_01GX6gX58tGiKyACSC5BSTB6 -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 80
}
```

<!-- pi:result #toolu_0118kuHEScRKTPb1VVdAsExK -->

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

<!-- pi:result #toolu_01GX6gX58tGiKyACSC5BSTB6 -->

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

[166 more lines in file. Use offset=81 to continue.]
````

<!-- pi:tool bash #toolu_01AZ4rii4RzkRg2FK2QVeHtA -->

```json
{
  "command": "cat caravel_ab.csv; python3 - <<'E'\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nfor v in ['control','new_checkout']:\n    x=[a for a in r if a['variant']==v]\n    print(v,len(x),sum(int(a['visitors']) for a in x),sum(int(a['conversions']) for a in x))\nE",
  "timeout": 20
}
```

<!-- pi:result #toolu_01AZ4rii4RzkRg2FK2QVeHtA -->

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
control 14 14000 700
new_checkout 14 14000 742
```

<!-- pi:thinking -->

I'm checking whether the 5.0% versus 5.3% gap is real: that's a relative lift of about 6%, not 12%. Pooling the rates gives a standard error near 0.0026, and the z-statistic comes out around 1.13, so p is roughly 0.26. I'll show that with a cell.

<!-- pi:block -->

<!-- pi:cell js #MtL7Fu -->

```js
{
const rows = d3.csvParse(await FileAttachment("caravel_ab.csv").text(), d3.autoType);
const g = v => { const x = rows.filter(r => r.variant===v); return {n:d3.sum(x,r=>r.visitors), c:d3.sum(x,r=>r.conversions)}; };
const a = g("control"), b = g("new_checkout");
const pa=a.c/a.n, pb=b.c/b.n, p=(a.c+b.c)/(a.n+b.n);
const se=Math.sqrt(p*(1-p)*(1/a.n+1/b.n)), z=(pb-pa)/se;
const erf=x=>{const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return x>=0?y:-y;};
const pv=2*(1-0.5*(1+erf(Math.abs(z)/Math.SQRT2)));
const seU=Math.sqrt(pa*(1-pa)/a.n+pb*(1-pb)/b.n), d=pb-pa;
return Inputs.table([
 {step:"control: conversions / visitors", value:`${a.c} / ${a.n} = ${(pa*100).toFixed(2)}%`},
 {step:"new: conversions / visitors", value:`${b.c} / ${b.n} = ${(pb*100).toFixed(2)}%`},
 {step:"relative lift (pb/pa − 1)", value:((pb/pa-1)*100).toFixed(1)+"%"},
 {step:"pooled p, SE", value:`${p.toFixed(4)}, ${se.toFixed(5)}`},
 {step:"z = diff / SE", value:z.toFixed(2)},
 {step:"two-sided p-value", value:pv.toFixed(3)},
 {step:"95% CI on abs. diff (pp)", value:`${((d-1.96*seU)*100).toFixed(2)} to ${((d+1.96*seU)*100).toFixed(2)}`}
],{layout:"auto"});
}
```

<!-- pi -->

Use a bare expression instead.

<!-- pi:block -->

<!-- pi:cell js #MtL7Fu -->

```js
result = {
const rows = d3.csvParse(await FileAttachment("caravel_ab.csv").text(), d3.autoType);
const g = v => { const x = rows.filter(r => r.variant===v); return {n:d3.sum(x,r=>r.visitors), c:d3.sum(x,r=>r.conversions)}; };
const a = g("control"), b = g("new_checkout");
const pa=a.c/a.n, pb=b.c/b.n, p=(a.c+b.c)/(a.n+b.n);
const se=Math.sqrt(p*(1-p)*(1/a.n+1/b.n)), z=(pb-pa)/se;
const erf=x=>{const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return x>=0?y:-y;};
const pv=2*(1-0.5*(1+erf(Math.abs(z)/Math.SQRT2)));
const seU=Math.sqrt(pa*(1-pa)/a.n+pb*(1-pb)/b.n), d=pb-pa;
return Inputs.table([
 {step:"control: conversions / visitors", value:`${a.c} / ${a.n} = ${(pa*100).toFixed(2)}%`},
 {step:"new: conversions / visitors", value:`${b.c} / ${b.n} = ${(pb*100).toFixed(2)}%`},
 {step:"relative lift (pb/pa − 1)", value:((pb/pa-1)*100).toFixed(1)+"%"},
 {step:"pooled p, SE", value:`${p.toFixed(4)}, ${se.toFixed(5)}`},
 {step:"z = diff / SE", value:z.toFixed(2)},
 {step:"two-sided p-value", value:pv.toFixed(3)},
 {step:"95% CI on abs. diff (pp)", value:`${((d-1.96*seU)*100).toFixed(2)} to ${((d+1.96*seU)*100).toFixed(2)}`}
],{layout:"auto"});
}
```

<!-- pi:thinking -->

I'm guessing the mode is js, since a named assignment would need ojs. I'll go with js, wrapping it in an IIFE and ending on a bare expression.

<!-- pi:block -->

<!-- pi:cell js #MtL7Fu -->

```js
(async () => {
const rows = d3.csvParse(await FileAttachment("caravel_ab.csv").text(), d3.autoType);
const g = v => { const x = rows.filter(r => r.variant===v); return {n:d3.sum(x,r=>r.visitors), c:d3.sum(x,r=>r.conversions)}; };
const a = g("control"), b = g("new_checkout");
const pa=a.c/a.n, pb=b.c/b.n, p=(a.c+b.c)/(a.n+b.n);
const se=Math.sqrt(p*(1-p)*(1/a.n+1/b.n)), z=(pb-pa)/se;
const erf=x=>{const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return x>=0?y:-y;};
const pv=2*(1-0.5*(1+erf(Math.abs(z)/Math.SQRT2)));
const seU=Math.sqrt(pa*(1-pa)/a.n+pb*(1-pb)/b.n), d=pb-pa;
return Inputs.table([
 {step:"control: conversions / visitors", value:`${a.c} / ${a.n} = ${(pa*100).toFixed(2)}%`},
 {step:"new: conversions / visitors", value:`${b.c} / ${b.n} = ${(pb*100).toFixed(2)}%`},
 {step:"relative lift (pb/pa − 1)", value:((pb/pa-1)*100).toFixed(1)+"%"},
 {step:"pooled p, SE", value:`${p.toFixed(4)}, ${se.toFixed(5)}`},
 {step:"z = diff / SE", value:z.toFixed(2)},
 {step:"two-sided p-value", value:pv.toFixed(3)},
 {step:"95% CI on abs. diff (pp)", value:`${((d-1.96*seU)*100).toFixed(2)} to ${((d+1.96*seU)*100).toFixed(2)}`}
],{layout:"auto"});
})()
```

<!-- pi -->

The test doesn't show a lift you can sign off on. The summary's two headline numbers, a 12% lift and p = 0.004, both fail to reproduce from `caravel_ab.csv`.

The cell above recomputes everything from the CSV. These are the figures behind my conclusion (I checked the totals separately in Python):

- **Totals:** over the 14 days, each arm had 14,000 visitors. Control converted 700 (5.00%) and new_checkout converted 742 (5.30%).
- **Lift:** that is about 6% relative, or 0.3 percentage points. It is not 12%.
- **Significance:** a two-proportion z-test gives z ≈ 1.13 and p ≈ 0.26. That is nowhere near 0.004.
- **Direction:** new_checkout is ahead on most days, but at this sample size the gap is within noise.

The test is underpowered for a lift this small, so it is inconclusive rather than negative. I'd hold the Monday ship and either run longer or fix the summary's numbers first. I can't tell from the CSV where the 12% and 0.004 came from.

<!-- you -->

