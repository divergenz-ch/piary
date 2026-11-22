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

I'm going to redefine the s4v1n6 cell with a slider, using a view-wrapped Inputs.range for the monthly value. I haven't read the skill file before touching this cell, though, so I'm going to read it now to be safe.

<!-- pi:tool bash #toolu_013FT6FhNmx3DGMmByPYNfkT -->

```json
{
  "command": "grep -n -i -B2 -A12 \"view(\\|Inputs\" <repo>/pi-extension/SKILL.md | head -80",
  "timeout": 10
}
```

<!-- pi:result #toolu_013FT6FhNmx3DGMmByPYNfkT -->

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
17-
18-```json
19-{ "file": "optional/path.ts", "oldText": "before\n…", "newText": "after\n…" }
20-```
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
97-  supported — cells are plain JavaScript, so `return` fails to parse. Use an
98-  IIFE (`(() => { …; return x; })()`) for multi-statement display cells.
99-  Also unsupported: top-level `yield` (wrap in a generator IIFE:
100-  `(function* () { yield … })()`), classic `viewof`/`mutable` syntax, and
--
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
133-  rather than flashing its default. Pick a key per artifact concern
134-  (`"board"`, `"turn"`), not per cell. Without this, everything the user did
135-  is gone on reload — the single most common complaint about a cell that
136-  keeps its state in a closure.
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
````

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
monthly = view(Inputs.range([100, 2000], {value: 500, step: 50, label: "Monthly amount"}))
```

<!-- pi -->

Needs a `const` declaration.

<!-- pi:block -->

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
const monthly = view(Inputs.range([100, 2000], {value: 500, step: 50, label: "Monthly amount"}))
```

<!-- pi -->

The monthly amount is now a slider from 100 to 2000, starting at 500 and moving in steps of 50. I redefined the cell to do this, but I haven't seen it run, so check that the slider shows up and that the 10-year total changes when you move it.

<!-- you -->

