# ADR 0014 — Piary is a native application, on Tauri 2

**Status:** accepted. **Lifts the freeze in
[ADR 0010](0010-frozen-prototype-specification-is-the-code.md)** and amends
[ADR 0012](0012-the-node-half-is-typescript.md): the app's process side is Rust.

## Context

Piary's prototype ran in a browser. The features it is being built toward — screen capture,
system-audio and microphone recording, camera — are ones a browser will not give a page, and the
ones it nominally does give arrive behind permission flows designed for a website rather than an
application. The browser was the limit, so the shell had to change.

This is also the moment ADR 0010 was waiting for. That ADR froze the prototype and said the
reimplementation was **gated, not scheduled**: it would not start until there was a reason. The
native capabilities are the reason, and rebuilding the shell cannot be done without touching the
view layer, so the rebuild starts here rather than being deferred a second time.

Four lanes were considered.

**Bundled Chromium — Electron.** One pinned engine, Node in the main process, and the strongest
testing story available: Playwright's `_electron.launch()` drives the real packaged app, truly
headless, with the real IPC and the real keyboard. `node-pty` keeps working. It cannot target
mobile, and it costs ~150MB against Tauri's ~12MB.

**System webview — Tauri 2, Electrobun, Wails, Neutralino.** The OS supplies the engine, so bundles
are small and the app inherits whatever WebKit the machine has. Tauri is the largest ecosystem in
this lane and the only one with real mobile targets. Electrobun has no `node-pty` equivalent (a PTY there is
hand-written C trampolines reached through `bun:ffi`) and no headless path for its native seams,
because WKWebView's console reaches no parent process. Wails is Go and was still in beta. Neutralino is too
thin for an app with PTYs and capture.

**No DOM — Flutter, Compose Multiplatform, React Native.** Disqualified on structure, not quality.
Piary's canvas *is* a DOM editor: CodeMirror 6, xterm.js, KaTeX, notebook-kit. Replacing it would
change the interaction ADR 0010 says to reproduce rather than revisit, and embedding a WebView
inside one of these frameworks gives the system-webview liabilities plus a bridge between the app
and its own editor.

**Raw CEF, NW.js.** Electron without the product: the same engine, minus the process model, IPC,
updater, packaging and signing. Choosing it means rebuilding Electron with fewer people.

A feasibility spike was built before deciding. It proved four things on a real machine rather than
from documentation:

| Claim | Evidence |
|---|---|
| A real PTY works under Rust | 7/7 assertions — a zsh passing `isatty`, taking keystrokes, honouring a resize, rendering colour |
| The canvas works in WKWebView | 12/12 — CodeMirror 6 reporting real caret geometry, `posAtCoords` round-tripping, KaTeX, marked, xterm's buffer readable |
| A test can report a verdict with no human | `probe_report` prints to stdout and sets the exit code; the failure path was verified by mutating an assertion |
| A bundled sidecar inherits the app's permission grant | The same unmodified Swift binary reported `denied` from a terminal with no grant and `granted` once the terminal had one |

## Decision

**Tauri 2.** Rust main process, the system WKWebView, macOS only for now.

The decision was the user's, on 2026-10-12, with the trade-off stated and accepted: **bundle size
and mobile reach were ranked above Electron's testing advantages.** This ADR records that ordering
because it is the whole of the argument — on testing alone, Electron wins.

### What it costs, accepted knowingly

These are not discovered problems. They were known before the choice and are the price of it.

- **macOS e2e of the real app is not headless, and cannot be.** WebKit does not paint a WKWebView
  whose window is ordered out, and treats an occluded window as hidden. A real window opens on a
  real WindowServer session on every run. No human ritual is needed — a logged-in Mac and stock
  CI runners both satisfy it — but it will not run over SSH to a locked machine.
- **WebDriver keyboard injection on macOS is incomplete.** Text entry, Home/End, and
  `Mod-Shift-<letter>` chords miss through the driver plugin's key table and need
  synthetic-`KeyboardEvent` workarounds. For a caret-positional editor (ADR 0005) that is the
  sharpest cost available, because the caret *is* the interaction.
- **Rust is a second language**, beside ADR 0012's TypeScript. See that ADR's status for what it
  still governs.
- **Three webview engines, if Linux or Windows are ever targeted.** Not paid today: macOS only
  until someone asks. The day that changes, it is recorded here.

