# TEST_ARCHITECTURE.md — the suite, the ladder, and the vacuous gates

The test architecture in force. Every fix is reproducible as a test that drives the real seams
(pure document core, a real editor under jsdom, the real page in a real engine, the real app), survives
refactors, and
stays in the suite as a regression net. The decision record is `docs/adr/0006-pure-core-real-dom-tests.md`.

For a frozen prototype (ADR 0010) the suite is not a quality nicety — **it is what makes "repairs
only" safe rather than merely stated.**

---

## 1. Origins (short version)

`tests/integration/editor.test.ts` states the diagnosis in its own first lines:

> Every bug this file guards against was once a bug report, because until now **nothing below
> `parseDocument` was testable without a browser.**

The bugs lived in the interaction between document positions and rendered lines — a layer a unit test
of `parseDocument` cannot see, and a layer a mocked CodeMirror cannot have, because the mock's model
of decoration is the thing under test. §2 is the architecture that closed the gap.

---

## 2. Architecture

```
                          what it drives                            what it costs
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │ L1  pure core        src/document/*  — ordinary functions       nothing          │
  │                      over strings. No DOM, no fetch, no RPC.                     │
  ├──────────────────────────────────────────────────────────────────────────────────┤
  │ L2  jsdom mount      the REAL <document-chat>: real CodeMirror   ~20 ms settle    │
  │                      constructing, dispatching, decorating,      per interaction │
  │                      rendering .cm-line elements                                 │
  ├──────────────────────────────────────────────────────────────────────────────────┤
  │ L2.5 browser         the REAL page in WebKit and Chromium        a browser        │
  │     (e2e/, Playwright) — layout, focus, engine quirks, and       download, ~20 s  │
  │     anything a terminal grid does. `pnpm test:e2e`, NOT part     per suite        │
  │     of `pnpm verify`.                                                             │
  └──────────────────────────────────────────────────────────────────────────────────┘
```

Above these sit the app's own layers — `cargo test` for Rust, the app's page under Playwright with
pi scripted on its real protocol, and the real app under WebDriver with a real pi — in §6.

**Runner:** `node:test` + `node:assert/strict` for every node tier. No `vitest`/`jest`, no
`testing-library`, no `sinon`: the jsdom harness *is* the browser substitute, and a second framework
would add a second model of the DOM to disagree with.

Two drivers run **real** browsers instead of modelling one, each confined to its directory:
`@playwright/test` in `e2e/`, WDIO in `e2e-app/`. WDIO hosts specs only in Mocha, Jasmine or
Cucumber, so `e2e-app/` is Mocha — and Mocha nowhere else.

**No mocks — only real things, narrowed.** The distinction that matters: a *mock* returns what the
test tells it to; the stand-ins here behave like the real thing and are merely isolated. The app's
page specs drive pi's real event protocol (`e2e/helpers/scripted-pi.ts`), Rust's tests run a real
child process as pi (`src-tauri/tests/fixtures/fake-pi`), and `pnpm test:app` runs the real pi.

### 2.1 The jsdom mount (`tests/helpers/editor.ts`)

```js
const { el, view } = await mount(md);   // real <document-chat>, real EditorView
await settle();                          // microtasks + rAF + CodeMirror's measure pass
unmount(el);
```

Each piece of the boot is load-bearing, and each was a failure before it was a line:

- **`Window` must be jsdom's** — CodeMirror's measure pass reads it off the global and throws without
  it.
- **`Event` / `CustomEvent` / `EventTarget` / `DOMParser` / `Blob` / `File` / `FormData` must be
  jsdom's too.** Node defines its own, so the bulk global copy skips them — and **an event from the
  wrong realm is rejected by jsdom's `dispatchEvent`**: a silent no-op that reads as "the component
  ignored my event". They are assigned explicitly after the loop.
- **jsdom has no layout**, so `Range.getClientRects` and `getBoundingClientRect` are stubbed to zeros.
  That is fine, and it is also the boundary: **nothing in the suite asserts on pixels.**
- **The element is booted once per process** (`booted`), because installing jsdom globals twice is not
  idempotent.

---

## 3. The bug-repro playbook (binding)

**A fix ships with the failing-first test that reproduces it.** Climb the ladder only as far as you
must:

1. **L1 — pure core.** Can the bug be stated about strings and positions? Then it belongs in
   `format.test.ts` / `run-at.test.ts` / `reply-slot.test.ts` / `cells.test.ts`. Most positional
   bugs are here, and this is the layer that costs nothing to run.
2. **L2 — jsdom mount.** Does it involve what is *rendered*, where the caret lands, a decoration, a
   fold, streaming attribution? `editor.test.ts`, `cell-edit.test.ts`, `block-backspace.test.ts`,
   `delete-range.test.ts`, `moveblock.test.ts`.
2.5. **L2.5 — browser (`e2e/`).** Does the claim involve PIXELS, focus the engine owns, or a library
   that cannot run under jsdom? Then jsdom cannot see it: every rect there is stubbed to zeros.
   `e2e/canvas.spec.ts`, `e2e/terminal.spec.ts`. xterm.js is the worked example — it calls
   `matchMedia` while opening and crashes the jsdom process, so the unit suite asserts the wiring
   against a stub live view and every claim about the grid lives here.
