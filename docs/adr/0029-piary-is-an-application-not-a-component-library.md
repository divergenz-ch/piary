# ADR 0029 — Piary is an application, not a component library

**Status:** accepted (2026-11-06).

## Context

Piary began as a successor to `pi-web-ui`: a set of web components for chat UIs
(message list, streaming container, composer, thinking block, code and console
blocks, a tool-renderer registry), published through a `src/index.ts` barrel and
the package's `exports`. ADR 0005 replaced the chat with one canvas, and the
canvas renders none of those components: it draws markdown, code and tool
output through CodeMirror decorations and its own views.

A trace from every entry point (the app page, the harness, the pi extension's
manifest) found the chat
components, the tool-renderer registry and the barrel reachable only from each
other and from two dev demo pages that showed them. Nothing in the repo
imported the package by name, and it was never published. The suite still
compiled, styled and partly tested all of it. The same trace found
`src/notebook/interop.ts` (export and import of Observable's `<notebook>`
format) imported only by its own test: no surface ever offered it.

## Decision

- **The library surface is gone:** the barrel, the package's `main`, `types`
  and `exports`, the chat components, `src/tools/*`, the demo pages that
  showed them, their CSS, and `highlight.js`, whose only importer they were.
  What stays is what an entry point reaches: the canvas and its parts, the
  rail's index, the session list, the notebook engine.
- **Observable interop is gone too**, with its section of
  `docs/notebook-cells.md`. The spec described an implementation, not a format
  the document depends on; a `pi:cell` is unchanged. It comes back as a
  feature with a surface and a test, not as a module waiting for one.
- **A manual script with no consumer is gone:**
  `pi-extension/skill-check.ts`.

## Consequences

- A component that some later surface needs is written for that surface and
  reached from its entry point; nothing is kept exported against a consumer
  that does not exist.
- A module only a test imports is dead code (docs/HANDBOOK.md, Hard Rules), however
  well tested.
