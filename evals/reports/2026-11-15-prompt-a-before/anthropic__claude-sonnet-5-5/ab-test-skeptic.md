Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_015HJNWthTYKFSV7zLKM2ehQ -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_014xK6KYzfD2LtD2dpAqjmVM -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 80
}
```

<!-- pi:result #toolu_015HJNWthTYKFSV7zLKM2ehQ -->

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

<!-- pi:result #toolu_014xK6KYzfD2LtD2dpAqjmVM -->

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

<!-- pi:tool bash #toolu_01KVUZSXmm2UQ4v2MMtdp8qt -->

```json
{
  "command": "cat caravel_ab.csv | tail -25; python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nd={}\nfor x in r:\n  a=d.setdefault(x['variant'],[0,0]);a[0]+=int(x['visitors']);a[1]+=int(x['conversions'])\nprint(d)\n(n1,c1),(n2,c2)=d['control'],d['new_checkout']\np1,p2=c1/n1,c2/n2;p=(c1+c2)/(n1+n2)\nz=(p2-p1)/math.sqrt(p*(1-p)*(1/n1+1/n2))\nprint(p1,p2,p2/p1-1,z,math.erfc(abs(z)/2**.5))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01KVUZSXmm2UQ4v2MMtdp8qt -->

```
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
{'control': [14000, 700], 'new_checkout': [14000, 742]}
0.05 0.053 0.05999999999999983 1.1356591192256702 0.2560992560993552
```

<!-- pi:thinking -->

The lift comes out to about 6% relative with p=0.256, so it's not significant. Now I'm weighing whether to show the working in a cell, since the user seems to want to see how it was computed, and I'll write a cell that reads the file.

<!-- pi:block -->

<!-- pi:cell js #1ZjiMQ -->

```js
{
const rows = await FileAttachment("caravel_ab.csv").csv({typed:true});
const t = {};
for (const r of rows) { const a = t[r.variant] ??= {n:0,c:0}; a.n += r.visitors; a.c += r.conversions; }
const {control:a, new_checkout:b} = t;
const p1=a.c/a.n, p2=b.c/b.n, p=(a.c+b.c)/(a.n+b.n);
const se=Math.sqrt(p*(1-p)*(1/a.n+1/b.n)), z=(p2-p1)/se;
const erf=x=>{const s=Math.sign(x);x=Math.abs(x);const t=1/(1+0.3275911*x);return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x))};
const pv=1-erf(Math.abs(z)/Math.SQRT2);
const f=x=>(x*100).toFixed(2)+"%";
return htl.html`<pre>control:      ${a.c} / ${a.n} = ${f(p1)}
new_checkout: ${b.c} / ${b.n} = ${f(p2)}
relative lift: ${f(p2/p1-1)}   absolute: ${f(p2-p1)}
pooled p = ${f(p)}, SE = ${f(se)}
z = ${z.toFixed(3)}, two-sided p = ${pv.toFixed(3)}
95% CI of abs diff: ${f(p2-p1-1.96*Math.sqrt(p1*(1-p1)/a.n+p2*(1-p2)/b.n))} to ${f(p2-p1+1.96*Math.sqrt(p1*(1-p1)/a.n+p2*(1-p2)/b.n))}</pre>`;
}
```

<!-- pi -->

Wrap it in an IIFE.

<!-- pi:block -->

<!-- pi:cell js #1ZjiMQ -->

```js
(async () => {
const rows = await FileAttachment("caravel_ab.csv").csv({typed:true});
const t = {};
for (const r of rows) { const a = t[r.variant] ??= {n:0,c:0}; a.n += r.visitors; a.c += r.conversions; }
const {control:a, new_checkout:b} = t;
const p1=a.c/a.n, p2=b.c/b.n, p=(a.c+b.c)/(a.n+b.n);
const se=Math.sqrt(p*(1-p)*(1/a.n+1/b.n)), z=(p2-p1)/se;
const erf=x=>{const s=Math.sign(x);x=Math.abs(x);const t=1/(1+0.3275911*x);return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x))};
const pv=1-erf(Math.abs(z)/Math.SQRT2);
const f=x=>(x*100).toFixed(2)+"%";
const h=1.96*Math.sqrt(p1*(1-p1)/a.n+p2*(1-p2)/b.n);
return htl.html`<pre>control:      ${a.c} / ${a.n} = ${f(p1)}
new_checkout: ${b.c} / ${b.n} = ${f(p2)}
relative lift: ${f(p2/p1-1)}   absolute: ${f(p2-p1)}
pooled p = ${f(p)}, SE = ${f(se)}
z = ${z.toFixed(3)}, two-sided p = ${pv.toFixed(3)}
95% CI of abs diff: ${f(p2-p1-h)} to ${f(p2-p1+h)}</pre>`;
})()
```

<!-- pi -->

**The summary's claim doesn't hold up. I'd hold off on signing off.**

The cell above sums visitors and conversions per variant from `caravel_ab.csv`. It then runs a pooled two-proportion z-test. A separate Python run gave the same numbers.

| | Visitors | Conversions | Rate |
|---|---|---|---|
| control | 14,000 | 700 | 5.00% |
| new_checkout | 14,000 | 742 | 5.30% |

- **Lift:** the relative lift is 6.0% (+0.30 points), not the 12% in the summary.
- **Significance:** z ≈ 1.14 and two-sided p ≈ 0.26, not 0.004. That is well short of the usual 0.05 threshold.
- **Confidence interval:** the 95% interval on the difference spans zero, so the data fits no effect as well as a real lift.

I can't tell how the summary got 12% and 0.004. The file has no segment or subset I could use to reproduce them.

The split is balanced and the dates match the summary (Oct 1–14). A 0.3-point lift is plausible but unproven. Detecting it reliably would take a much larger sample or a longer run. I'd treat "ship Monday" as unsupported until someone explains where the summary's figures came from.

<!-- you -->

