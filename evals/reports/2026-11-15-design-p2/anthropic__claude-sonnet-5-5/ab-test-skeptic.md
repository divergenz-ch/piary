Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01RrpHEwN9RUoGSmGAiakKYb -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 20
}
```

<!-- pi:tool read #toolu_01BUK1xPE94EnCtDte1bByTa -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 150
}
```

<!-- pi:result #toolu_01RrpHEwN9RUoGSmGAiakKYb -->

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

<!-- pi:result #toolu_01BUK1xPE94EnCtDte1bByTa -->

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

```js
htl.html`<div class="card" style="padding:12px;border-radius:12px;background:#eef">
  <h1>${city.name}</h1><p>${temp}°</p>
</div>`
```

Reach for `Plot` for charts and `Inputs` for controls before writing markup at
all. A cell written as a React component returns `NOT OK` from this tool and
renders nothing.

Semantics (Observable notebook style):

- Top-level declarations are the cell's exports: `const data = …` defines
  `data` for every other cell. A bare expression displays its value.
- Unlike observablehq.com, classic block cells (`{ …; return x; }`) are NOT
  supported — cells are plain JavaScript, so `return` fails to parse. Use an
  IIFE (`(() => { …; return x; })()`) for multi-statement display cells.
  Also unsupported: top-level `yield` (wrap in a generator IIFE:
  `(function* () { yield … })()`), classic `viewof`/`mutable` syntax, and
  assignment to undeclared names (`x = 1` → "Assignment to external
  variable"; always declare with `const`/`let`).
- The inverse is strict: a cell that starts with a declaration renders
  **nothing** — even when its value is a DOM node or a yielding generator.
  `const anim = (function* () { … yield canvas })()` animates invisibly.
  Put anything the user should see in its own bare-expression cell (or
  call `display(…)`); declaration cells are for data, not display.
- Reference other cells' names directly — no imports between cells. The
  runtime tracks dependencies and re-runs in topological order.
- `view(…)` wraps an input into a value: `const gain = view(Inputs.range([0, 10]))`
  renders a slider and gives dependents the live number.
- Interactive state belongs in the dataflow graph, not in DOM listeners:
  route it through `view()` (or a cell that re-exports it) so other cells,
  the host, and the agent can read it. A widget that keeps its state in raw
  DOM event handlers is invisible to everyone but the user's eyes.
  `view()`-routed state also survives reloads: the host persists it in the
  session transcript and restores it into the widgets on boot — you never
  write or read that yourself.
- State with no widget — a game board, a canvas, a drawing, anything the
  user changes by clicking your own DOM — goes through `state`, which is a
  `view()` that renders nothing:

  ```js
  const board = view(state("board", Array(9).fill(null)));   // reactive, persisted
  ```

  ```js
  setState("board", next);   // write from an event handler or another cell
  ```

  Dependents re-run on every `setState`, and the value is restored *before*
  the first paint on reload, so the artifact comes back as the user left it
  rather than flashing its default. Pick a key per artifact concern
  (`"board"`, `"turn"`), not per cell. Without this, everything the user did
  is gone on reload — the single most common complaint about a cell that
  keeps its state in a closure.
- When a user's change should become document text — a checklist's checked
  items, a constant the user scrubbed in a program — dispatch
  `dispatchEvent(new CustomEvent("pi-cell-writeback", {detail: {id, source}}))`
  to replace cell `id`'s source in the document.  An unchanged source is a
  no-op, which is what ends the re-run loop; prefer `state` for values that
  do not need to survive as editable document text.
- `display(…)` shows extra values; top-level `await` works; generators
  yield streams.
- Libraries: `d3`, `Plot`, `Inputs`, `htl`, `md`, `tex` are ambient. Import
  anything else from npm: `import {mean} from "npm:d3-array"`.
- Files: `FileAttachment("data/sales.csv")` reads a workspace file, the path
  from the workspace root — `.json()`, `.csv({typed: true})`, `.text()`,
  `.arrayBuffer()`. Read data from its file this way rather than copying its
  values into the source: the cell then shows the file, and follows it when it

[96 more lines in file. Use offset=151 to continue.]
````

<!-- pi:tool bash #toolu_014KY8xkoxK5HfdLGJjgRZGy -->

```json
{
  "command": "cat caravel_ab.csv | tail -26; python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nt={}\nfor x in r:\n  a=t.setdefault(x['variant'],[0,0]);a[0]+=int(x['visitors']);a[1]+=int(x['conversions'])\nprint(t)\n(n1,c1),(n2,c2)=t['control'],t['new_checkout']\np1,p2=c1/n1,c2/n2;p=(c1+c2)/(n1+n2)\nz=(p2-p1)/math.sqrt(p*(1-p)*(1/n1+1/n2));print(p1,p2,p2/p1-1,z,math.erfc(abs(z)/2**.5))\"",
  "timeout": 20
}
```

<!-- pi:result #toolu_014KY8xkoxK5HfdLGJjgRZGy -->

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

<!-- pi -->

Show the working as a cell.

<!-- pi:block -->

<!-- pi:cell js #fjKiN6 -->

```js
(async () => {
  const rows = await FileAttachment("caravel_ab.csv").csv({typed: true});
  const t = {};
  for (const r of rows) { const a = t[r.variant] ??= {n:0,c:0}; a.n += r.visitors; a.c += r.conversions; }
  const A = t.control, B = t.new_checkout;
  const pA = A.c/A.n, pB = B.c/B.n, p = (A.c+B.c)/(A.n+B.n);
  const se = Math.sqrt(p*(1-p)*(1/A.n+1/B.n));
  const z = (pB-pA)/se;
  const erf = x => { const s=Math.sign(x); x=Math.abs(x); const t=1/(1+0.3275911*x);
    return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x)); };
  const pval = 1 - erf(Math.abs(z)/Math.SQRT2);
  const seU = Math.sqrt(pA*(1-pA)/A.n + pB*(1-pB)/B.n), d = pB-pA;
  return htl.html`<pre>control: ${A.c}/${A.n} = ${(pA*100).toFixed(2)}%
new:     ${B.c}/${B.n} = ${(pB*100).toFixed(2)}%
absolute diff = ${(d*100).toFixed(2)} pts; relative lift = ${((pB/pA-1)*100).toFixed(1)}%
pooled p = ${p.toFixed(4)}, SE = ${se.toFixed(5)}
z = ${z.toFixed(2)}, two-sided p = ${pval.toFixed(3)}
95% CI of abs diff: ${((d-1.96*seU)*100).toFixed(2)} to ${((d+1.96*seU)*100).toFixed(2)} pts</pre>`;
})()
```

<!-- pi -->

**The summary overstates the result. The data doesn't support signing off on the lift as written.**

The cell above computes it from `caravel_ab.csv`. I summed visitors and conversions per variant over all 14 days, then ran a pooled two-proportion z-test. I also checked the numbers in Python.

| | Control | New checkout |
|---|---|---|
| Conversions / visitors | 700 / 14,000 | 742 / 14,000 |
| Conversion rate | 5.00% | 5.30% |

- **The 12% is wrong:** the relative lift is 6.0% (0.30 percentage points). The summary's figure is about double that.
- **The p-value is wrong:** z ≈ 1.14, so two-sided p ≈ 0.26, not 0.004. That is not significant, and the 95% interval on the difference includes zero.
- **The direction is encouraging:** the new checkout is ahead on most days. A gap of 0.3 points on this much traffic is still well within noise.

I don't know where 12% and 0.004 came from. You could check the original analysis for a different data cut or a calculation error.

**Recommendation:** don't ship on Monday based on this test. If the team still wants an answer, keep running it. To detect a 6% relative lift at 5% baseline you'd need roughly 100k visitors per arm. That is about 3 months at the current traffic.

<!-- you -->

