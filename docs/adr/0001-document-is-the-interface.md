# ADR 0001 — The document is the interface; markers are HTML comments

**Status:** accepted. Normative spec: `docs/document-format.md` (v1), `docs/notebook-cells.md`.

## Context

A conversation with an agent is conventionally a transcript: a list of turns owned by the
application, rendered from a database, editable only through the application's own affordances. Four
things follow from that shape: the conversation isn't yours,
history isn't editable, answers are dead text, and the shape is wrong.

The prototype's claim is that **one canvas** fixes the first three as consequences. But a canvas is
only yours if you can take it somewhere else — so the storage format, not the component, is where the
claim is settled.

## Decision

**A conversation is one markdown file**, and the file is the interface. All machine structure lives in
**HTML comments**, which render as nothing; payloads (tool arguments, tool output) are **fenced code
blocks**.

Design goals, in priority order (`docs/document-format.md`):

1. **A plain markdown file is a valid conversation.** A file with no markers at all is one pending
   user message. You can start a conversation by typing prose in any editor and handing the file to
   pi.
2. **Renders clean everywhere.** iA Writer, Obsidian, GitHub — no custom syntax to teach them.
3. **Parseable back into turns.** The segment grammar is regular.

The format is therefore the **publishable artifact**: what is worth publishing is the format — a
specification someone could implement in their own tool without touching a line of this code. `DocumentChat.ts` is one implementation of it.

## Consequences

- A format change updates `docs/document-format.md` **and** its test in the same change. The spec is
  normative; the parser conforms to it, not the reverse.
- Adding a marker kind is three edits in one commit: a spec section, a `format.test.ts` row, the
  parser. A marker in the parser with no spec section is undocumented private syntax, which defeats
  the point of the format.
- Escaping is load-bearing: body text that *looks* like a marker must round-trip. Hence
  `escapeBody`/`unescapeBody` in `src/document/format.ts` and the rule that **a marker only reads as
  one at the start of a line**.
- Attachments stay *in* the document (stored beside it, referenced by path), so a reload and a
  session rebuild both preserve them rather than relying on application-side state.

## Lessons

- **The format outlives the implementation, so it is the thing to get right.** The planned
  reimplementation (ADR 0010) reproduces the interaction and changes only what is underneath —
  possible only because the interaction is pinned by a file format rather than by a component's
  internals.
- **"Renders clean everywhere" is a testable property, not an aspiration.** Checking a document in a
  plain markdown renderer catches marker leakage that no unit test was asked to look for.
