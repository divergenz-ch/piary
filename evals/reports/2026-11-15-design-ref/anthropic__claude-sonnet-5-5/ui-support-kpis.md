I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:tool read #toolu_01EVQ2kPZ6qEu3k8MNMHi1o8 -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 60
}
```

<!-- pi:result #toolu_01EVQ2kPZ6qEu3k8MNMHi1o8 -->

````
---
name: view-templates
description: Read before calling `cell`, `canvas_edit` or `view` — the semantics of reactive code cells (what parses, how controls and state work), how `canvas_edit` changes prose already in the document, the payload schemas of the view templates (diff, file-tree, table, cards, matches, properties), and how to compose an `a2ui` answer to look at (stat tiles, decision matrices, charts, explainers whose sliders recompute).
---

# View templates

`view(template, data)` renders `data` as a widget block in the Piary
document. The call is the artifact — it computes nothing and returns `ok`.
In any other markdown renderer the block degrades to a plain JSON code
fence, so only send data that also reads as JSON.

Pick the template whose shape fits; a payload that does not fit is refused
with the reason, so match the shapes below exactly. An answer to look at is
`a2ui` (below); the others show data as it is.

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

For ps/df-shaped output, shown as it came. Cells are strings, numbers,
booleans, or null; numeric columns right-align automatically. Figures you
worked out are an `a2ui` answer, not a table.

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


[244 more lines in file. Use offset=61 to continue.]
````

<!-- pi -->

Deltas: opened +8.4%, closed +7.3%, reply −0.7h, CSAT +3, backlog +14.

<!-- pi:view a2ui #toolu_01UmAon48c7oEhJ5DL2LSnGR -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "k1",
        "k2",
        "chart",
        "note"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Support desk: week to Fri 13 Nov"
    },
    {
      "id": "k1",
      "component": "Row",
      "children": [
        "o",
        "c",
        "b"
      ]
    },
    {
      "id": "k2",
      "component": "Row",
      "children": [
        "r",
        "s"
      ]
    },
    {
      "id": "o",
      "component": "Stat",
      "label": "Opened",
      "value": 412,
      "delta": 32,
      "good": "down",
      "note": "last week 380"
    },
    {
      "id": "c",
      "component": "Stat",
      "label": "Closed",
      "value": 398,
      "delta": 27,
      "good": "up",
      "note": "last week 371"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "Backlog",
      "value": 57,
      "delta": 14,
      "good": "down",
      "note": "last week 43 (+33%)"
    },
    {
      "id": "r",
      "component": "Stat",
      "label": "Median first reply",
      "value": 2.4,
      "unit": "h",
      "delta": -0.7,
      "good": "down",
      "note": "last week 3.1 h"
    },
    {
      "id": "s",
      "component": "Stat",
      "label": "CSAT",
      "value": 91,
      "unit": "%",
      "delta": "+3 pts",
      "good": "up",
      "note": "last week 88%"
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "bar",
      "x": "day",
      "y": "opened",
      "title": "Tickets opened per day",
      "data": [
        {
          "day": "Mon",
          "opened": 96
        },
        {
          "day": "Tue",
          "opened": 88
        },
        {
          "day": "Wed",
          "opened": 79
        },
        {
          "day": "Thu",
          "opened": 81
        },
        {
          "day": "Fri",
          "opened": 68
        }
      ]
    },
    {
      "id": "note",
      "component": "Callout",
      "tone": "warning",
      "title": "Watch the backlog",
      "text": "Replies and CSAT improved, but opened (412) outpaced closed (398), so backlog grew by 14. Intake fell through the week."
    }
  ]
}
```

<!-- pi:result #toolu_01UmAon48c7oEhJ5DL2LSnGR -->

```
ok
```

<!-- pi -->

I built a one-screen dashboard of this week's numbers. Backlog is the one to watch: 57 against 43 last week, because 412 tickets opened and only 398 closed.

The rest moved the right way:
- **First reply:** median fell to 2.4 h from 3.1 h.
- **CSAT:** up 3 points to 91%.
- **Intake:** opened tickets dropped from 96 on Monday to 68 on Friday.

Everything on it is typed in from your message, so it won't update by itself. Next week, send me the new figures and I'll refresh it.

<!-- you -->

