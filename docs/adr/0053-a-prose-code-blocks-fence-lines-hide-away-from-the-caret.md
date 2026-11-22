# ADR 0053 — A prose code block's fence lines hide while the caret is away

**Status:** proposed (2026-11-16). Changes behaviour the canvas kept on purpose, so it is a
decision under ADR 0010 rather than a fix; it is accepted by merging the pull request that
carries it.

## Context

The live markdown hides a mark while the caret is away from it (`**`, `#`, a link's apparatus)
and kept one exception: a fence line never hid, because a fence is also how the format carries a
payload (a cell's source, a view's data, a tool's arguments and output), and that text has to
stay honest. The exception was drawn around every fence, though, and a code block in an answer
is not a payload. A tester read the ```` ```text ```` above an
answer's code block as a block that had failed to render.

## Decision

- **A code block in prose is drawn without its two fence lines while the selection is away from
  it.** The lines take no height. A selection that touches the block, its edges included, brings
  both back, so no caret is ever on a hidden line and the text is edited as it is written.
- **Prose is what the host says it is.** `markdown-live.ts` asks a facet (`proseAt`), and the
  canvas answers from its own parse: the body of a `you` or a `pi` segment. Everything else is a
  marker's payload and keeps its fence. With no answer given nothing is prose. The live markdown
  never reads an info string to decide: `js` names a cell's mode and an answer's snippet alike.
- **Hidden as two whole lines or not at all.** A fence that is unclosed (an answer still
  streaming), that holds no code, or that sits in a list or a quote, where the fence shares its
  line with the list's or the quote's mark, stays as written.
- **The block still reads as one.** Its code lines are tinted, and the first carries the language
  the hidden fence named, drawn by CSS from an attribute: nothing is added to the document.

## Declined

- **Hiding only the marks and leaving the lines.** Two empty line boxes around the code read as
  stray blank lines; the complaint becomes a quieter one.
- **Deciding by info string** (`text`, or none, is prose). It is a guess the format does not
  back, and it would hide a cell's fence the day a mode is named like a language.
- **A widget in place of the block.** The code would stop being text of the document that the
  caret walks into, which is what the canvas is (ADR 0005).

## Consequences

- A closing fence that arrives while an answer streams takes two lines out of the flow at once,
  below the reader's caret or above it.
- A new segment kind whose body is prose must be added to the canvas's answer (`inProse` in
  `DocumentChat.ts`), or its code blocks keep their fences. That is the safe side to err on.
- Held by `tests/unit/markdown-live.test.ts` (which fences), `tests/integration/markdown-fences.test.ts`
  (which segments) and `e2e/canvas.spec.ts` (the lines take no height, in both engines).
