# ADR 0018 — What a crash may take, written down before the code is held to it

**Status:** accepted. Amends [ADR 0010](0010-frozen-prototype-specification-is-the-code.md): an
invariant being written for the first time is written in prose first, and the code is held to it.
Enumerates the instances of [ADR 0017](0017-the-live-turn-is-an-object.md)'s lesson that live on the
save path.

## Context

`docs/document-format.md` said the document file "together with its stored attachment bytes are the
complete durable state." Nothing anywhere stated what that was a bound on, and the code under it
delivered less than the sentence promised. Six places, each checked against the tree:

- **The save debounce is starved by the machine's own writes.** `#scheduleSave`
  (`src/components/DocumentChat.ts:2057`) skips the `doc-draft` net for machine splices — "the
  debounced save covers that content" — and then runs `clearTimeout(this.#saveTimer)` *outside*
  that guard (`:2071`). A turn that streams faster than `SAVE_DEBOUNCE_MS` (500, `:214`) pushes the
  only save out for the whole turn. Each of the two mechanisms assumes the other covers streaming.
- **`pi: v1` is written and never read.** `src/document/format.ts:862` writes it; `parseDocument`
  (`:94-131`) keeps frontmatter as an opaque string. A future-version document would be read as v1
  and rewritten as v1. The repo already holds the right pattern for a lesser artifact:
  `cellStatePayload` (`src/document/views.ts:33-43`) is a version-tolerant reader, normative in
  `notebook-cells.md`. Cell *state* survives a version bump; the document does not.
- **No `fsync`.** `docs::write` (`src-tauri/src/docs.rs:172-187`) is `fs::write` then `fs::rename`.
- **No flush on exit.** `src-tauri/src/main.rs` handles no `RunEvent::ExitRequested`, and nothing
  under `src-tauri/` handles a signal.
- **`escapeBody`'s round-trip is false at whitespace.** `unescapeBody` is private (`format.ts:83`)
  and its one caller trims the slice first (`:119`).
- **The boot race discards the stored document.** `app/main.ts:94-98` applies the stored document
  only when nothing was typed; the other arm keeps seed-plus-typing, and the next save writes it over
  the stored conversation.

Each one is a place where an earlier prototype's host carried something the app's did not, and no
document said it was owed. ADR 0017 named the class — *a host-side invariant protecting a
component-side defect is a latent bug with a timer on it* — without listing its instances.

## Decision

### 1. Durability is a bound, stated per failure, not a promise

There is no such thing as perfect durability (DDIA ch. 7); there is a statement of what each kind of
failure may take. Three kinds, each with its own answer:

| Failure | What it may take | What answers it |
|---|---|---|
| **Process death** — crash, panic, SIGKILL | nothing that was saved; never a half-written file | temp file + same-directory `rename`. This holds today and is the floor. |
| **Power loss / kernel panic** | nothing that was saved | `fsync` ordering, below, made by `docs::write`. |
| **Unflushed buffer** — the text lives only in the webview | at most the save window: `SAVE_DEBOUNCE_MS` of typing, or the save deadline of a streaming turn | a save no writer can starve, and a flush before every exit the app is asked to perform |
| **Unflushed widget state** — a slider moved, not yet kept | at most one 500 ms debounce of widget changes | the canvas's own debounce; not flushed at exit (ADR 0025), because a lost slider position is not the user's work |

The third row is the widest window and was the one no document mentioned.

**The save path a correct write performs**, in order (OSTEP §39.7–39.8):
`write` → `fsync(file)` → `close` → `rename` → **`fsync(containing directory)`**.

- **The file fsync is taken.** Without it, `rename` can publish a name whose contents were never
  written: the rename orders the directory entry, not the data.
- **The directory fsync is taken too.** It is the half OSTEP calls "often overlooked, leading to many
  application-level bugs": until the directory is synced, the rename itself can be lost, and the file
  comes back as its previous version after power returns. The cost is one more sync per save, and a
  save happens at most once per debounce window, so it is paid. If a filesystem refuses to sync a
  directory handle, that failure is not reported as a failed save — the contents are already durable
  and the rename has happened; only the rename's ordering against a power cut is unguaranteed there.
