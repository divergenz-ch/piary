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

I'm wondering whether I should read the skill first, since I'm not fully sure how reactive cells work here. I think the monthly input is probably set up as a `viewof` range input, so I'll read the skill quickly to make sure I have it right.

<!-- pi:tool bash #toolu_01Kr8eu1yQhyYRWznKw5mBfN -->

```json
{
  "command": "grep -n -i -B2 -A12 \"viewof\" <repo>/pi-extension/SKILL.md | head -60",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Kr8eu1yQhyYRWznKw5mBfN -->

```
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
110-- `view(…)` wraps an input into a value: `const gain = view(Inputs.range([0, 10]))`
111-  renders a slider and gives dependents the live number.
112-- Interactive state belongs in the dataflow graph, not in DOM listeners:
```

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
const monthly = view(Inputs.range([100, 2000], {value: 500, step: 50, label: "Monthly amount"}))
```

<!-- pi -->

The monthly amount is now a slider from 100 to 2000. It moves in steps of 50 and starts at 500. The 10-year total below it should update as you drag. I didn't drag the slider to test that.

<!-- you -->

