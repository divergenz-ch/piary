# ADR 0037 — The first run is a tour document, and the chrome points at what to do next

**Status:** accepted (2026-11-14). **Amended by [ADR 0038](0038-the-first-run-is-a-splash-and-a-guided-walk.md)**: a first run opens on a
splash and a guided walk of this tour, whose steps replace the one-time hints of §5.

## Context

The app's first run has onboarding's job: a
newcomer's first run puts them in front of a working conversation before they have read or
configured anything, and a missing credential fails visibly rather than gating (ADR 0011). What met
it was a minimal first run: one `pi:note` of four paragraphs and an empty prompt, with the design
left open. That note explained the canvas rather than showing it, and named a terminal sign-in
ADR 0034 has since replaced.

Three questions were open: whether onboarding is a document or chrome around the canvas,
where sign-in sits when pi has no provider, and how a newcomer finds the pieces of chrome a document
cannot point at.

## Decision

**The first run is an ordinary document — a short tour — and three pieces of chrome are pointed at
once each.**

1. **The tour is a Piary document like any other**, editable, re-runnable and deletable. The main
   window opens on it when the store holds no `welcome` document; a stored one is never overwritten.
   **Help → Welcome to Piary** opens a fresh copy, as a new conversation, at any time.
2. **It shows rather than tells, in an order that always works.** First a cell the reader can drag,
   which runs in the page with no pi and no credential. It keeps its slider and its sentence in one
   expression and exports no name: a named export would put a `[cell values]` line in front of every
   prompt sent from the tour (`document-format.md` §Snippets); then a seeded prompt and its answer, to edit
   and send again in place; then an empty prompt. The prose around them is `pi:note`.
3. **The seeded exchange is real history.** Its prompt and answer reach pi as a turn on the first
   send's rebuild (ADR 0002), as any prompt on the page would. The notes never do: a note is never
   sent as something the user said (`document-format.md` §Notes).
4. **A missing provider is said loudly at the bottom right, and only after pi has said so.** When a
   prompt is refused while `get_available_models` answers an empty list — the condition that already
   raises the inline Sign in ask — a red **Sign in** button appears beside the model chip and the
   chip's pills blink red with it. The button opens the sign-in panel (ADR 0034). It goes away when a
   sign-in changes what pi holds, or when pi accepts a prompt. No pi is started to find out sooner:
   the chip is still never the reason a pi runs.
5. **Three one-time hints** point at the conversation list, the model chip (only once pi has named a
   model, and never while the Sign in button shows) and the first answer's `⋯`. One shows at a time;
   each, once dismissed — or once the reader clicks what it points at — never shows again. A hint
   sits under the status line: a notice says something went wrong, and nothing covers it.
   Which have been seen is presentation state in `localStorage` (`piary-hint:<name>`), like the
   effort pick — ADR 0018's objection is to a second copy of the document, which this is not.
6. **Motion is optional.** Under `prefers-reduced-motion: reduce` the Sign in alert is steady red.

## Consequences

- A first send from the tour carries its example exchange into pi's history. It is short and on the
  page, so the agent's reading of it is the reader's.
- The app-page spec that held the welcome out of pi's history now holds the notes out and the seeded
  prompt in.
- A reload loses the Sign in alert; the next refused send raises it again. Nothing stores it.
- A newcomer with no provider meets the refusal on their second interaction, not their first: the
  cell is first because it cannot fail.

## Lessons

- **A cell's export is a message prefix.** The draft split the slider and its sentence into two cells
  sharing a name, which would have put the slider's value in front of every prompt sent from the
  tour. A tour cell says what it shows and exports nothing.
- **Chrome over chrome.** A hint drawn above everything covered the status line's dismiss; the
  status-line spec, which asserts a notice is the topmost thing where it is drawn, is what caught it.
- **An empty canvas does not explain a canvas.** The minimal first run described what the page is;
  the tour makes the reader do the three things that make it not a chat.
