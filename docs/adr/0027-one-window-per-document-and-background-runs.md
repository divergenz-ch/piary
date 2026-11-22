# ADR 0027 — One window per document, and a background run writes through the store

**Status:** accepted (2026-10-29). The user did not overrule the window, lifetime and split
defaults. Applies ADR 0019 to more than one window, and ADR 0018 §3 to a run that
another window writes. Amended 2026-11-02: a menu click goes to the focused window, not to every
window, and the menu has no New Window. **Amended 2026-11-06 (the conversation list, the user's
decision): a window switches among documents in place.** One editor per file still holds; see
below.

## Context

A subsession is a sub-agent. `/subagent <prompt>` runs the prompt in a child session with its own
sid, pi, transcript and document, and the parent holds a `pi:view subsession` card for it. The card
has a live status and **open** and **stop**. With one page, *open* has to switch the one editor to
the child's document and hand its running turn to an off-screen text mirror and back, which is
hard bookkeeping.

The app is native, and its shell was already shaped for windows. `windows::label_for` names one
window per document, geometry is remembered per document, ADR 0019 attaches sessions to windows,
and the menu has New Window. Nothing created a second window.

## Decision

- **One window per document, not in-window switching.** *Open* shows the child's document in the
  window labelled for it (`doc-<id>`), focusing that window when it exists and building one with the
  remembered geometry otherwise (`open_document`). A window learns its document from `?id=`
  (`app/boot.ts`); `?doc=` stays the test seam. Each window keeps its one canvas and one `Turn`, so
  no running turn ever changes canvases. The outcome is "open shows the child's document". ADR 0010 governs the canvas's interaction;
  window management is the shell's.
- **A window switches among documents in place** *(amended 2026-11-06)*. The conversation list
  down the left switches this window to the conversation clicked. A switch
  saves this window's document and boots its page again on `?id=<other>` (`app/switching.ts`),
  the path every window already takes, rather than rebuilding every module bound to a session
  under a canvas that stays. A running answer is handed to the background follower and carried
  across the reload. **What the reload costs:** about a second per switch in the debug build
  (907–1206 ms measured), and the leaving document's undo history.
- **One editor per file still holds.** Rust records which document each window shows
  (`windows::Shown`): the page reports it at boot, and a window is recorded when Rust builds it.
  A switch to a document another window shows focuses that window instead (`show_document`), and
  `open_document` asks the same registry. A window that switched still carries its first label,
  so a new window takes a free one (`free_label_for`).
- **Every document window is granted what the main window is.** `capabilities/default.json` lists
  `"doc-*"` beside `"main"`; without it, every command from a second window is denied silently.
- **A child's run is written by the window that started it, through the store.** A pure mirror
  (`src/document/mirror.ts`) writes a run into text and saves each finished message through
  `docs_write`. It handles exactly the events the app's own `Turn` writes, so a document written
  off screen equals what the same run would have left on screen; a test drives both and compares
  them. A window showing the child takes each save in through its watcher as an outside edit
  (ADR 0018 §3). No channel between windows: the file stays the truth (ADR 0001), and the existing
  reconcile rules decide conflicts.
- **A child's document starts as a file** holding its prompt, written before the child is
  prompted, so *open* always finds one. A session pi knows that has no file
  is rendered from its transcript when its window opens.
- **A child lives as long as the window that started it, or a window showing it.** Starting the
  child's pi from the parent's window attaches the child to that window, so closing the parent
  stops a running child unless a window showing it attached it too. The rule is ADR 0019's, and a
  child is one more session under it.
- **A window destroyed without its close sequence still stops its sessions.**
  `WindowEvent::Destroyed` detaches the window and reaps what only it used, the window-level
  counterpart of `RunEvent::Exit`'s backstop. It was found when a driver-closed window left its pi
  running.
- **A send never rebuilds the history of a pi that is still answering.** A rebuild stops pi, so a
  send from a child's window while the parent's window writes that child's run would kill the run.
  pi refuses a prompt while it streams unless told to steer or queue it (pi 1.0.4), so the history
  sync refuses the rewrite and the send is abandoned with that reason.
- **On reopening a parent,** each child pi is asked whether it streams. A running one is followed
  again from its saved document; the rest show done.

## Consequences

- **Not carried:** the children's usage rolled into the parent's (the app shows no usage at all).
- **Model and effort are carried:** a child starts on its parent's model and effort, which the
  parent's window sets before the child's first prompt.
- **A menu click goes to the focused window only** (`menu.rs::target`), so one click acts in one
  document. With every window minimised it goes nowhere.
- **The menu has no New Window.** A window is a document here, and a second window on the same
  document is refused by design — its label focuses the one that exists — so the item could only
  repeat New Document. New Document and Open… are how a window is made.
- **Opening a parent starts one pi per child,** in parallel, to ask its state. A page with many
  children pays that once per open.
- **Two ids that differ only in a dot** (`notes.v2`, `notes-v2`) share a window label, because a
  label cannot hold a dot. Not addressed; ids the app makes never contain one.
