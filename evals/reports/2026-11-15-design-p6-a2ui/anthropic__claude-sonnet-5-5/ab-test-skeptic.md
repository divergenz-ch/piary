Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01Y1v5QjyYDYQeDiE4KT2Tnr -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 20
}
```

<!-- pi:tool read #toolu_01TY5eEVw9yEkXzC5Y432tZW -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_01Y1v5QjyYDYQeDiE4KT2Tnr -->

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

<!-- pi:result #toolu_01TY5eEVw9yEkXzC5Y432tZW -->

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
  changes. Hidden files (`.env`) are not served.
- One shot per name: two cells must not declare the same top-level name.
  Shared helper names used across multiple artifacts (for example an
  `lp_`-prefixed function another artifact calls) must never be declared a
  second time — redefine that cell by id.

Redefinition: pass the `id` of an existing cell (yours from an earlier
call, or a `#id` visible in the document) to replace its definition — the
latest definition wins and dependents re-run. Omit `id` for a fresh cell.

**Editing beats adding.** When the prompt opens with an artifact scope line —
`[artifact] NAME — edit by id` — the user is asking you to change *that*
artifact. Redefine its cells by the ids on their `pi:cell` markers above and
repeat their `group`.
Write a fresh cell only for material that genuinely did not exist before.
Ignoring this is what turns "make the card wider" into a second widget
sitting next to the first.

Artifact groups: cells composing one app or artifact should share a
`group` (single token, e.g. `group: "chess"`). Every member's output then
renders together as one artifact, under the answer of the turn that last
touched it — even members added many turns later — instead of scattering
through the transcript. Repeat `group` when redefining a member; only the
winning definition's group counts (omitting it ungroups the cell). A run of
cells you write back-to-back is treated as one artifact even without a
`group`, so prose belongs before or after the run, never between its cells.

The user sees the artifact as one block: its live output, with every member's
source one click away in a code pane below, editable in place.
A declaration cell shows nothing in the output pane — that is expected
inside an artifact, and no longer worth a note — but anything the user
should SEE still needs its own bare-expression cell. Treat cells as shared
workspace, not output. In Piary the `cell` call answers once the cell has
run: `ok — cell #ID ran.`, or a failed result carrying the runtime's error —
treat that as ground truth and redefine that cell by `id` with a fix before
going on. A cell `waiting on NAME` is fine if a cell you are about to write
defines `NAME`. After a few failed fixes the tool tells you to stop: then say
what is wrong and what you tried, rather than guessing again. Separately,
while your turn is still running, the UI may steer a message shaped
`[cell report] #ID failed: ERROR` about a cell that broke later — a
dependent re-run, say — and it is ground truth too. A message shaped
`[artifact report] @GROUP …` is about the whole artifact, not one cell:
usually it ran but every cell in it is a declaration, and the fix is to ADD a
bare-expression cell that returns what the user should see — not to rewrite a
cell that is already correct. Reports are capped per turn; if they stop, don't
retry blindly. After your turn ends, errors reach you only when the user
mentions them.

Cells you give the same `group` become one artifact — a block of their own in
the document, with one frame around their combined output. The block is where

[46 more lines in file. Use offset=201 to continue.]
````

<!-- pi:tool bash #toolu_01XJSSWFotarfbVr7ibcs1sB -->

```json
{
  "command": "cat caravel_ab.csv | tail -n +6; python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nd={}\nfor x in r:\n  a=d.setdefault(x['variant'],[0,0]);a[0]+=int(x['visitors']);a[1]+=int(x['conversions'])\nprint(d)\n(n1,c1),(n2,c2)=d['control'],d['new_checkout']\np1,p2=c1/n1,c2/n2;p=(c1+c2)/(n1+n2)\nz=(p2-p1)/math.sqrt(p*(1-p)*(1/n1+1/n2))\nprint(p1,p2,p2/p1-1,z,math.erfc(abs(z)/2**.5))\"",
  "timeout": 20
}
```

<!-- pi:result #toolu_01XJSSWFotarfbVr7ibcs1sB -->

```
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

The lift comes out to about 6% relative, with a p-value of 0.256, so it isn't significant. I'll put the calculation in a cell so it can be rerun.

<!-- pi:block -->

<!-- pi:cell js #A1SdUg -->

```js
(async () => {
  const rows = await FileAttachment("caravel_ab.csv").csv({typed: true});
  const g = v => rows.filter(r => r.variant === v);
  const n = v => d3.sum(g(v), r => r.visitors), c = v => d3.sum(g(v), r => r.conversions);
  const n1 = n("control"), c1 = c("control"), n2 = n("new_checkout"), c2 = c("new_checkout");
  const p1 = c1/n1, p2 = c2/n2, p = (c1+c2)/(n1+n2);
  const se = Math.sqrt(p*(1-p)*(1/n1+1/n2));
  const z = (p2-p1)/se;
  const erf = x => { const t=1/(1+0.3275911*x); return 1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x); };
  const pv = 1 - erf(Math.abs(z)/Math.SQRT2);
  const seu = Math.sqrt(p1*(1-p1)/n1 + p2*(1-p2)/n2);
  return htl.html`<pre>control:      ${c1} / ${n1} = ${(p1*100).toFixed(2)}%
new_checkout: ${c2} / ${n2} = ${(p2*100).toFixed(2)}%
absolute diff: ${((p2-p1)*100).toFixed(2)} pts; relative lift: ${((p2/p1-1)*100).toFixed(1)}%
pooled p = ${p.toFixed(4)}, SE = ${se.toFixed(5)}, z = ${z.toFixed(2)}
two-sided p = ${pv.toFixed(3)}
95% CI of diff: ${((p2-p1-1.96*seu)*100).toFixed(2)} to ${((p2-p1+1.96*seu)*100).toFixed(2)} pts</pre>`;
})()
```

<!-- pi -->

The summary's claim doesn't hold up, so I wouldn't sign off on it. The cell above reads `caravel_ab.csv` and shows each step. I also recomputed the numbers independently in Python, and they match.

I summed visitors and conversions for each variant over the 14 days, then ran a pooled two-proportion z-test.

| | Control | New checkout |
|---|---|---|
| Visitors | 14,000 | 14,000 |
| Conversions | 700 | 742 |
| Conversion rate | 5.00% | 5.30% |

- **Lift:** the relative lift is 6%, not the 12% in the summary. The absolute gain is 0.3 points.
- **Significance:** z ≈ 1.14 and the two-sided p ≈ 0.26, not 0.004. That is well above 0.05, so the data doesn't show a real difference. The 95% confidence interval for the difference runs from about −0.2 to +0.8 points, so it includes zero.
- **Direction:** the new checkout leads on most days, but the margin is small and the results are consistent with noise.

I can't tell where the 12% and p = 0.004 came from. Check whether they come from a different dataset or a different calculation.

If you need a decision now, treat this as inconclusive rather than a win. At this baseline, detecting a lift of this size would take roughly 10 times more traffic. Shipping to 100% on Monday on this evidence isn't supported. If the new checkout has other merits, shipping it is a judgement call, not something this test proves.

<!-- you -->

