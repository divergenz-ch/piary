# ADR 0010 — The prototype is frozen; the interaction is the specification

**Status:** **the freeze is lifted — [ADR 0014](0014-native-application-tauri.md) opened the gate
this ADR describes, and the reimplementation is underway**. The planned features need native
capability a browser will not give, which is the evidence this ADR said the rebuild was waiting on. Everything below stands as written and is now being *executed*
rather than deferred: the inheritance in "What the reimplementation inherits" is what ADR 0014
carries over, and the interaction is still reproduced rather than revisited.

**Amended by [ADR 0018](0018-what-a-crash-may-take.md)**: an invariant being written for the first
time is written in prose first, and the code is held to it (the clause under Decision).

What is reproduced exactly is the *interaction* — the canvas's behaviour, specified by
`tests/integration/editor.test.ts`. The prototype's host page is a reference for what a feature
does, not a specification of its defects (the clause under Decision).

Historically also **amended for one feature by
[ADR 0013](0013-inline-terminal-and-live-views.md)** — the inline terminal, where the user overrode
the freeze while it still held. This ADR is the primary record of the freeze: the planning documents
that first held these constraints are gone from the tree, and their reasoning is absorbed here.

## Context

Piary is a prototype, and in the author's words:

> we will reimplement the prototype but with consistent architecture which can scale and performant.
> prototype is just the simulation of the idea, but it is the specification of the interaction and
> the idea.

Two consequences follow, and they are the spine of how work on this repo is scoped.

**The interaction is specified as correct.** Nothing in it is known-wrong. A reimplementation
reproduces it and changes only what is underneath.

**The specification is the code.** Where code and prose documentation disagree, **the code wins**.
That deliberately closes off documentation work as a prerequisite for the reimplementation — there is
no document to bring up to date first, because the running prototype is the authority.

One exception to the freeze was carved out deliberately: the prototype gets shown to strangers before
anything is rebuilt, so presentation work is in scope — **the freeze applies after presentation, not
before it** — and scope is defined by **the route a newcomer actually walks**, not by a TODO list.

## Decision

**Repairs and presentation only.** A fix that would require restructuring is **out of scope by
definition**: it belongs to the reimplementation. The prototype's job is to be shown, not improved.

Practical consequences for a session working here:

- **Say "that belongs to the rebuild" rather than doing it.** Declining a restructure is the correct
  outcome, not a failure to deliver — and it is cheaper to say than to undo.
- **Behavior-preserving extraction is a repair** (ADR 0009), because the suite can prove it changed
  nothing. Redesign is not.
- **Documentation is not a prerequisite, and prose must not claim authority it does not have.** This
  is why `docs/HANDBOOK.md` and the ADRs record *seams, invariants, rules and gotchas* and never mirror an
  implementation detail: a doc that restates code is both redundant and outranked.

**For an invariant being written for the first time, the document is written first and the code is
held to it** (ADR 0018). "The code wins" is a rule about not letting stale prose outrank working
behaviour, and it stands for everything already implemented. It cannot cover an invariant nobody has
written: the code has nothing to be measured against, so the gap is invisible until it loses
someone's work. A rule nobody wrote down cannot be violated loudly. So a new invariant — a durability
bound, a teardown order, a safety net one host owes another — goes into an ADR or a normative spec
first, the code that does not yet meet it is a known defect against that text, and the code is
brought up to it. Existing behaviour stays code-authoritative.

**The prototype's host page is a reference, not a specification of its defects.** "Reproduced
rather than revisited" is about the canvas interaction, which `tests/integration/editor.test.ts`
pins assertion by assertion. A host feature the app takes over from the prototype reproduces what
the feature *does*. Where the prototype has a known defect — it contradicts a normative spec, loses
state it should keep, or does what its own comments call a weakness — the app fixes it rather than
copying it, and a test pins the fixed behaviour. A difference that is a matter of taste, not a
defect, is still reproduced; that line is drawn in writing, before the work.

## What the reimplementation inherits

These are the constraints it answers to, recorded while the reasons still have someone who remembers
them. They are not a design for the new system; they are what the new system is not allowed to get
wrong.

- **It is gated, not scheduled.** The rebuild does not start until there is evidence anyone wants it.
  Building the correct architecture for an audience that has not shown up is the specific failure the
  whole sequence was arranged to avoid.
- **The interaction is reproduced, not revisited.** It is the settled part. What changes is
  everything underneath it — the architecture that has to scale and perform.
- **The document format is the contract that survives** (ADR 0001). A rebuild reimplements
  `docs/document-format.md` and `docs/notebook-cells.md`; it does not reimplement `DocumentChat.ts`.
  That is the whole reason the format, not the component, was made the publishable artifact.
- **The seams that proved themselves are the ones worth keeping**: a pure document core driven
  directly by the suite (ADR 0006), the user's own pi rather than a pinned one (ADR 0004), and a
  transcript that is rebuilt from the document rather than diffed against it (ADR 0002).
- **The god objects are the known debt** (ADR 0009), and the clusters that could not be extracted
  behaviour-preservingly are named there with the reason. That list is the rebuild's starting
  backlog, not a reproach to the prototype.

## Consequences

- The test suite is what makes "repairs only" safe rather than merely stated. Every fix ships with a
  failing-first test, so the frozen surface has a regression net rather than a promise.
- ADRs written here are for the reimplementation's benefit as much as this repo's: they are the
  inheritance — the constraints and the reasons — that a rebuild would otherwise rediscover.

## Lessons

- **"The code is the specification" is a scoping decision, not a dismissal of docs.** It fixes what
  documentation is *for*: the why, the constraints, the gotchas — the things the code cannot state
  about itself.
- **A stale TODO list will define your scope if you let it.** Scope by the route a user walks; a
  list describes a past state of the code.
- **Write the inheritance down while the reasons are still remembered.** The constraints are cheap to
  record now and unrecoverable later; that is the entire argument for `docs/adr/` existing in a
  frozen repo — and it is why deleting the planning tree cost nothing once its reasoning had been
  absorbed into these files.
