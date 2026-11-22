# ADR 0024 — The app's host is composed of feature modules

**Status:** accepted. Applies [ADR 0009](0009-name-it-move-it.md) to the app's host before it needs
applying after the fact.

## Context

The canvas does not perform features itself: it raises an event and its host does the work. An
earlier prototype's host grew to 3,955 lines whose `send` alone reached 23 members of
the element. That is the shape ADR 0009 declines, because a cluster that tangled cannot be moved in a
way any test can prove behaviour-preserving. It is also why that host could not be carried
into the app: ADR 0016 built a vertical slice instead, and every feature since has been rebuilt on
its own.

The app's host is `app/main.ts`. It answered every canvas event, kept the document in step with the
store, held the status line, and carried the `?probe=1` self-test: 600 lines, with ten owed events
still to land, each adding to it. This is an open-source,
long-running project, so the shape has to hold after whoever wrote it is gone.

## Decision

**`app/main.ts` assembles; every concern is a module of its own.**

1. **One concern, one module.** A module owns its state, its handlers and its tests. The test a
   reviewer applies to a line in `app/main.ts`: could it live in a module and be tested there? If
   so, it does.
2. **A module contributes a typed fragment of the event table.** `app/canvas-events.ts` defines
   `HostFragment<K>`, a slice of `HostTable`, and `composeHost`, which joins fragments. The composed
   table must still be a complete `HostTable`, so forgetting an event remains a type error. An
   event answered by two fragments is refused when the page boots, because object spread would
   otherwise overwrite one silently.
3. **Modules take a narrow context, never the page.** One `AppContext` is built in `app/main.ts`.
   A module takes a `Pick` of it, naming only the fields it uses. No module imports `app/main.ts`;
   dependencies point into the context, never back at the entry.
4. **The self-test is its own module.** `app/probe.ts` is test code that ships in the bundle because
   it must run in the real window. Keeping it out of the entry is what keeps the entry's budget
   honest.
5. **A lint budget holds the shape.** `scripts/verify-hygiene.ts` caps `app/main.ts`'s line count.
   Like every rule there, the cap only ratchets down, and it fails before a reviewer has to argue
   about structure. Its message says what to do instead: put it in a module.

**A new feature** is therefore:
- a module;
- the event-table fragment it exports;
- the context slice it takes;
- its tests;
- one line in `app/main.ts` composing it.

## Consequences

- **A feature's plan says "add a module", not "edit `app/main.ts`".** The per-module
  fragments mean two features in flight touch different files. The only shared line is
  `BASELINE` in `tests/contract/canvas-events.test.ts`, which is meant to be shared.
- **Structure is enforced by the compiler, a boot check and a lint rule**, not by a reviewer
  remembering this ADR.
- **The budget is crude.** A line count does not measure tangle. It catches the slide this ADR exists
  for, the entry growing back into a host, and leaves finer judgement to review.
