# ADR 0012 — The Node half is TypeScript, run unbuilt

**Status:** accepted. It governs everything here that Node runs: the scripts, the whole `node:test`
suite, the evals and the Playwright specs. The app's own process side is Rust
([ADR 0014](0014-native-application-tauri.md)): Rust is the cost of the shell, and the Rust surface
is deliberately small — spawn, relay, guard paths — with no application logic in it.

The reasoning below is why the Node half is typed at all: a seam only holds if the compiler checks
it.

## Context

The page half of this repo was always TypeScript. The Node half — the scripts and the whole suite —
began as plain `.mjs`. `pnpm typecheck` reported success while checking none of it.

That is not a cosmetic gap. The suite was unchecked, so a test could call a function with the wrong
number of arguments and pass. That turned out to be true in fact, not just in principle (see
Consequences).

Two things made converting it cheap enough to be worth doing to a frozen prototype:

1. **Node strips types natively** — 22.18+, unflagged — so `.ts` here needs no build step:
   `node scripts/verify-hygiene.ts` just runs, and `node --test` over `.test.ts` files just runs.
2. The alternative to typing it was *documenting* it, and `CODING_GUIDELINES.md` was already
   carrying JSDoc-shaped descriptions of shapes the compiler could have been enforcing.

## Decision

**Every file Node runs is `.ts`, typed against `strict: true`, and runs unbuilt.** Nothing in the
repo is `.mjs`.

**One tsconfig per scope, because each exists to catch a different mistake:**

| Config | Job | Why it is separate |
|---|---|---|
| `tsconfig.build.json` | emits `dist/` | `include: ["src"]`, because it is also the build |
| `tsconfig.app.json` | checks the app's page and the e2e harness's page entry | browser scope, and the modules the build config cannot carry |
| `tsconfig.node.json` | checks the Node tree | `types: ["node"]` and no DOM |
| `tsconfig.app-e2e.json` | checks the real-app specs | the only one that may see WebdriverIO's globals and Mocha's |

Keeping the Node config apart is the point: `process` in a page module, or a DOM global in a Node
module, is a compile error rather than a surprise at runtime. Its `exclude` is `[]` and stays `[]`.

The build config is named `tsconfig.build.json` rather than `tsconfig.json` because tsserver, which
has no `-p`, only discovers a file named exactly `tsconfig.json`. That name belongs to a file that
owns nothing and lists every config as a `references` entry, so an IDE checks each file under the
config that owns it (`docs/CODING_GUIDELINES.md`).

**`@types/node` and `@types/jsdom` are load-bearing, not convenience.** The whole Node half is built
on `node:*` builtins and `process`; without `@types/node`, `tsconfig.node.json` cannot check a line
of it. Without `@types/jsdom`, the harness cannot name the `Window` it installs. Neither is a
dependency added to make one call easier — each is the type half of a dependency already in the
policy.

**`lib` is the runtime's floor; `target` is the emit's.** `tsconfig.build.json` sets
`lib: ["es2023", "dom", "dom.iterable"]` against `target: "es2022"`. `engines` requires Node 22.18,
so an ES2023 array method is present at runtime, while `target` stays `es2022` because that is what
shapes what `dist/` emits for a browser engine. Those two numbers differing is deliberate.

**`package.json` declares `"engines": { "node": ">=22.18" }`.** Without the floor, an older Node
meets a `.ts` script with a syntax error rather than a refusal.

## Consequences

- **`exclude` in a tsconfig does not stop a file being pulled in by an import.** An excluded file
  that something imports is still checked, so only a leaf — an entry point nothing imports — is
  genuinely excludable. A tree is therefore converted whole or not at all: the suite cannot be
  deferred file by file.
- **Strip-only mode forbids `enum`, `namespace` and constructor parameter properties.** All three
  are banned or absent here (ADR 0008 bans the third for an unrelated reason) — but a new one fails
  at **runtime**, not at compile time, which is a worse failure than the usual.
- **The checking found real defects, not just missing annotations.** A representative set: a test
  called `artifactsFrom` with four arguments where it takes two, and had done so invisibly for as
  long as it was JS; two functions declared a trailing parameter mandatory that their own callers
  omitted. Each of those is a thing the prose could not have caught.
- **A fixture that is a partial version of a type is completed in a test-local factory, never by
  narrowing the source.** Where a function provably reads three fields of pi's `AssistantMessage`,
  the honest fix is a factory in the test that fills the inert rest.
- `scripts/verify-hygiene.ts` walks `.ts` only. Its rules are name-based, so a rule that stopped
  matching any file would pass vacuously — see `TEST_ARCHITECTURE.md` on that failure mode.

## Lessons

- **A typecheck that passes over a tree it does not read is worse than no typecheck.** `pnpm
  typecheck` was green while covering half of the repo. The failure was silent and the signal was
  positive, which is the combination that keeps a gap open for years.
- **Native type stripping changes the calculus for a prototype.** The reason this half stayed JS was
  that TypeScript meant a build step, and a build step between a script and the terminal was not
  worth it. Once the runtime strips types, that trade is gone and the only remaining cost is writing
  the annotations.
- **The annotations are where the bugs are.** The conversion was framed as a rename and was mostly
  mechanical, but it kept turning up defects of the shape "the signature claims a guarantee the body
  does not have, and a caller has been quietly relying on the body." That is a class of bug prose
  review does not find, because both halves read correctly in isolation.
- **Keep the configs split along the axis of what is a bug.** One config with the union of both
  global sets would typecheck everything and catch neither `process` in a page module nor
  `document` in a Node module. The split is not organisational tidiness; it is two rules.
