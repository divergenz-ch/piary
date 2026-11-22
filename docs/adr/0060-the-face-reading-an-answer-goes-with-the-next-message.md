# ADR 0060 — What the face did reading an answer goes with the next message

**Status:** accepted (2026-11-21). Amends [ADR 0058](0058-the-face-is-read-in-the-page-and-only-words-leave-it.md):
its decision 7 (the camera is on only while typing) gains the seconds after an answer appears.

## Context

The face format has a line for reading (`docs/face-format.md`): what the face did in the first
seconds after the previous answer appeared. The experiment settled its window at four seconds,
with no claim about where the reader looked (`evals/spikes/face-format/results/reading.md`). The app sent only what the face did while typing: the
camera came on at a key, and the reaction to the answer was over by then.

## Decision

1. **A turn that ends opens a reading**: four seconds (`READ_WINDOW_MS`) from the moment pi is
   done with the turn. The camera comes on for it and stays two seconds past, so a movement
   that ends at the window's edge is seen to end. This is the first time the camera is on
   with no key: the sheet the user agrees to says so.
2. **Only when the user is at the answer.** No reading opens while the window is not in
   front, while the tour walks, when the turn wrote no new answer (it failed, pi handled a
   command, pi refused the send: the answer standing last is the one from before), when the
   answer is scrolled out of sight (`DocumentChat.shows`), or when the user typed within the
   last two seconds, which is writing and not reading. A reading whose answer is out of sight
   when the window closes is dropped. The gates of the reading itself still apply: a head
   turned away, a second face (`face-episodes.ts`).
3. **The first key ends it.** From there the face is the writing's: a step that crosses that
   moment is the reading's up to it and the typing's after (`assemble`'s `reading`). So is the
   camera going off under it, as when the window is left.
4. **It goes with the next message, once**, as the timeline's `read`, timed from when the
   answer appeared: the block's `read` lines, before the typing lines. A message with no key
   log (pasted, or typed in another editor) can still carry it, since it is tied to no words.
   When pi takes a message the reading is gone, sent or not.
5. **Not when it is stale.** A message sent more than two minutes after the answer appeared
   (`READ_FRESH_MS`) carries no reading: the user has been elsewhere, and the line would
   claim a reaction the message is no longer about.
6. **What the draft would carry includes it**, in the panel and in the pill's mark, before a
   word is typed.

## Consequences

- The window opens when the turn settles, not at the answer's first word. For a long answer
  that streams for a minute the reaction to its start is not seen; what is seen is the face
  at the finished answer. Opening at the first word would hold the camera on for the whole
  stream.
- A steer or a follow-up sent while a turn runs carries no reading: the one before it went
  with the message that started the turn.
- The reading is read against the same rest as everything else, which the last message's
  typing left: the first answer of a session, after a first message typed in under two
  seconds, may be read blind.
- A real camera takes a moment to start, and that moment is taken out of the four seconds:
  the reading is of what is left. How long it is on this Mac is a step of the smoke test.
- pi's guidance says a movement tied to no words changes nothing, and a `read` line is tied
  to none. The experiment's reading cases ran under that same paragraph and the block still
  moved answers, so the wording is left alone here; changing it owes an eval run.
- "On screen" is any part of the answer inside the scroller. Where on it the user looks is
  not known, which the format says of itself.
- A user who agreed to the sheet before this agreed to a camera that is on only while they
  type. Whether they are asked again is open: the app does not ask.

## Not chosen

- **Opening at the answer's first word.** See above.
- **Sending a reading by itself, with no message.** That is the agent speaking first, which
  is a change to the interaction and its own decision.
- **Keeping the reading for a later message when the next one is a command.** A command
  takes it with it: one rule for when a reading ends.
