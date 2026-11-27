# ADR 0004 — The user's own pi runs; the app bundles none

**Status:** accepted. Amended by
[ADR 0068](0068-pi-is-found-where-a-terminal-finds-it-or-chosen.md): the pi is also looked for on
the login shell's `PATH`, and the user can choose one in Settings; and by
[ADR 0069](0069-a-release-ships-pi-for-a-mac-with-none.md): a release ships a pi, run only on a
Mac with none of the user's. Implementation:
`src-tauri/src/pi_cli.rs`.

## Context

A user's pi is whatever `pi` on PATH is, and **that** is the version their
`~/.pi/agent/settings.json` packages were installed against. Any other pi — a pinned copy shipped
with the app, say — is a different thing entirely.

Spawning a different copy loads those extensions into a pi they were never written for. The first
extension to extend a class the older pi does not export fails with

```
Class extends value undefined is not a constructor
```

the process exits, and **no session can start**. Observed with five global packages against a pi
five minor versions behind.

A second trap sits underneath: an app launched through a package script (`pnpm app`) inherits a PATH
to which npm/pnpm/yarn have **prepended dependency `node_modules/.bin` directories**. A naive PATH
lookup therefore finds the *pinned dependency* the typecheck reads, not the user's pi — the exact
failure this decision exists to prevent, reintroduced by the launch mechanism.

## Decision

The app runs **the pi a terminal in the same shell would**, resolved *before* dependency-bin
injection. Precedence (`pi_cli::resolve`):

1. **`PI_CLI`** — explicit, wins. A locally built pi, or a test double.
2. **`pi` on PATH, skipping dependency bins.** Any PATH entry that is a `node_modules/.bin`
   directory is **skipped**.

**There is no third step.** The app bundles no Node and so no pi of its own: none found is a
failure that names the fix ("Install it, or set PI_CLI to point at one"), never something silently
worked around.

`pi_cli.rs` is **pure**: it reads only the environment it is handed and the files that environment
names, so every branch of the resolution is tested without a shell and without changing the
environment a parallel test is reading.

## Consequences

- `Class extends value undefined is not a constructor` on session start is the **signature of a pi
  other than the one the user's packages were installed against** — documented in `docs/HANDBOOK.md` so it
  is diagnosed in seconds rather than debugged as an extension bug.
- The `pi-coding-agent` in `devDependencies` is what the typecheck reads and nothing that runs. It
  is exactly the copy the resolver must look past.

## Lessons

- **A PATH lookup inside a package script is not the user's PATH.** Any tool that resolves a sibling
  CLI from a package script must skip `node_modules/.bin`, or it silently resolves to its own pinned
  dependency.
- **A missing dependency the user owns is an error with a fix in it, not a fallback.** A fallback pi
  would start, and then fail on the first extension written for a newer one — a worse message, later.
- **Take the environment as an argument.** A resolver that reads the process environment itself
  cannot be tested beside another test that reads it; one that is handed its inputs is pure, and
  pure is what made it testable.
