# ADR 0013 — The inline terminal, and the live-view seam

**Status:** accepted. Amends ADR 0010 for this one feature: the freeze was overridden deliberately,
by the user, for a feature named as core. Amended by [ADR 0019](0019-nothing-outlives-the-app.md):
rule 6, flow control. Implementation: `app/terminals.ts` over `src-tauri/src/pty.rs`. **Amended by [ADR 0046](0046-the-source-toggle-says-what-it-shows-and-the-way-back.md)**:
a terminal with no process behind it draws a line saying so, not an empty grid.

## Context

Two things were true at once.

A tool's output reached the document only when it finished. The page handled `message_end` with
`role === "toolResult"` and nothing before it, so a sixty-second command rendered **nothing at all**
until it ended. Meanwhile pi had been streaming that output the whole time: `tool_execution_update`
carries a cumulative `partialResult`, and every event pi emits reaches the page unfiltered. A
repo-wide grep for `partialResult` returned zero matches. The data was arriving and nobody read it.

And a terminal is not a `<pre>`. Colour, cursor addressing, spinners and in-place redraws are what
make a running command legible, and an escape-stripping `<pre>` turns them into run-together text or
visible `ESC[31m`. The prototype this pattern was ported from had tried the parser route first; its
own note on the SGR parser it deleted is the argument — a parser "is not a terminal emulator."

ADR 0010 freezes this prototype to repairs and presentation only, and a live terminal is neither. It
was read, quoted to the user, and the user **overrode it**, approving xterm.js and a native PTY
dependency and naming the terminal a core feature. That is recorded here so a later session neither
re-litigates it nor quietly narrows the feature back to a repair.

## Decision

**Two things, in the order they constrain future work.**

### 1. A live-view seam, because a `ViewTemplate` cannot change

`src/document/views.ts` templates are `(data) => HTMLElement | null` — called once per decoration
build. Nothing that receives content over time can use that, which is why `subsession.ts` grew a
private side-channel (`setSubsessionStatus`) just to show live status.

`src/document/live-views.ts` is that need, named once: `write` / `settle` / `dispose`, plus a host of
three (`send` / `measure` / `focusEditor`). `views.ts` keeps **static** templates; this holds
**changing** ones. It is pure and is in `PURE_DOCUMENT_MODULES`, so the gate enforces it.

Six rules bind every implementation. The first five are bugs already paid for; the sixth is a bound
written before one was:

1. **The element is stable for the view's life.** The widget is rebuilt on most edits — `segFrom`
   moves whenever text above it changes — so what protects a view's content is that the element is
   **pooled outside CodeMirror** and the widget only re-parents it. `eq()` is an optimisation here,
   not the safety net; verified by mutation (sabotaging `eq()` fails nothing, sabotaging the pool
   fails two tests).
2. **`write` dispatches no transaction.** A state effect per chunk rebuilds the widget and defeats
   (1).
3. **Bytes are not document content.** What a process emitted belongs to the view; what the user
   authored belongs to the document. The dividing line, for every future live view: **state the user
   authored persists; output a process emitted does not.** `cell-state` persists for the mirror-image
   reason — a widget's value *is* the user's data.
4. **One view per id**, pooled outside CodeMirror.
4a. **`host.interactive` says whether anything at the other end reads input, and the view must read
   it.** The two terminal panels are identical in every other respect, and the difference decides
   whether a keystroke goes anywhere: an agent's `bash` output has no stdin reachable from here,
   while a user's `/terminal` has a pty. Forwarding regardless was the first implementation — the
   message was dropped on the way, which made it harmless and invisible, but the panel still
   showed a cursor and took focus. **A cursor is an invitation; do not offer one that cannot be
   honoured.** It defaults to `false`, so a producer that has not thought about it gets the safe
   answer.
5. **`dispose` is lifetime, not visibility.** CodeMirror drops the widgets of lines outside its drawn
   viewport, so releasing from the widget throws a running terminal's output away. Only the owner
   watching which ids are still in the document may dispose — and "still in the document" means the
   **marker** is present, not that the payload parsed. A fence is unclosed for as long as it takes to
   type its second delimiter, and reading that as "the view left" is what once destroyed a cell's
   editor mid-keystroke.
5a. **Disposing is half of leaving: the PRODUCER has to be told.** `dispose()` reaches the view's own
   DOM and nothing past it, by design — a view does not know what its transport is. So the owner that
   disposes also emits `live-view-closed`, and the page stops whatever was feeding it
   (`pty_close` for a terminal). Without that half, deleting a terminal's marker makes the panel
   vanish while its login shell goes on running with nobody reading it, and the orphans accumulate
   one per deleted panel.
6. **Every relay from a child process to the page is bounded, and says what it drops.** A producer
   faster than the page consumes grows whatever sits between them until the app is killed, and a
   per-chunk event per write wedges the webview before that. So: a buffer has a high-water mark with
   its overflow policy written beside it — for a terminal, the **oldest** bytes go, because a
   scrollback is capped and a frozen grid reads as a bug — and a line reader has a length cap. A
   producer that is not rate-limited at its source is coalesced on time before it reaches the page,
   as invariant 2 of `pty.rs` does with `FLUSH`. The decision and the per-child policies are ADR
   0019 §6.

