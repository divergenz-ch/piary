# ADR 0007 — Build artifacts stay out of git

**Status:** accepted. Implementation: `.gitignore`.

## Context

The repo generates several bundles: `dist/` (tsc + esbuild), `app/dist/` (the app's page), and an
esbuild output per page under `demo/` (`demo/harness-app.js`, megabytes of it).

Ignore rules written by **listing** the outputs that exist miss the next one. Bundles that were not
on the list were tracked, so roughly **8 MB of generated bundle rode along in the history, and
every one of them was stale.**

A second, opposite failure comes from an unanchored pattern. `pi-docs/` ignored unanchored also
swallows any `pi-docs/` deeper in the tree — so documents a build copies from one are
**untracked**, and the build only works from a working copy that happens to have them.

## Decision

**Ignore generated output by pattern, not by enumeration; anchor a path pattern that means one
specific directory.**

- `demo/*-app.js` + `demo/*-app.css` — every esbuild output under `demo/`, not the ones that
  happened to get listed.
- `dist/`, `app/dist/`, `node_modules/`.
- `/pi-docs/` — **anchored**: the private conversation corpus is the one at the repo root.
- `.flow/` — a planning tool's scratch directory, wholly untracked. It once held the specs that
  recorded why this work exists, and those were tracked for exactly that reason; that reasoning now
  lives in `docs/adr/`, which is the durable home for it.

Each of these rules carries its reason **in `.gitignore` itself**, because the failure mode of an
ignore rule is invisible: nothing errors, the wrong file is simply absent or stale.

## Consequences

- A build after a pull is all an update to a checkout takes, and nothing in git disagrees with it.
- A newly added page's bundle is ignored automatically. Adding a page does not require
  remembering to add an ignore rule.
- A file that *must* be tracked under a directory of the same name as an ignored one can be, and
  the anchored pattern is what makes that statable.

## Lessons

- **Enumerating generated files guarantees drift.** The list is written once and the outputs keep
  being added; the pattern is written once and keeps working.
- **Unanchored path patterns reach further than intended, and the symptom is a build that only works
  on your machine.** An ignore rule naming one directory should be anchored (`/pi-docs/`).
- **Comment the ignore rule with the incident.** Both failures here were diagnosed slowly precisely
  because `.gitignore` is not where anyone looks; the comments are the fix for the next person.
