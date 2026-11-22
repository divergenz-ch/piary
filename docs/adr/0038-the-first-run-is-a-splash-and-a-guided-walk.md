# ADR 0038 — The first run is a splash, then a guided walk the reader cannot wander out of

**Status:** accepted (2026-11-14). Amends [ADR 0037](0037-the-first-run-is-a-tour-document-and-chrome-hints.md):
its tour document stands; its one-time hints (§5) are replaced by the walk's steps, and what makes
a first run is restated here.

## Context

ADR 0037 opened the main window straight onto the tour document and left the reader to follow its
prose ("change three to five"), with three one-time hints at the chrome. Used for real, it fell
short three ways:

- **The hints walked through someone else's conversation.** The main window's document is always
  `welcome`. For a user with conversations already, the stored `welcome` is their own, and the hints
  were gated only by "not seen yet", so the block-menu hint pointed into an unrelated conversation.
- **Prose is a poor pointer.** A sentence naming a word to change makes the reader hunt for it. An
  arrow at the word does not.
- **A tour that can be wandered out of is not followed.** With the whole app reachable, a newcomer
  clicks elsewhere and the tour's order is lost.

The user also wants a place before the canvas that later work can grow into: sign-up, a tip of the
day.

## Decision

1. **A first run is the main window with nothing stored under `welcome`**, decided from the store
   alone (`app/boot.ts`). Only then does the window open on a **splash** — *Take the tour* or
   *Quit onboarding* — before the canvas can be used. Finishing or quitting stores the tour
   document, which is what ends the first run. A user whose `welcome` is already a conversation
   never sees the splash.
2. **A walk is tied to one document.** The splash starts it on `welcome`; **Help → Welcome to
   Piary** writes a fresh copy, and a window whose stored document is still that untouched copy
   walks it with no splash. A reload mid-walk resumes it from the window's session storage. No
   other document is ever walked through, and nothing about the walk is kept anywhere that
   outlives the store.
3. **Each step cuts out what it is about, points a small arrow at it, and lets through only what it
   asks.** The rest of the window is covered: four panes around the cutout take the pointer, a
   fifth covers the cutout on a step the reader only reads. Keys are filtered before the canvas sees
   them (`app/onboarding-steps.ts`): the slider step takes none, the edit step takes characters,
   deletes and horizontal moves only, the send step adds ⌘⏎. Native menu items are held too, by the
   same rule (`setupMenubar`'s `held`), save excepted. Until what a step points at is drawn, the
   whole window is covered; a target that never comes (a cell that failed) is passed after a few
   seconds rather than stranding the reader.
4. **The steps:** drag the slider → change *three* to *five* (the arrow at the word, selected) → ⌘⏎
   → the answer's `⋯` → the conversation list, when shown → the model chip → the empty prompt,
   where a send or *Finish* ends the walk. A step finished by doing it advances by itself; a step the
   reader only reads offers *Next*, and so does the edit step once the question was changed some
   other way.
5. **The send forks through Sign in and joins back.** A send pi refused for want of a provider leads
   to a Sign in step pointing at the red button. A sign-in that takes leads back to the send, with
   the caret at the question's end, and the question goes to pi again. One that fails or is
   cancelled offers **Try again**, which opens the panel at once, or **Sign in later**; later is also
   offered before trying. A send refused for any other reason offers **Go on with a recorded
   answer**.
6. **Later goes on with fixed input and output.** Whatever the reader wrote in the question and
   whatever stands under it (an error, an answer to another question), the walk rewrites the
   exchange to *Give me five names for a houseplant.* and a recorded answer, as one undoable edit,
   and makes no model call (`recordedExchange`). The question is the first prompt on the page, found
   by position, so one rewritten whole is still found.
7. **Nothing the reader needs is behind the walk.** The sign-in panel is drawn in the document; while
   it shows, the walk stands aside. The status line is lifted over the walk, so a notice stays the
   topmost thing (ADR 0037's "chrome over chrome").
8. **Quit onboarding is on the splash and on every step**, and says where the tour went: *The tour is
   still here whenever you want it: Help → Welcome to Piary.*
9. **The splash has one panel today.** Sign-up or a tip of the day would be panels of their own
   beside it, added with a consumer — no empty slot is built for them.

## Consequences

- A recorded exchange is history like any other: the next send rebuilds it into pi's session
  (ADR 0002), so pi takes the recorded answer as its own. It is on the page and short, as the seeded
  exchange is (ADR 0037 §3).
- The splash is a gate in front of the canvas on a first run, which ADR 0011 otherwise refuses. It
  is one click to pass either way and never stands for a missing credential: a missing provider still
  fails in the open, at the send.
- The tour document is still an ordinary document. With the walk finished or quit, it behaves as ADR
  0037 describes, and its prose still reads on its own in another editor.
- The real-app specs (`wdio.conf.ts`) start from a stored `welcome`, so they open on a conversation;
  the walk is held by the app's page specs.
- A fresh document directory (`PI_DOC_DIR`) is a first run, whatever the webview remembers; a
  Help → Welcome copy quit before anything in it changed is walked again when reopened.

## Lessons

- **The webview's storage is not the user's state.** Kept in `localStorage`, "the tour was
  finished" outlived every launch and every document directory, so a fresh store opened with no
  splash. What the walk depends on lives where the documents do.
- **A walk checked only in a test page is not checked.** Drawn in the real app, the cutout stood
  where the slider had been before the cell laid out (the frame loop had died with the window
  hidden), the slider's cutout spanned the page, and the sign-in panel opened below the fold, so
  its button seemed to do nothing. Screenshots of every step in the real app found all of them.

- **"Not seen yet" is not "a newcomer".** A hint gated on its own flag fires wherever the user is;
  what marks a first run is the store, and what marks a tour is the document it was armed for.
- **A turn can be over before a frame sees it.** A step that waited to see the turn running missed
  one that started and settled between two frames; it now also counts an answer that changed since
  the send.
- **Read the step at the keystroke.** A ⌘⏎ typed right after the change the edit step waited for was
  held, because the step had not advanced since the last frame. The gate advances first, then
  decides.
