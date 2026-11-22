# Coding Guidelines — Piary

The architecture, patterns and hard rules for this repo. Decision history lives in `docs/adr/`; the
architecture tree, the Hard Rules table and the key facts live in `HANDBOOK.md` —
**canonical, not copied here.** This file keeps what is unique to it: the hard-rule prose, the
comment policy, the build gotchas, and the file-layout reference.

**Where code and prose disagree, the code wins** (ADR 0010) — for behaviour that already exists; a
new invariant is written here or in an ADR first, and the code is held to it (ADR 0018). So nothing
here restates an implementation; everything here is a rule, an invariant, or a gotcha the code cannot state about
itself.

---

## Hard Rules (do not violate)

### Layering

- **`src/document/*` is pure.** No DOM, no `fetch`, no RPC, no `window`. It is the layer a bug repro
  starts at and the layer the suite drives directly; an effect import there removes a test the next
  person would have written (ADR 0006).
- **`src/components/*` own all DOM.** A view renders. It does not resolve document positions — ask
  `run.ts`. Duplicating position logic into a component is how the agent ends up overwriting the
  user's text in one code path and not another (ADR 0005).
- **`src/bridge.ts` is the only importer of `@tauri-apps/api`** (ADR 0014): every command the page
  calls and every event it hears. A spec boots the page by replacing this one module, and a second
  importer is a second place to audit against the capability grants. Lint-enforced.
- **Only the surface Rust modules name `tauri::`** (`main.rs`, `commands.rs`, `menu.rs`,
  `teardown.rs`). Everything behind them takes plain types, so `cargo test` drives it without an
  app. Lint-enforced.
- **`app/main.ts` assembles; a feature is a module** (ADR 0024). A module owns its state, its
  handlers and its tests. It exports a `HostFragment` of the canvas's event table, takes a `Pick` of
  `AppContext` naming only what it uses, and never imports the entry. `composeHost` joins the
  fragments: forgetting an event is a type error, and answering one twice fails at boot. A lint
  budget holds the entry's line count.
- **The notebook engine is loaded lazily** — heavy (acorn + lezer) and its `/runtime` touches
  `document` at import time. The canvas imports it on the first `pi:cell` segment, so a document
  without cells never pays for it.

### Code quality

- **No magic numbers at the use site.** A timing literal (`300`, `500`, `6000`) gets a module-scope
  const whose name says what it is, or a comment saying why the number is that number. "Debounce" is
  not a reason; "one frame past CodeMirror's measure pass" is.
- **The parse budget: the canvas re-parses the whole document on every transaction, and that is
  accepted.** `docField` (`src/components/editor-state.ts`) flattens the rope and runs `parseState`
  on each keystroke **and** each streamed chunk — O(n) per edit, so a streamed reply is chunks ×
  document. It is accepted because the alternative is positions that lag the text, and a hide range
  one keystroke out of date deletes the wrong text on screen (the `parseState` comment). Cost follows
  **marker count** far more than bytes — roughly 0.7 µs per segment over a floor of ~1.4 ms/MB.
  Measured with `node tests/helpers/bench-parse.ts` (after `pnpm build`; Apple M2, node 24.18, V8 —
  the app runs JavaScriptCore, so re-measure there before leaning on a figure near the line):

  | Document | Segments | Per transaction | 200-chunk stream, total |
  |---|---|---|---|
  | 100 KB tool-dense | ~960 | 0.7 ms | 0.14 s |
  | 400 KB tool-dense | ~3,800 | 2.6 ms | 0.53 s |
  | 1.6 MB tool-dense | ~15,100 | 10.5 ms | 2.2 s |
  | 400 KB prose-heavy | ~680 | 0.6 ms | 0.12 s |
  | 1.6 MB prose-heavy | ~2,700 | 2.2 ms | 0.46 s |

  **The threshold:** the budget holds while one transaction parses in under **8 ms** — half a 60 Hz
  frame, leaving the other half to decoration and paint. On these figures that is ~12,000 segments
  (~1.2 MB of tool-heavy conversation, ~5 MB of prose). Past it, a streamed reply spends most of
  every frame parsing, and incremental parsing becomes worth a phase; below it, it is not — do not
  build it against these numbers. Nothing caps document size (ADR 0018 §3 declined a cap), so this
  threshold is the budget's only upper bound.
