# ADR 0005 — One canvas: the prompt is positional, resolved from the caret

**Status:** accepted. Implementation: `src/document/run.ts` (`promptAt`, `tailPrompt`, `promptEnd`,
`replySlot`, `runAnchor`), `src/document/format.ts` (`blocksFrom`, `promptFrom`, `leadIndex`).

## Context

The agent is no longer a talking partner but an **implementation partner working in the same canvas**
That changes a question the chat shape never had to ask.

In a transcript, "the prompt" is unambiguous: the last thing the user typed, at the bottom. The send
path originally meant exactly that — **the document's last segment**.

A page you compose **top-down** breaks it. Prompts sit in the middle of the document; the user writes
a heading, asks for a section under it, scrolls up and asks for something else under an earlier one.
The question "which prompt am I sending?" becomes **positional**, and so does "where does the answer
go?"

## Decision

**The caret decides.** `src/document/run.ts` answers the positional questions, and nothing else does:

- **`promptAt(segments, pos)`** — which prompt the caret means.
- **`tailPrompt(segments)`** — the document-last prompt (the old behavior, now one case rather than
  the rule).
- **`promptEnd(md, seg)`** — where that prompt's text stops.
- **`replySlot(md, segments, pos, body)`** — what the answer **occupies**: the region the streaming
  reply writes into, inside the block it belongs to.
- **`runAnchor(base, atTail, index)`** — where a run attaches.

`run.ts` is **pure — no DOM, no RPC** (ADR 0006). Position resolution is the highest-consequence logic
in the editor (get it wrong and the agent overwrites the user's text), and purity is what lets the
suite drive every case directly.

Blocks, not segments, are the unit a reply lands in: `blocksFrom` folds a lead segment and its
followers into one `DocBlock`, and `leadIndex`/`isFolded` resolve a position inside one to the block
that owns it.

## Consequences

- The agent writes **at the caret's block**, not appended below the document. That is the one-canvas
  behavior; the rest of what chat gets wrong (editable history, live answers) follows from the
  document being ordinary text.
- Streaming must attribute correctly against a document the user is **still editing**: edits above the
  machine's region are allowed, and attribution holds.
- Deleting across blocks, deleting a range, deleting a segment, moving a block, inserting a cell —
  each is a positional operation with its own test file (`tests/unit/delete-range.test.ts`,
  `delete-segment.test.ts`, `moveblock.test.ts`, `insert-cell.test.ts`, `run-at.test.ts`,
  `reply-slot.test.ts`). The density of those tests is proportional to the risk.

## Lessons

- **When a shape changes, re-ask what its vocabulary means.** "The prompt" survived the move from
  chat to canvas as a word while its referent changed from "the last segment" to "the one at the
  caret". The bug class is a term that still parses but no longer denotes.
- **Positional logic earns purity.** Every one of these functions is a one-line call from a
  component and a fully enumerable test; had they been methods on the editor, the cases would be
  reachable only through a mounted DOM.
- **A reply needs a *slot*, not an insertion point.** Modelling the answer as a region it occupies —
  rather than an offset it starts at — is what makes a re-run replace cleanly instead of appending.