- **On macOS a plain `fsync` does not reach the platter.** It hands the data to the drive, whose cache
  may still lose it. `F_FULLFSYNC` is the call that asks the drive to flush, and Rust's
  `File::sync_all` issues it on Apple targets (std's unix `fs.rs`, `os_fsync`). Use `sync_all`, not
  a hand-rolled `libc::fsync` — and the change that makes the call confirms that against the
  toolchain in use rather than trusting this sentence. Confirmed for rustc 1.99.0 on
  `aarch64-apple-darwin` from the compiled code rather than the source, which the toolchain does
  not ship: `File::sync_all` is `fcntl(fd, 51)`, retried on `EINTR`, and 51 is `F_FULLFSYNC` in the
  SDK's `sys/fcntl.h`. `sync_data` compiles to the same function. A toolchain upgrade is the moment
  to look again.
- **`docs_write` is `async`, with the write in `spawn_blocking`.** A synchronous command runs on the
  main thread, and the syncs wait on the drive. Measured on an idle APFS SSD, a whole save — write,
  both syncs, rename — is a median of 6–11 ms from 10 KB to 4 MB and 16 ms at worst: one frame,
  every save, mid-stream. That would be tolerable if it were the bound, but it is not: how long a
  full sync takes is the device's to decide, and a busy disk takes far longer. So the wait moved off
  the main thread rather than being argued down to a number. Moving it has a price, paid in the same
  change: two writes of one document can now be in flight at once and finish in either order. Two
  rules answer it. A write's temp file is unique to the write, not only to the process, so one write
  cannot truncate another's. And the page's `docsWrite` makes a document's writes one after the
  other, each after the last has finished — without that, an earlier save finishing late leaves the
  older document as the file, and on quit that is the version kept. A write still in flight when a quit's bound
  passes (ADR 0019 §2) dies with the process, which is the first row: the previous version stays the
  file, and at most a dot-named temp file is left beside it, which no listing reads.

### 2. A save no writer can starve, and a flush before exit

- **A debounced save must not be starvable by a non-user writer.** A writer that resets the debounce
  on every chunk defers the save for as long as it writes. The rule is a **deadline**: a save
  deferred for longer than a small multiple of `SAVE_DEBOUNCE_MS` happens anyway, mid-stream, and the
  next one follows by the same rule. Exempting machine writes from resetting the timer is *not* the
  fix: it fires on a stale timer and writes a half answer as if it were final, once, and then nothing
  until the turn ends.
- **Anything that ends the process on purpose flushes first.** The webview holds the unsaved buffer,
  so the flush is a round trip: the host asks, the page writes, the host proceeds. The ordering of
  that flush against stopping the app's child processes belongs to the teardown ADR that follows
  this one (0019); the rule here is only that the flush happens and comes first.
- **The stored document is the base at boot, never a candidate.** What the store holds is a
  conversation that exists; typing in the first frames is a new prompt *against* it, not a
  replacement for it.

### 3. Every net under the document is carried by the app, or declined in writing

Declining is a legitimate outcome. Silence is not — silence is how the six defects above reached the
app. The four nets, each decided:

| Net | The app | Why |
|---|---|---|
| **A draft copy in `localStorage`** (the canvas raises `doc-draft` as the user types) | **declined** | A draft covers a reload, or a store that is unreachable, between saves. The app's store is an in-process call that cannot go offline, and the save deadline plus the exit flush narrow the window a draft would cover to one debounce. A second copy of the document in a store no user can see also brings its own defect: a draft can "recover" over a newer file and roll the document behind its transcript. The window left — a reload, or the webview process dying, inside one debounce — is accepted and is the third row's bound. The canvas still raises `doc-draft`; the app does not listen, and need not. |
| **Rolling snapshots** (`.backups/<id>/`, at most one a minute, fifty kept) | **carried** (`snapshot`, `src-tauri/src/docs.rs`) | The format's edits are destructive by design — the next send rebuilds the transcript from the document wholesale, and a re-run cuts the old answer (`document-format.md` §The document is the history). The snapshots are the only undo that survives a reload, and the spec points users at them. |
| **Conflict copy** (a second writer's version parked beside the document) | **declined** | The case it is for — a second writer — is answered by reconciling an external edit into the buffer (`reconcileDocument`, a minimal splice), not by parking a copy beside it. |
| **Size cap** (a largest document the store accepts) | **declined** | A cap bounds a body sent to a server that may be shared — a resource limit at a trust boundary. The app's write is its own page writing to its own disk, and refusing that write loses precisely the work this ADR exists to keep. Parsing is linear; its per-edit cost, and the size at which it stops being cheap, are the parse budget in `CODING_GUIDELINES.md` — and crossing that is answered by parsing less, not by refusing the write. |

### 4. A reader that does not recognise the version refuses to rewrite

The format exists so another tool can read it (ADR 0001), so it has to say what that tool does with a
version it does not know. **It may render the file; it must not rewrite it.** A missing frontmatter,
or one without a `pi` key, is v1 — a plain markdown file is a valid conversation, and stays one.

A reader that ignores its own version marker is a defect, not a simplification: the first time a v2
document meets a v1 writer, the v1 writer's next save silently drops whatever v2 added, and nothing
reports it. The version marker is only worth writing if some reader refuses on it. The normative rule
is `document-format.md` §Frontmatter.

### 5. The escaping round-trip is whitespace-insensitive

`escapeBody`'s round-trip is specified over body text **with its surrounding whitespace removed**:
for any text `t`, a segment written with `escapeBody(t)` parses back to `t` without its leading and
trailing whitespace. Everything between those edges is preserved exactly — marker look-alikes,
nested comments and CRLF line endings included; a property test that finds otherwise has found a
defect, not a gap in the contract.

That is the behaviour every test already encodes. Making whitespace survive would move every segment
boundary in the format, which is a format change with its own plan — far more dangerous than the
defect it would fix. The contract is corrected to say what is true, and a property test holds it.

### What this deliberately does not do

**No journal, no write-ahead log, no snapshot format.** Journaling (OSTEP ch. 42, DDIA ch. 3) exists to
make a *multi-block, in-place* update atomic. A document save is a single-file whole-content rewrite,
and for that `fsync` + atomic `rename` already buys exactly what a journal would — all of the new
version or all of the old — at a fraction of the machinery. A WAL for a markdown file is a proposal to
decline on sight.

## Consequences

- `document-format.md`'s durable-record paragraph states the bound rather than the promise, and
  §Frontmatter carries the version rule. A third-party implementer has a rule to follow.
- The app carries the rolling snapshots, the one net this decision owed it.
- Power-loss durability is asserted by this reasoning and by the calls being made, never by a test: a
  crash cannot be produced in-process. A test can assert what is observable — the temp file is gone,
  the content is complete — and should say in its header that it asserts no more.
- `CODING_GUIDELINES.md` §Durability and the save path carries the three rules in the form a
  reviewer checks.

## Lessons

- **A rule nobody wrote down cannot be violated loudly.** Every defect above was a place where one
  host carried a net and the next host did not, and nothing said the net was owed. "The code is the
  specification" (ADR 0010) is right for behaviour that exists; for an invariant that does not yet,
  the code has nothing to be measured against unless the prose comes first.
- **Two mechanisms that each assume the other covers a case cover nothing.** The draft net skipped
  streaming because the save covered it; the save was starved by streaming. When a comment says
  "the other thing handles this", check the other thing.
- **A version marker nobody reads is not a version.** It is a string that makes the format look more
  evolvable than it is, until the day it is needed.
- **A guard's comment covers one arm.** The boot race's guard was right and carefully argued, and the
  arm with no comment was the one that lost a conversation. Read the branch nobody explained.
