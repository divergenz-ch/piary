---
pi: v1
session: eval-two-versions-diff
---

Here are two versions of our greeting function.

Before:

```js
function greet(name) {
  return "Hello " + name;
}
```

After:

```js
function greet(name, punctuation = "!") {
  return `Hello, ${name}${punctuation}`;
}
```

<!-- you -->

What changed between the two? Show me.

<!-- pi:tool read #toolu_012yJTfy5ua7kfxTGypbJrvt -->

```json
{
  "path": "<repo>/pi-extension/SKILL.md",
  "offset": 1,
  "limit": 80
}
```

<!-- pi:result #toolu_012yJTfy5ua7kfxTGypbJrvt -->

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

[167 more lines in file. Use offset=81 to continue.]
````

<!-- pi:view diff #toolu_0167MLoCgCHfFwvezkjqyqiB -->

```json
{
  "file": "greet.js",
  "oldText": "function greet(name) {\n  return \"Hello \" + name;\n}\n",
  "newText": "function greet(name, punctuation = \"!\") {\n  return `Hello, ${name}${punctuation}`;\n}\n"
}
```

<!-- pi:result #toolu_0167MLoCgCHfFwvezkjqyqiB -->

```
ok
```

<!-- pi -->

Three things changed:

1. **New parameter:** `punctuation` is optional and defaults to `"!"`.
2. **Output text:** the greeting now has a comma, `Hello, Ada!`. Before, it was `Hello Ada`.
3. **Style:** string concatenation became a template literal.

The change affects existing callers. `greet("Ada")` used to return `"Hello Ada"` and now returns `"Hello, Ada!"`. Anything that compares against the old string will break.

<!-- you -->

