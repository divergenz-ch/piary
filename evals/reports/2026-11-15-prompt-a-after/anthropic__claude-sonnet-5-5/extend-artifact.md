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

I'm redefining the cell as a range slider for the monthly value, and I'm weighing whether the Observable-style `view(Inputs.range(...))` form fits this cell system or whether I should switch to a plain JS version. I'm leaning toward the plain version to be safe, but I want to check the skill documentation before committing to either.

<!-- pi:tool bash #toolu_01MfYfR1g26cDhwmn6Q81Kh2 -->

```json
{
  "command": "grep -n -i -B2 -A8 \"view(\\|viewof\\|Inputs\" <repo>/pi-extension/SKILL.md | head -60",
  "timeout": 10
}
```

<!-- pi:result #toolu_01MfYfR1g26cDhwmn6Q81Kh2 -->

````
6-# View templates
7-
8:`view(template, data)` renders `data` as a widget block in the Piary
9-document. The call is the artifact — it computes nothing and returns `ok`.
10-In any other markdown renderer the block degrades to a plain JSON code
11-fence, so only send data that also reads as JSON.
12-
13-Pick the template whose shape fits; a payload that does not fit is refused
14-with the reason, so match the shapes below exactly.
15-
16-## diff — unified line diff
--
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
113:  route it through `view()` (or a cell that re-exports it) so other cells,
114-  the host, and the agent can read it. A widget that keeps its state in raw
115-  DOM event handlers is invisible to everyone but the user's eyes.
116:  `view()`-routed state also survives reloads: the host persists it in the
117-  session transcript and restores it into the widgets on boot — you never
118-  write or read that yourself.
119-- State with no widget — a game board, a canvas, a drawing, anything the
120-  user changes by clicking your own DOM — goes through `state`, which is a
121:  `view()` that renders nothing:
122-
123-  ```js
124:  const board = view(state("board", Array(9).fill(null)));   // reactive, persisted
125-  ```
126-
127-  ```js
128-  setState("board", next);   // write from an event handler or another cell
129-  ```
130-
131-  Dependents re-run on every `setState`, and the value is restored *before*
132-  the first paint on reload, so the artifact comes back as the user left it
--
````

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
const monthly = view(Inputs.range([100, 2000], {value: 500, step: 100, label: "Monthly amount"}))
```

<!-- pi -->

The monthly amount is now a slider from 100 to 2000, starting at 500 and moving in steps of 100. The result cell still reads `monthly`, so the 10-year total should update as you drag it. I haven't seen the slider run in the page yet.

<!-- you -->

