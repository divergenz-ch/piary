Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01Ppnkje3kuFBWz5fve4jncv -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 20
}
```

<!-- pi:tool read #toolu_019sKQFSZL9V2Kmv2gCWft1v -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 150
}
```

<!-- pi:result #toolu_01Ppnkje3kuFBWz5fve4jncv -->

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

<!-- pi:result #toolu_019sKQFSZL9V2Kmv2gCWft1v -->

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

[100 more lines in file. Use offset=151 to continue.]
````

<!-- pi:tool bash #toolu_01REkLfdFnGF7AqqminN1oBi -->

```json
{
  "command": "cat caravel_ab.csv | tail -n +6; python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nfor v in('control','new_checkout'):\n  x=[a for a in r if a['variant']==v];print(v,len(x),sum(int(a['visitors']) for a in x),sum(int(a['conversions']) for a in x))\n\"",
  "timeout": 20
}
```

<!-- pi:result #toolu_01REkLfdFnGF7AqqminN1oBi -->

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
control 14 14000 700
new_checkout 14 14000 742
```

<!-- pi:thinking -->

I'm checking the lift and the significance: the rates are 5.00% and 5.30%, a relative lift of about 6%. Working through the pooled z-test, I get z around 1.14 and a p-value near 0.26, and I want to recompute that more precisely.

<!-- pi:tool bash #toolu_01CRNWF4TKkb8VDz6JmbRVdF -->

```json
{
  "command": "python3 -c \"\nfrom math import *\na,b=700,742;n=14000\np=(a+b)/2/n;se=sqrt(p*(1-p)*2/n);z=(b-a)/n/se\nprint(z,erfc(z/sqrt(2)))\ns=sqrt(a/n*(1-a/n)/n+b/n*(1-b/n)/n);d=(b-a)/n;print(d-1.96*s,d+1.96*s)\"",
  "timeout": 20
}
```

<!-- pi:result #toolu_01CRNWF4TKkb8VDz6JmbRVdF -->

```
1.1356591192256718 0.25609925609935463
-0.0021774907435938495 0.008177490743593849
```

<!-- pi -->

**The summary's claim doesn't hold up. I'd hold off on signing off.**

I summed all 28 rows of `caravel_ab.csv` (14 days × 2 variants) and ran a two-proportion z-test on the totals.

| Variant | Visitors | Conversions | Rate |
|---|---|---|---|
| control | 14,000 | 700 | 5.00% |
| new_checkout | 14,000 | 742 | 5.30% |

- **Lift:** the absolute difference is 0.30 percentage points, which is a **6% relative** lift. The summary says 12%.
- **Significance:** the pooled rate is 1,442 / 28,000 = 5.15%, and the standard error is √(0.0515 × 0.9485 × 2/14000) = 0.00264.
  - That gives z = 0.003 / 0.00264 = **1.14**, a two-sided **p ≈ 0.26**. The summary says p = 0.004.
- **Confidence interval:** the 95% interval for the absolute difference is **−0.22 to +0.82 percentage points**. It includes zero, so the data is consistent with no effect.

The new checkout converted slightly better in this sample, but the difference is well within noise. The summary's 12% and p = 0.004 don't match this file. I can't tell where they came from. They may be from a different cut of the data or a different file.

I'd rerun the test or get more traffic before shipping on the strength of this result. Detecting a true 6% relative lift at 5% baseline would need roughly 30k or more visitors per arm. That figure is a rough estimate I didn't compute here.

<!-- you -->