- **No dead code.** Delete the stub, the unreferenced export, the commented-out branch.
- **A comment states the invariant plus its spec/ADR anchor — it never narrates provenance or
  restates code.** Full rubric below.
- **No `console.log` in `src/`.** Page code that has something to say says it through `logLine` (`src/bridge.ts`), and
  Rust says it through `diag::note`, not a bare `eprintln!`: both reach the app's log file, which
  is the only place a Finder-launched build's output reaches anyone (`packaging.md` §5).
- **Non-public class members use `#private`**, lint-enforced. Where a test legitimately needs access,
  make the member public with a doc comment naming it a harness seam; do not leave it `private` and
  reach through the erasure (ADR 0008).
- **No `export enum` in `src/`.** TS emits a value→name reverse map, so every member name ships as a
  string. Use an `as const` object plus a same-name type alias.
- **Widen the interface, don't cast.** `x as unknown as T` plus a `typeof` probe means the shared
  type is missing something callers legitimately need. Add it and let the compiler check.
- **A seam is proven only when both ends run.** An event nobody reads, a policy hook nobody
  implements, a marker the parser emits and no renderer handles — build the consumer in the same
  change. The first real consumer is where a design breaks.
- **Rule of three, enforced at two.** The second wholesale copy is the cheap moment to extract
  (ADR 0009).
- **Don't grow a second state-cluster plus method-family inside an existing class — name it, move
  it.** Extraction is behavior-preserving: bodies transplant verbatim, order holds, and the suite
  passes **without a test being edited**. A test that needs editing means behavior changed — stop
  (ADR 0009).
- **Geometry is relative, never absolute.** Any assertion about a rendered line is expressed
  **relative to its marker**, never as an absolute newline count.

### Format changes

- A marker kind is three edits in **one** commit: a `docs/document-format.md` section, a
  `tests/unit/format.test.ts` row, the parser. A marker in the parser with no spec section is undocumented
  private syntax and defeats the format's purpose (ADR 0001).
- **A marker only reads as one at the start of a line.** Body text that looks like a marker must
  round-trip through `escapeBody`/`unescapeBody`.
- The format is the publishable artifact. `docs/document-format.md` and `docs/notebook-cells.md` are
  normative; the parser conforms to them, not the reverse.

### Scope

- **The prototype is frozen: repairs and presentation only** (ADR 0010). A fix requiring restructure
  is out of scope by definition and belongs to the reimplementation. Saying so is the correct
  outcome.

---

## Comment policy

This project is heavily AI-developed, and its comments are unusually good — they carry gotchas,
incidents and reasons that nothing else records (`pi-cli.ts`, `rebuild.ts`, `core.ts`,
`.gitignore`, the test headers). That is the standard to hold. But AI tools over-comment, and the
failure mode is specific: narrating **the change** instead of **the file**.

**These lists bind when you WRITE a comment, not only when you sweep.** A comment a sweep would
delete should not have been written.

Two habits make the difference, and both fail most often while executing a plan or spec task:

- **Write for a reader of the FILE, not a reviewer of the DIFF.** The reader never saw your change,
  does not know a planning document existed, and cannot tell new code from old. Justifying *the
  change* —
  why this value, why now, what it mirrors, what it replaces — is reviewer-talk that goes stale the
  moment it merges. Put it in the commit message or the ADR.
- **Match the density of the code you are editing.** A file's existing comments ARE its convention.
  If neighbouring entries in a table or switch are bare, yours is bare; if each carries a one-line
  rationale, yours does too, in the same shape and length. A three-line block appended to a list of
  one-line neighbours is a density mismatch even when every word is true.

**KEEP (as-is or near):**

- Invariants the code cannot show: ordering constraints, units, coordinate frames, wire contracts,
  what must run before what and why.
- **Incidents that cost a session to rediscover.** This repo's best comments are these: "the first one
  to extend a class the older pi does not export fails with `Class extends value undefined`";
  "an event from the wrong realm is rejected by jsdom's `dispatchEvent`"; "~8MB of generated bundle
  rode along in the history". Never strip one.
- Spec and decision anchors: `docs/document-format.md §`, `ADR NNNN`. These are the citation system.
- The WHY of a non-obvious decision, and **the reason a line exists at all** — "an app quietly
  running a different pi from the terminal next to it is the failure this line exists to make
  visible".
- A deliberate omission and its reason: "the notebook engine is deliberately NOT exported here".

