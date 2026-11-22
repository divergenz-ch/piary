# ADR 0009 — Name an implicit subsystem and move it; rule of three enforced at two

**Status:** accepted.

## Context

`src/components/DocumentChat.ts` is 3,587 lines. Every size in this ADR is a snapshot and drifts
with each change — re-measure with `wc -l <file>` before an argument leans on one.

It did not get there by a decision. It got there because clusters that **were** subsystems were
never named — and a class grows past the point where anyone can hold it only if nothing in the
process says "that is a new thing, give it a module".

Note what is *not* a god object. `src/document/format.ts` is 1,317 lines and is fine: it is the
implementation of one specified grammar, and splitting it would scatter a spec across files. **Big is
not the same as god.** A knob home, a type contract, and a single-grammar parser stay whole.

## Decision

**Don't grow a second state-cluster plus method-family inside an existing class — name it, move it.**

Five tells that a subsystem already exists and is merely unnamed:

1. a private-state cluster only some methods touch;
2. a `tick()`/`update()`/`sync()` that reads as a pipeline of named phases;
3. comment headers standing in for module boundaries;
4. a method family with its own vocabulary;
5. the class name needs "and" to describe honestly.

Extraction is **behavior-preserving**: bodies transplant verbatim, call order is held, one subsystem
per commit, and the suite passes **without a single test being edited**. A test that needs editing
means behavior changed — stop and find out why.

**Rule of three, enforced at two.** The moment a class or handler is copied wholesale for a second
case, extract the shared core *then*. Waiting for the third copy triples every future edit and the
duplication leaks into the consumers.

## What has been extracted, and what has not

Done, each verbatim-transplant with the suite passing untouched:

- **`src/components/editor-state.ts`** — the CodeMirror state plane out of `DocumentChat.ts`
  (tells 1 and 4: a field cluster with its own vocabulary). A leaf: the widgets and the decoration
  builder read it and nothing in it reads them back.
- **`src/components/editor-widgets.ts`** — the eleven `WidgetType` classes and the DOM builders they
  share. They talk back to the element only by `CustomEvent`, which is why they could leave at all.

**Deliberately not extracted**, because the cost is a redesign and not a move:

- **The clusters still inside `DocumentChat.ts`.** Each is a genuine subsystem by the five tells,
  but each reaches many pieces of the element's state, most of them Lit `@state()` reactive fields.
  Extracting means inverting the reactive model, which no test can prove behaviour-preserving — so
  it is reimplementation work (ADR 0010), not a repair. Size is not why the file stays whole: the
  seam is. What would make the clusters movable is characterizing them first
  (`docs/TEST_ARCHITECTURE.md` §3.1), not a smaller line count.

The pattern worth keeping: **what can leave is what already had a narrow seam** — a `CustomEvent`, a
leaf nothing reads back from. A cluster that reaches deep into its host's state is telling you the seam does not
exist yet, and inventing one is a design change.

## Consequences

- This applies to the **frozen prototype** with the limit ADR 0010 sets: an extraction is in scope
  when it is behavior-preserving and the suite proves it. A restructuring that cannot be proven that
  way belongs to the reimplementation (ADR 0010), not to a repair.
- `src/document/*` is the model for where logic belongs: a named module, pure, with its own test
  file.

## Lessons

- **God objects are an absence, not an act.** Every individual addition to a 3,000-line class was
  locally reasonable; what was missing was the step that says "this cluster has a name".
- **"Tests pass without re-recording" is the gate that makes a big refactor safe.** If the suite
  needs editing to go green, the extraction changed behavior and the diff is lying about being
  mechanical.
- **Enforce the rule of three at two, because the second copy is the cheap moment.** By the third,
  the duplication has already shaped its callers.
