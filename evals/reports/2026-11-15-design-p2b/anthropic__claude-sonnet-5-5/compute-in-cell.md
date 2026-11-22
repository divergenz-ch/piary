What is the monthly payment on a 300 000 CHF mortgage at 1.8% a year over 25 years? Show the calculation so I can change the numbers.

<!-- pi:tool read #toolu_012r6RCPNhn1kjhsbjPKqwF1 -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 150
}
```

<!-- pi:result #toolu_012r6RCPNhn1kjhsbjPKqwF1 -->

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

<!-- pi -->

Use a2ui with sliders instead.

<!-- pi:view a2ui #toolu_01Xd6fX3C1WBqW85W7js4nYn -->

```json
{
  "dataModel": {
    "P": 300000,
    "r": 1.8,
    "y": 25
  },
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "pIn",
        "rIn",
        "yIn",
        "k",
        "note"
      ]
    },
    {
      "id": "t",
      "component": "Text",
      "text": "## Monthly mortgage payment"
    },
    {
      "id": "pIn",
      "component": "Slider",
      "label": "Loan, CHF",
      "min": 50000,
      "max": 2000000,
      "steps": 1000,
      "value": {
        "@path": "/P"
      }
    },
    {
      "id": "rIn",
      "component": "Slider",
      "label": "Interest, % a year",
      "min": 0.1,
      "max": 8,
      "steps": 0.1,
      "value": {
        "@path": "/r"
      }
    },
    {
      "id": "yIn",
      "component": "Slider",
      "label": "Years",
      "min": 5,
      "max": 40,
      "steps": 1,
      "value": {
        "@path": "/y"
      }
    },
    {
      "id": "k",
      "component": "Row",
      "children": [
        "pay",
        "tot"
      ]
    },
    {
      "id": "pay",
      "component": "Stat",
      "label": "Monthly payment",
      "unit": "CHF",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(P * (r/1200) / (1 - (1 + r/1200) ^ (-12*y)) * 100) / 100",
          "vars": {
            "P": {
              "@path": "/P"
            },
            "r": {
              "@path": "/r"
            },
            "y": {
              "@path": "/y"
            }
          }
        }
      }
    },
    {
      "id": "tot",
      "component": "Stat",
      "label": "Total interest",
      "unit": "CHF",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(P * (r/1200) / (1 - (1 + r/1200) ^ (-12*y)) * 12*y - P)",
          "vars": {
            "P": {
              "@path": "/P"
            },
            "r": {
              "@path": "/r"
            },
            "y": {
              "@path": "/y"
            }
          }
        }
      }
    },
    {
      "id": "note",
      "component": "Callout",
      "tone": "info",
      "title": "Formula",
      "text": "M = P·i / (1 − (1+i)^−n), with i = rate/12 and n = years×12 (annuity, fixed rate)."
    }
  ]
}
```

<!-- pi:result #toolu_01Xd6fX3C1WBqW85W7js4nYn error -->

```
The a2ui surface would not render, so the user would see this error instead:
- VALIDATION_FAILED at /components/3/steps: Validation failed for component 'Slider' (rIn): steps: Expected integer, received float, steps: Number must be greater than or equal to 1
Fix the payload and call view again.
```

<!-- pi:thinking -->

I'm weighing whether "steps" is even needed here, since it's probably just a count and I could drop it from the rate calculation or switch to integer arithmetic. Expressing the rate in basis points is another option, but simply omitting the steps term looks like the cleaner route.

<!-- pi:view a2ui #toolu_01SHPSK99yMMxkNnXL7ei6yD -->

```json
{
  "dataModel": {
    "P": 300000,
    "r": 1.8,
    "y": 25
  },
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "pIn",
        "rIn",
        "yIn",
        "k",
        "note"
      ]
    },
    {
      "id": "t",
      "component": "Text",
      "text": "## Monthly mortgage payment"
    },
    {
      "id": "pIn",
      "component": "Slider",
      "label": "Loan, CHF",
      "min": 50000,
      "max": 2000000,
      "value": {
        "@path": "/P"
      }
    },
    {
      "id": "rIn",
      "component": "Slider",
      "label": "Interest, % a year",
      "min": 0.1,
      "max": 8,
      "value": {
        "@path": "/r"
      }
    },
    {
      "id": "yIn",
      "component": "Slider",
      "label": "Years",
      "min": 5,
      "max": 40,
      "value": {
        "@path": "/y"
      }
    },
    {
      "id": "k",
      "component": "Row",
      "children": [
        "pay",
        "tot"
      ]
    },
    {
      "id": "pay",
      "component": "Stat",
      "label": "Monthly payment",
      "unit": "CHF",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(P * (r/1200) / (1 - (1 + r/1200) ^ (-12*y)) * 100) / 100",
          "vars": {
            "P": {
              "@path": "/P"
            },
            "r": {
              "@path": "/r"
            },
            "y": {
              "@path": "/y"
            }
          }
        }
      }
    },
    {
      "id": "tot",
      "component": "Stat",
      "label": "Total interest",
      "unit": "CHF",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(P * (r/1200) / (1 - (1 + r/1200) ^ (-12*y)) * 12*y - P)",
          "vars": {
            "P": {
              "@path": "/P"
            },
            "r": {
              "@path": "/r"
            },
            "y": {
              "@path": "/y"
            }
          }
        }
      }
    },
    {
      "id": "note",
      "component": "Callout",
      "tone": "info",
      "title": "Formula",
      "text": "M = P·i / (1 − (1+i)^−n), with i = rate/12 and n = years×12 (annuity, fixed rate)."
    }
  ]
}
```

<!-- pi:tool bash #toolu_01B3RPXB3YevFKXGedoxkUct -->

```json
{
  "command": "python3 -c \"i=.018/12;print(300000*i/(1-(1+i)**-300))\"",
  "timeout": 5
}
```

<!-- pi:result #toolu_01SHPSK99yMMxkNnXL7ei6yD -->

```
ok
```

<!-- pi:result #toolu_01B3RPXB3YevFKXGedoxkUct -->

```
1242.5556160205415
```

<!-- pi -->

The monthly payment is about **CHF 1,242.56**. I checked this by recomputing it outside the widget. The sliders above let you change the loan, rate and years.

The formula is M = P·i / (1 − (1+i)^−n). Here i is the yearly rate divided by 12 and n is the number of years times 12. It assumes a fixed-rate annuity, so the payment stays the same every month.

<!-- you -->