3. **The app's layers (§6).** Does it involve Rust — a path guard, a PTY, a window, the store? Then
   `cargo test`, beside the module. Does it involve what the page does with pi's events — a send, a
   rebuild, a sign-in, a model pick? Then the app's page under Playwright (`e2e/app-page.spec.ts`,
   `e2e/flows.spec.ts`), pi scripted on its real protocol. The real IPC boundary, a real PTY, a quit,
   a Finder launch: the real app under WebDriver (`e2e-app/`).

**Extend the layer you are at before climbing.** A test that reaches for the app's layers because L1's helper could
not express the setup is a missing helper, not a missing integration test.

**Manual observation is for finding the bug; the test is what verifies the fix.** A fix verified by
driving the browser by hand is a fix that will be re-broken.

### 3.1 Before the ladder: characterization, for code about to move

The ladder assumes the behaviour is already pinned and one piece of it is wrong. Code that is about
to be moved or rewritten often fails that assumption. Feathers's definition is the useful one here:
**legacy code is code that lacks sufficient tests to modify with confidence, whoever wrote it and
whenever.** Before changing such code, write **characterization tests** — tests that capture what it
does *now*, bugs included — and only then change it.

ADR 0009's gate (an extraction passes "without a single test being edited") is a *verification*
rule: it presumes the behaviour is already asserted. Characterization is the *acquisition* step
before it. Without it the gate is vacuous in the way §4 catalogs — green because nothing was looking.
The canvas's event protocol was the worked case: 8 of `<document-chat>`'s 14 outbound events, `doc-send`
among them, had no test at all, and a rewrite cannot prove it preserved a protocol nobody asserted.

**The inversion, stated because it cuts against this file's own standing rule.** §4 ends with *a new
regression test is not finished until it has been shown to fail*: revert the fix, watch it go red.
That pins behaviour **already judged correct**. A characterization test pins behaviour **not yet
understood**, so its procedure runs the other way: **write the assertion wrong on purpose, run it,
and correct it from the failure message** — the message is how you learn what the code does. Repeat
until it passes, and the passing test is a record of current behaviour, not a claim that the
behaviour is right. Both rules are correct, for different jobs; do not apply one where the other is
meant. A characterized behaviour that turns out to be a bug is then fixed by the ladder above, with
its own failing-first test.

Where it applies today:

- **`DocumentChat`'s public surface.** The surface must keep working while everything behind it
  moves, with `editor.test.ts` as the proof. That promise is only
  as good as what is pinned: a member or event with no test is unknown behaviour, and it is
  characterized before the phase that re-plumbs it, not after.

---

## 4. Vacuous-gate catalog

Gates that pass while testing nothing. Each of these has bitten this repo or is one line away from
doing so.

- **Testing the previous build.** The suite imports `../dist/**`. `pnpm test` without a preceding
  `pnpm build` will happily "reproduce" a bug you already fixed, or pass on a fix you have not built.
  **`pnpm verify` exists so this cannot be skipped** — it is the most common wasted debugging session
  in this repo.
- **Absolute newline counts.** A rendered-line assertion expressed as an absolute offset passes until
  someone tunes whitespace, then fails for an unrelated reason and gets "fixed" by updating the
  number. **Express geometry relative to its marker** (`editor.test.ts` header).
- **Asserting on pixels under jsdom.** `getBoundingClientRect` is stubbed to zeros, so a geometry
  assertion against it compares `0` to `0`. It will pass forever. **This is what L2.5 is for.**
- **A browser spec that reads xterm's DOM.** WebKit draws text spans; Chromium draws into a canvas
  and leaves the row divs empty. A spec over `.xterm-rows span` therefore asserts which renderer was
  picked. Assert through `terminal.buffer` — the emulator's own answer, identical in both engines.
- **A browser spec that asserts a widget left the viewport.** CodeMirror's drawn viewport has a
  generous margin and depends on estimated line heights, so `toHaveCount(0)` after a scroll is not
  reliably reachable. The first version of `e2e/terminal.spec.ts` passed that assertion *while the
  document was being silently wiped* — it had nothing left to scroll past. Assert what survives a
  scroll round-trip; guard the dispose-on-viewport-exit rule at L2 instead.
- **Reading an async library's state synchronously.** `xterm.write` parses on its own queue, so the
  buffer is still empty on the next line and a spec reads a blank screen. Flush first
  (`terminal.write("", cb)`). The failure looks exactly like a broken terminal.
- **A test that skips for a missing dependency.** A skip is a green run that covered nothing, so no
  node tier may skip (`scripts/node-tests.ts` fails the run), and the one `pnpm test:app` spec that
  can be turned off (`PI_E2E_DISABLED`) says so loudly.
- **A guard nobody tried to break.** Three guards written during ADR 0013's work were vacuous as
  first written, one of them passing against the exact bug it named. **Sabotage the line the test
  claims to protect and watch it go red** — it takes a minute and it is the only thing that
  distinguishes a guard from a comment.
