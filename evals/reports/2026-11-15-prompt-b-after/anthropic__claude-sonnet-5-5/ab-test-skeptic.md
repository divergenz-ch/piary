Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01JRJ2wbPqGNgSoug4xamPny -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 10
}
```

<!-- pi:tool read #toolu_01Bap4cg7ECr3KNQomr6evg3 -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 80
}
```

<!-- pi:result #toolu_01JRJ2wbPqGNgSoug4xamPny -->

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

<!-- pi:result #toolu_01Bap4cg7ECr3KNQomr6evg3 -->

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

Pick the template whose shape fits. Payloads that don't fit render as the
raw fence (never an error), so match the shapes below exactly.

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

[170 more lines in file. Use offset=81 to continue.]
````

<!-- pi:tool bash #toolu_016sm5KJRSEV9MYmjsYaeTgS -->

```json
{
  "command": "cat caravel_ab.csv | tail -26; python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nt={}\nfor x in r:\n  a=t.setdefault(x['variant'],[0,0]);a[0]+=int(x['visitors']);a[1]+=int(x['conversions'])\nprint(t)\n(n1,c1),(n2,c2)=t['control'],t['new_checkout']\np1,p2=c1/n1,c2/n2;p=(c1+c2)/(n1+n2)\nz=(p2-p1)/math.sqrt(p*(1-p)*(1/n1+1/n2))\nprint(p1,p2,p2/p1-1,z,math.erfc(abs(z)/2**.5))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_016sm5KJRSEV9MYmjsYaeTgS -->

```
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
{'control': [14000, 700], 'new_checkout': [14000, 742]}
0.05 0.053 0.05999999999999983 1.1356591192256702 0.2560992560993552
```

<!-- pi:thinking -->

I'm checking that the lift is about 6% relative with p=0.26, which isn't significant. Next I'm deciding whether to show it as a notebook cell that reads the data file, so I'll build a cell that computes the result using FileAttachment.

<!-- pi:block -->

<!-- pi:cell js #rbckgA -->

```js
{
  const rows = await FileAttachment("caravel_ab.csv").csv({typed: true});
  const t = {};
  for (const r of rows) { const a = t[r.variant] ??= {n:0,c:0}; a.n += r.visitors; a.c += r.conversions; }
  const A = t.control, B = t.new_checkout;
  const p1 = A.c/A.n, p2 = B.c/B.n, p = (A.c+B.c)/(A.n+B.n);
  const se = Math.sqrt(p*(1-p)*(1/A.n+1/B.n));
  const z = (p2-p1)/se;
  const erf = x => { const s=Math.sign(x); x=Math.abs(x); const t=1/(1+0.3275911*x);
    return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x)); };
  const pval = 1 - erf(Math.abs(z)/Math.SQRT2);
  const sed = Math.sqrt(p1*(1-p1)/A.n + p2*(1-p2)/B.n);
  return Inputs.table([
    {step:"control: conversions / visitors", value:`${A.c} / ${A.n} = ${(p1*100).toFixed(2)}%`},
    {step:"new_checkout: conversions / visitors", value:`${B.c} / ${B.n} = ${(p2*100).toFixed(2)}%`},
    {step:"relative lift (p2/p1 − 1)", value:((p2/p1-1)*100).toFixed(1)+"%"},
    {step:"pooled two-proportion z", value:z.toFixed(2)},
    {step:"two-sided p", value:pval.toFixed(3)},
    {step:"95% CI, absolute diff (pp)", value:`${((p2-p1-1.96*sed)*100).toFixed(2)} to ${((p2-p1+1.96*sed)*100).toFixed(2)}`}
  ], {layout:"auto"});
}
```

<!-- pi -->

**No, the summary doesn't hold up. I'd hold off on signing off.**

The cell above computes everything from `caravel_ab.csv`. I also cross-checked it in Python.

- **Totals:** I summed visitors and conversions per variant over the 14 days. Control has 700 conversions from 14,000 visitors (5.00%). New checkout has 742 from 14,000 (5.30%).
- **Lift:** the relative lift is about **6%**, not the 12% the summary claims. The absolute gain is 0.3 percentage points.
- **Significance:** a pooled two-proportion z-test gives z ≈ 1.14 and **p ≈ 0.26**, not 0.004. That is well within noise.
- **Confidence interval:** the 95% interval for the absolute difference spans zero (shown in the cell).

New checkout is ahead on the totals, but this data can't distinguish a real lift from chance. I can't tell where the summary's 12% and p = 0.004 came from. Nothing in the CSV reproduces them.

The recommendation to ship Monday isn't supported by this data. If you want to ship anyway, the case would have to rest on something other than this test. Alternatively, run the test longer. At about 5% baseline conversion, detecting a 6% relative lift reliably takes far more than 14k visitors per arm.

<!-- you -->

