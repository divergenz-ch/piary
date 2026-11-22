# ADR 0059 — What the camera reads and what a message carried can be looked at, and what is passed on is the user's to set

**Status:** accepted (2026-11-21). Amends [ADR 0057](0057-the-face-is-switched-from-a-pill-beside-the-model-after-the-user-agrees.md):
the pill has a panel of its own beside its menu (decision 1 here, against that ADR's "Not
chosen"), and the sheet says where what was sent is seen. Amends
[ADR 0058](0058-the-face-is-read-in-the-page-and-only-words-leave-it.md): its decision 1 gains the one way
the camera's picture is shown (decision 5 here). Amends
[ADR 0055](0055-the-face-block-is-an-app-line-built-at-the-send.md): the filter's numbers are a
preference with the measured values as its default (decision 2 here).

## Context

A message may end with a `[face]` block (ADR 0055), read by a camera in the page (ADR 0058),
switched from a pill beside the model (ADR 0057). The user could see that the camera was on,
and nothing else: not what it made of their face, not what a message was about to carry, and
not what one had carried, which stands only in pi's transcript. The first real use showed
readings the user could not explain (a held frown reported in pieces, a frown read as a tipped
head), and every threshold was one person's face in one light. A feature that sends what a
camera saw has to show its work.

## Decision

1. **A panel of the pill's, not a menu** (`app/face/inspector.ts`), opened from the pill's menu
   by *What is read and sent…*. It has no backdrop and takes no focus from the document: the
   camera is on only while the user types (ADR 0058 decision 7, unchanged), so what it shows
   is what typing does, and a menu would close at the first key. It shows:
   - each expression unit's level against the face's own rest, as a share of that unit's range,
     through the gates the reading itself uses (`levelsAt`): a unit that is not read, because
     the head is turned or the mouth is talking, says so;
   - what the reading found in the last 30 seconds, each stretch in the block's own words,
     the ones not passed on struck through with why: a blink, too weak, too short
     (`inspected`, over `dropOf`, which is `filtered`'s rule said of one step);
   - the block the message being written would end with as it stands. This is the send's own
     code path asked without its effects: no log is dropped and nothing is marked as asked.
   The pill carries a mark while that block is not empty.

2. **What is passed on is set there**, applied as it is changed and kept as the `faceTuning`
   preference: the weakest intensity (slight, marked, severe), the shortest hold (0.3, 0.5, 1
   or 2 s), and how far the head may turn and tip before the face is not read (8° to 25°, 6°
   to 20°). The measured values are the default and *Reset* goes back to them. Each part is
   held to the values offered (`readingOf`): a number from nowhere would be a reading nobody
   measured and no control shows. The intensity is a floor of the reading, not only a filter
   after it (ADR 0058), so a detector reads at whatever is set when it is asked. It has no row
   in the Preferences window: it is set beside what it changes.

3. **What a message carried is read back from pi** (`app/face/sent.ts`): a block's menu has
   *face: what was sent*, once the user has agreed to a face being read. It asks pi for its
   entries, finds the prompt by how many prompts stand above it, and shows the block its
   message ends with, word for word, split off by the same rule that strips it
   (`faceBlockOf`, beside `withoutAppTail`). The app keeps no copy of its own. A history
   rewritten since holds the document's text and no block, and nothing tells that from a
   message sent with none: one sentence says both. A prompt pi does not hold as the document
   has it (edited since, never sent) is said as not known.

   Under a block that was sent the menu asks whether it was right about the user: *It was
   right*, *It was not*. Only the two counts are kept, in the window's own storage, and the
   panel says them. How often a sent block was right is what says whether the reading earns
   its place, and which of its weaknesses is worth the work.

4. **A key turns the reading off and on: ⌥⌘F**, on Conversation → Read My Face. It is the
   switch itself, which stays where it is put as Caps Lock does: off, nothing is read and no
   message carries a block until it is pressed again. There is no opt-out for one message:
   a message that must go without is sent with the switch off.

5. **The camera's picture is shown only when asked for**, to sit in frame: *Show camera* in
   the panel, mirrored, gone when the panel closes. It is the camera source's own video
   element moved to where the user looks (`SampleSource.picture`); nothing outside
   `app/face/mediapipe.ts` creates it, holds its stream or reads a frame from it. A script has
   no picture and the row is not shown.

6. **The sheet says where to look**: a message's block menu for what it carried, the pill's
   menu for what is read as one types.

## Consequences

- The detector seam says more (`app/face/detector.ts`): `inspect(now)` and `picture(host)`.
  A script of steps is inspected as far as it has played, which is how page specs hold the
  panel with no camera.
- "A fixed filter" is now "a filter with measured defaults": `docs/face-format.md` §The
  filter says so. The block's wording is unchanged, and a line at any intensity is still one
  `isFaceLine` knows, so a block passed on at slight is stripped like any other.
- Set to slight, the agent is sent lines its guidance tells it change nothing
  (`pi-extension/face-guidance.md`). The guidance is not changed for it.
- Working out what a draft would carry reads everything watched since the last message: a
  sixth of a second for a draft of twenty minutes. It is done at most every three seconds,
  every second while the panel is open, and at once when something other than time changed it.
- Switching with the key is switching the preference: every window follows, and this
  window's pi is stopped once no turn runs, since what it is told changes (ADR 0055). A user
  who flips it often pays a pi start each time.
- Asking what a message carried starts this window's pi if none runs, as reading anything
  else out of its transcript does.
- The panel's live half (levels, the picture) has no automated layer: no layer has a camera.
  It is a step of the manual smoke test.
- The panel does not hold the camera on. With no key for twenty seconds the levels go and the
  panel says the camera is off until a key.

## Not chosen

- **The panel as rows of the page's one menu.** A menu closes on a choice and takes the
  keyboard; this has to stay open under typing and take four settings in a row.
- **Holding the camera on while the panel is open.** It would be the first way to light the
  camera without typing, and the sheet the user agreed to says the camera is on only while
  they type.
- **A store of sent blocks.** pi's transcript already holds each one for as long as the
  history is not rewritten; a second copy is a second place a face's record is kept.
- **An opt-out for one message** (*Send this message without it*, resetting once pi took a
  message). Built first, and not wanted: a state that ends by itself is one more thing to
  keep track of, and the switch under a key does the same with nothing to remember. ⌥⌘⏎,
  which was meant for it, already continues the current block in the canvas.
- **Per-step reasons for "head turned" and "talking".** Those are stretches where nothing is
  read, not steps that were dropped: they are said live, on the levels, and by the pill.
- **Free numbers for the settings.** A few values on either side of the measured one are
  enough to find a face's own, and a value typed in is one no control shows back.
