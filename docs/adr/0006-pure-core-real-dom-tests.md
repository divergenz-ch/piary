# ADR 0006 — A pure document core, and a real-DOM suite with no mocks

**Status:** accepted; amended 2026-11-07 — time may be virtualised (see *Amendment: time* below).
Implementation: `src/document/*` (pure), `tests/helpers/editor.ts` (jsdom
mount), `e2e/helpers/scripted-pi.ts`. Full architecture: `docs/TEST_ARCHITECTURE.md`.

## Context

`tests/integration/editor.test.ts` opens with the diagnosis:

> Every bug this file guards against was once a bug report, because **until now nothing below
> `parseDocument` was testable without a browser.**

That is the whole problem. The editor is CodeMirror 6 with custom decorations, block folding,
streaming attribution and live cells — and the bugs were in the interaction between document
positions and rendered lines, which is exactly the layer a unit test of `parseDocument` cannot see
and a mocked editor cannot have.

Mocking was available and was rejected: a mocked CodeMirror asserts against the mock's model of
decoration, which is the thing under test.

## Decision

**Two halves, each testable for a different reason.**

**1. A pure core.** `src/document/*` — `format.ts`, `run.ts`, `cells.ts`, `views.ts`, `modes.ts`,
`branch.ts`, `command-doc.ts`, `ask.ts` — imports **no DOM, no `fetch`, no RPC**. Positional logic and
the marker grammar are ordinary functions over strings, so every case is reachable directly. This is
the layer a bug repro should start at.

**2. A real-DOM harness, no mocks.** `tests/helpers/editor.ts` mounts the **real**
`<document-chat>` under jsdom. Real CodeMirror constructs, dispatches, applies decorations, and
renders `.cm-line` elements. What that costs, and why each piece is load-bearing:

- **`Window` must be jsdom's** — CodeMirror's measure pass reads it off the global and throws without
  it.
- **`Event`/`CustomEvent`/`EventTarget`/`DOMParser`/`Blob`/`File`/`FormData` must be jsdom's too.**
  Node defines its own, and an event **from the wrong realm is rejected by jsdom's `dispatchEvent`** —
  a silent no-op, not an error. These are copied over explicitly after the bulk global copy skips
  them.
- **jsdom has no layout**, so `Range.getClientRects` / `getBoundingClientRect` return zeros. Fine:
  nothing in the suite asserts on pixels.
- **`settle()`** lets queued microtasks, rAF callbacks and CodeMirror's measure pass run.

pi is likewise **not mocked**. The app's page specs script pi on its real event protocol
(`e2e/helpers/scripted-pi.ts`): the page is sent the events a real pi sends, in pi's own shapes,
through the one module that reaches Rust (`src/bridge.ts`). And `pnpm test:app` runs the real app
against a real pi.

## Consequences

- **The suite runs against `dist/`.** Tests import `../dist/document/format.js`, so **`pnpm build`
  before `pnpm test`** or you are testing the previous build. This is the single most common wasted
  debugging session in this repo; `pnpm verify` exists to make it unskippable.
- **Geometry assertions are relative, never absolute** — a line's index **relative to its marker**, so
  tuning whitespace cannot rot them. An absolute newline count is the canonical vacuous gate here.
- The test runner is `node:test` + `node:assert/strict`. No `vitest`/`jest`, no `testing-library`, no
  `sinon`, no browser driver — the harness *is* the browser substitute, and adding a framework would
  add a second model of the DOM to disagree with.
- A measurement that is not a test lives in `tests/helpers/` and says so in its first line
  (`bench-index.ts`: "Not a test — a measurement, kept next to the change it justifies").

## Lessons

- **"Not testable without a browser" is a design finding, not a constraint.** The fix was a 60-line
  harness, after which a whole class of recurring bug reports became regression tests.
- **A realm mismatch fails silently.** `dispatchEvent` rejecting a foreign-realm event produces no
  error and no effect — the kind of failure that reads as "the component ignored my event". Copy the
  constructors deliberately.
- **A script on the real protocol beats a stub that returns a constant.** A scripted pi speaks the
  events the page will hear in production, so a spec fails when the page mishandles one; a stubbed
  reply could never show that.

## Amendment: time (2026-11-07)

**Time may be virtualised; the editor and pi may not be mocked.** The jsdom suite's
waits were the component's own debounces and frames, slept through in real time — most of
`editor.test.ts`'s wall time. `tests/helpers/editor.ts`'s `onVirtualClock()` runs a file's tests on
`node:test`'s built-in `mock.timers`: `setTimeout` and `Date` are mocked, `requestAnimationFrame` is
a frame-paced `setTimeout` for the duration, and `settle(ms)` advances the clock by `ms`. It is the
same CodeMirror, the same element and the same DOM, run against a clock a test controls. No
dependency was added.

What keeps it honest: every debounce was broken in a scratch build and the virtual run had to fail
everything the real-time run failed — it did, for each of them. Two gotchas are written into the
helper, because each produced a whole-file failure that read as something else: jsdom's
`requestAnimationFrame` runs on one `setInterval` it starts lazily, so mocking `setInterval` and
resetting with a frame queued leaves jsdom thinking its pump runs and no frame fires again in the
process; and the clock must be started after jsdom has booted.

**On drivers (2026-11-07).** "No browser driver" above meant no driver standing in for jsdom inside
the node suite, and that holds. Two drivers now run real browsers beside it, each confined to its
directory — `@playwright/test` in `e2e/`, WDIO in `e2e-app/` — and WDIO hosts its specs in Mocha,
which appears nowhere else (`docs/TEST_ARCHITECTURE.md` §2).