- **An assertion over a `Result` that admits both arms.** `assert!(outcome.is_err() ||
  outcome.is_ok())` is true of every `Result` there is — and it sat in the test named for the pi
  request timeout, which also never reached the timeout: it ended the session after 300 ms, and the
  30-second `REQUEST_TIMEOUT` was a `const` with no way to shorten it. Assert the arm you mean and the
  state it leaves (the waiter released, the pending entry gone), and make the bound injectable so the
  branch the test is named for can run — `Sessions.request_timeout` is that seam.
- **A foreign-realm event.** `dispatchEvent` with Node's `CustomEvent` instead of jsdom's is rejected
  silently — the handler never runs and the "nothing happened" assertion passes.
- **Asserting before `settle()`.** CodeMirror's measure pass and the rAF callbacks have not run, so
  the DOM is asserted mid-update. The failure is a flake, which is the worst kind of pass.
- **A stubbed model list standing in for a credential policy.** Filtering a list proves the filter.
  Only spawning a process **with the env stripped** proves the strip (ADR 0011).
- **An empty `catch {}` under test.** The test passes because the error was swallowed, not because the
  path worked. Every `catch {}` in source carries a comment saying what is ignored and why; a test
  that relies on one is asserting the silence.
- **A test that supplies the consumer the product lacks.** The app's probe asserted "an external edit
  reaches the page" by subscribing to the watcher's `doc-changed` itself — and passed, because the
  probe *was* the subscriber. The product had none: a producer with no consumer, under a green check
  named for the consumer, and a checklist step that said "the page notices" on its strength. The
  general form: **when a gate drives a seam through wiring only the test installs, it proves the seam
  and says nothing about the product.** Name such a check for what it proves — the probe's says "the
  watcher's report reaches the page" — and assert the product's behaviour through the product's own
  wiring — the outside-edit rows of `e2e/flows.spec.ts` raise the event and read what the page did.
  The tell is a grep: the test's subscription is the only call site.
- **An event test that asserts emission.** `tests/integration/events.test.ts` proves the canvas dispatches each
  event with the right `detail`, and stays green when no host listens — the app page bound 3 of the
  canvas's 20 events, so its gutter `+`, cell drag and every menu were dead under a passing suite.
  Emission proves nothing about consumption. The other half is `tests/contract/canvas-events.test.ts` (every
  dispatched event is catalogued) plus the app's `HostTable` type (every catalogued event has a
  disposition), and a port is proven by a page-layer spec that performs the gesture.

### Shapes found by writing the fixes

Seven more, each one a test that looked finished and asserted nothing. They are listed with what the
assertion *should* be. Six share one failure mode — the test and the code happen to agree on the one
input the test uses — and the last is the harder kind, where they agree only on the machine it was
written on.

- **An assertion on a removal the harness performs anyway.** `assert.equal(view.dom.isConnected, false)`
  after unmounting an element passes with **zero** teardown — removing the host disconnects its whole
  subtree. What distinguishes a real `view.destroy()` is that the view detaches its DOM from its
  parent, where `remove()` on the host leaves the two joined: assert `view.dom.parentNode === null`.
- **An assertion that a destroyed object rejects use.** CodeMirror's `destroy()` neither throws on a
  later `dispatch` nor nulls `docView` — it **still applies the transaction**. Any "it throws
  afterwards" assertion against a library is a guess about that library; check what its teardown
  actually changes before asserting on it.
- **A fixture built where the old and new implementations agree.** `clearTail`'s hand-rolled offset
  (`tailAnchor + marker.length + 2`) and the parse-derived one differ by one character — so a draft
  typed at `doc.length` is past both and the test passes either way. Build the fixture at the
  boundary the change is *about*.
- **A fixture whose state is empty, where the code short-circuits on empty.** `#persistViewState`
  returns before its dedupe memo when the snapshot has no views and no store, so a `cell-state-save`
  test with empty state exercises nothing. Likewise `compactRedefinitions` returns `false` with
  no redefined cells, so a "it refuses mid-turn" test over a plain page survives **deleting the
  guard**.
- **`assert.ok(x <= 1)` over a collection that can be empty.** `editor.test.ts`'s ⋯ test looped over
  matched heads and asserted "no more than one pair of dots" — green on an empty match **and** green
  on zero dots, so deleting the ⋯ feature outright left it passing. Assert the collection is the size
  you expect, then assert `=== 1`.
- **A negative with no control.** Four "no `cell-failure` fired" tests stayed green when the dispatch
  was deleted; only the three positives beside them noticed. A negative proves the gate held only if
  the same listener, in the same mounted page, can be shown to fire for an input that *must* report —
  otherwise it proves the harness went deaf. `assertNoReportButWired` in `editor.test.ts` is that
  pairing; after it, eight tests notice the deletion instead of three.

- **A fixture that is only valid on the platform you ran it on.** `events.test.ts` delivered its
  chords with a hardcoded `metaKey`, which is what `Mod-` means on macOS — so the two tests reaching
  the dispatch only through CodeMirror's keymap asserted the binding locally and matched **nothing**
  on Linux CI, where `Mod-` is `ctrlKey`. CodeMirror decides which once, at module load, from
  `navigator.platform`; under the jsdom harness that is **Node's own** global `navigator`, because
  jsdom's globals are installed after that import and jsdom reports `platform: ""` either way. The
  tell is a suite that is green on a developer's machine and red in CI, so it cannot be found by
  running it. Derive the modifier the way the code under test does, and when a fixture depends on a
  platform, re-run it under the other one — overriding the global `navigator` before the import is
  enough to reproduce CI's resolution locally.

