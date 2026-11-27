# Piary: the handbook

What the project is, how it is put together and the rules its code is held to, in one file.
The documents it points at hold the long versions.

**What this is:** an agentic interface that is **one canvas, not a chat** — a markdown document the
user and the agent both write into, in place. A **TypeScript** view layer (`src/`) over a
**plain-markdown document format** (`docs/document-format.md`), with one resident `pi --mode rpc`
per session behind it.

**One product, a Tauri desktop app:** `src-tauri/` (Rust: the sessions, PTYs, the document store)
under `app/` (the page) and `src/` (the canvas).

**Normative:** `docs/document-format.md` (the marker grammar) and `docs/notebook-cells.md` (cell
semantics). They are a specification someone could implement in another tool without reading this
code — a format change updates the spec **and** its test in the same change.

**Status: the app runs.** Piary is a **Tauri 2 desktop application** — Rust main process, the system
WKWebView, macOS only — because the features it is built toward (screen capture, system audio,
microphone, camera) need capability a browser will not give. A prompt leaves the canvas, pi answers,
and the answer lands in the document. **ADR 0014 is why Tauri**, including what the choice costs and
how that is answered; capture is a Swift sidecar rather than a webview feature (ADR 0015).

A send rebuilds pi's history from the document when it changed (ADR 0002): the transcript is read
over the wire, rewritten by the page, and written whole by Rust (ADR 0021).
The page answers every canvas event through one table the compiler holds complete
(`app/canvas-events.ts`), and none is owed: `OWED` there is empty, and `tests/contract/canvas-events.test.ts`
holds it at zero, so a new canvas event must arrive answered. A gesture the app does not carry is
closed by porting it, never by a notice. A window switches among conversations from the list down
its left, and one file never has two editors (ADR 0027).
The page opens terminals (`app/terminals.ts`); capture runs in Rust but the page reaches it only
from its `?probe=1` self-test. A menu click reaches the focused window only, and its page answers
every item (`app/menubar.ts`, held to `menu.rs`'s ids by `tests/contract/menubar.test.ts`); Quit is Rust's
own. Piary → Settings… opens the app's one Preferences window, whose own page answers only the
items that open a window (ADR 0048). The app keeps rolling backups of each document (at most one a minute, the newest fifty), and
has no conflict copy, no size cap and no `localStorage` draft (all declined) — ADR 0018 says which
and why, and what a crash may take meanwhile.

**The interaction is still specified as correct, and is reproduced rather than revisited**
(ADR 0010). What changes is everything underneath it. A better idea about how the canvas should
*behave* is a conversation with the user, not a phase — and `tests/integration/editor.test.ts` is the standing
answer to what the behaviour is, every assertion in it having once been a bug report.

**Where code and prose disagree, the code wins** (ADR 0010) — for behaviour that already exists. An
invariant being written for the first time is written in prose first, and the code is held to it
(ADR 0018): a rule nobody wrote down cannot be violated loudly. That rule is why this file states
seams, rules and gotchas and never mirrors an implementation detail a reader could go read.

## Where things are documented

Durable docs only — each owns its own status, so this list never tracks per-task progress:

- **Normative:** `docs/document-format.md` (the marker grammar: markers are HTML comments, payloads
  are fenced blocks, the rebuild rule) · `docs/notebook-cells.md` (cell modes, the settled gate) ·
  `docs/face-format.md` (what a camera saw of the user's face: the timeline a detector writes,
  the filter, and the `[face]` block of plain words pi is handed).
- **Decisions:** `docs/adr/` — every significant decision and the lessons behind it. **Read
  `adr/README.md` before changing architecture; it is also where the history of any current
  behavior lives.**
- **Engineering:** `docs/CODING_GUIDELINES.md` (architecture, hard rules, comment policy, build
  gotchas) · `docs/TEST_ARCHITECTURE.md` (the headless-real-DOM harness, bug-repro playbook,
  vacuous-gate catalog) · `docs/GLOSSARY.md` (the words that mean more than one
  thing here — `settled` three ways, `cell`, `run`, `block`, `branch` — and where each spec term is
  defined) · `evals/README.md` (the system-prompt evals: what a case is, running them, reading a
  report).
- **The app:** `docs/running-the-app.md` — how to run it and the manual smoke test ·
  `docs/packaging.md` — how `Piary.app` is built, signed and notarized. ADR 0010 is what
  the interaction is held to and why; ADR 0014 is the framework choice and its costs.
- **Showcase:** `docs/markdown-showcase.md` (what the renderer must handle).

---

## Guiding Principles

1. **The document is the interface, and the file is the truth.** A conversation is one markdown
   file. Machine structure lives in HTML comments so any markdown renderer (iA Writer, Obsidian,
   GitHub) shows a clean document; payloads are fenced code blocks. A file with no markers at all is
   one pending user message — you can start a conversation by typing prose in any editor (ADR 0001).
2. **One canvas.** The agent writes into the same document the user is editing, at the caret's
   block, not into a transcript below it. Everything else chat gets wrong — history not editable,
   answers as dead text — follows from fixing that one thing (ADR 0005).
3. **The format is the publishable artifact, not the implementation.** `docs/document-format.md` +
   `docs/notebook-cells.md` are what transfers to another tool; `DocumentChat.ts` is one
   implementation of them (ADR 0001).
4. **The transcript is pi's alone.** The app reads it over pi's RPC (`get_entries`) and Rust writes
   it whole, knowing only its header — no JSONL hand-parsing. A document is rebuilt into a session,
   never diffed against one (ADR 0002, ADR 0021).
5. **It is the user's own pi that runs** — the `pi` on PATH, the version their
   `~/.pi/agent/settings.json` packages were installed against (`src-tauri/src/pi_cli.rs`). The app
   bundles no Node and so no fallback pi: none found is a failure that names the fix (ADR 0004).
6. **Pure core, DOM at the edges.** `src/document/*` (format, run, cells, views, live-views, modes,
   branch) is pure — no DOM, no RPC — which is what makes the suite real instead of mocked (ADR 0006).
7. **Placeholders fail visibly.** A missing credential makes the first prompt fail in the open, with
   a way to sign in under it, rather than gating the app behind a wall (ADR 0011).

---

## Architecture (summary — full version in `docs/CODING_GUIDELINES.md`)

```
WEBVIEW (WKWebView)
  app/main.ts  assembles the page from feature modules (ADR 0024): turn.ts (a send
   │           and its stream), model.ts, login.ts, terminals.ts, conversations.ts,
   │           history.ts (the rebuild), attachments.ts, transfer.ts, menubar.ts,
   │           update.ts (the notice of a newer version, in model.ts's chip: ADR 0064), …
   ├── app/face/  the user's face, from a detector to the message pi is handed
   │           (ADR 0058, ADR 0055, ADR 0057, ADR 0059, ADR 0060, ADR 0061): index.ts (the module, and the
   │           camera's life), log.ts (a key log per prompt), detector.ts (the
   │           seams), state.ts (pure: what the pill shows, which camera is read,
   │           what the user set of the reading), pill.ts (the pill in the model
   │           chip), sheet.ts (what is sent, agreed to once), inspector.ts (the
   │           panel: what is read, what would be sent, the filter's settings),
   │           sent.ts (what a message carried, read back from pi), scripted.ts (a script as the detector), mediapipe.ts (the camera
   │           as a source of samples: the ONLY importer of
   │           `@mediapipe/tasks-vision`, a chunk loaded when the camera is
   │           first wanted), record.ts (the fixture recorder, in no ordinary build)
   └── <document-chat>  src/components/DocumentChat.ts
        │   the canvas: a CodeMirror 6 editor over the raw markdown, decorated
        │   into blocks. Owns caret→prompt resolution, streaming attribution,
        │   cell lifecycle, view state.
        ├── src/document/*  PURE — no DOM, no RPC, no fetch
        │     ├── format.ts  the marker grammar: parseDocument / escapeBody /
        │     │              blocksFrom / documentMessages / rebindDocument
        │     ├── run.ts     which prompt the caret means (promptAt/tailPrompt),
        │     │              what its answer occupies (replySlot), cell insertion
        │     ├── transcript.ts  document → the transcript a rebuild writes (ADR 0021)
        │     ├── cells.ts   cell ids, modes, IN_ARTIFACT
        │     ├── views.ts   tool-result view templates (STATIC: data → element)
        │     ├── live-views.ts  the LiveView seam (CHANGING: write/settle/dispose)
        │     │              — what a terminal and every future streaming element
        │     │              renders through (ADR 0013)
        │     ├── a2ui.ts / a2ui-expr.ts / a2ui-figures.ts  an `a2ui` view's payload as
        │     │              A2UI messages, the `calc`/`series` formula language
        │     │              (parsed and walked, never run as code), and what
        │     │              Piary's components show: figures, verdicts, a
        │     │              chart's Plot options, the theme's ramp (ADR 0043)
        │     ├── face.ts    the face format: a timeline's types, the filter, the
        │     │              `[face]` block's wording (`docs/face-format.md`)
        │     ├── keystrokes.ts / face-assemble.ts  when a prompt's words were typed,
        │     │              and a face on a clock tied to them (ADR 0055)
        │     ├── face-episodes.ts  a detector's samples → what the face did, as
        │     │              steps: rest, hold, blink, pose, the gates (ADR 0058)
        │     ├── turn-context.ts  what a send adds for pi alone, and its removal
        │     ├── export-html.ts  a conversation as a page that reads without Piary:
        │     │              each segment as the canvas draws it, around what the
        │     │              page drew of its cells and views (ADR 0066)
        │     └── branch.ts / modes.ts / command-doc.ts / ask.ts / canvas-edit.ts / bundle.ts
        ├── src/components/*  Lit custom elements (CellBlock, ArtifactBlock,
        │     CellEditor, ChatIndex, SessionList)
        │     └── TerminalView.ts  the `terminal` live view — the ONLY xterm.js
        │           importer, same containment rule as src/notebook/ (ADR 0013)
        ├── src/components/views/*  tool-output renderers (diff, table, cards,
        │     file-tree, matches, properties, subsession, a2ui)
        │     └── a2ui.ts  the `a2ui` template: a surface the agent composed from
        │           Piary's catalog. It lazy-loads a2ui-surface.ts (the renderer),
        │           a2ui-catalog.ts, a2ui-components.ts and a2ui-chart.ts on the
        │           first surface: those four are the only importers of
        │           `@a2ui/*` and `zod` in src/ (ADR 0043)
        ├── src/notebook/engine.ts  cell execution (acorn + lezer; lazy-loaded
        │     on the first pi:cell — heavy, and /runtime touches `document` at
        │     import time). A cell's `Plot.plot` draws with Piary's defaults
        │     (plot-defaults.ts, pure): the palette, data order, margins, the
        │     column's width; what the cell sets itself wins
        ├── src/utils/plot.ts  the ONLY loader of Observable Plot: one lazy
        │     chunk for an a2ui Chart and a cell's `Plot` alike, so a chart
        │     needs no network (ADR 0043). chart-palette.ts beside it is the
        │     one reader of the `--chart-*` series colours, for both
        └── src/bridge.ts  the ONLY importer of @tauri-apps/api: every command
              │              the page calls and every event it hears (ADR 0014)
              ▼  Tauri IPC (commands in, `pi-event` / `pty-data` / … out)
RUST  src-tauri/src/
  commands.rs   the whole IPC surface; main.rs, menu.rs, teardown.rs are the
   │            other modules allowed to name `tauri::` (lint-enforced)
   ├── session.rs     one resident `pi --mode rpc` per session; relays its wire
   │                   and knows no shapes (ADR 0020)
   ├── pi_cli.rs      which pi runs: the user's own (ADR 0004)
   ├── extension.rs   `--extension pi-extension/` + the appended system prompt
   ├── transcript.rs  writes a rebuilt transcript whole, header only (ADR 0021)
   ├── docs.rs / store.rs / watch.rs  the document store and its watcher
   ├── pty.rs         one real PTY per terminal (portable-pty)
   ├── attachments.rs files the user hands the agent, served as piary-file://
   ├── bundle.rs      a conversation written out and read back with its attachments,
   │                   as a folder or a zip (ADR 0049)
   ├── workspace_files.rs  the workspace, read-only, for a cell's FileAttachment
                       (piary-workspace://)
   ├── windows.rs / exit.rs  one window per document (ADR 0027), nothing
   │                   outlives the app (ADR 0019)
   ├── menu_keys.rs   the key each menu item really has, read back from AppKit
   │                   (ADR 0051)
   ├── print.rs       a window's page written out as a PDF, by the system's print
   │                   path with a file for a printer (ADR 0066)
   ├── preferences.rs the user's preferences, one JSON file (ADR 0048)
   ├── update.rs      whose turn it is to check for a newer version, and the tag
   │                   last read (ADR 0064)
   └── capture.rs     the Swift capture sidecar (ADR 0015)
PI  the user's own `pi`, plus Piary's package `pi-extension/` (the view, cell,
    canvas_edit, budget and terminal tools, the login commands, the skill — ADR 0030)
```

**Responsibility rules:**
- `src/document/*` imports **no DOM, no `fetch`, no RPC.** It is the layer the suite drives
  directly; a DOM import there is a test the next person cannot write.
- `src/components/*` own all DOM. Views render; they do not resolve document positions — ask
  `run.ts`.
- `src/bridge.ts` is the **only** importer of `@tauri-apps/api`, which is what lets a spec boot the
  page by replacing one module — lint-enforced (ADR 0014).
- `src/components/TerminalView.ts` is the **only** importer of xterm.js, the same containment rule
  `src/notebook/` has for notebook-kit.
- `app/face/mediapipe.ts` is the **only** importer of `@mediapipe/tasks-vision`, and no frame,
  image or landmark leaves it: what it reports is numbers — lint-enforced (ADR 0058).
- Only `main.rs`, `commands.rs`, `menu.rs` and `teardown.rs` name `tauri::`; every other Rust module
  takes plain types, so `cargo test` drives it without an app — lint-enforced (ADR 0014).
- Every event `<document-chat>` raises for its host is named, with its `detail`, in
  `src/canvas/events.ts`; `tests/contract/canvas-events.test.ts` holds that list to the source, and the app
  page's `HostTable` (`app/canvas-events.ts`) must name a disposition for every entry.
- `app/main.ts` assembles; a feature is a module exporting an event-table fragment, composed with
  `composeHost` (ADR 0024). A lint budget holds the entry's line count.

### Hard Rules

| ❌ Don't | ✅ Do |
|----------|-------|
| `private` field/method in `src/` (a TS-only annotation — erased, so the name ships verbatim in `dist/` and in the app's minified bundle) | `#private` — **lint-enforced** for fields, methods, AND ctor parameter properties. A parameter property cannot take `#` (TS18009): declare `readonly #x`, take a plain param, assign in the body (assignment FIRST if the body reads it). Only `private constructor` is exempt — `#constructor` is not syntax (ADR 0008) |
| `export enum` in `src/` (TS emits a value→name reverse map, so every member name ships as a string) | `as const` object + same-name type alias |
| `console.log` in `src/` | Nothing, or a real UI surface: the status line or the document (ADR 0011) |
| Import the DOM, `fetch`, or RPC into `src/document/*` | Keep it pure; the component calls it and owns the effect |
| A second importer of `@tauri-apps/api` outside `src/bridge.ts` | Add the call to `src/bridge.ts` (ADR 0014) |
| Hand-parse pi's JSONL transcript | Read it with `get_entries` and rebuild from the document (`src/document/transcript.ts`); the transcript is pi's (ADR 0002, ADR 0021) |
| Assert a rendered line by an absolute newline count | Express geometry **relative to its marker**, so tuning whitespace cannot rot the test (`tests/integration/editor.test.ts` header) |
| Mock the editor or `pi` | Mount the real `<document-chat>` under jsdom (`tests/helpers/editor.ts`); the app's page specs script pi on its real event protocol (`e2e/helpers/scripted-pi.ts`), and `pnpm test:app` drives the real app with a real pi (ADR 0006) |
| Hardcode a bare `300` / `500` / `6000` timing literal at its use site | Name it a module-scope const with the reason (`SYNC_DEBOUNCE_MS`), or cite why the number is what it is |
| Add a marker kind without a format-spec section and a `format.test.ts` row | Spec + test + parser in one change — the format is the deliverable (ADR 0001) |
| Commit a build artifact (`dist/`, `demo/*-app.js`, `app/dist/`) | They are gitignored for a reason: ~8MB of stale generated bundle once rode along in the history (`.gitignore`) |
| Comment the DIFF (`task .7`, "now uses X", "mirrors the old change") or out-comment the neighbours | Comment the FILE as it stands, at the density of the code around it. Cite an ADR / a normative spec §, never a task number — specs retire and the tag dies (`CODING_GUIDELINES.md` comment policy) |
| Leave dead code (a stub, an unreferenced export) | Delete it |
| Grow a second state-cluster + method-family inside an existing component | Name it, move it behavior-preservingly (ADR 0009) |
| Widen a type with `as any` / `as unknown as T` + a `typeof` probe | Widen the interface so the compiler checks it |
| Ship a producer with no consumer (an event nobody reads, a policy hook nobody implements) | Prove the seam end-to-end in the same change |
| Add a dependency to make one call easier | `src/utils/*` — see the Dependency Policy below |

---

## Testing Rules

1. **Two loops.** **`pnpm test:smoke` is the development loop** — it checks rustfmt, builds, then runs the
   unit and contract tiers, `cargo test` and the Playwright tests tagged `@smoke`, in seconds rather
   than minutes. **`pnpm test:all` is the merge gate**: `pnpm verify` (typecheck + lint + build + every
   node tier), `pnpm test:e2e` and `pnpm verify:rust`. A test's tier is its directory under
   `tests/` — `unit`, `contract`, `integration` — and lint holds every test file to exactly
   one (`docs/TEST_ARCHITECTURE.md` §8). `pnpm test` alone runs the suite against `dist/`, so
   **`pnpm build` first or you are testing the last build** — this is the single most common wasted
   debugging session in this repo. **There is no hosted CI: `make ci` is the merge gate**,
   run locally and by hand: `make lint`, `make typecheck`, `make test`, `make e2e` and `make rust`,
   each starting from a frozen-lockfile install and an emptied `dist/`, so a local pass means what a
   clean checkout's would (`Makefile`). `make ci` installs and builds once for all of them, then
   runs the browser layer beside the Rust half, whose output it prints whole at the end. Nothing runs them automatically: no hooks, by decision.
   **A gate is run once, not iterated on.** Develop against the narrowest test that answers the
   question (one spec, `cargo test <name>`, a tier), then `pnpm test:smoke`, then `make ci` once
   when the work is done. When `make ci` fails, fix it against the failing target alone
   (`make rust`, the one spec) and run `make ci` once more — a whole gate rerun per fix is minutes
   spent learning what a seconds-long check already said. `make ci` runs its cheapest check first
   (`make format`) for the same reason.
   **`pnpm test:e2e`** is the browser layer (`e2e/`, `playwright.config.ts` for the harness and
   `playwright.app.config.ts` for the app's page), which sees what jsdom cannot: layout, focus,
   engine behaviour. It is deliberately **not** part of `pnpm verify`, because a browser download
   does not belong in the gate every change runs.
2. **No mocks.** The suite mounts the **real** `<document-chat>` under jsdom
   (`tests/helpers/editor.ts`): real CodeMirror constructing, dispatching, decorating and rendering
   `.cm-line` elements. The app's page specs script pi on its real event protocol
   (`e2e/helpers/scripted-pi.ts`), and `pnpm test:app` runs the real app against a real pi.
3. **Behavior-level assertions.** Assert what a user would see or a caller would get — a rendered
   line, a parsed segment, a command's answer — not an internal field's value.
4. **Geometry is relative, never absolute.** A line's index **relative to its marker**. An absolute
   newline count rots the moment anyone tunes whitespace.
5. **Add a test for every fix.** Every assertion in `tests/integration/editor.test.ts` was once a bug report;
   that is the standard. That file is also the rebuild's specification of the interaction:
   a port that cannot account for an assertion has changed behaviour, so each one is routed to its
   new layer with a reason, never dropped quietly.
6. **Shared helpers.** `tests/helpers/` — `editor.ts` (mount/settle/unmount), `pairing.ts`. A measurement that is not a test lives there too and says so in its first line
   (`bench-index.ts`).

**Bug-repro playbook (binding):** a fix ships with the failing-first test that reproduces it —
thinnest layer first (pure `src/document/*` or `cargo test` → jsdom mount → the app's page under
Playwright → the real app under WebDriver). Reach
for the next layer only when the one below cannot express the setup. Full ladder:
`docs/TEST_ARCHITECTURE.md`.

## Dependency Policy

- **Runtime deps** are the editor and renderer stack: `@codemirror/*`, `lit` (peer), `marked`,
  `katex`, `lucide`, `@observablehq/notebook-kit`, `@lezer/highlight`,
  `@xterm/xterm` + `@xterm/addon-fit` (the terminal grid — ADR 0013),
  `@a2ui/lit` + `@a2ui/web_core` + `zod` (the renderer, catalog and schemas of an `a2ui` view,
  pinned exactly and moved together: the `view` tool checks a payload against a serialized copy of
  the same catalog — ADR 0043), `@observablehq/plot` (pinned exactly; it ships in the app so a
  chart, in a surface or a cell, needs no network and draws at the version that was tested —
  ADR 0043), `@mediapipe/tasks-vision` (pinned exactly; the Face Landmarker that reads the
  user's face in the page. Its wasm and model ship in the app, put beside the page by
  `pnpm face:assets`, the model held to a checksum and neither committed — ADR 0058),
  `@earendil-works/pi-*`. **No new runtime dep without approval.**
- **The pi peers (`pi-agent-core`, `pi-ai`) are `"*"` on purpose** (ADR 0020 §6): `src/` imports
  them only as types, and what runs is the user's own pi, which no range here can know. The
  version the typecheck reads is the devDependencies', kept in step with the pinned
  `pi-coding-agent` — a pi upgrade moves all three together.
- **Dev deps:** `esbuild`, `typescript`, `jsdom`, `@types/node`, `@types/jsdom`, `@playwright/test`,
  and the `pi` packages. The runner for every node tier is **`node:test` + `node:assert/strict`** —
  no `vitest`/`jest`, no `testing-library`, no `sinon`. That ban is about a second model of the DOM
  disagreeing with jsdom's. Two drivers run a **real browser** instead of modelling one, which is a
  different question, each confined to its directory: `@playwright/test` in `e2e/`, WDIO in
  `e2e-app/`. WDIO hosts specs only in Mocha, Jasmine or Cucumber, so `e2e-app/` is Mocha — and
  Mocha nowhere else. Both
  `@types/*` are load-bearing, not convenience: the scripts, the suite and the evals are built on
  `node:*` builtins and `process`, and the harness names a jsdom `Window`, so without them
  `tsconfig.node.json` cannot check a line of either.
- **Rust crates** (`src-tauri/Cargo.toml`) answer to the same rule — **no new crate without
  approval**. Each has its reason: `tauri` (the shell, ADR 0014), `serde`/`serde_json` (the IPC
  and pi wires), `ts-rs` (`src/bridge-types.ts` generated from the Rust types), `notify` (the
  store's watcher), `portable-pty` (the terminals), `libc` (the account's
  login shell from the password database, for a terminal opened from a Finder
  launch whose environment carries no `SHELL`), `signal-hook` (SIGINT/SIGTERM enter the exit
  sequence — std cannot install a signal handler, ADR 0019 §2; `iterator` feature only),
  `zip` (a bundle's archive, written and read in the process so import and export need no
  platform's own tool; pinned exactly, `deflate-flate2` only, ADR 0049),
  `tauri-plugin-dialog` (the system's open and save panels for import and export, pinned exactly
  and called from Rust only: the page is granted none of its commands, ADR 0049; it brings `rfd`
  and `tauri-plugin-fs`), `objc2` + `objc2-app-kit` + `objc2-foundation` (the menu bar's key equivalents, read back
  from AppKit, ADR 0051, and the print operation that writes a page as a PDF, ADR 0066; ranges
  rather than pins, because they must stay the versions Tauri resolves or the binary carries
  two copies),
  and `tauri-plugin-wdio-webdriver`, optional behind the `e2e` feature.
- **Utilities:** extend `src/utils/*`. No `lodash`-class libraries.
- **Never a platform-specific binary in runtime `dependencies`** — `optionalDependencies` plus a
  comment naming the upstream issue and when it can be dropped.
- Audit `package.json` against this policy whenever dependencies change.

---

## Keeping this file

- **This file states what is true TODAY, never what changed.** It is read with no
  prior context, so a sentence about the past costs attention and eventually becomes a lie. When a
  change lands, update the affected statement **in place** — do not append the delta.
  - ❌ "the house credential is OpenAI now (Anthropic is GONE)" · "X was removed in task .9" ·
    "no longer hand-parses JSONL".
  - ✅ "the app's pi gets `PIARY_VERDICTS=1`, and its `cell` tool waits for the page's verdict" —
    the current fact, standing alone.
  - The one exception is a **retired identifier other code must not reuse**, because that is a live
    constraint on future work, not history. State it as the constraint.
  - Superseded lineage belongs in the ADR that superseded it. Never mirror another document's status
    here; the copy drifts.

---

## Key facts

```
WORKSPACE        the directory the app was launched from, or PI_CWD. pi runs there, and conversations
                 belong to it.
DOC LOCATION     ~/.pi/agent/docs/<workspace>/ beside pi's transcripts. A workspace with a
                 `pi-docs/` directory in its root gets them there instead. PI_DOC_DIR overrides
                 both.
APP ENV          PI_CWD, PI_DOC_DIR, PI_CLI (which pi), PI_CODING_AGENT_DIR (pi's agent dir: how
                 the sign-in walk runs without the real `~/.pi/agent/auth.json`), PIARY_LOG_DIR
                 (the directory `piary.log` is written to, instead of the one every running
                 Piary shares: how a driven session keeps its own app log), PIARY_DRAW (how
                 an answer is drawn: `free` is free drawing, unset or anything else `a2ui`;
                 DRAW MODE below), PIARY_PREFERENCES (the preferences file, instead of the
                 user's: how a driven run keeps its own).
TEST ENV         PIARY_E2E=1 arms the app's embedded WebDriver server (one of three gates;
                 docs/TEST_ARCHITECTURE.md §6), and the same gate makes the app's activation
                 policy `Prohibited`, so a driven run never takes the user's focus (a spec file
                 during which it does fails), and makes every window transparent and
                 click-through — a known hack, chosen over costlier options (TEST_ARCHITECTURE.md
                 §6). PIARY_E2E_SHOW=1 keeps the windows visible, for debugging a spec.
                 PIARY_E2E_PICK (what an import opens) and PIARY_E2E_EXPORT_DIR (the folder
                 an export goes into) are what a driven debug build answers a system panel
                 with, instead of showing one WebDriver cannot drive.
                 PIARY_FACE_SCRIPT names a file the same build hands the page as the script
                 its face follows (`app/face/scripted.ts`): a driven run never gets the
                 camera, and with no script nothing reads a face (`harness::face_source`).
                 A script may also say what a camera would: refused, absent, failed, what is
                 in view, the cameras there are (TEST_ARCHITECTURE.md §6).
                 PIARY_FACE_RECORD=1, at build time, adds the fixture recorder's page to the
                 build (`app/face-record.html`, TEST_ARCHITECTURE.md §6).
                 PIARY_UPDATE_SCRIPT names a file the same build answers the check for a
                 newer version with, in place of GitHub: a driven run never asks GitHub, and
                 with no script asks nothing (`harness::update_source`).
                 PI_E2E_DISABLED=1 (or =true) turns OFF the one
                 `pnpm test:app` spec that spends a real model call — on by default, because the
                 boundary it covers is the product. It skips loudly either way.
PI SELECTION     the `pi` on PATH, or PI_CLI; the app bundles no fallback. `Class extends value
                 undefined` on session start is the signature of a pi other than the one the user's
                 packages were installed against (ADR 0004).
TURN CONTEXT     every message the app hands pi ends with a `[now: …]` line — local weekday, date,
                 time, IANA zone and UTC offset (`app/now.ts`). The document never holds it:
                 `serializeUser` drops a trailing one when a transcript is written as a document, so
                 the history compare reads no edit (ADR 0028).
PIARY PROMPT     every pi the app starts gets `--extension <pi-extension>` (the `view`/`cell`/`canvas_edit`/`budget`/`terminal`
                 tools and their skill, bundled in `Resources/pi-extension/`) unless the user's own pi settings
                 already install `pi-ui-views` — two copies registering `cell` make pi exit at
                 startup — and `--append-system-prompt pi-extension/system-prompt.md`, appended to
                 pi's own prompt, never replacing it (`src-tauri/src/extension.rs`, ADR 0030).
ANSWER UI        an answer to look at (stat tiles, a comparison, a chart, a table of figures, an
                 explainer with sliders) is a `view` with template `a2ui`: the agent sends
                 `{components, dataModel?}` from Piary's catalog and no colour or style, and the page
                 draws it in Piary's tokens. The tool checks the payload against the catalog before it
                 is drawn and refuses with one fault at a JSON pointer (`pi-extension/a2ui.ts`); the
                 packaged app's extension has no `node_modules`, so `pnpm build` bundles the
                 processor beside it (`a2ui-core.bundle.js`, git-ignored) and the check runs there
                 too (`tests/contract/a2ui-check-packaged.test.ts`). A
                 cell is for a workspace file's data, a calculation shown as code, a drawing or a
                 simulation. What the agent is told lives in the `view` description
                 (`pi-extension/a2ui-guide.ts`); `tests/contract/guidance-budget.test.ts` holds it,
                 the system prompt and the `cell` description to a size, and raising a ceiling owes a
                 design run (`evals/design/run.sh`, `evals/README.md`). The system prompt and the
                 skill name no a2ui (ADR 0043). This is the default draw mode, `a2ui`.
DRAW MODE        how an answer to look at is drawn is a mode, `a2ui` or `free`, and it picks what
                 the `view` and `cell` tools say of themselves, never what the page draws: a
                 document written in one mode opens in the other. The app reads `PIARY_DRAW` from
                 its own environment (`session::draw_mode`) and sets it on every pi it starts,
                 subsessions included; the two tools read it once, when they register
                 (`pi-extension/draw-mode.ts`), so a change takes effect at the next pi start. In
                 `free` the `view` tool names no a2ui template, carries no guide and refuses a
                 call to it ("draw it with the `cell` tool"), and the `cell` description says a
                 cell is the default for anything to look at; each mode carries only its own
                 teaching, and the budget test holds both totals. There is no control for it in
                 the window. A `pi-ui-views` the user installed themselves ignores the variable
                 (ADR 0044).
CANVAS EDITS     pi changes prose already in the document with `canvas_edit(oldText, newText)`, never
                 `edit`/`write` on the file: the quote must occur once, inside one `you`/`pi`/`pi:note`
                 block, outside the running turn's region. The page applies it as an undoable edit and
                 answers ok or why not over the verdict channel; 3 refusals per run, then "stop and tell
                 the user" (`src/document/canvas-edit.ts`, `app/canvas-edits.ts`, ADR 0033). An edit
                 that leaves its block with no text removes the block, marker included, as the
                 user's own delete of a segment does; the prompt being answered is refused, and the
                 trailing prompt keeps its marker (ADR 0065). An edit that adds lines under the
                 prompt being answered is refused too, and told to write them as the reply: an
                 answer is never an edit of its question (ADR 0033 §6). The text an edit put in is lit once
                 it is in view and fades by itself; one that landed out of view waits behind a link
                 pinned to the scroller's edge on its side (`changed above ↑`), which scrolls to it
                 and moves no caret. Neither is document text, and both are the canvas's own
                 (`src/components/edit-highlight.ts`, ADR 0067).
RUN BOUNDS       the agent proposes, the app enforces (ADR 0031). The app's pi gets
                 `PIARY_VERDICTS=1`, and its `cell` tool waits for the page's verdict on the cell
                 (`app/cell-verdicts.ts`, `notebook-cells.md` §Policy): 3 failed writes per cell per
                 run, then "stop and tell the user"; 10 s pending is "not verified". A cell that
                 ran while its chart, or one drawn from what it declares, has no data is told
                 so as a failed write naming the empty value (`src/notebook/plot-empty.ts`, ADR 0047). A run
                 stops at 20 min or 60 tool calls (`app/run-limits.ts`); pi's `budget` estimate, clamped,
                 earns one steer to report and ask. A badge at the top of the run's answer block says
                 what the run is doing, with its max time beside it;
                 what a cell is doing shows at the top of its artifact instead — blue for the whole
                 run, then green, amber `ran · no data` when its chart has none, or red when its
                 last attempt failed. Both are derived from events alone (`app/run-status.ts`). The canvas draws no `budget` call or result.
                 While its chip is blue and the turn runs, an artifact is locked: its outputs,
                 source pane and controls are `inert` and only the chip is not, so nothing the
                 run is about to replace takes a click or a key; the markdown stays editable.
                 The lock is derived in `ArtifactBlock` from the chip's tone and is no
                 preference (ADR 0054).
PREFERENCES      how the user chose the app to behave: `preferences.json` in the app's config
                 directory, read and written whole by Rust (`src-tauri/src/preferences.rs`), a
                 missing file or key being its default. Piary → Settings… (⌘,) opens the one
                 Preferences window (`app/preferences.html`, `app/preferences-window.ts`), which
                 writes a change as it is made; Rust then emits `preferences-changed` to every
                 window, and a page follows it (`app/preferences.ts`), so a change applies at
                 once with no restart. The window's switches take no click until what is kept
                 has been read. pi's own settings are not kept here. A new preference is
                 a field of `wire::Preferences`, a default beside it and in
                 `DEFAULT_PREFERENCES`, and in the window's table either a row or `null` with
                 where it is set instead, which the compiler asks for.
                 `cellWorkPulse` (on, under Runs): a faint neutral wash over the artifact a
                 run is working on, while its chip is blue (ADR 0048). It switches the wash
                 alone: the lock on that artifact is always on (ADR 0054). `face` (off,
                 under Camera), `faceSpeaks` (off, under Camera), and `faceExplained`,
                 `faceCamera` and `faceTuning`, which have no row there: FACE below.
                 `updateCheck` (on, under Updates) and `updateDismissed`, which has no row
                 there: UPDATES below.
UPDATES          the app says when a newer version exists (ADR 0064). A document's window asks
                 Rust for the turn to check (`update_claim`) at launch, when a preference
                 changes and every five minutes; Rust grants one an hour for the whole app
                 and none with the `updateCheck` preference off (`src-tauri/src/update.rs`).
                 The window with the turn asks GitHub for the repository's latest release
                 with `fetch` (`app/update.ts`), the only request the app itself makes to
                 GitHub, and hands Rust the tag it read; Rust keeps it for windows opened
                 later (`update_state`) and tells every window (`update-latest`). A tag is
                 three numbers, with or without `v`, compared with the app's own version;
                 a pre-release is never the latest. A later one is a pill in the model
                 chip, left of the model, `Update 0.2.0`, whose menu opens the release's page, at an
                 address built from the version and never taken from the answer, and
                 dismisses that version for every window and launch (the `updateDismissed`
                 preference); the next version is announced again. No network, a refusal
                 or an answer naming no version shows nothing and is a `PAGE update` line
                 in the log. Not shown during the tour. Help → Check for Updates… asks
                 at once, whatever the hour and the preference say (`update_claim` with
                 `asked`), and says on the status line what it found: the newer version,
                 whose pill then shows in that window even if dismissed, that this build
                 is the newest, or why it could not ask. The rules are pure
                 (`app/update-check.ts`). The app's version is written in `package.json`:
                 `tauri.conf.json` names that file, and `tests/contract/version.test.ts`
                 holds `Cargo.toml` and `Cargo.lock` to it. Nothing installs an update.
FACE             with the `face` preference on and agreed to (below), a message may end with a
                 `[face]` block: what the user's face did while it was typed, as a few lines of plain
                 words tied to the words typed (`docs/face-format.md`, normative). Movements,
                 never feelings; a filter (marked or stronger, half a second or longer,
                 unless the user set it otherwise, and no blinks) and no model in between;
                 at most six lines. The block is an app
                 line like `[now: …]`: after the `[attached: …]` lines, before the time line,
                 never in the document, and `withoutAppTail` drops it wherever a message is
                 read as what the user wrote (`serializeUser`, the history compare, a
                 `canvas_edit` quote). The canvas raises `prompt-edit` for every change to a
                 prompt's body; the page keeps a key log per prompt while the preference is on
                 (`app/face/log.ts`) and trusts it only if it replays to the body being sent,
                 so a miss ties nothing to the message's words, never the wrong ones. Only text typed key by key has a
                 time (`src/document/keystrokes.ts`); `src/document/face-assemble.ts` ties
                 each step of the face to the words, the pause or the removed text it fell
                 on. A command (`/…`) and a subsession's prompt carry no block; a message
                 nothing was typed for carries only a reading, if there is one (below). Rust appends `pi-extension/face-guidance.md` to the prompt of
                 a pi started while a face is read (`Preferences::reads_face`: the switch on
                 and agreed to), read at every start; a change of that stops the window's pi
                 once no turn runs (ADR 0055).
                 What reads the face is Rust's to say (`face_source`): the camera, or in a
                 driven run a script or nothing. The camera is read in the page
                 (`app/face/mediapipe.ts`, MediaPipe's Face Landmarker on the CPU, every
                 second frame, wasm and model from the app's own files) and reports samples:
                 the model's scores, the head's transform, the faces in view. No frame leaves
                 that file. `src/document/face-episodes.ts` turns samples into steps: each
                 score against the face's own rest of the last minute watched (kept across
                 the camera's stops and across messages), a unit begun once held
                 300 ms and ended once let go 400 ms, a blink told from closed eyes by
                 length, the head's pose and its to and fro, and nothing read while the head
                 is turned away, a second face is in view or the mouth is talking. It names
                 brows raised and lowered, a smile, lips pressed, the jaw dropped, eyes
                 closed and the head's poses and movements; what the model's scores do not
                 show on a real face (widened eyes, a wrinkled nose, raised cheeks, lowered
                 mouth corners) it does not name. Recordings of a person making each
                 movement hold it (`tests/fixtures/face/`, cut by
                 `scripts/face-fixtures.ts`). The camera is on from a key in a prompt until
                 20 s pass with none, the window is no longer in front, or pi takes the
                 message (ADR 0058). It is also on for 6 s after a turn ends in an answer:
                 the first 4 s are a reading, which the next message carries once as the
                 block's `read` lines (`assemble`'s `reading`). No reading opens behind
                 another window, in the tour, after an error, with the answer scrolled
                 out of sight (`DocumentChat.shows`) or within 2 s of a key; the first key
                 ends one; one older than two minutes is not sent; pi taking a message
                 ends it, sent or not (ADR 0060).
                 With the `faceSpeaks` preference on (off by default; a row under Camera and
                 one in the pill's menu), the agent may speak first: six seconds after an
                 answer, with no key and a reading that holds a marked movement
                 (`unaskedThreshold`, never weaker than measured), pi is handed the block
                 alone through `Turn.aside`, which opens no turn on the page and draws
                 nothing. Words come back as a `pi:aside` block under the answer
                 (`document-format.md` §An unasked reply), put there with the caret left
                 alone; `[silent]` or nothing is drawn as nothing and stays in pi's
                 transcript, which reads back with no difference. Once per answer; not
                 after three silent replies in a row, for a model in `NEVER_SPEAK`, or once
                 the user clicked Not helpful on one (`aside-dismiss`), which also removes
                 it. A send cuts an asking off. The panel counts the askings (ADR 0061).
                 The switch is a pill, last in the model chip (`app/face/pill.ts`): an icon
                 drawn by where the reading stands, and a menu that says it in a sentence
                 with what can be done. Its states are pure rules (`app/face/state.ts`): off;
                 `ask` (on, not agreed to); idle (on, the camera off until a key); starting;
                 watching; no face, two faces or head turned (the camera on and nothing
                 read, said by the gates the reading goes through, `seenIn`); no camera;
                 refused, whose menu opens System Settings (`open_camera_settings`, its
                 address fixed in Rust); failed, with the reason and Try again. A camera
                 that cannot be had is said there and nowhere else, and is asked for again
                 at the next key after the window is come back to. Nothing reads a face
                 until the user has agreed, once, on a sheet in the document that says what
                 is read, what is sent and to whom (`app/face/sheet.ts`, the
                 `faceExplained` preference): the switch on without it reads nothing and
                 tells pi nothing, and the document window in front shows the sheet by
                 itself, once, never at a key; declined, the switch goes off. The pill, the Preferences window, Conversation → Read My
                 Face and `/face` flip the same app-wide preference. The camera read is the
                 one the user chose in the pill's menu, by its label (`faceCamera`), else
                 the Mac's own, never an iPhone's or a Desk View unasked (`pickCamera`); a
                 camera plugged in or out starts the choice over. The tour reads no face.
                 Under 44rem of window the chip drops the session's totals, under 34rem the
                 meter too, and keeps the pills (ADR 0057).
                 What is read can be looked at (ADR 0059). The pill's menu opens a panel
                 (`app/face/inspector.ts`) that is no menu: it stays while the user types,
                 and does not hold the camera on. It shows each expression against its own
                 rest (`levelsAt`), what was found in the last 30 s with what is not passed
                 on struck through and why (a blink, too weak, too short: `inspected`,
                 `dropOf`), and the block the message being written would end with, worked
                 out by the send's own code with no effect; the pill carries a mark while
                 that is not empty. What is passed on is set there and kept as `faceTuning`:
                 the weakest intensity, the shortest hold, how far the head may turn and
                 tip, each one of the values offered (`readingOf`), with Reset. The camera's
                 picture shows only on Show camera, as `mediapipe.ts`'s own element. A
                 block's menu has `face: what was
                 sent`, once a face was agreed to: the block that message ends with in pi's
                 transcript (`app/face/sent.ts`, `faceBlockOf`), the app keeping no copy; a
                 rewritten history and a message sent with none are said as one, and a
                 prompt pi does not hold as it stands is said as not known. Under a block
                 that was sent the menu asks whether it was right about the user; the two
                 counts are kept in `localStorage` (`piary.face.judged`) and said in the
                 panel. A signed build gets the camera through
                 `src-tauri/Entitlements.plist` (`docs/packaging.md` §4), and no
                 microphone: the app asks for none. ⌥⌘F is Read My
                 Face's key: the switch itself, which stays where it is put, and the only
                 way to send without a block; no message is opted out alone.
MODEL            a chip at the window's bottom-right picks the model and the effort from pi's own
                 lists (`get_available_models`, `get_available_thinking_levels`), and names what
                 `get_state` says after every change: pi can refuse a model, and clamps the effort
                 to what a model takes. pi's transcript holds a conversation's model; a send that
                 rewrites the history puts the restarted pi back on the model it ran, or fails
                 saying which it would not take (`keepModel`, ADR 0021 §7). A provider's refusal is
                 written as `provider/model: message`, from pi's own record of where the request
                 went. The page
                 keeps, in `localStorage`, the effort the user picked (pi puts a switched model on
                 its settings default, so the pick is re-sent after every model change and pi
                 rounds it up) and a pick staged for a conversation pi has not heard a word of. A
                 new conversation and a subsession start on the window's pick; no pi is started
                 to paint the chip (`app/model.ts`). Left of the pills the chip shows the context
                 the last reply used of the model's window, and the session's tokens and cost with
                 its subsessions' included: seeded from `get_session_stats`, grown by each reply's
                 `usage`, never re-seeded mid-run (`app/usage.ts`).
SIGN-IN          a panel in the document over pi's own login code (ADR 0034): the page sends
                 `/piary-login` or `/piary-logout` to this window's pi, a command of Piary's
                 extension (`pi-extension/login.ts`) that runs pi's `ModelRuntime` login and asks
                 each question as a `piary:login` dialog the page draws (`app/login.ts`,
                 `app/login-flow.ts`): a searchable provider list, a password field for a key, a
                 button that opens the provider's page through Rust's `open_url` (http(s) only),
                 a device code, and a warning on the Anthropic account row that a Claude plan used from Piary
                 draws on extra usage; a flow that went through the browser brings the window back to the
                 front (`focus_window`) when it ends. pi writes and removes its own credentials; the app writes no
                 `auth.json` and keeps no key. The command is checked for in pi's command list
                 first — an older `pi-ui-views` lacks it, and pi would hand it to the model. A
                 prompt pi refuses, when `get_available_models` then answers an empty list, gets
                 an inline Sign in ask under its error and a red Sign in button beside the model
                 chip, whose pills blink red with it until a sign-in or a prompt pi takes
                 (ADR 0037); the `/login` row of the creation menu and
                 the model menu's `Sign in…` row (pi lists no models) open the same panel. While pi
                 lists models, the menu offers `Sign in to another provider…`, which adds one (pi
                 answers with every provider it is signed in to), and `Sign out…`, which lists only
                 what pi stored: an environment key is not pi's to remove. When a flow changes a sign-in, this window's pi is stopped, quietly and
                 keeping the window's terminals, so the next send starts one that reads it.
                 `PI_CODING_AGENT_DIR` points pi at another agent dir, which is how the sign-in
                 walk runs without the real `~/.pi/agent/auth.json` (`docs/running-the-app.md`).
FIRST RUN        the main window with no stored `welcome` opens on a splash, then a guided walk of
                 the tour document (`app/tour.ts`): a cell that runs with no pi, a seeded prompt
                 and answer to edit and send again — real history pi inherits — and an empty
                 prompt. Each step cuts out what it is about, points an arrow at it and lets
                 through only what it asks — pointer, keys and menu items. A send refused for want
                 of a provider forks to Sign in and joins back at the send once it takes; a failed
                 one offers Try again or Sign in later, which rewrites the question to five under a
                 recorded answer, with no model call (`app/onboarding.ts`, its rules in
                 `app/onboarding-steps.ts`); Quit onboarding is on every step and says the tour is
                 under Help → Welcome to Piary. Finishing or quitting stores the tour, which ends
                 the first run; nothing about it is kept in the webview's storage. Help → Welcome
                 writes a fresh copy under a new id and opens it, walked while untouched; a stored
                 `welcome` is never overwritten. No pi is started to show any of it (ADR 0037,
                 ADR 0038).
EVALS            `pnpm eval` answers `evals/cases/*` and scores the answers; `--compare` lists what
                 regressed against an older report in `evals/reports/`. Out of `pnpm verify` and
                 `make ci` because answers are not deterministic. There are two harnesses.
                 `--harness claude` asks through `claude -p` on the account it is signed in to,
                 so it draws on a Claude plan's limits and spends no API credits: the user's own
                 pi is hosted with no model behind it and serves its system prompt and its tools
                 (`evals/claude/host.ts`), and Claude Code runs only the model's loop. **Use it
                 for every run made while developing**: trying a wording, an experiment's arms,
                 a spike, a rerun after a fix. Anthropic models only; a history goes in as the
                 document's text; cases tagged `needs pi` are left out and named. Without the
                 flag the user's own pi calls the model on both eval models, on pi's own
                 credentials: that is the run **a prompt change ships with**, once, with its
                 comparison, and the only one that scores the `needs pi` cases. A pi run on a
                 Claude plan is refused by Anthropic and is not worked around. `--compare`
                 refuses a report of the other harness. A turn the provider refused is never
                 scored as an answer: the report lists it and the run exits 1 (ADR 0056,
                 `evals/README.md` §The claude harness).
ATTACHMENTS      images ride along as real vision content; anything else is stored and referenced by
                 path for the agent to open with its own tools — an `[attached: …]` line after the
                 prompt names it. Files land in `attachments/` beside the conversation
                 (`src-tauri/src/attachments.rs`, read by the webview through `piary-file://`,
                 ADR 0026) and stay in the document,
                 so they survive a reload and a rebuild.
TRANSFER         Import and export act on conversations, each through a window of its own, one
                 for the app, built as the Preferences window is (`app/import-window.ts`,
                 `app/export-window.ts`, the labels `import` and `export`): File → Import… and
                 Export… open it or focus the one there is, and with no window in front the menu
                 opens it itself. A row's `⋯` in the conversation list has `export…`, which opens
                 the Export window on that conversation alone; one already open is told which is
                 meant (`export-from`) and draws itself again. The Export window asks which
                 conversations (the one it was asked for is chosen), then as what: the `.md` alone, or a bundle — a folder holding
                 the `.md` and an `attachments/` with the files the document references, or that
                 folder zipped. Rust asks for a folder and writes each conversation into it under
                 its own name; a name already there is never written over, and the window says
                 so. The Import window takes any of the three forms and opens the conversation in
                 a window of its own. A page names no path: Rust shows the panel
                 (`tauri-plugin-dialog`), and an import read but not yet placed is held by Rust
                 under a token. The page does what needs the format (`src/document/bundle.ts`):
                 the references, the binding to the new id (so its own pi session), the links
                 following an attachment stored under another name. A name the store refuses is
                 refused; a taken one is asked about in the window (Keep both, Replace — which
                 keeps the old document as a backup first — or Cancel); a link with no file is
                 reported, not refused; a document of an unknown format version is imported byte
                 for byte and opens read-only. Zip is the `zip` crate, in the process; an archive
                 is never extracted as it says: every entry is checked first (a path that reaches
                 outside or a symlink refuses it whole), then only the document and the files
                 under `attachments/` are written out (`src-tauri/src/bundle.rs`, ADR 0049).
                 There is no version conversion.
                 Two more forms are the conversation drawn, for a reader without Piary
                 (ADR 0066): a web page (`notes.html`) or a PDF (`notes.pdf`). The page is
                 written from the document by a pure function
                 (`src/document/export-html.ts`), which draws each segment by the canvas's own
                 rules: prose under its label, a step folded, a terminal as one line saying it
                 ran. What only a page can make is handed to it by `app/export-render.ts`,
                 which the Export window loads when one of the two is first asked for: it
                 mounts the real canvas off screen and inert, lets the cells run from the
                 state the conversation kept (twenty seconds; one still running is exported
                 as its source and named in the window), and copies out what each drew and
                 what each view's template draws, made still: a control disabled at its
                 value, a `<canvas>` as a picture, pictures as bytes, no script, handler or
                 custom element. The page is one file: its styles are read from the
                 window's own sheets, its pictures are `data:` urls, no font is carried, and
                 its policy allows no script and no request. A PDF is the Export window
                 printed: the window puts one conversation in `#print-root`, which only
                 paper shows, and Rust runs the webview's print operation to a file with no
                 panel (`src-tauri/src/print.rs`); several conversations are several
                 commands, and the folder asked for once is named to the next by the token
                 the answer carries, which Rust takes only for another PDF, from the same
                 window, until the next export. A drawn export is not imported back.
COMMANDS         what a `/` command is comes from one catalog (`app/command-catalog.ts`, pure): the
                 app's own (`/terminal`, `/subagent`, `/model`, `/thinking`, `/new`, `/resume`,
                 `/import`, `/export`, `/settings`, `/face`, `/login`, `/logout`), then this window's pi's
                 (`get_commands`, asked only once pi has answered, so no pi is started to fill a
                 list). Two surfaces list it: the `/` menu on an empty line of the trailing prompt,
                 under a header per offerer, and the palette that Conversation → Commands… (⌘K)
                 opens from anywhere, with a search field (`app/palette.ts`). A row is an icon,
                 the name, one line of what the command does and the chord of its menu item; the
                 chord is the key the system's menu item holds, which macOS moves under some
                 keyboard layouts (`⌘,` is `⌘Ö` on a Turkish one): Rust reads the menu back
                 from AppKit (`menu_chords`, `src-tauri/src/menu_keys.rs`), and the page asks
                 at startup, on window focus and when the palette opens (ADR 0051). The menu has no card
                 beside it; a `/name` already written has one on hover (name, argument hint, one
                 line, source), which never shows a command file's text. A terminal the user opens leaves a prompt slot under it. A row for a control the app has runs that control's menu item
                 through the menu's own route, so the tour holds it as it holds the item; a command
                 that is written lands on the trailing prompt. A row adds no capability, and a pi
                 command that asks a question gets no answer from the app (ADR 0050).
LINKS            Cmd-click (macOS) / Ctrl-click opens; a plain click places the caret, because the
                 document is editable text first.
TERMINALS        Two panels, one element, told apart by `host.interactive`: an agent's command
                 output is READ-ONLY (no cursor, no key forwarded — nothing can reach a running pi
                 tool's stdin), a `/terminal` takes input. A panel the user opens is scrolled into
                 view. `/terminal` opens a real PTY (xterm.js over `src-tauri/src/pty.rs`): the page
                 sends an empty command and cwd and Rust resolves them — the login shell (`$SHELL`,
                 else the account's, else /bin/sh) in the workspace. An agent's command gets a panel
                 only when the agent runs it through Piary's `terminal` tool (pi's `bash` under the
                 name that shows it to the user), or when a `bash` is still running after 3 s — a
                 stand-in until a long process has a surface other than a block in the answer
                 (`app/output-panels.ts`); any other `bash` is the folded step under its call. The
                 output streams in via `tool_execution_update`, but uncoloured — pi pipes it and
                 its spawnHook is unreachable from outside (ADR 0013). A terminal answers only the
                 session that opened it: opening establishes ownership, every other verb refuses
                 unless the terminal is the caller's, and an unknown terminal gets the same refusal
                 as someone else's. A view's marker leaving disposes it AND emits
                 `live-view-closed`, which the page turns into `pty_close` — disposing alone frees
                 only the page's half and would leave the shell running. A terminal has no
                 source toggle, and one with no process behind it (a document reopened) draws a
                 line saying a terminal ran here and its output is not kept.
```
