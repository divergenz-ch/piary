# ADR 0019 — Nothing outlives the app, and no turn waits on an event that may not come

**Status:** accepted. Amends [ADR 0013](0013-inline-terminal-and-live-views.md): flow control is a
rule of the live-view seam (its rule 6), not a habit of one module. Owns the teardown ordering that
[ADR 0018](0018-what-a-crash-may-take.md) §2 defers here, and answers the signal question it leaves
open.

**Consequences' standing violations are resolved**: `drop_session`, `stop_all` and `Capture::stop`
take their entry out and release the lock before the exit wait, and `pi_send`, `pi_stop` and
`capture_stop` wait off the main thread — `CODING_GUIDELINES.md` §Rust concurrency and lifetime
states both rules as they hold. The quit-time checks the Consequences leave to a checklist are
automated by `e2e-app/quit.spec.ts` (a SIGTERM against a live pi, a pi's tool child, a terminal and
the capture helper); only ⌘Q's own key binding stays with `running-the-app.md` step 13.

## Context

The app has three kinds of child process, and each subsystem ends its own correctly:

- **`pi --mode rpc`**, one per session. `Sessions::drop_session` (`src-tauri/src/session.rs:249`)
  closes stdin, polls `try_wait` twenty times at 50 ms, then kills — "closing stdin is how pi is asked
  to go; the kill is the guarantee."
- **A shell per terminal.** Dropping the PTY master hangs the terminal up (`src-tauri/src/pty.rs`,
  invariant 3), so `Ptys::close` (`:277`) and `Ptys::close_session` (`:289`) end shells by removing
  their entries.
- **The capture helper**, at most one. `Capture::stop` (`src-tauri/src/capture.rs:132`) has
  `drop_session`'s shape, and its comment already names the leak: a wedged helper "keeps a Screen
  Recording grant alive with nobody reading it."

**Nothing calls any of them when the app ends.** `src-tauri/src/main.rs` chains `.setup`,
`.invoke_handler`, `.run` and handles no `RunEvent`; there is no `impl Drop` on `Sessions`, `Ptys` or
`Capture`. No window-close path calls them either: `pty_close_session`'s comment says it is "called
when a window goes away", and nothing in `app/` calls it, and `piStop` is reached only from the
self-test probe in `app/main.ts`. Shells happen to die when the process exits cleanly, because the
masters are closed with it — one of three children is safe by accident, which is why the other two
went unnoticed. A quit leaves a `pi` holding the user's credentials and working directory, and a
helper holding a TCC grant.

Separately, **a turn ends only on an event**. `app/turn.ts` has no timer; `#setRunning(false)` is
reached from `agent_settled`, `error`, `onPiExited`, a refused prompt, and a rejected `abort`. One
lost event locks the canvas until relaunch. And the opposite failure is one line away: `send`
(`:136`) unlocks on `reply?.success === false`, and `commands::pi_send` turns `REQUEST_TIMEOUT`
(`session.rs:41`, 30 s) into that same shape through `session::failure` (`:290`) — so a reply that
was merely *late* unlocks the canvas while pi goes on writing into it. Two writers on one document
is the class ADR 0005 exists to prevent.

And the exit hooks are not where a reader would assume. Checked against the Tauri 2.12 / tao 0.37
sources in the lockfile:

- `RunEvent::ExitRequested` fires **only** when the last window is destroyed (`code: None`) or when
  the app calls `AppHandle::exit` (`code: Some`). **⌘Q does not reach it on macOS.** The app menu's
  Quit is `PredefinedMenuItem::quit` (`src-tauri/src/menu.rs:120`), which sends `terminate:` to
  `NSApp`; tao handles that in `applicationWillTerminate` and emits only the loop's end —
  `RunEvent::Exit`, which cannot be prevented and runs with the process already going. The Dock's
  Quit and a logout take the same route.
- By the time the last window's `Destroyed` raises `ExitRequested`, its webview is gone. A flush
  there has nothing to ask.
- **A synchronous command runs on the main thread** (the `tauri::command` macro's own documentation:
  `async` "runs the command on the async runtime instead of blocking the main thread"). Every command
  in `src-tauri/src/commands.rs` is synchronous — 23 of them.

## Decision

### 1. The invariant, in two halves

> **No process the app started — or that one of its children started — outlives the app. No turn is
> "running" without something that will end it.**

The first half is about processes and is checked with `pgrep`. The second is about the flag that
gates the canvas (`Turn.#running`, which moves `chat.streaming` with it) and is checked by a turn
that receives nothing.

