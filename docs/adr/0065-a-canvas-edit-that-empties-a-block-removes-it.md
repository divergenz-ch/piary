# ADR 0065 — A canvas edit that empties a block removes it, marker included

**Status:** accepted (2026-11-23). How pi names the block and which blocks it may remove were put
to the user and decided that day. Amends
[ADR 0033](0033-pi-edits-the-canvas-by-quoting-it.md), whose consequences said whole-block
removal was not offered.

## Context

`canvas_edit` changes text inside one block of prose (ADR 0033). An empty `newText` removes the
quoted text, so pi asked to delete a paragraph that was a block of its own quoted all of it and
replaced it with nothing. The text went and the marker stayed: an empty `you`, `pi` or `pi:note`
on the page, a block with nothing in it that the user then had to delete by hand. pi had no way to
remove the block itself, and ADR 0033 had left that as a new decision, because a tool for it
"would address blocks".

"Block" here is one **segment** of `docs/document-format.md`: a marker and the body under it. It
is not the rail's block, the group of segments one prompt opens (`docs/GLOSSARY.md`).

Two questions decide it: **how pi names the block**, and **which blocks it may remove**.

## Decision

1. **No new tool and no new addressing: the edit that empties a block removes it.** When a
   `canvas_edit` leaves the body of its block with no text (the quote was all of it, or all that
   was left, and `newText` is empty or only whitespace), the page removes the block with its
   marker. pi still names text by quoting it, so nothing of ADR 0033's choice changes and
   `docs/document-format.md` is untouched. An edit that leaves any text keeps the marker.
2. **Every block a quote may land in can be removed: `you`, `pi` and `pi:note`.** These are the
   blocks `canvas_edit` could already empty, and an empty prompt or note was already no message
   (`document-format.md` §Message reconstruction), so no message leaves pi's history that the
   emptying edit had not already taken. One thing differs: an empty prompt or note still ended
   the answer above it, so the answers on either side were two assistant messages in a row;
   with the marker gone they are one, as after the user's own delete. A cell, a tool's call, result or view and a file are still refused, as
   ADR 0033 §3 has it; a cell is a segment of its own, so removing the prose above one leaves it
   standing.
3. **The removal is the user's own delete.** The span is `deleteSegment`'s
   (`src/document/run.ts`), the function behind the user's delete of one segment: the
   `pi:block` marker that folded a removed prompt into the block above goes with it, an
   attachment above a removed prompt stays and belongs to the next prompt, and a page emptied of
   segments is a new page. It is one undoable change, and ⌘Z brings the block back.
4. **Two prompts keep their marker.** The prompt being answered is not emptied: its answer would
   be left with no question, so the edit is refused and says so; rewording it is still allowed.
   The page's trailing prompt is where the user types next, so emptied it stays, as it does for
   the user.
5. **`ok` means the document changed.** The editor drops a change that clips a marker, without
   an error, so the plan for a removal covers the block whole. As a guard, the page answers `ok`
   only when the change landed: a change the editor dropped is a refusal. No plan is known to
   reach the guard, so no test does.

### Alternatives weighed

| Option | For | Against |
| --- | --- | --- |
| **The emptying edit removes the block** (chosen) | Nothing to teach: pi already empties a block when asked to delete it, and now that does what was meant. No second tool in the guidance. | A short body that also occurs elsewhere is refused as found in several places, and pi cannot quote across the marker to tell them apart. It can reword the block instead, or say so. |
| A separate `canvas_remove(text)` that removes the block a quote is in | Removes a block from a partial quote, so a repeated body is no obstacle. | A second tool and its description; and it removes more than it quoted, so a quote that lands in the wrong block deletes all of it. |
| Only pi's own answers removable | pi never removes what the user wrote. | pi can already empty the user's block; keeping the empty marker protects nothing and leaves the page worse. |

## Consequences

- A turn that removed a block above its prompt is followed by a rebuild at the next send, as for
  any edit above a prompt (ADR 0033).
- Moving a block is still not offered.
- Held by `tests/unit/canvas-edit.test.ts` (the plan) and `e2e/flows.spec.ts` (the page: the
  removal, its undo, the refusal).

## Lessons

- **A change the editor may drop has to be checked after it is dispatched.** The first plan for a
  removal started inside the marker; the editor dropped it and the tool was told `ok`. The unit
  tests, which apply a plan to a string, passed. Only the page spec showed it.
