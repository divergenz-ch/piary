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

I'm going to swap cell s4v1n6 for a slider while keeping the name monthly. I'm not sure whether the right pattern is Inputs.range wrapped in view(), or the viewof form from Observable-style ojs, so I'll check the skill to confirm which one this mode uses.

<!-- pi:tool bash #toolu_01FxGM39Wb3nj5JiawrigF5M -->

```json
{
  "command": "grep -n -i -B2 -A8 \"viewof\\|view(\" <repo>/pi-extension/SKILL.md | head -60",
  "timeout": 10
}
```

<!-- pi:result #toolu_01FxGM39Wb3nj5JiawrigF5M -->

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
216-default is the value asked for (`Inputs.color({label: "Colour", value: "#ff0000"})`)
````

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
const monthly = view(Inputs.range([100, 2000], {label: "Monthly amount", step: 50, value: 500}))
```

<!-- pi -->

The monthly amount is now a slider from 100 to 2000, in steps of 50, starting at 500. The result cell reads it, so the 10-year total should change as you move it. I couldn't confirm the cell ran, so check that the total updates.

<!-- you -->

