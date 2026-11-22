# ADR 0008 — `#private`, not `private`

**Status:** accepted.

## Context

TypeScript's `private` is a **compile-time annotation**. It is erased by the compiler, leaving an
ordinary property — which a minifier cannot prove safe to rename, because property access is dynamic.
So every `private` member name **ships verbatim** in `dist/` and in the app's minified bundle.

`#private` is enforced by the language. The minifier can mangle it (`#x` → `#t`) because no dynamic
access can reach it, and a mistake is a **compile error** rather than a silent runtime `undefined`.

Two things made this worth deciding rather than leaving to taste:

1. The app's page is a minified bundle of megabytes that ships to every user. The decomposition of
   the editor — every internal method name — was readable in it.
2. The **test harness had come to depend on the erasure.** `tests/helpers/editor.ts` noted it
   outright: *"TS `private` is compile-time only, so `.view` is reachable at runtime"*. A rule with a
   load-bearing exception is not a rule, so the exception had to be resolved, not grandfathered.

## Decision

**Non-public class members in `src/` use `#private`.** Lint-enforced via `no-restricted-syntax` on
`PropertyDefinition[accessibility="private"]` and
`MethodDefinition[accessibility="private"][kind!="constructor"]`.

Mechanics that bite:

- **`#` cannot be a constructor parameter property.** `constructor(private readonly x: T)` has no `#`
  equivalent (TS18009). Declare `readonly #x: T` on the class, take a plain parameter, and assign in
  the body — **assignment first** where the body reads the field. Also lint-enforced
  (`TSParameterProperty[accessibility="private"]`), because the name leaks exactly like a plain
  `private` field.
- **`private constructor` stays `private`** — `#constructor` is not valid syntax. Exempted by the
  `kind!="constructor"` clause.
- **Public API names still ship by necessity**: exported types, custom-element attributes, Lit
  `@property` declarations, and anything on a class's public contract. Convert non-public members
  only.

**Where a test legitimately needs access, the member is made public with a doc comment saying it is a
harness seam — it is not left `private`.** A member reached from outside the class is public in fact;
`private` there was documentation that disagreed with the code. The alternative — a test reaching
through an erased annotation — makes the suite depend on a compiler implementation detail, which is
how a minifier upgrade becomes a test failure.

## Consequences

- `tests/helpers/editor.ts` no longer explains why it may reach a `private` field, because it no
  longer does.
- A member's declaration now states the truth about its audience, which makes "is this a seam or an
  internal?" answerable by reading rather than by grepping the tests.
- Lit `@property`/`@state` decorated fields are part of the element's reactive contract and stay as
  they are.

## Lessons

- **An annotation the runtime cannot see will eventually be relied upon not seeing.** The harness
  comment was honest and correct, and that is exactly the problem: it documented a dependency on
  erasure that no one chose.
- **The guarantee has to come from the language, not from the minifier's inference.** `#` fails at
  compile time; a rename-properties pass fails at runtime, in production, as `undefined`.
- **"Private but reachable by tests" is a design smell with a cheap fix**: name the seam. The set of
  such seams in this codebase turned out to be small, which is itself the evidence the boundary was
  mostly right.
