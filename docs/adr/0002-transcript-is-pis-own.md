# ADR 0002 — The transcript is pi's own; a document is rebuilt, never diffed

**Status:** accepted. Implementation: `src/document/transcript.ts` (ADR 0021),
`documentMessages`/`rebindDocument` in `src/document/format.ts`.

**What this ADR is about, and what it is not.** It is about pi's **JSONL transcript** — a format we
do not control and must not become a general reader of. It says nothing against **pi's RPC
protocol**, which is the supported interface: newline-delimited JSON on stdio, `{type, id, …}` in and
`{id, type:"response", success, data}` or an untagged event out. Speaking that wire — from Node or
from Rust — is using pi as intended, and pi's own `RpcClient` is itself one implementation of it.
The two are easy to conflate, and the conflation produces a wrong conclusion (that a Rust session
layer is ruled out), so the distinction is stated here rather than left to be inferred.

## Context

The document is editable at every point, including history (ADR 0001, ADR 0005). pi, meanwhile, keeps
its own JSONL transcript — an append-only, parent-linked entry log with branches, and the file pi's
own CLI reads in the terminal next to us.

So after the user edits a sentence the agent wrote four turns ago, two records of the conversation
disagree. Something has to reconcile them, and there were two shapes available:

1. **Diff and patch** — compute what changed in the document and mutate the transcript to match.
2. **Rebuild** — treat the document as the history and rewrite the transcript from it.

Option 1 means owning pi's transcript format: parsing its entries, understanding its branch model,
and keeping a hand-written mutator correct against a format we do not control and that changes
upstream.

## Decision

**The document is the history.** A send rewrites the transcript from the document. The entries the
rebuild must carry forward are read over pi's RPC (`get_entries`), never by parsing the JSONL, and
Rust writes the result whole, knowing only its header (ADR 0021).

What the document provably cannot carry is **restored position for position** from the entries the
rebuild replaces:

- **Provider metadata** per message — `api`, `provider`, `model`, `responseModel`, `responseId`,
  `usage`, `stopReason`, `diagnostics`, `toolName`, `details` (the `META` list).
- **Session state** — model, thinking level, name, per-session custom state (extension set, widget
  values, mode): the active branch's *latest* entry of each kind (`carriedState`).

`block-new` is deliberately excluded from carried state: it is document structure, rebuilt from the
document's own openers, not session state.

`carriedState` is one named rule, so nothing that rewrites a session can come to disagree with
another about what a session is apart from its text.

## Consequences

- `src/document/transcript.ts` is pure **so tests can exercise it without starting a pi** — the
  rebuild is the highest-risk pure function in the app and it is tested as one
  (`tests/unit/transcript.test.ts`).
- Editing history is cheap by construction. There is no divergence to reconcile, because there is
  only one authority.

## Lessons

- **Carried state is found by its absence.** Without it "a rebuild silently reset the session to the
  default model" — a bug with no error, visible only as a model that quietly changed. Any state that
  lives in the transcript and not in the document is a silent-reset candidate; enumerate it
  explicitly rather than discovering each item as a bug report.
- **One rule for two callers, or they drift.** A copy and a rewrite answer the same question ("what
  is a session apart from its text?"). Two implementations of that answer would disagree eventually;
  one exported function cannot.
- **Don't own a format you don't control.** The decision not to be a general reader of pi's
  transcript is what keeps a pi upgrade from being a rewrite of the app (see ADR 0004 for the other half
  of that exposure).
