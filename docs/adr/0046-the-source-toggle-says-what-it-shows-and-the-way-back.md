# ADR 0046 — The source toggle says what it shows, and the raw text says the way back

**Status:** accepted (2026-11-15). Amends ADR 0013: a live view with no process behind it draws a
line saying so, where that ADR settled on an empty grid.

## Context

A view and an artifact each carried a bare `⟨⟩` that took the rendered result away and left the
raw fences. Nothing on it said what it did, and nothing in the raw text said the result could come
back: two testers believed they had deleted their work. A
terminal carried the same toggle, though its fence is empty by design, so its "source" was two
empty fence lines; and a document reopened with a terminal in it showed an empty grid that read
as a broken one.

## Decision

- **The toggle is labelled by what it opens.** A view's reads `⟨⟩ source`. An artifact's reads
  `⟨⟩ markdown`, because `source` is already what the artifact's own label opens (its code panes).
  Each tooltip names what the toggle reaches and says nothing is deleted.
- **The raw text carries the way back.** Every label the toggle laid bare has a `← Show result`
  button, superseded cell definitions included. An artifact's marker line, laid bare, reads
  `artifact @name` and carries the button too: it is the first place a reader looks.
- **A live view has no source toggle**, on its label or in the menu: there is no source to show.
- **A live view with no process behind it says so.** A terminal in a reopened document draws one
  line saying a terminal ran here and that its output is not kept, and points at the output step
  when the document holds one. What ADR 0013 decided stands: scrollback is not document content,
  and nothing is persisted for a terminal.

## Declined

- **A banner over the document while anything is laid bare.** It says the same thing once, far
  from where the reader is looking, and it is chrome the canvas otherwise does without.
- **Moving the toggle into a cell's `⋯` menu.** It hides the one control whose problem was that
  nobody understood it.
- **Calling the artifact's toggle `source`.** Two controls with one name on one block.

## Consequences

- The toggle's reach and wording are held by `tests/integration/source-toggle.test.ts`.
- A future live view gets the same two rules without asking: no source toggle, and a line in
  place of an empty surface when nothing is behind it.
