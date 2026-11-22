Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01FhZhQ2yKzcc8rVgA4KDqsi -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 20
}
```

<!-- pi:tool read #toolu_01SBneRa5WQ3tZvfq8TSLPCT -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 400
}
```

<!-- pi:result #toolu_01FhZhQ2yKzcc8rVgA4KDqsi -->

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

<!-- pi:result #toolu_01SBneRa5WQ3tZvfq8TSLPCT -->

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
it lives: the user can drag it anywhere, and it stays there. Redefine a member
by `id` to change it; a new cell with the same `group` joins it.

**Controls before they are asked for.** A cell the user will look at (a chart,
a simulation, a drawing, a calculator) comes with controls for what they are
likely to change next: a range, a count, a colour, a speed, a threshold. Each
is its own `view(Inputs.*)` cell in the artifact's group, and its default draws
exactly what was asked:

```js
const turns = view(Inputs.range([1, 20], {label: "Turns", step: 1, value: 6}))
```

A few controls that matter beat one per constant. When a request changes a
property ("make it red", "thicker"), put that property on a control whose
default is the value asked for (`Inputs.color({label: "Colour", value: "#ff0000"})`)
rather than writing the value into the drawing, because the next request is
usually "a bit less".

**Keep what the user set.** A control the user has moved keeps their value
when you redefine its cell, as long as the new definition declares the same
name. A changed range or label keeps it, but a renamed control starts again
from its default. So change the cell the request is about, and when a
control must change, keep its export name. Values set through
`state(key, …)` survive a redefinition the same way, by key. A prompt that opens
with `[cell values] {…}` carries what the user has set right now, by export
name. Read it before you change a control, and keep those values unless you
are asked to change them.

## Changing what is already in the document

`canvas_edit(oldText, newText)` changes prose already in the conversation — a
heading, a paragraph, a list, one of your earlier answers — in place. Quote
`oldText` exactly as the document has it, with enough around it to occur
once, inside one block; `newText` replaces it. An empty `newText` removes the
text; to add after something, repeat it in `newText` and add to it. The open
page applies the change and answers `ok`, or why not — not found, found in
several places, a cell, more than one block — and a refusal means nothing
changed, so requote rather than report it done. The `[now: …]` and `[attached: …]` lines you
see on the user's messages are added on the way to you and are not in the
document: leave them out of a quote.

A cell is changed with `cell` by its id, never with `canvas_edit`. Never edit
the conversation's markdown file with `edit`, `write` or `bash`: the user has
it open, and a change from outside makes them resolve a conflict.
````

<!-- pi:tool bash #toolu_01EGSfDFzQRUzGDFqdQr1NYG -->

```json
{
  "command": "cat caravel_ab.csv | tail -26; python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nfor v in['control','new_checkout']:\n  x=[i for i in r if i['variant']==v];print(v,len(x),sum(int(i['visitors']) for i in x),sum(int(i['conversions']) for i in x))\n\"",
  "timeout": 20
}
```

<!-- pi:result #toolu_01EGSfDFzQRUzGDFqdQr1NYG -->

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
control 14 14000 700
new_checkout 14 14000 742
```

<!-- pi:thinking -->

I'm checking the lift from 5.00% to 5.30%, which works out to about 6% relative rather than 12%. For the z-test, the pooled rate is 5.15%, the standard error comes out near 0.00264, and z lands around 1.14, giving a p-value near 0.26. I'll put the calculation in a cell that reads the numbers from the file.

<!-- pi:block -->

<!-- pi:cell js #6iM7r4 -->

```js
(async () => {
  const rows = await FileAttachment("caravel_ab.csv").csv({typed: true});
  const g = v => { const r = rows.filter(d => d.variant === v);
    const n = d3.sum(r, d => d.visitors), c = d3.sum(r, d => d.conversions); return {n, c, p: c/n}; };
  const a = g("control"), b = g("new_checkout");
  const pp = (a.c + b.c) / (a.n + b.n);
  const se = Math.sqrt(pp*(1-pp)*(1/a.n + 1/b.n));
  const z = (b.p - a.p) / se;
  const erf = x => { const t = 1/(1+0.3275911*Math.abs(x)); const y = 1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x); return x>=0?y:-y; };
  const p = 2*(1 - 0.5*(1+erf(Math.abs(z)/Math.SQRT2)));
  const sed = Math.sqrt(a.p*(1-a.p)/a.n + b.p*(1-b.p)/b.n), d = b.p - a.p;
  const f = x => (100*x).toFixed(2) + "%";
  return htl.html`<table style="border-collapse:collapse">
  <tr><th></th><th>visitors</th><th>conversions</th><th>rate</th></tr>
  <tr><td>control</td><td>${a.n}</td><td>${a.c}</td><td>${f(a.p)}</td></tr>
  <tr><td>new_checkout</td><td>${b.n}</td><td>${b.c}</td><td>${f(b.p)}</td></tr></table>
  <p>Absolute diff ${f(d)}; relative lift <b>${(100*d/a.p).toFixed(1)}%</b><br>
  Pooled p = ${f(pp)}, SE = ${f(se)}, z = ${z.toFixed(2)}, two-sided <b>p ≈ ${p.toFixed(3)}</b><br>
  95% CI for diff: ${f(d-1.96*sed)} to ${f(d+1.96*sed)}</p>`;
})()
```

<!-- pi -->

The summary's claim doesn't hold up. I recomputed it from `caravel_ab.csv`, and the cell above shows the working. I also checked the totals in Python.

- **Totals:** control had 700 conversions from 14,000 visitors (5.00%). new_checkout had 742 from 14,000 (5.30%).
- **Lift:** the relative lift is about 6%, not the 12% in the summary. The absolute difference is 0.3 percentage points.
- **Significance:** a two-proportion z-test gives z ≈ 1.14 and p ≈ 0.26, not 0.004. The 95% confidence interval for the difference is roughly −0.2 to +0.8 points, so it includes zero.

The data doesn't show a reliable lift. The new checkout may be slightly better, but this test can't tell that apart from noise. I'd hold off signing off on "ship to 100% on Monday" until someone explains where the 12% and p = 0.004 came from.

I only had the CSV and the summary. If the summary used a different metric or a subset of the data, I can't see that from here.

<!-- you -->