"Started by one of its children" is deliberate: pi runs tools. Killing pi does not kill a `bash` it
spawned — the child is reparented to `launchd` and keeps running. So **pi is started as the leader of
its own process group and its kill is sent to the group**; the polite path (§3) asks pi to end its
own tools first. A shell started in a PTY is a session leader already, and the hang-up reaches its
foreground job; a job the user deliberately detached (`nohup`, `disown`) outlives the terminal as it
would in any terminal emulator, and that is accepted.

### 2. The teardown ordering

One sequence, for every exit the app performs on purpose:

1. **Refuse new work.** A flag set first; every command that would start something — `pi_start`, a
   `prompt` through `pi_send`, `pty_open`, `capture_start` — refuses once it is set. `docs_write`
   stays open, because step 3 is one.
2. **End the turns.** Each window's page stops its running turn — `abort`, the same path Escape takes
   (`Turn.stop`, `turn.ts:73`) — and waits, bounded, for it to settle.
3. **Flush the document.** Each page writes its buffer through `docs_write` and answers. This is ADR
   0018 §2's flush.
4. **Stop `pi`**, every live session, by `drop_session`'s route with the group kill.
5. **Close the PTYs.**
6. **Stop capture.**

**Why the flush is third and not first.** ADR 0018 requires only that the flush precede stopping any
child, and it does. It follows step 2 because the turn writes into the same buffer: a flush taken
while pi is still answering is a snapshot of half an answer, and the chunks after it — including
whatever an abort finalizes — land in a buffer nothing will save. Flushing after the last writer has
stopped, and before any child is stopped, is the one point where the buffer is both complete and
still worth writing.

**Why `pi` before the PTYs and capture.** pi is the only child that writes into the document, and the
only one with credentials and a working directory; it is the costliest to leak. The PTYs and the
helper write only into views (ADR 0013 rule 3: their bytes are not document content). Between the
last two the order is free; capture last keeps the sequence `pi_stop`'s own order extended
(`commands::pi_stop` closes a session's terminals before dropping it, which is per-session cleanup,
not the app's sequence).

**Steps 2–3 are one round trip, and it is bounded.** The host asks every window and proceeds when
each has answered or when the bound expires, named at module scope with its reason. A wedged page
costs what ADR 0018's third row allows — the unflushed buffer — and never a hang at quit. Steps 4–6
are bounded by the stop methods' own 1-second polls.

**Where it runs, which is where an implementation goes wrong:**

- **Never block the main thread waiting on the page.** The webview's IPC is delivered on the main
  thread, so a handler that waits there for the page's answer is waiting for something it is itself
  preventing. Prevent the exit, emit the request, return; the page's answer (or the bound's timer
  thread) runs steps 4–6 off the main thread and then calls `AppHandle::exit`. That second request
  arrives as `ExitRequested { code: Some(_) }` and is let through by the step-1 flag.
- **Quit is a custom menu item**, not `PredefinedMenuItem::quit`, so that ⌘Q enters this sequence.
  The predefined item reaches only `RunEvent::Exit`.
- **A window's close is its own, smaller instance**: on `CloseRequested`, prevent it, run steps 2–5
  for *that window's* session, then close. Closing the last window is a quit, and the
  `ExitRequested { code: None }` that follows has no page left — it runs steps 4–6 for anything still
  live (the helper is app-wide, not a window's).
- **`RunEvent::Exit` is the backstop.** The Dock's Quit and a logout reach only this. It cannot be
  prevented and the page cannot be asked anything, so it runs steps 4–6 synchronously — the children
  are still reaped — and the flush does not happen. That loss is ADR 0018's third row, stated here so
  it is a bound and not a surprise.
- **SIGINT and SIGTERM enter this same sequence**; a second signal stops waiting on the pages. `pnpm
  app` is `tauri dev` in a terminal, so Ctrl-C is how a developer normally stops the app, and
  "Ctrl-C may lose the last half-second" is the kind of exception that becomes a lost edit nobody
  can reproduce. Rust's standard library cannot install a signal handler, so the `signal-hook` crate
  does, and only to wake a thread of its own (`exit::listen`); everything a signal causes runs there,
  never in the handler and never on the main thread. The first signal calls `AppHandle::exit` with
  128 plus its number — the Quit item's entry, so the sequence cannot tell them apart except by the
  code. A second does not wait out the pages' bound: it reaps (steps 4–6, bounded by the stops'
  grace) and exits the process. It still reaps, because "at once" bought by leaving pi running is
  the defect this section exists to prevent. Under `tauri dev` the terminal's Ctrl-C reaches the
  whole foreground group, the CLI included; the app's handler runs regardless, and the page's flush
  lands before the process goes. The decision (`Exit::signalled`) and a real signal reaching the
  listener are tested in `exit.rs`; that the sequence it enters then runs is the quit checklist's.

**One handler, extended.** The flush and the reaping arrive as separate changes; whichever lands
second extends the sequence the first wrote. A second `ExitRequested` match arm with its own idea of
the order is the defect this section exists to prevent.