### 2. The PTY lives in the app's own process, not in a pi extension

The first design put it in an extension, and that was wrong. Output would have worked: a tool's
`execute` gets an `onUpdate` whose calls pi forwards as `tool_execution_update`. **Input cannot work
there at all:**

- a tool's `ctx.ui` is `Pick<…,"select"|"confirm"|"input"|"notify">` — blocking dialogs, nothing
  stream-shaped;
- and pi's rpc protocol has **no verb that reaches a running tool**. The whole list is `prompt,
  steer, follow_up, abort, bash, abort_bash, get_*, set_*, compact, clone, fork, new_session,
  switch_session, export_html, extension_ui_response` — and the last only answers a request pi itself
  opened.

So `src-tauri/src/pty.rs` owns one real PTY per terminal (`portable-pty`), the commands
`pty_open` / `pty_write` / `pty_resize` / `pty_close` carry input in, and `pty-data` / `pty-exit`
events carry output out. `src/bridge.ts` stays the only plumbing between the page and Rust.

**A terminal answers only the session that opened it.** `open` establishes the ownership; every other
verb is refused unless the terminal's session is the caller's `sid`, and an unknown terminal gets the
same refusal as someone else's, because which it was is not a caller's business. Both ids arrive as
free text and a well-formed pair says nothing about belonging together: checking only their *shape*
lets `{ sid: mine, termId: theirs }` type into another session's login shell, and a keystroke needs
no reply to read.

**pi's own `bash` output still arrives via `tool_execution_update`** and renders in the same view.
It stays uncoloured, because pi spawns bash with `stdio: "pipe"` and `BashToolOptions.spawnHook` is
unreachable from outside — `agent-session.js` builds the tool with `{ commandPrefix, shellPath }`
only. Do not patch `node_modules`, and do not intercept the agent's tool calls to reroute them:
that changes what the agent executes.

### Not a new marker

A terminal renders through the existing `pi:view NAME #ID` grammar. `viewPayload` already returns
`null` for an unclosed fence and leaves the segment as visible, editable text, which is exactly what
a mid-stream view needs. So: no grammar change, no `format.test.ts` row for the format itself, and a
document holding a terminal still opens clean in any markdown editor (ADR 0001). `pi-extension/view.ts`
and `cell.ts` are the precedent — *the tool call's transcript entry IS the artifact.*

## Consequences

- **A reload brings no terminal back, and that is settled** (what it draws instead is ADR 0046: a
  line saying a terminal ran here). Rule 3 says scrollback is not document
  content, and a dead PTY's bytes are not resurrectable anyway. The question of whether a
  user-opened terminal should serialize into the document and come back on reload was put to the
  user and **answered: it should not.** A terminal is a place you worked, not a thing the document
  records — so do not add a persisted `pi:view terminal #id` for one later.
- **`pnpm verify` is unchanged, and a second command exists.** `pnpm test:e2e` is the browser layer
  (`docs/TEST_ARCHITECTURE.md` L2.5) and is a separate gate, `make e2e` (ADR 0022): a browser
  download does not belong in the gate every change runs.
- **xterm.js cannot be tested under jsdom.** It calls `matchMedia` while opening and attaches a
  change listener; jsdom implements none, so importing the view there crashes the test process.
  Stubbing it on the window, the global and `document.defaultView` did not help. The unit suite
  therefore asserts the wiring against a stub live view, and every claim about the grid lives in
  `e2e/terminal.spec.ts`. That is the right split regardless: a grid is geometry.

## Lessons

- **Look for the event nobody reads before building a transport.** The highest-value part of this
  work was three cases in one `switch`: pi had been streaming tool output all along. The instinct to
  design a channel first would have cost days and added a second stream to reconnect.
- **An `onUpdate` is not a channel.** It was tempting to read "a tool can stream" as "a tool can
  converse". Output and input are separate capabilities, and pi grants exactly one of them. Check the
  *inbound* half of a protocol before designing against it.
- **A capability's own teardown is not its producer's.** `dispose` was documented as releasing "the
  producer" and released nothing of the kind, because the seam that would have reached one does not
  exist — a view deliberately knows no transport. A release path that spans a process boundary needs
  a consumer on the far side proved in the same change, or it is a producer with no consumer wearing
  a teardown's name.
- **Validating an id's shape is not validating the caller's claim to it.** Both terminal ids were
  checked against `/^[\w-]+$/` and neither against each other, which reads as validation and is
  not. When an id keys a real process, ask who owns it.
- **A test that passes against the sabotage is worth less than no test.** Three guards here were
  vacuous when first written — one of them passed while the document was being silently wiped.
  Mutation-testing each one took minutes and changed what three of them assert.
- **"Cannot be made to fail" is a result; record it.** The spec for rule 5 could not be made to
  unmount reliably in a browser, so the claim is guarded at the unit layer and the e2e spec says in
  its own comment that it does not prove it. An honest limit beats a test that looks stronger than it
  is.
- **The browser layer paid for itself twice on the first feature through it.** Auto-follow never
  worked (the scroll decision was taken *after* the content was written, when the panel was by
  definition no longer at the bottom) and `openStreamingView` replaced the whole document — 7619
  characters became 40. Both are invisible under jsdom, where every rect is zeros.
