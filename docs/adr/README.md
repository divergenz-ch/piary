# Architecture Decision Records

Every significant decision taken while building Piary, with the context that produced it and the
durable lessons learned while landing it. Backfilled from the project's planning record, the source
trees, and `git log`; written forward from here. The planning documents themselves are gone — this
directory is where their reasoning lives now, which is why these ADRs state their constraints in
full rather than pointing somewhere.

An ADR exists so the **next** session does not re-derive a decision or quietly undo it. Write one
when a choice constrains future work: a seam, an invariant, a thing deliberately *not* done. Do not
write one for an implementation detail — **where code and prose disagree, the code wins**
(ADR 0010), so an ADR that restates code is a liability. The exception is an invariant being written
for the first time: that ADR comes first, and the code is held to it (ADR 0018). Record the decision and the why;
let the code carry the how.

**Numbers are never reused**, and a number missing from the index is a record that is kept
elsewhere.

**Supersession convention:** both ends of a supersession/amendment carry it in their status line —
the newer ADR names what it supersedes, and the older ADR's status gains the back-marker in the
same change.

Reference documents (not ADRs) live one level up:

- `../document-format.md` — the pi document format (v1) as implemented: the marker grammar, the
  segment grammar, the rebuild rule. **Normative.**
- `../notebook-cells.md` — cell modes and semantics, the settled gate. **Normative.**
- `../face-format.md` — what a camera saw of the user's face: the timeline, the filter and the
  block of plain words the agent is handed. **Normative.**
- `../CODING_GUIDELINES.md` — architecture, hard rules, comment policy, build gotchas.
- `../TEST_ARCHITECTURE.md` — the headless-real-DOM harness and the bug-repro playbook.
- `../packaging.md` — how the native app is built, what is in the bundle, and the signing path.
- `../running-the-app.md` — running the app locally, and the manual smoke test for what no
  automated layer covers.
- `../markdown-showcase.md` — what the renderer must handle.

## Index

A number is never reused: a gap in the sequence is a record that was withdrawn.

