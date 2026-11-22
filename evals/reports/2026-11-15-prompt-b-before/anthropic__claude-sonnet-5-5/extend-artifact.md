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

I'm thinking about whether to read the skill first, since I need to know how the reactive inputs bind. The input is probably an Inputs.range declared as a viewof in an Observable cell, or something similar in plain JS. I'll go read the skill quickly.

<!-- pi:tool bash #toolu_01U6sShGNAdE1fvmWmbq4jsM -->

```json
{
  "command": "grep -n -i -B2 -A12 \"viewof\\|Inputs\" <repo>/pi-extension/SKILL.md | head -80",
  "timeout": 10
}
```

<!-- pi:result #toolu_01U6sShGNAdE1fvmWmbq4jsM -->

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
97-  supported — cells are plain JavaScript, so `return` fails to parse. Use an
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
119-- State with no widget — a game board, a canvas, a drawing, anything the
120-  user changes by clicking your own DOM — goes through `state`, which is a
121-  `view()` that renders nothing:
122-
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
154-  `lp_`-prefixed function another artifact calls) must never be declared a
155-  second time — redefine that cell by id.
156-
157-Redefinition: pass the `id` of an existing cell (yours from an earlier
--
205-a simulation, a drawing, a calculator) comes with controls for what they are
206-likely to change next: a range, a count, a colour, a speed, a threshold. Each
207:is its own `view(Inputs.*)` cell in the artifact's group, and its default draws
208-exactly what was asked:
209-
210-```js
211:const turns = view(Inputs.range([1, 20], {label: "Turns", step: 1, value: 6}))
212-```
213-
214-A few controls that matter beat one per constant. When a request changes a
215-property ("make it red", "thicker"), put that property on a control whose
216:default is the value asked for (`Inputs.color({label: "Colour", value: "#ff0000"})`)
217-rather than writing the value into the drawing, because the next request is
218-usually "a bit less".
219-
220-**Keep what the user set.** A control the user has moved keeps their value
221-when you redefine its cell, as long as the new definition declares the same
222-name. A changed range or label keeps it, but a renamed control starts again
223-from its default. So change the cell the request is about, and when a
224-control must change, keep its export name. Values set through
225-`state(key, …)` survive a redefinition the same way, by key. A prompt that opens
226-with `[cell values] {…}` carries what the user has set right now, by export
227-name. Read it before you change a control, and keep those values unless you
228-are asked to change them.
````

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
const monthly = view(Inputs.range([100, 2000], {label: "Monthly amount", step: 50, value: 500}))
```

<!-- pi -->

The monthly amount is now a slider from 100 to 2000, in steps of 50 and starting at 500. The 10-year total underneath updates as you move it. I haven't moved the slider to check that.

<!-- you -->

