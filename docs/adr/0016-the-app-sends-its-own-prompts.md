# ADR 0016 — The app sends its own prompts

**Status:** accepted. Depends on [ADR 0014](0014-native-application-tauri.md) for the shell and
[ADR 0004](0004-the-users-own-pi-runs.md) for which pi runs.

## Context

Everything underneath was in place: a window, a document store, terminals, a
session relay speaking pi's wire. What was missing was the line that makes it an
agentic interface rather than an editor — a prompt leaving the canvas and an
answer arriving back in the document.

Two routes were available. Port the host of an earlier prototype, which already
did this and much more. Or write the thinnest path that works and let the rest
arrive deliberately.

That host was 3,943 lines, and its `send` alone reached **23 members** of
the element: the sign-in gate, subsession dispatch, steering and follow-up
routing, run-state bookkeeping, baseline tracking, the staged-attachment set.
That is the shape [ADR 0009](0009-name-it-move-it.md) declines — a cluster
reaching deep into a reactive element cannot be moved in a way any test can
prove behaviour-preserving — and it is the same measurement that made the
canvas rewrite a piece of work of its own.

## Decision

**A vertical slice, not a port.** `app/turn.ts` sends the caret's prompt and
routes pi's events into the document: `message_update` to
`applyAssistantPartial`, `message_end` to `finalizeAssistant`, `agent_settled`
to `endTurn`. The canvas already had that API; nothing in the document layer
changed.

The block opens **before** the send, so the answer has somewhere to go when the
first chunk arrives rather than racing it. The caret's offset is what the answer
is positioned by ([ADR 0005](0005-one-canvas-caret-positional-prompts.md)) and
the canvas resolves it — `turn.ts` passes the offset along and resolves no
document positions itself.

**A failed turn is written into the document**, not only shown as a notice. The
conversation is the file ([ADR 0001](0001-document-is-the-interface.md)), and a
refusal is part of what happened.

## Consequences

- **The app is usable for the thing it is for.** A prompt runs, the answer lands
  in the document attributed with `<!-- pi -->`, and the next user block is
  ready. Verified in the real window against a real model.
- **The gap list above is the backlog.** It is not a quality problem to be
  apologised for; it is what the next pieces of work are.

## Lessons

- **Measure the coupling before planning a port.** The plan twice said "port
  X", and twice the measurement — 23 members, both times — turned a port into
  either a rewrite or a slice. The number is cheap to get and it changes the
  plan.
- **A deletion that removes tests is not a deletion.** A module can look like
  dead weight from the architecture diagram and be load-bearing in the suite.
  Grep for who *tests through* a module, not just who imports it.
- **Ship the slice and write the gap down.** A half-ported host would have been
  larger, slower to finish, and impossible to reason about; a working slice with
  an explicit list of what it does not do is both usable and honest.