| ADR | Title |
|---|---|
| [0001](0001-document-is-the-interface.md) | The document is the interface; markers are HTML comments |
| [0002](0002-transcript-is-pis-own.md) | The transcript is pi's own; a document is rebuilt, never diffed |
| [0004](0004-the-users-own-pi-runs.md) | The user's own pi runs; the app bundles none |
| [0005](0005-one-canvas-caret-positional-prompts.md) | One canvas: the prompt is positional, resolved from the caret |
| [0006](0006-pure-core-real-dom-tests.md) | A pure document core, and a real-DOM suite with no mocks |
| [0007](0007-no-build-artifacts-in-git.md) | Build artifacts stay out of git |
| [0008](0008-hash-private-not-private.md) | `#private`, not `private` |
| [0009](0009-name-it-move-it.md) | Name an implicit subsystem and move it; rule of three enforced at two |
| [0010](0010-frozen-prototype-specification-is-the-code.md) | The prototype is frozen; the interaction is the specification |
| [0011](0011-credentials-fail-visibly.md) | Credentials fail visibly rather than gating the app |
| [0012](0012-the-node-half-is-typescript.md) | The Node half is TypeScript, run unbuilt |
| [0013](0013-inline-terminal-and-live-views.md) | The inline terminal, and the live-view seam |
| [0014](0014-native-application-tauri.md) | Piary is a native application, on Tauri 2 |
| [0015](0015-capture-is-a-native-sidecar.md) | Capture is a native sidecar, not a webview feature |
| [0016](0016-the-app-sends-its-own-prompts.md) | The app sends its own prompts |
| [0017](0017-the-live-turn-is-an-object.md) | The stream region is absent between turns, not collapsed |
| [0018](0018-what-a-crash-may-take.md) | What a crash may take, written down before the code is held to it |
| [0019](0019-nothing-outlives-the-app.md) | Nothing outlives the app, and no turn waits on an event that may not come |
| [0020](0020-the-pi-boundary.md) | The pi boundary: a relay knows no shapes, a translation names pi's types |
| [0021](0021-the-app-rebuilds-through-the-wire.md) | The app rebuilds through the wire: read by `get_entries`, written whole by Rust |
| [0022](0022-the-gate-runs-locally.md) | The gate runs locally: `make ci`, no hosted CI, no hooks |
| [0024](0024-the-app-host-is-composed-of-modules.md) | The app's host is composed of feature modules |
| [0025](0025-the-app-keeps-widget-state-in-its-own-store.md) | The app keeps widget state in its own store, and writes it into the transcript only through a rebuild |
| [0026](0026-the-app-stores-attachments-and-serves-them-through-its-own-scheme.md) | The app stores attachments in Rust and the webview reads them through its own scheme |
| [0027](0027-one-window-per-document-and-background-runs.md) | One window per document, and a background run writes through the store |
| [0028](0028-each-send-carries-the-time.md) | Each send carries the time, on the message, and the document never holds it |
| [0029](0029-piary-is-an-application-not-a-component-library.md) | Piary is an application, not a component library |
| [0030](0030-piarys-prompt-and-tools-ship-with-the-app-and-answer-to-evals.md) | Piary's prompt and tools ship with the app, and a prompt change answers to evals |
| [0031](0031-the-agent-proposes-the-app-enforces.md) | The agent proposes, the app enforces: cell verdicts and run limits |
| [0032](0032-sign-in-is-pis-own-login-in-a-terminal.md) | Sign-in is pi's own `/login`, run in an app terminal |
| [0033](0033-pi-edits-the-canvas-by-quoting-it.md) | pi edits the canvas by quoting it, and the page applies the edit |
| [0034](0034-sign-in-is-a-panel-over-pis-own-login.md) | Sign-in is a panel over pi's own login, carried by Piary's extension |
| [0037](0037-the-first-run-is-a-tour-document-and-chrome-hints.md) | The first run is a tour document, and the chrome points at what to do next |
| [0038](0038-the-first-run-is-a-splash-and-a-guided-walk.md) | The first run is a splash, then a guided walk the reader cannot wander out of |
| [0040](0040-cells-read-the-workspace-and-the-agent-shows-a-command-on-purpose.md) | Cells read the workspace through a read-only scheme, and the agent shows a command on purpose |
| [0043](0043-the-agent-draws-an-answer-through-an-a2ui-catalog.md) | The agent draws an answer through an A2UI catalog, checked before it is drawn; Plot ships in the app |
| [0044](0044-how-an-answer-is-drawn-is-a-mode.md) | How an answer is drawn is a mode: `PIARY_DRAW` picks the guidance pi starts with, never the rendering |
| [0046](0046-the-source-toggle-says-what-it-shows-and-the-way-back.md) | The source toggle is labelled by what it opens and the raw text carries `← Show result`; a live view has no toggle, and one with no process says so |
| [0047](0047-a-chart-with-no-data-is-a-verdict-not-a-green-ran.md) | A cell whose chart has no data is answered `empty`: a failed write naming the empty value, an amber chip; an empty set that is an answer stays `ok` |
| [0048](0048-preferences-are-the-apps-own-file-and-every-window-hears-a-change.md) | Preferences are one JSON file of the app's, written by Rust; a change is emitted to every window and applies at once; pi's settings stay pi's |
| [0049](0049-a-conversation-leaves-and-enters-as-a-bundle.md) | Import and export act on conversations, each through a window of its own; a conversation leaves and enters as a bundle (the document and the attachments it references, as a folder or a zip); the page never names a path; a taken name is asked about, a broken link reported, an unknown version imported read-only |
| [0050](0050-commands-come-from-one-catalog-and-have-two-ways-in.md) | Every surface lists commands from one catalog; a row is an icon, a name, one line of what it does and its menu item's chord (how the chord is known: ADR 0051); the menu has no card beside it; controls the app has get rows that run their menu items; Commands… (⌘K) opens a searchable palette from anywhere; one-line rows and ⌘K-at-the-prompt were built and not chosen |
| [0051](0051-a-rows-chord-is-read-from-the-systems-menu.md) | A row's chord is the key the system's menu item holds, read back from AppKit and paired with the app's menu by position and title; no chord rather than a wrong one; a layout switched while the app runs is followed late; working it out from the layout and turning the system's move off were not chosen |
| [0052](0052-a-table-cell-is-drawn-from-the-canvas-own-parse.md) | A table cell is drawn from the editor's own markdown tree as DOM nodes and is its source while focused; an escape's backslash hides like any mark; no prompt change; parsing cells with `marked`, HTML cells with a prompt line, and a prompt-only rule were built, measured and not chosen |
| [0053](0053-a-prose-code-blocks-fence-lines-hide-away-from-the-caret.md) | Proposed: a code block in a `you` or `pi` body is drawn without its two fence lines while the selection is away from it; the canvas says what is prose and a marker's payload keeps its fence; unclosed, empty, listed and quoted fences stay as written; deciding by info string and a widget were not chosen |
| [0054](0054-a-cell-the-run-is-working-on-is-locked.md) | The artifact holding the cell a run is working on is `inert` for as long as its chip is `working`, the whole run rather than write-to-verdict, and never past the turn; the chip and the document's markdown stay the user's; the `cellWorkPulse` preference switches the wash and not the lock |
| [0055](0055-the-face-block-is-an-app-line-built-at-the-send.md) | The `[face]` block is an app line like `[now: …]`: built at the send from a key log the page keeps per prompt (`prompt-edit`), trusted only if it replays to the body sent, dropped wherever a message is read as the user's text; the `face` preference gates the log, the block and pi's guidance; a driven run's face is a script |
| [0056](0056-evals-may-run-on-claude-code-with-pi-serving-the-prompt-and-tools.md) | An eval run may ask through `claude -p` on a Claude plan, with the user's own pi hosted model-less for its system prompt and tools (`--harness claude`); pi calling the model on a plan is refused by Anthropic and not worked around; a history goes in as text; cases that turn on the skill are tagged `needs pi` and left out; a prompt change still ships on a pi run |
| [0057](0057-the-face-is-switched-from-a-pill-beside-the-model-after-the-user-agrees.md) | Reading the face is switched from a pill in the model chip that shows where it stands (off, asking, idle, watching, nothing in view, refused, failed); nothing is read until the user has agreed once to a sheet saying what is sent and to whom; the camera read is the one chosen, never a phone unasked; a camera that cannot be had is the pill's to say (amends ADR 0058); the tour reads no face |
| [0058](0058-the-face-is-read-in-the-page-and-only-words-leave-it.md) | The face is read in the page with MediaPipe's Face Landmarker, and only samples leave the detector module; the detector is a seam with a scripted implementation that driven runs use; CPU delegate; model and wasm ship in the app; the camera is on only while typing or just after an answer; recording stays in the helper (amends ADR 0015); Apple Vision, frames from the helper, a Python sidecar and a model call were not chosen |
| [0059](0059-what-the-camera-reads-and-what-was-sent-can-be-looked-at.md) | A panel of the face's pill, open under typing, shows each expression against its rest, what was found with what the filter dropped and why, and the block the draft would carry; what is passed on (intensity, hold, head angles) is set there and kept as `faceTuning`; a block's menu reads back what its message carried from pi's transcript; ⌥⌘F flips the switch, and there is no opt-out for one message; the camera's picture only when asked for (amends ADR 0055, 0057, 0058); a store of sent blocks, holding the camera on and a per-message opt-out were not chosen |
| [0060](0060-the-face-reading-an-answer-goes-with-the-next-message.md) | A turn that ends opens a four-second reading: the camera comes on with no key, if the window is in front, the answer in sight and the user not writing; the first key ends it; the next message carries it once as `read` lines, unless two minutes have passed (amends ADR 0058); opening at the first word and a reading sent by itself were not chosen |
| [0061](0061-the-agent-may-speak-first-when-the-face-moved-at-an-answer.md) | With `faceSpeaks` on (off by default), six quiet seconds after an answer the face moved at, pi is handed the reading with no message and may add a sentence or two, drawn as a `pi:aside` block under the answer, or answer `[silent]`, drawn as nothing and kept in its transcript; once per answer; three silent replies in a row or a model on a short list stop the asking; Not helpful removes it and backs off; the panel counts the askings; a list of allowed models, the reply as more answer text and streaming it were not chosen |
| [0062](0062-piary-reaches-other-people-as-one-build-on-github-releases.md) | Binaries are GitHub Release assets under a version tag; one bundle for Apple silicon and Intel, every binary in it compiled for the macOS the app says it runs on and checked by `pnpm app:release`; the app asks for no microphone until a feature uses one; it says when a newer version exists; signing comes from the environment, ad-hoc with none; whether an update installs itself is not decided |
| [0064](0064-the-page-asks-github-for-the-newest-release-one-window-an-hour.md) | The page asks GitHub for the latest release with `fetch`, when Rust gives its window the turn: one request an hour for the app, none with `updateCheck` off, never in a driven run (`PIARY_UPDATE_SCRIPT`); a newer version is a pill in the model chip, left of the model, whose menu opens a download address the app builds and dismisses that version (`updateDismissed`); a failed check is a log line; Help → Check for Updates… asks at once, whatever the hour and the preference, and says what it found on the status line; the version is written in `package.json`; a request from Rust through `curl`, a stored check time, a bar and pre-releases were not chosen |
| [0065](0065-a-canvas-edit-that-empties-a-block-removes-it.md) | A `canvas_edit` that leaves a `you`, `pi` or `pi:note` block with no text removes the block with its marker, as the user's own delete of a segment does, in one undoable change; the prompt being answered is refused and the trailing prompt keeps its marker; the page answers `ok` only when the change landed; a separate remove tool and removing only pi's own answers were not chosen |