### 3. The orphan rule: quit aborts, waits a bound, then kills

Cancellation is specified for one path today: Escape → `abort`. Every way a page stops being there is
now specified too.

**Quit, and closing a window, abort the turn and wait a bound; then the kill.** Not kill-first,
because pi runs tools: a turn mid-`bash` is editing files in the user's repository with the user's
permissions. `abort` is the only request that ends a tool the way pi's own interface would — pi
cancels its tool, the answer so far is finalized, and step 3 saves it. Killing first would leave the
tool's side effects on disk with no record in the document of what was done, and the next open
rebuilds from the file (ADR 0002), so nothing would ever show the work happened. The bound exists
because an abort pi does not honour must not hold the quit hostage; when it expires, the group kill
ends pi and its tools, and whatever they had already changed on disk stays changed. That residue is
accepted, and it is the reason the polite path comes first.

**A reload is not a teardown.** The children survive it: `pi_sessions` exists so a reloaded page
re-attaches to its session rather than starting a second `pi`. What a reload loses is the page's turn
state. The rest of an in-flight answer is dropped — ADR 0017: with no region, a write has nowhere to
land — and the re-attached page asks `get_state` (§4) before allowing a send; a session still
streaming leaves the canvas locked, with Escape able to abort it, until it settles. Re-rendering
such a turn is a feature, not a lifetime question.

**Process death and SIGKILL reap nothing, by definition.** No handler runs, and every child is
reparented and keeps going — pi included, mid-turn. A Rust panic in a command handler unwinds one
thread and leaves every child too. This ADR does not close that: no in-process mechanism can, and a
handler written in the belief that it has is worse than none. What answers it is the next launch —
a `pi` for a session that is already running is a second writer — and that is named in
Consequences, not solved here.

### 4. A silent turn is probed, never unlocked on a timer

Silence is not evidence that pi is gone. A slow first token, a long tool call, and a model thinking
for a minute all produce no event for longer than any bound a page would pick. So:

- **A silence timer is armed when a turn starts and re-armed on every event for its session** — a
  `tool_execution_update` during a long `bash` is as much proof of life as a `message_update`.
- **On expiry the page asks pi `get_state`** and acts on the answer: `isStreaming: true` re-arms and
  nothing visible happens; `isStreaming: false` means the ending was lost, so the turn ends and the
  user is told (ADR 0011); a failed or timed-out probe means pi is wedged or gone, so the turn ends
  and the page asks `pi_running` which. **Gone**, the user gets the notice a pi exit gives, and its
  promise holds: the next send starts a fresh pi. **Still running**, the notice says pi stopped
  answering and was left running — never that it stopped, and never that the next send restarts it,
  because `piStart` is a no-op on a live session and the next send reaches the same pi. **A failed
  probe never stops pi**: stopping the process is `piStop`'s decision, not the probe's, and a pi
  that is slow rather than dead keeps its session.
  `get_state` is the question because pi already answers it: `isStreaming` is what tells a live
  turn from a lost ending.
- **A request timeout is a reason to probe, not to unlock.** A late reply and a refusal must reach the
  page as different things, and the timeout routes into the same probe.

**Unlocking on a timer alone is the design this rules out**, because it is the first one anyone
reaches for: it turns a slow turn into two writers on one document — the same defect as the timeout
above, by another route. The probe is also what makes the bound safe to get wrong: one that fires
early costs a `get_state` round trip, not a turn.

**The pi wire is at-most-once, deliberately.** No retry and no de-duplication: a request is written
once and its reply matched or abandoned. A local pipe loses no messages short of the process dying,
and a dead pi closes stdout, so the reader sees EOF — fail-stop detection that a distributed system
does not get, and the reason the duplicate-request machinery has no purchase here.

### 5. Degraded operation, one row per child

Each child can be gone while the app goes on. What the app is still for, and what it owes the user:

| Gone | Still works | What the user is owed |
|---|---|---|
| **`pi`** | the canvas: editing, saving (`docs_write` touches only the store, never `session.rs`), opening other documents, terminals | the running turn ends and they are told (`onPiExited`); **the next send starts a fresh pi**, as the notice promises |
| **a shell** | everything; other terminals are separate PTYs | the panel shows the exit; a new terminal opens a new shell |
| **the capture helper** | everything else | the page is told (`capture-ended`); a new capture starts a new helper |

**A child that exits on its own is reaped and its slot freed by whatever observes the exit** — the
reader thread's EOF — so the table above is reachable. Today it is not for two of the three:
`Sessions` keeps a dead pi's entry in `live`, so `start` is a no-op, the next send writes to a closed
pipe, and the unreaped process stays a zombie until something calls `drop_session`; `Capture` keeps a
dead helper's `Running`, so `is_running` answers `true` and `start` refuses. The rule is written here
so that fixing it is meeting a contract, not a judgement call.