> **The standing rule, and the cheapest one in this file: a new regression test is not finished until
> it has been shown to fail.** Revert the fix, run the test, watch it go red, restore. Revert on a
> **copy** — `git checkout <file>` takes the rest of the working tree with it, which cost a
> reapplication of five edits once. Four of five tests written in that task passed before
> their fix existed; every one was caught by this check and by nothing else.

---

## 5. Conventions

- **A test file opens with why the thing under test exists and what must hold.** See `editor.test.ts`
  and `e2e/flows.spec.ts`. This is the single highest-value habit in the suite: it is what lets a later
  reader tell a real regression from a changed intention.
- **Helpers live in `tests/helpers/`.** `editor.ts` (mount/settle/unmount), `pairing.ts` (the provider's own rule: every `tool_result` matches a `tool_use` in the message
  before it, and every `tool_use` is answered).
- **A measurement is not a test, and says so in its first line.** `tests/helpers/bench-index.ts`:
  *"Not a test — a measurement, kept next to the change it justifies."* It is kept because it
  justifies a change, and it is in `helpers/` because the runner must not collect it.
- **Isolate `HOME` and any storage root.** `mkdtempSync` per test. A test that reads the developer's
  real `~/.pi` passes on their machine and nowhere else.
- **Never hardcode a port.** The harness server and Vite take one the OS picks; a fixed port makes two
  checkouts fight.
- **A contract test reads both sides of a seam and fails naming the drifted item.** The
  `tests/contract/` tier is source-text checks on purpose — canvas events ↔ the host table, menu
  ids ↔ `menu.rs`, keymap ↔ its wiring, the page's IPC calls ↔ the Rust signatures. A message that
  says "mismatch" sends the reader to diff two files by hand; one that names the command, the key or
  the event is the fix.
- **A negative has a barrier, never a guess.** "Nothing happened" is asserted after something proves
  the page had its chance: a positive control in the same test (a second page that does the thing,
  or the same gesture done the allowed way), or `afterFrames(page)` from `e2e/helpers/frames.ts` —
  two animation frames, by which every synchronous handler, every untimed promise chain and the
  render it scheduled have run. A wait FOR something polls it (`expect.poll`, `waitUntil`). What is
  left is time with no event — a debounce a save must not beat, a window Rust must not open — and
  each is a named const saying what it covers. `pnpm lint` counts fixed waits in every spec and the
  count only goes down.
- **A page error fails its test.** Every app Playwright spec imports `test` from
  `e2e/helpers/console-guard.ts`: a `console.error` or uncaught error the test did not declare with
  `allowConsoleError(page, /…/)` fails it, and so does a required allowance that never matched.
  `CONSOLE_SURVEY=1` reports instead, for finding what a run emits.
- **A skip fails the run.** `scripts/node-tests.ts` runs the node tiers and prints the skipped count;
  any skip fails. A committed
  `.only` fails `pnpm lint`, in every tier and both browser layers.

---

## 6. The native app's four layers

The Tauri app (ADR 0014) is tested in four layers, and the point of naming all four is that **each
covers what the one below cannot** — a test one layer too high is slow, and one
layer too low cannot see the bug.

| Layer | Runner | Answers | Cannot answer |
|---|---|---|---|
| 1. Pure core | `node:test` | the grammar, caret resolution, cells, modes, **which command a key means** | anything needing layout or a process |
| 2. Rust | `cargo test` | path guards, PTY ownership, window geometry, the capture helper's lifetime | anything needing a webview |
| 3. The page | Playwright, headless | real CodeMirror geometry, focus, **real key events**, the canvas | the real IPC boundary, the real shell |
| 4. The real app | WDIO, a real window | IPC end to end, a real PTY, the sidecar, the overlay primitives, **what a quit ends, a real outside write, a Finder launch's log** | **keys, text entry, chords** |
| (in-app) The probe | `app/probe.ts`, `?probe=1` | the app's own self-test, run in the real window and reporting through `report`: the store and its watcher, a real PTY, the capture helper, the overlay primitives and a real pi, asked from inside the webview | anything it was not written to ask — it is a test, so it is not itself tested |

**The seam between layers 2 and 3 is a contract test, not a layer.** Rust's
half of a command is answered beside its module, the page's use of it in the
app's Playwright project. What neither sees — a command the page calls that Rust
no longer registers, an argument key the signature does not take, a fake still
answering a name that is gone — is `tests/contract/ipc.test.ts`, which reads
`commands.rs`, `main.rs`'s `generate_handler!`, `build.rs`, the capabilities and
`src/bridge.ts` and compares them. Both browser fakes answer only the list in
`e2e/helpers/ipc-surface.ts` and refuse anything else, as the runtime does, and
the contract test holds that list to what Rust registers: a fake that answered
any name would leave a renamed command green in every app spec.