**SIMPLIFY (rewrite shorter, keep the meat):**

- Task-genealogy chains ("fn-3 task .7, extended .9"): keep the one anchor that still helps a reader
  — usually the ADR or the normative spec § — and drop the lineage. Git holds the archaeology; a
  comment is not a changelog.
- **Task tags in new code** (`fn-3 task .7`, `fn-5 R4`, a ticket id such as `DIV-123`, a path under
  the git-ignored `docs/plans/`): cite the ADR or the spec §, or cite nothing.
  A spec task number stops resolving once the spec is done, so the tag becomes a dead reference the
  reader must do archaeology on to learn it did not matter. Cite a spec only for a gotcha that lives
  nowhere else — and prefer promoting that gotcha into the ADR.
- Multi-sentence narration where one sentence carries the invariant.
- Doc comments restating the interface doc on every implementation.

**DELETE:**

- Comments restating the adjacent code.
- Provenance-only comments ("moved here from DocumentChat", "extracted in the cleanup").
- Reviewer-talk ("this is correct because…" where the code shows it).
- References to deleted systems where nothing needed replacing.

**FIX (stale → true):**

- Named things that no longer exist → their living successor, or a plain description.
- Hardcoded numbers in prose that the code has since made configurable.

**Write-time test.** Before adding a comment, three questions — any "no" means delete it:

1. Does it say something the code cannot? (Not a restatement, not a label for the line below.)
2. Would it still read as true and useful to someone who never saw this change, a year from now?
   (Kills task tags, "now X", "moved from Y", "mirrors the old change".)
3. Is it already stated at the top of this file, in the ADR, or in the normative spec?

Then: **does it match its neighbours in length and shape?**

**Sweep rules of engagement:** comment-and-whitespace-only diffs. No identifier, assertion or
behavior change rides along a sweep commit. If a stale comment reveals a real code problem, note it
and finish the sweep — fix the code in its own commit with its own test.

---

## Build & toolchain (hard-won)

- **The suite runs against `dist/`.** `pnpm test` without a preceding `pnpm build` tests the previous
  build and will "reproduce" a bug you already fixed. `pnpm verify` composes them so it cannot be
  skipped. This is the most common wasted debugging session in this repo.
- **Node runs `.ts` directly** (type-stripping, unflagged from Node 22.18). That is why the scripts,
  the suite and the evals are `.ts` with no build step between them and `node`. Strip-only mode means **no
  `enum`, no `namespace`, no parameter properties** — all three already banned or avoided here, and
  a new one would fail at runtime rather than at compile time. Reasoning: ADR 0012.
- **Four tsconfigs with jobs, and one for the editor.** `tsconfig.build.json` emits `dist/`
  (browser, `src` only). `tsconfig.app.json` checks the browser scope it leaves out: `app/`,
  `src/bridge.ts` and the e2e harness's page entry.
  `tsconfig.app-e2e.json` checks the real-app test layer (`wdio.conf.ts`, `e2e-app/`).
  `tsconfig.node.json` checks the Node tree — the scripts, the suite and the evals —
  and is the only one with `types: ["node"]`, which is what makes `process` in a page module, or a
  DOM global in a Node module, a compile error. Its `exclude` is `[]` and
  stays `[]`: an exclude would buy nothing anyway, because a file something imports is checked
  whether or not it is listed, so only a leaf could ever be excluded. `tsconfig.json` owns no file:
  it lists the other four as `references`, for the editor. tsserver has no `-p`; it finds a file's
  project by walking up to the nearest file named exactly `tsconfig.json`, so without this file an
  IDE checks everything outside `src/` under the wrong options. Its `extends` is for Vite and
  esbuild, which take compiler options from the nearest `tsconfig.json`. Every script names its
  config with `-p`, and none reads `tsconfig.json`.
- **`lib` is the runtime's floor, `target` is the emit's.** `tsconfig.build.json` sets
  `lib: ["es2023", "dom", "dom.iterable"]` against `target: "es2022"`: `engines` requires Node
  22.18, so an ES2023 array method is there, while `target` stays es2022 because it shapes what
  `dist/` emits for a browser.
- **A package script's PATH is not the user's PATH.** npm/pnpm/yarn prepend dependency
  `node_modules/.bin`, so resolving a sibling CLI by PATH inside a script finds your own pinned
  dependency. Skip `node_modules/.bin` entries (ADR 0004).
