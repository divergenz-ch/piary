# External Tauri material, reviewed against this repo

A review of the five Tauri pages published on `rustify.rs`, read in full and
checked against `src-tauri/` as it stands. It records what the material adds,
what it duplicates, and the two gaps in our own documentation that reading it
surfaced.

**Status:** Research record, not an approved change. Nothing here is
implemented. The findings in §3 are each either a documentation gap or an
open question; §3.2 is a security question that wants an answer before it is
written down as a decision. No ADR is amended and no guideline is changed by
this file alone.

**Date of the check:** 2026-10-14. Everything
in §3 was verified against the working tree at that point; re-verify before
acting, because the command surface is under active development.

## 1. What was reviewed

| Source | Verdict |
|---|---|
| [Tauri v2 Tutorial 2026][tut] | Beginner scaffold. Two gotchas worth keeping (§3.1, §3.3). |
| [Tauri vs Electron 2026][elec] | Corroborates ADR 0014's trade-off with third-party figures. Adds no decision input. |
| [Tauri vs Qt 2026][qt] | A lane ADR 0014 never considered. Not applicable. |
| [Tauri vs Flutter 2026][flut] | ADR 0014 disqualifies Flutter on a stronger ground. |
| [Tauri glossary][gloss] | Fully covered by ADR 0014. |

The material is framework-selection writing, aimed at a reader who has not
chosen yet. This repo chose on 2026-10-12, spiked the four risks that could
have ended the choice, and recorded the ordering that decided it (ADR 0014).
So the comparison articles are **behind** our own record on the questions they
address, and the only useful yield is a short list of implementation gotchas.

## 2. What it duplicates, and should not be copied in

Each of these is already documented here, with a measured number or a named
upstream issue where the article has a range or a code sample:

- **Capability model.** `src-tauri/capabilities/default.json` already carries
  the operative fact in its own description — Tauri denies every ungranted
  command, the core ones included, and a missing grant surfaces only as a
  rejected promise in the page.
- **Bundle size.** `packaging.md` §1 states **5.7 MiB, measured**, against the
  article's 3–10 MB estimate.
- **Signing and notarization.** `packaging.md` §4 names [tauri#11992], the
  `externalBin`-in-`Contents/MacOS/` rejection, and the keychain-trust
  workaround. The articles offer four lines of `signingIdentity` JSON.
- **The three-webview cost.** ADR 0014 records it under what the choice costs,
  explicitly deferred: macOS only until someone asks.
- **The no-DOM lane.** ADR 0014 disqualifies Flutter and its neighbours on
  *structure* — the canvas is a DOM editor (CodeMirror 6, xterm.js, KaTeX,
  notebook-kit) and replacing it would revise the interaction ADR 0010 says to
  reproduce. That reasoning outranks the articles' binary-size and
  frame-pacing argument and should not be diluted by it.

**Do not paste third-party benchmarks into ADR 0014.** It records the ordering
that decided a close call — bundle size and mobile reach above Electron's
testing advantages — and that is the whole of its argument. Mirroring another
document's figures into it costs the reader attention and drifts.

## 3. The findings

### 3.1 Every command is synchronous

The tutorial's gotcha: *"Synchronous I/O blocks the runtime — use `async` for
file/network operations."*

Checked against the tree: **no `async fn` in `src-tauri/src/commands.rs`.** All
24 commands are synchronous, and several do real filesystem work on the calling
thread — `windows.rs:82` (`read_to_string`) and `windows.rs:95` (`write`) via
the window-layout commands, and `docs_read` / `docs_write` / `docs_list`
through `Store`.

**This is not a bug today.** The I/O is a small local file per call, and the
cost of a thread hop would exceed the work. It is a gap in the *documentation*:
nothing states the rule, so the threshold at which a new command must become
`async` is unwritten, and the next person adding a network-bound or
large-payload command has nothing to consult.

What is missing is one rule, in `docs/CODING_GUIDELINES.md`: a synchronous
command is correct while its I/O is small and local; anything network-bound,
unbounded in size, or waiting on another process takes `async`.

### 3.2 `csp: null` is an undocumented security decision

`src-tauri/tauri.conf.json` sets `app.security.csp` to `null`, which disables
the Content-Security-Policy Tauri would otherwise inject.

A grep for `csp` / `CSP` across `docs/` and `src-tauri/src/` returns **exactly
one hit: the line itself.** No ADR mentions it, no guideline mentions it, there
is no comment beside it, and ADR 0014, ADR 0015, `packaging.md` and
`running-the-app.md` are all silent.

The threat shape is what makes the silence matter. The canvas renders
**model-generated markdown** into the webview, so script injection is a live
surface rather than a theoretical one, and the capability file is then the only
barrier between an injection and a command surface that includes `pty_open`
and `capture_start`. The articles' framing — that the capability allowlist is
what bounds an XSS blast radius — is the standard argument, and it assumes a
CSP is also in place.

`null` may well be load-bearing: KaTeX, CodeMirror 6 and xterm.js all inject
inline styles, and a default CSP commonly has to be relaxed for them. **That
is the open question, and this document does not answer it.** Two outcomes are
possible and they want different work:

1. It is load-bearing → the reason belongs beside the line, naming which
   library forces it and what the capability file is therefore carrying alone.
2. It is incidental → the CSP should be tightened, with the capability surface
   re-read in that light.

Settling which requires reading what the page actually inlines. That is
read-only investigation and is the recommended next step — it is the one
finding in this review with security weight.

### 3.3 Serde on the IPC boundary — likely already solved, worth confirming

The tutorial notes that types crossing the IPC boundary need
`#[derive(Serialize, Deserialize)]`. This repo has `ts-rs = "12.0.1"` in
`src-tauri/Cargo.toml` and a `src-tauri/src/wire.rs`, which together suggest a
generated, typed seam that is stronger than the article's advice. Recorded only
so the next reader does not mistake the article's note for an unmet need;
confirm against `wire.rs` before acting on it.

## 4. What to skip

- The tutorial's tray, dialog-plugin and `npm create tauri-app` sections. Not
  our shape: we have `menu.rs`, no tray, and no dialog plugin.
- Its Next.js `output: 'export'` note. We build the page with Vite.
- All Qt, Flutter and Electron figures, per §2.

[tut]: https://rustify.rs/articles/rust-tauri-v2-desktop-app-tutorial-2026
[elec]: https://rustify.rs/articles/rust-tauri-vs-electron-2026
[qt]: https://rustify.rs/articles/rust-tauri-vs-qt-2026
[flut]: https://rustify.rs/articles/rust-tauri-vs-flutter-2026
[gloss]: https://rustify.rs/glossary/tauri
[tauri#11992]: https://github.com/tauri-apps/tauri/issues/11992