**What only the real app can answer**, and so the only reasons a test belongs
at layer 4:

- windows and displays — geometry on a real screen, `remember_window`,
  `window_geometry`, one window per document;
- the capture sidecar's lifetime — spawn, stop, a wedged stop;
- quit and signals — the SIGTERM flush, no child surviving;
- a Finder launch — no tty, the log file;
- the overlay probe restoring the window (§7);
- custom-scheme serving of attachments (`piary-file://`; a mock runtime cannot
  dispatch schemes, tauri#16200);
- a real `pi --mode rpc` turn end to end.

Everything else about a command is answered by `cargo test` (what it does), the
contract test (the seam) and Playwright (the page's use of it), each cheaper.

**`app/*` is covered where each half is cheapest.** A module's pure decision is
pulled out and unit-tested (`tests/unit/app-pure.test.ts`: whether a history must
be rebuilt, an attachment's url, a minted id; `cell-reports.test.ts`); its DOM
wiring is the app's Playwright project, which drives every module from the page
the app ships. A module with no test of its own names where its behaviour is
tested only when that is not obvious from the spec titles. No module→test table
is kept here: it would drift the first time either side moved.

**Why layer 4 must never assert a keystroke.** WebDriver's keyboard injection on
macOS cannot deliver text or `Mod-Shift-<letter>` reliably (ADR 0014). A spec up
there that typed would pass or fail on the driver rather than on the app. So
**which command a chord means is a pure question** answered as data in
`tests/unit/keymap.test.ts`, the editor is held to that table by
`tests/contract/keymap-wiring.test.ts`, and **real key events are layer 3's job**, where a
real engine delivers them.

**Why layer 4 must never assert a refusal's message.** A `#[tauri::command]`
returning `Err` reaches the driver as a protocol-level `WebDriverError` *before*
any page handler sees it — the rejection cannot be caught in the page and read
back. So the refusal assertions that matter (ADR 0013: an unknown terminal is
refused *identically* to someone else's) live in `src-tauri/src/pty.rs`, where
the two errors are compared directly. Discovered the hard way: a spec written to
assert them failed at the call rather than measuring it.

**Layer 4 cannot be display-less, but it is invisible.** WebKit
suspends rendering, timers and `requestAnimationFrame` for a window that is
ordered out, so a real window opens on a real WindowServer session. No human
ritual is needed — a logged-in Mac and a stock macOS CI runner both satisfy it —
but **it will not run over SSH to a locked machine**, and that consequence is
unchanged by anything below.

**The window is visible, but a driven run never takes the user's focus.** The
developer is using the machine while `pnpm test:app` runs. When the harness
drives the app (the same gate that arms the WebDriver server, `main.rs`), the
app's activation policy is `Prohibited`, set before the event loop runs. The
weaker settings were tried and do not hold: macOS hands activation at launch to
a child of the active app, and the active app is usually the terminal running
the tests, so `activate_ignoring_other_apps(false)` still activated and
`Accessory` still took focus. `Prohibited` still opens real, ordered-in windows
that render and answer WebDriver. The Finder-launch spec also opens its bundle
with `open -g`.

`e2e-app/helpers/focus-hooks.ts` holds it: mocha root hooks around
`focus.ts`, which samples the frontmost app through a spec file and fails the
file if a binary under test was ever frontmost. They are root hooks because
WDIO logs an error thrown from its own config hooks and still passes the run. So
**layer 4 does not observe focus**: a spec asserts that a window is shown, never
that it is key. Which window a menu click reaches is covered by `menu.rs`'s unit
tests.

**And a driven window is transparent.** It is kept ordered *in*, so WebKit
renders it, but at zero alpha and click-through, so nothing shows on the
developer's screen (`out_of_sight` in `main.rs`, applied on every page load).
`PIARY_E2E_SHOW=1` leaves windows visible, for watching a spec while debugging
it. **This is a known hack, not the platform's way**, and it is chosen on
purpose. [zhom/tauri-wd](https://github.com/zhom/tauri-wd)'s `headless: true`
uses the same trick. macOS has no headless WKWebView and no public virtual
display (Linux's Xvfb), so every clean option costs more than this one:

| Option | Why not |
|---|---|
| A macOS VM (Tart, UTM) | the idiomatic isolation, but a 25–50 GB image, about a day of setup, and a graphical session to launch into |
| A second display (a dummy HDMI plug, a virtual-display app) | hardware or a third-party tool, plus placing every window on that display |
| Hidden, minimized, another Space, off screen, another user's switched-out session | WebKit treats the window as not visible and suspends it (the last is untested, but follows from the same rule) |
| `tauri-wd` itself | a 0.2.x crate replacing the embedded `tauri-plugin-wdio-webdriver`, which already works behind a triple gate (§ below) |

The cost of the hack is what it changes: test windows are not the user's
windows, and `setAlphaValue:` is one unsafe Objective-C call through the
system's `libobjc`, since Tauri has no API for it. Layer 4 asserts no pixels,
so the transparency hides nothing it checks. The overlay spec turns
click-through off as part of its probe, so the window it leaves behind is
transparent but takes clicks until it closes.

Three things not to re-derive:

- **`tauri-driver` does not support macOS and will not.** The Tauri v2 docs:
  *"only Windows and Linux are supported on desktop, as macOS has no WKWebView
  driver tool available."* [tauri#7068](https://github.com/tauri-apps/tauri/issues/7068)
  is open, and a maintainer has called it a blocker needing Apple's involvement.
  The embedded provider is the only macOS-viable route, which is why we are on it.
- **The old private occlusion switch is now fatal.**
  `_setWindowOcclusionDetectionEnabled:NO` was the historical workaround and
  **aborts the process on macOS 26.** Do not reach for it.
- **The WDIO packages stay on the major that `@wdio/tauri-service` names as
  its `webdriverio` peer.** A newer runner does not fail: the service's
  `before()` throws partway (`addTauriApi` … `reading 'bind'` — it binds
  `browser.executeAsync`, which a newer `webdriverio` removed), logs an error,
  and every spec still passes against a half-set-up session, with no window
  wait and no console forwarding. `webdriverio` is a direct devDependency so
  the peers resolve to that major too. Bump the runner when the service's peer
  moves, not before.

And the keyboard rule above is independently confirmed: `tauri-wd` delivers keys
as untrusted synthetic events through `webview.eval`, and a migration that tried
it reports *"CodeMirror took no typed text"*
([dxos#13621](https://github.com/dxos/dxos/pull/13621)). Piary's canvas **is**
CodeMirror, so no typing at layer 4 stands however the window is managed.

**`commands.rs` has no unit tests, and that is the design working.** It is the
whole `#[tauri::command]` surface and it is *only* wiring: every command unwraps
its arguments, calls a module that imports no `tauri::`, and returns the result.
There is no argument validation to test — arguments are `String`, `u16`,
`Vec<String>`, `serde_json::Value`, and a malformed shape is rejected by serde
before any body runs, which is the framework's behaviour and not ours. The logic
each command reaches is tested beside the module that owns it: `pi_cli::resolve`
takes an injected `exists`, `Verdict`/`format_report` are tested in `wire.rs`, and
`docs`, `pty`, `session` and `windows` each carry their own suite.

`tauri::test::MockRuntime` was considered for it and **refused**: it has no
webview and cannot dispatch to custom URI schemes
([tauri#16200](https://github.com/tauri-apps/tauri/issues/16200)), no monitors,
and an `app.exit` that does not exit — so the four commands that need an
`AppHandle` for a real OS fact (`window_geometry`, `remember_window`,
`overlay_support`, `report`) would assert that the mock returned the mock's
answer, and the other twenty would assert that delegation delegates. That is a
test which cannot fail, and the cost is real: a `test` feature on the crate and
a second runtime model to keep in step. `overlay_support`'s one genuine
invariant — it is a probe, so it must put the window back — is a real-window
question, and it is in §7's checklist where a real window answers it.

**`main.rs` and `teardown.rs` have no unit tests for the same reason.** They are the
other Tauri-aware surface (`verify-hygiene.ts`'s `TAURI_AWARE_RUST`): `main.rs`
assembles the builder, `teardown.rs` is the exit sequence's contact with the event
loop, and every decision either acts on is made in a module `cargo test` drives —
`exit.rs` for the sequence, `harness.rs` for whether a harness drives the run (the
`PIARY_E2E` gate, with its negatives: unset, any value but `1`, and a build without
the feature are never driven). Their behaviour as wiring is `quit.spec.ts` and every
WDIO spec, which run only because the gate opened.

**A spec that ends or relaunches the app starts its own.** The WDIO service holds one instance open
for `shell.spec.ts`; a quit would end the process its session drives, an outside edit needs a
document directory the test writes behind the app's back, the list's order needs one whose files' times
the test set, and a Finder launch has a different parent altogether. So `e2e-app/quit.spec.ts`,
`outside-edit.spec.ts`, `list-order.spec.ts` and `finder-log.spec.ts` launch the
same binary themselves (`e2e-app/helpers/instance.ts`) on a free WebDriver port
(`TAURI_WEBDRIVER_PORT`) with a scratch `PI_DOC_DIR`, speak the W3C protocol to it directly, and end
every process they recorded below it, pass or fail — by pid, never by name, because a developer's own
`pnpm app` runs from the same binary path. The stand-in for pi is `src-tauri/tests/fixtures/fake-pi`
through `PI_CLI`, a real process on the real wire; no layer-4 spec but the one in `shell.spec.ts`
reaches a model. The quit is a SIGTERM to the app, which enters the sequence the Quit item does
(`teardown.rs`); **⌘Q's menu binding is not asserted** — that is a keystroke and a native menu,
both §7's.

**The binary embeds the page.** `pnpm app:e2e:build` builds with `tauri/custom-protocol`, so the
app serves `app/dist` itself, as a bundle does. Without it a `cargo build` is a dev build that loads
`devUrl` — the spec would pass or fail on whether a Vite happened to be up on :5190, and test whatever
it served rather than what `app:build` produced. `pnpm app` builds the same `target/debug/piary`
without the feature, so after a `tauri dev` session run `app:e2e:build` again before `test:app`.

**A system panel is answered from the environment.** WebDriver cannot drive the open panel an
import asks for a file in, or the one an export asks for a folder in. In a debug build with the
`e2e` feature, and no other, the panel is skipped (`pick` in `commands.rs`): `PIARY_E2E_PICK` is
what an import opens and `PIARY_E2E_EXPORT_DIR` the folder an export goes into, so a spec exports
into a folder and imports a file out of it (`e2e-app/transfer.spec.ts`). The panel itself is §7's.

**A newer version is an answer handed over, never GitHub's.** The app asks GitHub whether a
newer release exists (ADR 0064). No suite may: it would make a request per launch from whoever
runs it, and would pass or fail by what is released that day. The page asks Rust for the turn
and where to ask (`update_claim`), and Rust answers "GitHub" only to a run no harness drives
(`harness::update_source`). A driven debug build gets the text in the file `PIARY_UPDATE_SCRIPT`
names, read as GitHub's answer would be, or no turn at all (`e2e-app/update.spec.ts`). The page
specs answer the command themselves and route the one address the page fetches, so the request,
a refusal and no network are each driven there (`e2e/app-page.spec.ts`); the scripted host of
the flows gives no turn.

**A face is a script, never a camera.** No automated layer may read a real face: a run that
needed one would need a person, and would light the user's camera while they work. The page asks
Rust what reads the face (`face_source`), and Rust answers "the camera" only to a run no harness
drives (`harness::face_source`). A driven debug build gets the script in the file
`PIARY_FACE_SCRIPT` names, or nothing (`e2e-app/face.spec.ts`); the page specs answer the
command from the scripted host (`faceScript` in `e2e/helpers/scripted-pi.ts`), which is where
what a sent message carries is held (`e2e/flows.spec.ts`). A script is JSON in one of two
shapes (`app/face/scripted.ts`): a list of `{from, to, units}` steps, which says what the face
did outright, or `{samples: [...]}`, what a detector saw frame by frame, which goes through the
same reading as the camera's samples. Its clock starts at the first key of a prompt. An object
may also say what a camera would, which is how every state of the face's pill is reached with no
camera (ADR 0057): `"state"`, where a start ends up in place of watching (`"refused"`,
`"absent"`, `{"failed": "…"}`); `"seen"`, what a script of steps has in view (`"none"`,
`"many"`, `"turned"`; a script of samples is read for it); and `"cameras"`, the labels there are
to choose from. `{"steps": [...]}` is the list of steps as an object, to carry them.

**What a real face does is held by recordings.** `src/document/face-episodes.ts` turns samples
into steps, and its rules are tested twice: on faces made of numbers
(`tests/helpers/face-samples.ts`), one rule at a time, and on samples recorded from a person
making each movement on request. The recorder is a page of its own (`app/face-record.html`),
built only with `PIARY_FACE_RECORD=1` and run as a bundle with its own identifier, opened with
`open` so the camera grant is the bundle's and not a terminal's (ADR 0015). It writes numbers
only. A tuning bug is reproduced from a recording first, and fixed there.

**The embedded WebDriver server is gated three ways** and must never ship: it is
unauthenticated, on a fixed local port, with the app's whole IPC surface behind
it. The `e2e` cargo feature, a debug build, and `PIARY_E2E=1` are all required —
and a release build with the feature on **fails to compile**, which is the gate
that cannot be forgotten at a call site.

## 7. What no layer covers — the manual checklist

Automation stops here, and saying so is the point: claiming coverage that does
not exist is worse than naming the gap. Walk this before a release, and after
any change to the webview, the menu, or the capture seam.

- [ ] **IME composition.** Type Japanese or Chinese into the canvas with a real
      IME: candidates appear, committing inserts once, and backspace during
      composition does not eat the previous character. No layer can drive this —
      WebDriver cannot compose, and jsdom has no IME.
- [ ] **The menu bar's key equivalents.** Each item in Conversation and File
      fires from both the menu *and* its accelerator, and neither double-fires.
      A page cannot click a native menu item.
- [ ] **Permission prompts on a machine that has never run the app.** Screen
      Recording prompts once, names **Piary** and not the helper, and the grant
      survives a relaunch. The responsible-process inheritance (ADR 0015) is
      what makes this work and it is only observable on a first run.
- [ ] **The camera prompt**, same check — and confirm the
      `Info.plist` string reads as something a user would consent to.
- [ ] **Display sleep and wake.** A capture running when the display sleeps, and
      the app after waking: no frozen window, no orphaned helper (`ps` for
      `piary-capture`).
- [ ] **A second display, and unplugging it** while a window is on it. The
      window comes back somewhere reachable (`src-tauri/src/windows.rs` decides
      where; this checks the decision against a real display going away).
- [ ] **The overlay probe leaves the window usable.** Call `overlay_support`
      (the page asks it on boot), then click and drag the window: it takes
      clicks and is not stuck floating. The command deliberately sets
      click-through and always-on-top to find out whether they are honoured,
      and putting them back is the one failure a capability probe must not
      cause — a mock answers `Ok` to all four and proves nothing about it.
- [ ] **The log a release bundle leaves.** `e2e-app/finder-log.spec.ts` opens the e2e binary in a
      bundle through LaunchServices — launchd its parent, no terminal — throws in the page, and finds
      the throw in `~/Library/Logs/ch.divergenz.piary/piary.log`. What it cannot see is a bundle
      `tauri build` made — its signature, its layout, its sidecar in place — and Console.app's own
      listing. Once per release, bundle with `tauri build --debug` (a release has no Web Inspector to
      throw from), open it from Finder, run `setTimeout(() => { throw new Error("probe") })` in
      Inspect Element's console, and find it under Console.app → Log Reports → `ch.divergenz.piary`
      → `piary.log`.
- [ ] **A real editor's save.** `e2e-app/outside-edit.spec.ts` writes the open conversation in
      place and by rename and asserts the window takes it in with the caret where it was, then
      makes the window's text unsaved, writes again, and asserts the window keeps its copy, says so
      on its status line, and its next save replaces the edit on disk. What it cannot do is be an
      editor: with a window open, save its conversation from iA Writer (or another editor with its
      own save strategy) and confirm the text appears in place; then **type**, and confirm the
      keystroke lands where the caret was. The typing is the half no automated layer can deliver
      to the real window (§6).

---

## 8. Running

Every test belongs to one **tier**, and a tier is a directory: what decides
where a test goes is what it needs to run, which is also what it costs.

| Tier | Where | What belongs |
|---|---|---|
| **unit** | `tests/unit/`, and `cargo test` | pure logic: `src/document/*`, pure helpers in `app/` and `src/components`, the pi-extension's shapes. No DOM mount, no process, no sleep |
| **contract** | `tests/contract/` | a seam's two sides held to each other by reading both sources: canvas events ↔ the host table, menu ids ↔ `menu.rs`, keymap ↔ its wiring, the CSS invariants |
| **integration** | `tests/integration/` | the real `<document-chat>` under jsdom (§2.1), the notebook engine |
| **e2e** | `e2e/` (Playwright), `e2e-app/` (WDIO) | a real engine (layer 3), the real app (layer 4, §6) |
| **smoke** | composite | unit + contract + `cargo test` + the Playwright tests tagged `@smoke` |

The lint holds the directories: a `*.test.ts` under `tests/` that is not in
exactly one tier's directory fails `pnpm lint`, because the smoke command finds
its tiers by glob and a stray file would silently sit outside it.

**The tiers are the vocabulary.** The layer numbers that predate them survive in
§2 and §6, where they name what each layer can see, and map onto the tiers once:

| Older name | Tier |
|---|---|
| §2 L1 pure core · §6 layer 1 | unit |
| §6 layer 2, Rust | unit (`cargo test`) |
| §2 L2 jsdom mount | integration |
| §2 L2.5 browser · §6 layer 3, the page | e2e — `e2e/` (Playwright) |
| §6 layer 4, the real app | e2e — `e2e-app/` (WDIO) |

**Regression is not a tier.** Every assertion here began as a bug report
(docs/HANDBOOK.md, Testing Rules); the whole suite is the regression suite, so there is
no `tests/regression/` to put one in.

```sh
pnpm test:smoke    # the development loop: rustfmt, build, unit + contract, cargo test, @smoke specs
pnpm test:all      # the merge gate: verify + test:e2e + verify:rust (`make ci` is the same, from clean)

pnpm verify        # typecheck + lint + build + test — the gate every change runs
pnpm verify:rust   # cargo fmt --check + clippy -D warnings + cargo test + bindings drift
pnpm build         # required before any node tier (the suite imports dist/)
pnpm test          # every node tier
pnpm test:unit     # tests/unit         (also :contract, :integration)
pnpm rust:test     # cargo test alone, after checking its build inputs exist
pnpm test:e2e      # playwright test, then -c playwright.app.config.ts — layer 3
pnpm test:app      # wdio run wdio.conf.ts                  — layer 4, opens a window
pnpm app:e2e:build # the binary layer 4 drives (needs the `e2e` feature)
```

The two Playwright configs are split by server: `playwright.config.ts` runs the
harness in WebKit and Chromium, `playwright.app.config.ts` runs the app's own
page in WebKit against Vite. Each starts only its own server, so the `@smoke`
leg does not pay for the harness build. A `@smoke` test is the highest-signal
path through the product and stays fast; tag one with
`test("…", { tag: "@smoke" }, …)` only for that reason.

Neither `test:e2e` nor `test:app` is part of `pnpm verify`: that gate must stay
fast, must not download a browser, and must not open a window.

**`pnpm test:app` spends one real model call**, in the one spec that drives a
real `pi --mode rpc` end to end — the boundary that is the product, so it is on
by default. Turn it off for a run that must not spend one:

```sh
PI_E2E_DISABLED=1 pnpm test:app    # or =true; anything else leaves it ON
```

It skips **loudly** either way — with the flag, or on a machine with no `pi` on
PATH. A silent skip is a green run that covered nothing (§4), and the default
has to be the covered one: a check nobody runs protects nothing.

A single file, while iterating:

```sh
pnpm build && node --test tests/integration/editor.test.ts
```
