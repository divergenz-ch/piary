# ADR 0017 — The stream region is absent between turns, not collapsed

**Status:** accepted. Supersedes nothing. Names a seam a rewrite of the canvas
inherits rather than re-derives.

## Context

`streamRegionField` holds where the machine is writing:
`{ msgAnchor, tailAnchor, turnAnchor }`. It was created `{0, 0, 0}` and rode
document changes like every other anchor in `editor-state.ts` — which is right,
and is why the hand-rolled `tailAnchor = msgAnchor + insert.length` arithmetic it
replaced is gone.

The bug was the default. `{0, 0, 0}` reads as "nowhere", and it is not: it is a
real span at the top of the buffer. `setDocument` inserts the whole document at
offset 0, and the end anchor maps with assoc `+1`, so the insert carries it to
`doc.length`. **On any loaded document with no turn in flight, the region spanned
the entire buffer.**

Everything the machine writes goes through one sink, `#replaceStream`, which
replaces `[msgAnchor, tailAnchor]`. So three public methods — `appendError`,
`applyAssistantPartial`, `appendToolResult` — replaced the whole document when
called with no turn live. Measured on a 61-character conversation: an error
reported after the turn ended left 35 characters, a stray partial left 20.

`openStreamingView` already knew. Its comment records the incident that found it
— *"The user's conversation, gone, for opening a terminal… 7619 characters became
40"* — and the fix went in **there**, as a committed insertion rather than a
region write. The shared sink was never guarded, so the next three callers
inherited the defect.

Two things kept this from being noticed:

- **A host can carry an invariant that covers it.** An earlier prototype's host
  returned early from its stream handler unless the run was live, and dropped
  the run's state before `endTurn`. A host-side guard holding a component-side
  defect up.
- **`endTurn` left the region open.** It collapsed only as a side effect of
  whichever write happened to land last, so a turn that ended without a finalize
  — a stop, a dropped connection, pi exiting — left the anchors spanning live
  text. The native app's `error` path reaches exactly that.

The same shape appeared in the turn's three flags (`#headEdited`,
`#midPageTurn`, `#userTypedDuringTurn`): they reset when the *next* turn began,
so between two turns the element answered for the turn that had already ended.
`beginTurn` carried a comment about the ordering because it had already bitten
someone once.

## Decision

**The region is `StreamRegion | null`, and `null` is the state between turns.**

- `create: () => null`. There is no triple that honestly means "nowhere", so the
  absence is the type. A span cannot be misread as an absence if there is no span.
- **`#replaceStream` refuses when the region is `null`.** A chunk, a result or an
  error that outlives its turn is dropped rather than written somewhere. This is
  the one guard, at the one sink, instead of a guard per caller.
- **`endTurn` closes the region and clears the turn's own state** — the three
  flags and `turnCells` — *after* every read that needs them. The turn's state
  goes with the turn.
- **`#advancePastWritten` replaces three copies** of
  `#setRegion(tailAnchor, tailAnchor)`, and is a no-op with no turn live:
  re-opening a closed region is how a stray write would find a target again.

**Two accessors, because readers and writers want different answers.**
`liveRegion` is the nullable truth and every writer asks it. `region` collapses
to the document's end for readers — the suite, the change filters, the cell
report gate — none of which should carry a null check to ask a question that only
matters while streaming. The collapse point is the document's end rather than
`{0,0,0}`: an empty span at the end can delete nothing and insert at the end,
which is the harmless reading of "no turn". The dangerous default was a span at
the *start* that grew.

### What this deliberately does not do

**It does not make turns plural.** One live turn, nullable. Concurrent regions —
a parent and a subsession streaming into one canvas — need a turn registry, and
that is the canvas rewrite's problem, not this seam's. `attachStream` still
cannot recover a turn's origin across a session switch, and still says so.

**It does not fix the `#syncCells` stale-position race.** Positions captured
before an `await` are still compared against a region read after it. That wants a
decision about whether positions or the epoch are the right currency, which is
design work for the rewrite.

## Consequences

- The three document-destroying paths are now impossible rather than guarded:
  there is no region to write through, so there is no offset to get wrong.
- **The component is safe regardless of its host.** No host has to guard its
  stream handler for the document's sake.
- `app/turn.ts`'s `error` case needs no guard of its own. A host that wants to
  *show* "pi errored with no turn" needs a surface for it; that is a host
  concern.
- A write arriving with no turn is silently dropped. That is deliberate: the
  alternative is throwing into a host's event handler, and `console.*` is not
  available in `src/`. If a dropped write ever needs to be visible, the model to
  follow is `cell-failure` — an event the host may render — not a log line.
- Five tests in `tests/integration/editor.test.ts` now hold this: one per destroying path,
  one for a turn that ends without a finalize, one for the flags. The other 92
  passed unedited, which is the evidence that the interaction did not change.

## Lessons

- **A default that is also a valid value is not a default.** `{0,0,0}` had to
  serve as both "no turn yet" and "a turn at the top of the buffer", and the type
  could not tell them apart. The absence wanted to be in the type, and the day it
  was, the three bugs had nowhere to live.
- **Fix the sink, not the caller that found the bug.** `openStreamingView`'s
  point-local fix was correct and insufficient: it left the shared path defective
  for everyone who arrived later. When a fix is written at a call site, ask what
  the call site shares.
- **A host-side invariant protecting a component-side defect is a latent bug with
  a timer on it.** It holds exactly until a second host appears: the app arrived
  without the guard, and the defect was live.
- **State that belongs to a turn should die with the turn**, not survive until the
  next one starts. "Cleared by whatever runs next" is an ordering dependency that
  no type checks and no test names.
