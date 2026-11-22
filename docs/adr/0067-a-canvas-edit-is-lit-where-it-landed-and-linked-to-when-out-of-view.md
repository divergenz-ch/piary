# ADR 0067 — A canvas edit is lit where it landed, and linked to when it is out of view

**Status:** accepted (2026-11-23). A change to how the canvas behaves, asked for by the user on
2026-11-14 (ADR 0010). Builds on
[ADR 0033](0033-pi-edits-the-canvas-by-quoting-it.md).

## Context

`canvas_edit` changes prose anywhere in the document (ADR 0033), and the text it changes is
usually far from the prompt that asked: a heading at the top of a page the user is reading the
foot of. Nothing pointed at the change. The user learned of it from pi's closing words, and then
had to find it.

Three questions decide what the canvas shows: **what marks the change**, **what a reader who is
elsewhere is offered**, and **how long either lasts**.

## Decision

1. **The changed text is lit, and the light fades by itself.** When an edit lands, the text it
   put in is given a background that fades over `EDIT_LIT_MS` (2.4 s) and is then taken away. An
   edit that only removed text has none of its own to light, so the line it was taken from is lit
   instead; for a removed block (ADR 0065) that is the first line with text under where the block
   stood.
2. **Nothing is lit where nobody is looking.** A change is lit once its line is in view: at once
   when it lands in view, and otherwise when the reader gets to it, by the link or by scrolling.
   The fade is the one moment that says "here", and a fade played off screen is spent.
3. **A change out of view is one click away.** While a change waits to be seen, a link is pinned
   to the edge of the scroller on the side the change is on: `changed above ↑` at the top,
   `changed below ↓` at the bottom, with a count when more than one waits there
   (`2 changes above ↑`). A click scrolls to the nearest one and lights it. The link is pinned to
   the scroller, not placed in the answer, because the reader of a long answer is at its tail, or
   anywhere: the scroller's edge is the one place that is always in view.
4. **The link moves no caret.** The caret says which prompt is meant, so going to a change
   scrolls and leaves the selection alone. What the user types after a jump is still the next
   prompt.
5. **It is the canvas's own, and no document text.** The marks are a field of the editor, mapped
   through later edits like the run badge's anchor (ADR 0031); the lights are decorations and the
   links are elements of the editor's frame. The file, the undo history and what pi is told are
   as they were, and the host hears no new event. `docs/document-format.md` is untouched.
6. **A link is about the run that made the edit.** Changes still unseen are dropped when the next
   turn begins and when another document is opened in the window. An edit the user took back with
   ⌘Z is dropped with it.

What was weighed for the reader who is elsewhere:

| Offer | For | Against |
| --- | --- | --- |
| **A link pinned to the scroller's edge** (chosen) | In view wherever the reader is. Says which way the change is. Gone once the change has been seen, so it never needs dismissing. | One more floating element over the document. |
| A link in the answer, by the run badge | Belongs to the run visibly. | The badge is at the top of the answer and the reader of a long one is at its foot: more than one click away, which is the fault being fixed. |
| Scroll to the change when it lands | No click at all. | Takes the page from under a reader mid-sentence, for a change they may not care to look at now. |
| Light it off screen and say nothing | Nothing to build beyond the light. | The fade is over before anyone sees it. |

## Consequences

- An edit inside something the canvas draws as one piece, a collapsed block or a rendered table,
  is lit underneath it, where it does not show; the link still goes to the place.
- The whole of the text pi put in is lit, not the characters that differ from what it replaced:
  the quote is what pi chose to rewrite, and a one-letter light is not found by eye.
- jsdom has no layout, so `tests/integration/edit-highlight.test.ts` gives the scroller a
  rectangle to hold the out-of-view rules, and `e2e/flows.spec.ts` shows them on a real page that
  scrolls.

## Lessons

- **A signal about somewhere else has to be where the reader is.** The edit was already correct
  and already undoable; what was missing was only that the user could see it happened. The
  cheapest surface that is always in view carried it, and the document needed nothing added.
