# ADR 0055 — The face block is an app line, built at the send from a key log

**Status:** accepted (2026-11-17). Where the face is read, and with what, is ADR 0058's, which
lands with the detector it describes; this ADR is everything after the detector. Amended by
[ADR 0059](0059-what-the-camera-reads-and-what-was-sent-can-be-looked-at.md): the filter's numbers
are the user's to set, with the measured ones as the default.

## Context

Two experiments (`evals/spikes/face-format/results/`) settled what the agent is told of the
user's face: a few lines of plain words at the end of the message, movements and never feelings,
written by a fixed rule with no model in between. They ran on timelines written by hand. The app
has to make one from what it can observe: a detector that says what the face did from when to
when, and a keyboard.

The format ties a movement to words, not to a clock ("while typing `the same timeout`"), so the
app must know when each part of the final message was typed. Nothing in the canvas said so:
`doc-draft` is debounced and carries the whole document. And the block must reach pi without
becoming part of the conversation: the document is the history (ADR 0002), so anything a send
adds that the document does not hold reads as an edit at the next send, and rewrites pi's
history before every prompt.

## Decision

1. **The format is the app's, and normative.** `docs/face-format.md` is the specification: the
   timeline a detector writes, the filter, the block. `src/document/face.ts` implements it and
   the experiment's harness imports it, so the app sends the wording that was measured.
2. **The block is an app line, like `[now: …]` (ADR 0028).** A send puts it after the
   `[attached: …]` lines and before the time line, a blank line above it. It is never written
   into the document. `withoutAppTail` (`src/document/turn-context.ts`) drops it wherever a user
   message is read as what the user wrote: `serializeUser` (so pi's echo, a transcript read back
   and a rebuild carry none), the history compare, and a `canvas_edit` quote. It recognises a
   block by its whole shape: the `[face]` line after a blank line, followed to the end by lines
   the wording itself writes, down to the movements' words. A `[face]` the user typed above their
   own prose stays theirs (`docs/document-format.md` §Serialization rules).
3. **The canvas reports a prompt's edits; the page keeps the log.** `prompt-edit` carries each
   change to one prompt's body as it was made: where, what went, what came, how
   (typed, pasted, removed, undone, composed), and when. It carries the change and no other
   text, is raised whether or not anything listens, and names the prompt by how many prompts
   stand above it. The page's face module (`app/face/`) keeps a log per prompt, only while the
   preference is on.
4. **A log is trusted only if it replays to the body being sent.** A prompt's ordinal changes
   when a block is added or removed above it, and some changes are never reported (the machine's
   own splices, an edit that crosses blocks). So the log starts from the body the prompt had
   before its first edit, and at the send it is replayed: if the result is not the body as the
   document holds it, the log is dropped and the message goes with no block. Space at the body's
   end is not compared, because a turn opening under a prompt moves the blank lines below it.
   The cost of a miss is silence, never a face tied to the wrong words.
5. **Only text typed key by key has a time** (`src/document/keystrokes.ts`). Text that was there
   before the log, pasted, composed, brought back by undo, or that arrived more than a few
   characters at once (dictation, a completion) is tied to no face. A gap between keys over 2 s
   is a pause, over 60 s is the user gone. Text typed and then removed is remembered when it was
   two words or more, typed, and not in the message at the end: words moved or typed again were
   not taken back.
6. **A step of the face is tied to what the keyboard was doing meanwhile**
   (`src/document/face-assemble.ts`): a pause when most of it fell inside one, removed text when
   most of it fell while that was typed, otherwise the words of the final message typed while it
   lasted, grown to whole words. A step the keyboard was doing nothing under is left out: it
   says nothing about the message.
7. **A send never fails or waits for the face.** `renderFace` does not throw, an entry whose
   text the message does not hold is left out, and a block has at most six lines, the strongest.
   A prompt that is a command (`/…`) carries none: its arguments are not the app's to add to. A
   subsession's prompt carries none. The log of a prompt is forgotten once pi has taken its
   message, so a prompt sent again later carries only what was typed since. That includes the
   retry of a request the provider refused after pi took it: it goes with no block, which is
   silence and not a stale face. A prompt pi itself would not take (no model, no sign-in) keeps
   its log, and sent again it carries the block of the same typing.
8. **The preference is `face`, app-wide, off by default** (ADR 0048), and it decides two things.
   The page keeps no log and builds no block while it is off. And Rust appends
   `pi-extension/face-guidance.md` to pi's system prompt only for a pi started while it is on,
   read at each start as the draw mode is (ADR 0044), so every start gets it: the first, the one
   after a history rebuild, a subsession's. A pi that will never see a block is told nothing of
   one. When the preference changes, the window's pi is stopped quietly once no turn runs, as a
   sign-in change stops it (ADR 0034), and the next send starts one that knows.
9. **The detector is a seam, and a driven run's face is a script.** `app/face/detector.ts` is
   what the module asks: start, stop, clear, the steps so far on the page's clock. A driven
   debug build's detector plays the script in the file `PIARY_FACE_SCRIPT` names
   (`app/face/scripted.ts`), and with no script nothing watches and no message carries a
   block. What watches in every other run is the camera, which is ADR 0058's.
10. **Codes 84 and 85 are worded as movements**: "head moved side to side", "head moved up and
    down". FACS calls them a shake and a nod, which are meanings and differ by culture. The
    reading test was run again with those words (`results/rendering.md`).

## Consequences

- pi's transcript holds a sent block until the conversation is next rewritten; a rebuild writes
  the document's text, which has none. That is the time line's behaviour too.
- A user's own prompt that ends in literally a valid block is read without it. Accepted, as for
  the time line: the shape is specific enough that it is not prose.
- A message whose body pi is handed in other words has no block: a line escaped because it looks
  like a marker, or a prompt run again with its cell-values prefix replaced. Rare, and silent.
- A change of blocks above a prompt while it is being written (a steer's echo landing above the
  tail) starts its log over: what was typed before has no time.
- With the preference on, the guidance costs its length on every turn
  (`tests/contract/guidance-budget.test.ts` holds it), whether or not a message carries a block.
- Its last paragraph speaks of a message that is only a block. Nothing sends one yet; it is kept
  because the text is the one the experiments measured.

## Alternatives rejected

- **The block as document content**, behind a marker. It would make the face part of the
  history, show it in every other markdown tool, and send it again on every rebuild.
- **Timing keys from `doc-draft`.** Debounced by 150 ms and whole-document: a diff per draft
  cannot say which key was when, nor what was pasted.
- **A stable id per prompt for the log.** The format has none, and adding one to hold a log that
  lives for one draft would put a marker in the file for the app's convenience. Replaying is
  cheaper and fails safe.
- **Passing the guidance flag from the page at `pi_start`.** Three call sites start pi with no
  arguments, the restart after a rebuild among them; one that forgot would silently start a pi
  that does not know the block.
