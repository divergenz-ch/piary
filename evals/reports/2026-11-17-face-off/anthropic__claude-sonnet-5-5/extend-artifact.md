---
pi: v1
session: eval-extend-artifact
---

Make me a small savings calculator.

<!-- pi -->

A calculator in two cells: the inputs, then the result.

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
monthly = 500
```

<!-- pi:cell js #r3su1t -->

```js
html`<p>After 10 years: <strong>${(monthly * 12 * 10).toLocaleString()}</strong></p>`
```

<!-- you -->

Turn the monthly amount into a slider from 100 to 2000.

<!-- pi:thinking -->

I'm going to redefine the cell s4v1n6 with a slider, since the earlier creation only returned "ok" and I need to use that same id. I'm not sure how Inputs.range pairs with view in this JS cell setup, so I'll check the skill docs first.

<!-- pi:tool bash #toolu_01SZ54vxNzVCtDZ23FscDB87 -->

```json
{
  "command": "grep -n -i -B2 -A8 \"viewof\\|Inputs\" <repo>/pi-extension/SKILL.md | head -60",
  "timeout": 10
}
```

<!-- pi:result #toolu_01SZ54vxNzVCtDZ23FscDB87 -->

````
86-```
87-
88:Reach for `Plot` for charts and `Inputs` for controls before writing markup at
89-all. A cell written as a React component returns `NOT OK` from this tool and
90-renders nothing.
91-
92-Semantics (Observable notebook style):
93-
94-- Top-level declarations are the cell's exports: `const data = …` defines
95-  `data` for every other cell. A bare expression displays its value.
96-- Unlike observablehq.com, classic block cells (`{ …; return x; }`) are NOT
--
98-  IIFE (`(() => { …; return x; })()`) for multi-statement display cells.
99-  Also unsupported: top-level `yield` (wrap in a generator IIFE:
100:  `(function* () { yield … })()`), classic `viewof`/`mutable` syntax, and
101-  assignment to undeclared names (`x = 1` → "Assignment to external
102-  variable"; always declare with `const`/`let`).
103-- The inverse is strict: a cell that starts with a declaration renders
104-  **nothing** — even when its value is a DOM node or a yielding generator.
105-  `const anim = (function* () { … yield canvas })()` animates invisibly.
106-  Put anything the user should see in its own bare-expression cell (or
107-  call `display(…)`); declaration cells are for data, not display.
108-- Reference other cells' names directly — no imports between cells. The
109-  runtime tracks dependencies and re-runs in topological order.
110:- `view(…)` wraps an input into a value: `const gain = view(Inputs.range([0, 10]))`
111-  renders a slider and gives dependents the live number.
112-- Interactive state belongs in the dataflow graph, not in DOM listeners:
113-  route it through `view()` (or a cell that re-exports it) so other cells,
114-  the host, and the agent can read it. A widget that keeps its state in raw
115-  DOM event handlers is invisible to everyone but the user's eyes.
116-  `view()`-routed state also survives reloads: the host persists it in the
117-  session transcript and restores it into the widgets on boot — you never
118-  write or read that yourself.
--
143-- `display(…)` shows extra values; top-level `await` works; generators
144-  yield streams.
145:- Libraries: `d3`, `Plot`, `Inputs`, `htl`, `md`, `tex` are ambient. Import
146-  anything else from npm: `import {mean} from "npm:d3-array"`.
147-- Files: `FileAttachment("data/sales.csv")` reads a workspace file, the path
148-  from the workspace root — `.json()`, `.csv({typed: true})`, `.text()`,
149-  `.arrayBuffer()`. Read data from its file this way rather than copying its
150-  values into the source: the cell then shows the file, and follows it when it
151-  changes. Hidden files (`.env`) are not served.
152-- One shot per name: two cells must not declare the same top-level name.
153-  Shared helper names used across multiple artifacts (for example an
--
206-a simulation, a drawing, a calculator) comes with controls for what they are
207-likely to change next: a range, a count, a colour, a speed, a threshold. Each
208:is its own `view(Inputs.*)` cell in the artifact's group, and its default draws
209-exactly what was asked:
210-
211-```js
212:const turns = view(Inputs.range([1, 20], {label: "Turns", step: 1, value: 6}))
213-```
214-
215-A few controls that matter beat one per constant. When a request changes a
216-property ("make it red", "thicker"), put that property on a control whose
217:default is the value asked for (`Inputs.color({label: "Colour", value: "#ff0000"})`)
218-rather than writing the value into the drawing, because the next request is
219-usually "a bit less".
````

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
const monthly = view(Inputs.range([100, 2000], {label: "Monthly amount", step: 50, value: 500}))
```

<!-- pi -->

The monthly amount is now a slider from 100 to 2000, in steps of 50, starting at 500. I haven't seen it run, so I haven't confirmed that the 10-year total below it updates as you move the slider.

<!-- you -->

