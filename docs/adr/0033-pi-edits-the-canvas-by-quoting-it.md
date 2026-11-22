# ADR 0033 — pi edits the canvas by quoting it, and the page applies the edit

**Status:** accepted (2026-11-14). Quoted text is the block addressing, chosen over block ids and
positions. Amended by [ADR 0065](0065-a-canvas-edit-that-empties-a-block-removes-it.md): an edit
that empties a block removes it.

## Context

A conversation is one markdown file (ADR 0001), the user and pi both write into it (ADR 0005), and
pi's history is rebuilt from it (ADR 0002). The one tool pi has had that changes something already in
the document is `cell`, which redefines a cell by its `#id`. For a heading, a paragraph or an earlier
answer pi had nothing, so asked to fix one it reached for `edit` or `write` on the `.md` file. That
failed three ways: it is an outside edit, so the open window either writes its own text back over it
or asks the user to keep, take or fork; pi has edited a same-named file in the workspace instead; and
pi has said "fixed" when nothing changed.

Two questions decide a canvas-edit tool: **who applies the change**, and **how pi names the text it
means.**

The jobs the eval set and real use show are all text-shaped: correct a typo or a fact in the user's
prose or in an earlier answer, reword a heading, drop a sentence, add a line after one. None of them
moves or restructures blocks.

## Decision

**1. The page applies the edit.** The page owns the open document, so the tool asks it: an `input`
dialog over pi's extension UI channel titled `piary:canvas-edit`, the channel the `cell` tool's
verdicts use (ADR 0031), gated on the same `PIARY_VERDICTS=1`. The page plans the change against the
document as it stands, applies it as an ordinary edit, and answers `ok` or why not; a refusal is the
tool's error, so pi requotes inside the same turn. Nothing writes the file but the page, so there is
no outside edit, no wrong file and no "fixed" without a check — the tool's answer *is* the check.
Without a page (a terminal pi, the eval runner) the tool fails saying so, and pi
writes the change in its answer, which is what the system prompt already tells it to do.

**2. pi names text by quoting it** (the alternatives below were weighed). One tool,
`canvas_edit(oldText, newText)`: `oldText` must occur exactly once in the document, inside the body
of one prose block (`you`, `pi`, `pi:note`), and `newText` replaces it. Empty `newText` removes; an
insert-after repeats the quote and adds to it. One tool covers the three edits the ticket lists.

| Addressing | For | Against |
| --- | --- | --- |
| **Quoted text** (chosen) | pi already uses it (`edit`'s old/new), so it is reached for without teaching. Needs no format change: a plain markdown file stays clean (ADR 0001). Robust to the user editing elsewhere mid-turn, since nothing is an offset. A miss is loud and specific (not found, found N times). | Ambiguous text needs more context quoted. pi must quote the document's spelling. The history it hears is the document's text with the app's own lines added to the user's messages — the `[now: …]` line every send carries (ADR 0028) and `[attached: …]` lines — which pi may quote; the planner drops them from both texts. A marker look-alike line, escaped in the file, still differs, and fails as "not found". |
| Block ids | Exact, and the `cell` tool shows ids work. | Every prose block would need an id in the file — a marker per paragraph, a format change, and noise in every other renderer, against the principle that a markerless file is a valid conversation. A user's typed block has no id until something assigns one. |
| Position (block index, line) | Short to say. | pi never hears block structure (ADR 0021 §4: openers are not part of what it is told), so it has nothing to count with; and any edit, the user's or pi's own, shifts every later position mid-turn. |

**3. What a quote may touch.** Only prose. A quote in a cell is refused with the cell's id and a
pointer to `cell`; a quote in a tool call, result, view or file block is refused as a record Piary
keeps. A quote that crosses a marker is refused as spanning blocks, and `newText` is escaped
(`escapeBody`) so it cannot add one: the structure is the app's, and this ADR changes no grammar —
`docs/document-format.md` is untouched. The running turn's own region is not the canvas: a quote only
it holds is not found.

**4. The edit is the user's to undo, and a rebuild carries it.** It is applied as an ordinary change,
kept in the undo history, so ⌘Z takes it back like any change to the user's text. The transcript
learns of it the way it learns of any edit above the prompt: the next send compares the document with
`get_entries`, sees the change, and rebuilds (ADR 0002, ADR 0021). The tool call stays in the answer
as the record of what was asked.

**5. Bounded like a cell.** Three refused edits in a run, then the answer tells pi to stop and tell
the user (`app/canvas-edits.ts`), the bound and reason of ADR 0031.

## Consequences

- A send after a turn that edited earlier prose rebuilds pi's history and restarts pi, which costs
  seconds. That is the price of the document being the history, paid by every edit above a prompt.
- The eval runner has no page, so it measures whether pi reaches for `canvas_edit` rather than the
  file, not whether the edit lands; the page's half is held by `e2e/flows.spec.ts`.
- Moving a block is not offered. Removing one is: an edit that empties a block takes its marker
  too ([ADR 0065](0065-a-canvas-edit-that-empties-a-block-removes-it.md)).

## Lessons

- **The tool that changes the document asks the thing that holds it.** A tool that answered `ok` and
  left the page to apply its transcript entry later — the `cell` model — would have said done about an
  edit that could still miss. Asking first is what lets the answer be the check.
