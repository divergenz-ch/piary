# ADR 0052 — A table cell is drawn from the canvas's own parse, and is its source while edited

**Status:** accepted (2026-11-16). Builds on ADR 0010 (the interaction is reproduced, not
revisited): the table stays an edit-in-place widget, and only what an unfocused cell draws
changes.

## Context

A rendered table showed each cell's markdown as typed: `**Subtotal**` with its stars, a code span
with its backticks, a link with its brackets and URL, `\*` with its backslash. Outside a table the
same marks hide. Testers read the stars as a broken answer, and
one asked the agent to remove them; it wrote them again, because the markdown was correct and the
canvas was what did not draw it. A backslash escape in prose showed its backslash for the same
reason: no rule hid it.

Four ways to close it were built side by side and recorded against the same document,
and the two that change the prompt were measured with the evals (18 answers each, on
`claude-sonnet-5-5` alone).

## Decision

- **A cell is drawn from the tree the prose is drawn from.** The plan (`liveMdPlan`) gives each
  cell its inline runs (text, strong, emphasis, strikethrough, code, link), read off the editor's
  markdown tree, and the widget builds them as DOM nodes. One parser decides what is bold in a
  paragraph and in a cell, so the two cannot disagree. A node the cell has no drawing for (an
  image, an HTML tag, an entity) is its source text.
- **Never an HTML string.** Cell text is transcript content: runs become nodes one by one, and a
  link's destination passes `safeLinkUrl` or the link opens nothing.
- **A focused cell is its source.** From focus until the table commits, the cell holds what the
  document holds, so what is typed is what is written, and leaving a cell unedited changes nothing.
  A cell that committed no change is drawn rendered again.
- **A link in a cell opens on a modified click**, as in the prose; a plain click edits.
- **A bracketed word with no destination keeps its brackets in a cell** (`[1]`, `[sic]`).
- **An escape's backslash hides like any other mark**, in prose and in a cell: away from the
  caret it is the character alone.
- **No prompt change.** The agent goes on writing ordinary markdown, which is also what every
  other reader of the file renders.

## Declined

- **Parsing cells with `marked`.** Less code in the canvas, and the same picture on ordinary
  cells, but a second grammar beside the editor's: on a corpus of 53 cells the two disagreed on
  four (`H~2~O` and `~word~` struck through, a bare `www.` address and an e-mail address   a destination where the prose gives them none), and
  each disagreement is a cell that changes its look when the caret reveals the raw table.
- **Reading cells as HTML and telling the agent to write `<b>`.** Every table already written
  with stars stays broken, the prompt carries a line on every turn that names the renderer's
  allowlist, and the model follows it unevenly: 13 of 18 answers were clean, two replaced the
  table with a raw `<table>` block and three used a tag outside the allowlist. The first, shorter
  wording was ignored outright.
- **Telling the agent to write plain cells and changing nothing on the canvas.** The model
  complies (18 of 18), and the answers get worse: totals in capitals, the winner marked
  `(CHOSEN)`, commands without code styling, a sentence apologising for the table. Tables already
  written, and a table the user types, stay as they were.
- **Hiding a code block's fence lines** in the same change. It alters what the canvas kept
  visible on purpose and is judged on its own.

## Consequences

- `tests/unit/markdown-live.test.ts` holds what a cell's runs are;
  `tests/integration/markdown-table-cells.test.ts` holds the focus, commit, revert and link
  gestures; `e2e/canvas.spec.ts` holds a real click and real typing in both engines.
- A new inline construct the prose learns to draw needs a case in `inlineRuns`, or a cell shows
  its source for it: the honest default.