- **The app's page is a minified bundle shipped in every `Piary.app`.** Anything a minifier cannot
  mangle ships readable: that is the whole argument for `#private` (ADR 0008).
- **The e2e harness is built with code splitting** (`build:harness`). esbuild hoists an external
  `https://` import to the top of a single-file bundle, so unsplit, the cell engine's CDN libraries
  load on every page open, and a slow CDN times out specs that have nothing to do with cells.

---

## Assertions and failure handling

There is no dev-stripped assert helper here. The rules that replace one:

- **Handle runtime conditions with a real branch.** Network errors, a missing credential, a malformed
  document, a truncated transcript tail — these legitimately happen and must be handled in
  production. Swallowing a failure the code could report is not handling it.
- **Fail visibly where the user is watching.** A missing credential surfaces as a failed first
  prompt, not a silent empty picker (ADR 0011). An empty `catch {}` is acceptable only where the
  comment says what is being ignored and why ("partial/noise line").
- **Never let a swallowed error stand in for a branch you did not write.** `catch {}` with no comment
  is a bug waiting to be filed against something else.

### Durability and the save path

ADR 0018 holds the invariant and the reasoning; these are the rules in the form a reviewer checks.

- **A document write is atomic and synced:** temp file, `fsync` it, `rename` it into place, `fsync`
  the directory. The file is the only copy (ADR 0001), so a write that can publish a half-written or
  never-written file has nothing to fall back on — and a rename alone orders the name, not the bytes.
- **Writes of one document are ordered by the caller.** `docs_write` runs off the main thread, so two
  in flight can finish in either order; `docsWrite` (`src/bridge.ts`) issues each after the last has
  finished. A second path to `docs_write` that skips it can land an older document over a newer one.
- **A debounced save must not be starvable by a non-user writer.** A stream resets a debounce on
  every chunk, so a save gated only on a pause never fires while the agent writes. Give it a
  deadline; do not exempt the writer, or the save fires on a stale timer mid-answer.
- **Anything that ends the process on purpose flushes the document first.** The unsaved buffer lives
  in the webview, which no Rust-side shutdown can read without asking it.
- **A safety net one host carries is owed by every host, or declined in writing.** ADR 0018 keeps
  the ledger. A net that exists in one host and is silently absent in another is the defect class
  ADR 0017 named.

### Rust concurrency and lifetime

ADR 0019 holds the teardown ordering and the orphan rule; these are what a reviewer checks in
`src-tauri/`.

- **One lock order.** The mutex clusters are `Sessions.live`, `Ptys.sessions`, `Capture.inner`,
  `Store.watcher` and `Exit.inner`, plus a terminal's own `pending` and `reading`. The **only**
  nesting is `Sessions.live` → `Live.pending` (`session::send`, and its timeout path), always
  outside-in; a reader thread takes `pending` alone, and at EOF takes `live` (or `Capture.inner`)
  alone to free its slot. No other lock is acquired while another is held — `pty`'s
  `pending` and `reading` are taken one after the other, never together — and a cross-subsystem
  sequence (`pi_stop`, the exit sequence) calls each subsystem in turn, holding nothing. A new nesting
  extends this list in the same change, outside-in.
- **Never hold a lock across a blocking wait.** `session::send` releases `live` before
  `recv_timeout` and says why: a 30-second request must not stop every other session from being
  driven. `drop_session`, `stop_all` and `Capture::stop` take the entry out under the lock, drop the
  guard, then wait out the stop's grace — the shape every stop follows.
- **A synchronous command runs on the main thread.** That is Tauri's rule, not ours: only an `async`
  command (or `#[tauri::command(async)]`) runs on the async runtime. A synchronous command is right
  while its work is small and local — a document read, a window-layout file. One that waits on
  another process, or on a device — `docs_write`'s syncs (ADR 0018 §1), `pi_send`'s wait for pi's
  reply (up to `REQUEST_TIMEOUT`), `pi_stop`'s and `capture_stop`'s wait for a child to go (up to
  `STOP_GRACE`) — is `async`, with the wait in `tauri::async_runtime::spawn_blocking`, because a
  blocking wait on the main thread stalls the event loop and every other command with it. Off the
  main thread, two calls made at the same instant run in either order; a command whose callers need
  an order keeps it on the page side, as `docsWrite` does. A stop needs none to stay sound: it takes
  its entry out before it waits, and a reader frees only its own start's slot (the `generation`
  check in `session::take` and `capture::take`), so a start landing mid-stop keeps the child it
  started — what the order still decides is whether a child is running afterwards, and the page
  awaits a stop before it starts again. The same holds for every `RunEvent` handler: it runs on the main thread, and a
  handler that waits there for the page waits for something it is itself preventing (ADR 0019 §2). A
  SIGINT or SIGTERM is acted on by the `signals` thread `exit::listen` starts, never in the signal
  handler itself (which `signal-hook` keeps to waking that thread) and never on the main thread —
  the thread may take `Exit.inner` and wait on a reap.