### The mitigation, which is why the cost is bearable

The keyboard gap would be disqualifying if the keymap had to be asserted through a driver. It does
not, and the reason is that this is a **rebuild** rather than a port:

**The keymap becomes data.** `src/document/keymap.ts` is a pure table from `(key, modifiers,
context)` to a command name, tested by `node:test` with no events at all. The canvas binds
CodeMirror to that table; nothing in the table knows CodeMirror exists. Real key events are asserted
one layer up, in Playwright against a real engine, which is not WKWebView but is a far better
approximation than a synthetic event. The real-app layer then asserts only what needs the real shell
and never presses a key.

That is the single most valuable consequence of rebuilding instead of porting, and it is the reason
this ADR and the testing strategy (`../TEST_ARCHITECTURE.md`) are one decision rather than two.

**IME composition has no automated layer.** It is engine- and shell-specific and WebDriver cannot
drive it. It gets a documented manual checklist. Stating the gap is the decision; pretending
coverage would be worse than having none.

### What carries over unchanged

The seams ADR 0010 named as having proved themselves are the ones the rebuild keeps:

- **The format is the contract** (ADR 0001). `../document-format.md` and `../notebook-cells.md` are
  what a reimplementation answers to; `DocumentChat.ts` was one implementation of them and is not
  ported.
- **A pure document core driven directly by the suite** (ADR 0006). `src/document/*` is
  already pure, and moves across with its tests unedited — which is what makes the move provably
  safe (ADR 0009's rule: a test that needs editing means behaviour changed).
- **The transcript is pi's own** (ADR 0002): rebuilt from the document, never diffed, no JSONL
  hand-parsing.
- **It is the user's own pi that runs** (ADR 0004). With one change: a Tauri app bundles no Node, so
  there is no bundled-pi fallback. Absence of `pi` must therefore fail visibly, naming what to
  install.
- **Credentials fail visibly** (ADR 0011).
- **The live-view seam** (ADR 0013) is what a capture stream renders through. It was built for
  exactly this and did not know it yet.

## Consequences

- **The freeze is over.** ADR 0010's "repairs and presentation only" no longer describes this repo,
  and its status line says so. A session that reads the freeze as current will refuse correct work,
  which is why lifting it on paper comes first rather than as a tidy-up at the end.
- **`cargo test` joins `pnpm verify` as a gate.** Rust modules behind the command surface take plain
  types and import no `tauri::`, so they are testable without an app. A module that reaches for
  `tauri::` outside the command surface has stopped being testable, which is the invariant that
  keeps layer 2 of the strategy alive.
- **One IPC seam, lint-enforced.** `src/bridge.ts` is the only importer of `@tauri-apps/api`. A
  second `invoke()` anywhere else is a bug, and the hygiene script says so.
- **Capture is not a webview feature.** It gets its own ADR
  ([0015](0015-capture-is-a-native-sidecar.md)), because the reasoning is about macOS permissions
  rather than about frameworks and outlives this choice.
- **Signing is deferred.** Local development only until a certificate is supplied. The known release
  risk is upstream and unresolved: notarization rejecting an `externalBin` sidecar in
  `Contents/MacOS/` as "nested code is modified or invalid" ([tauri#11992]). It is a release risk,
  not a development one, and it is verified end to end before the release path is trusted.

## Lessons

- **Spike the risk that would end the decision, not the feature.** Four risks were named before any
  code was written — the PTY, the canvas in WebKit, a verdict without a human, and the permission
  model — and each could have ended the choice on its own. The spike answered three by experiment
  and one by a two-line change of who launched a binary. None of that would have come out of more
  reading.
- **A test suite that cannot fail proves nothing.** The spike's verdict path was only believed after
  an assertion was deliberately mutated and the exit code went to 1. Verify the failure path of any
  new gate, in the same session that builds it.
- **When a framework's weakness lands on your core interaction, move the interaction below it.**
  The keyboard gap was answered by making the keymap data rather than by fighting the driver. A
  rebuild can do that; a port cannot, and that difference is most of why the rebuild earns its
  scope.
- **Record the ordering that decided a close call, not just the winner.** Electron was better on
  testing and lost on bundle size and mobile. A future reader who knows only "Tauri" will eventually
  propose Electron again; one who knows *why* can tell whether the premises have changed.

[tauri#11992]: https://github.com/tauri-apps/tauri/issues/11992