### 6. Flow control belongs to the live-view seam

`pty.rs` coalesces on a 16 ms `FLUSH` with a documented invariant; the capture relay and the pi relay
(`session.rs:163`) forward per line. Whether that is right is not a question about one module, and
the seam every streaming element renders through (ADR 0013) is where a generic rule lives. **ADR 0013
rule 6 now states it**: every relay from a child to the page is bounded in memory, with the policy for
what is dropped written beside the bound; and a producer not already rate-limited at its source is
coalesced on time before it reaches the page.

Applied, as the policies the code is held to:

- **A terminal drops its oldest bytes** past a high-water mark. A terminal's scrollback is capped and
  xterm's own buffer discards from the top, so losing the oldest output is what a user already
  expects; dropping the newest would show a frozen terminal, which reads as a bug.
- **A capture line that is not JSON, or longer than its cap, is dropped and the relay continues** —
  the same rule `session.rs` already applies to pi ("dropping it keeps one bad line from ending the
  session"), with the drop said on stderr so it is not silent.
- **pi's events are forwarded per line, uncoalesced**, because pi cannot outrun the reader: checked
  against pi 1.0.4, it throttles a tool's streamed output itself (`BASH_UPDATE_THROTTLE_MS`, 100 ms)
  and awaits its stdout's backpressure between events. The line-length bound applies to them as to
  every relay, and a pi line that is not JSON — not UTF-8 included — is dropped and noted like a
  capture line, rather than ending the relay.

The bounds themselves (`pty::HIGH_WATER`, `capture::LINE_CAP`, `session::LINE_CAP`) are named
constants with their reasons beside them; every relay from a child reads its lines through
`lines::bounded`.

### What this deliberately does not do

- **No `Drop` impls as the teardown.** `Drop` runs at an unspecified point during teardown, gives no
  ordering between the three subsystems, and cannot ask the page anything. The sequence is one
  explicit handler. A `Drop` is added only where a subsystem must be safe when dropped for some other
  reason.
- **No crash recovery.** A turn interrupted by a crash is lost and asked again — ADR 0002 refuses to
  read pi's transcript, so there is nothing to resume from.
- **No supervisor process.** An orphan left by SIGKILL is answered at the next launch, not by a second
  process watching the first.

## Consequences

- `CODING_GUIDELINES.md` §Rust concurrency and lifetime carries the lock order, the no-lock-across-a-
  wait rule, and where a command runs, in the form a reviewer checks. Two violations of those rules
  stand today and are named there: `drop_session` and `Capture::stop` hold their lock across the
  child's exit wait, and `pi_send`, `pi_stop` and `capture_stop` block the main thread while waiting
  on another process.
- `running-the-app.md` carries the quit-time checks: after quitting with a live session and an open
  terminal, `pgrep` finds no `pi --mode rpc`, no `piary-capture`, and no shell. The exit sequence
  cannot be driven by `cargo test` without an app; what can be is a stop-everything method asserted
  by the children being gone, and the rest is that checklist.
- A `pi` orphaned by a crash and a fresh `pi` started for the same session at the next launch are two
  writers on one transcript. Nothing detects that today, and it is the open edge of this ADR.
- The probe in §4 sends `get_state` through `pi_send`, which today blocks the main thread for up to
  `REQUEST_TIMEOUT` when pi is wedged. A probe is only as cheap as the command it rides on.
- `TEST_ARCHITECTURE.md` §4 catalogs the test that was supposed to guard the timeout and could not
  fail: an assertion over a `Result` that admits both arms.

## Lessons

- **Three correct `stop()` methods are not a teardown.** Each subsystem did its own job well, and the
  composed statement — who ends what, in which order, at which event — had no owner, so none of them
  was ever called at exit. A lifetime rule spans subsystems or it is not a rule.
- **One child that is safe by accident hides the two that are not.** PTYs die with the process
  because closing the master hangs them up; that made "children die at exit" look true from the one
  place most people would check.
- **Read the framework's exit path before trusting its event names.** `ExitRequested` reads like
  "the app is about to quit"; on macOS the ordinary ⌘Q never raises it. The source answered in
  minutes what a handler written against the name would have taken a lost edit to find.
- **A comment that says "X finalizes it" is a claim about X.** `Turn.stop` closes nothing by hand
  because `agent_settled` will; a pi that answers `abort` and then goes quiet makes that false. ADR
  0018 said it already: when a comment says the other thing handles this, check the other thing.
- **A watchdog that unlocks is the bug it guards against.** The obvious fix for a hung turn creates
  two writers. The second half of the invariant is about a flag, and the only safe way to clear that
  flag is to ask the one party that knows.