---

## File layout

```
src/
  index.ts             the library's public surface: registers every custom element (side
                       effect) and re-exports the types a consumer needs. NOT the engine.
  document/            PURE. No DOM, no fetch, no RPC.
    format.ts          the marker grammar (docs/document-format.md): parseDocument,
                       escapeBody/unescapeBody, blocksFrom, documentMessages, rebindDocument
    run.ts             positional logic: promptAt / tailPrompt / promptEnd / replySlot /
                       runAnchor / deleteSegment / insertCellAt   (ADR 0005)
    cells.ts           cell ids, modes, IN_ARTIFACT
    views.ts           tool-result view templates
    branch.ts          conversation branching
    modes.ts           cell/run modes
    command-doc.ts     slash-command documents
    ask.ts             the ask flow
  components/          Lit custom elements — all DOM lives here
    DocumentChat.ts    the canvas: CodeMirror 6 over raw markdown, decorated into blocks
    editor-state.ts    the state plane: one StateField per thing the view must agree
                       about, and the StateEffect that moves it. A LEAF — the widgets
                       and the decoration builder read it; nothing here reads them.
    editor-widgets.ts  the widget plane: every WidgetType the decoration builder
                       mounts, plus the DOM builders they share. Reads the state
                       plane, talks back to the element only by CustomEvent.
    CellBlock.ts CellEditor.ts ChatIndex.ts markdown-live.ts SessionList.ts
    ArtifactBlock.ts TerminalView.ts code-highlight.ts
    views/             tool-output renderers: diff, table, cards, file-tree, matches,
                       properties, subsession
  notebook/            engine.ts (acorn + lezer; lazy-loaded by the canvas)
  utils/               format.ts, icons.ts, plot.ts, chart-palette.ts — the only utility home
  styles/              plain CSS on design tokens, no framework. theme.css holds the
                       custom properties a consumer overrides; `class="dark"` for dark mode.

app/                   the app's page: main.ts assembles feature modules (ADR 0024) —
                       turn.ts, model.ts, login.ts, terminals.ts, conversations.ts,
                       history.ts, attachments.ts, menubar.ts, …
src-tauri/src/         the Rust main process: commands.rs (the IPC surface), session.rs
                       (one pi per session), store.rs/docs.rs, pty.rs, transcript.rs, …
pi-extension/          Piary's pi package: the view, cell, canvas_edit and budget tools,
                       the login commands, the skill and the appended system prompt
demo/harness.ts        the e2e harness page: the real <document-chat>, nothing behind it
evals/                 the system-prompt evals (evals/README.md)

tests/                 node:test + node:assert/strict. See docs/TEST_ARCHITECTURE.md.
  helpers/editor.ts   the jsdom mount — real <document-chat>, real CodeMirror
  helpers/pairing.ts
  helpers/bench-index.ts   a measurement, not a test (says so in line 1)

docs/                  normative specs, this file, TEST_ARCHITECTURE.md, adr/
```

---

## Adding a feature (or, more likely, a repair)

1. Check it is in scope: repairs and presentation only (ADR 0010). If it needs restructuring, say so.
2. Write the **failing test first**, at the thinnest layer that can express it
   (`docs/TEST_ARCHITECTURE.md` ladder).
3. Implement it. Pure logic goes in `src/document/*`; DOM in `src/components/*`.
4. If the document format changed: update `docs/document-format.md` and its test **in the same
   change**.
5. If a significant decision was made: write the ADR, add it to `docs/adr/README.md`'s index.
6. If `docs/HANDBOOK.md` now states something untrue: fix the statement **in place** — never append a delta.
7. `pnpm verify`.
