# ADR 0068 — A driven run is handed real pointer, wheel and key events from inside the app

**Status:** accepted (2026-11-23). Builds on [ADR 0014](0014-native-application-tauri.md), which
records what WebDriver on macOS cannot do, and keeps the rule of
[`TEST_ARCHITECTURE.md`](../TEST_ARCHITECTURE.md) §6 that a driven run never takes the user's
focus.

## Context

The real app is driven through an embedded WebDriver server (ADR 0014). On macOS that server
makes a click or a key in the page, by script. Three things follow, and each was measured:

- **Nothing hovers.** No pointer exists, so `:hover` never holds and `mouseover` never fires.
  Whatever the canvas shows only under the pointer (a block's grip, the `+` between blocks) is
  never on the screen of a driven window.
- **The engine does no work for a click.** It hit-tests nothing, moves no focus and places no
  caret: whatever sends the click has to imitate all of that, and an imitation is only as good as
  the cases someone thought to compare. A press on the outer half of a glyph, which the engine
  takes as a press beside it, went unnoticed for that reason.
- **The page is told the event is not trusted**, and text entry and chords do not arrive
  reliably at all, which is why layer 4 asserted no keystroke.

The obvious way to a real event, posting one to the system, is closed: it moves the user's
cursor and lands in whatever app is in front, and a driven run is one the developer works beside.

## Decision

1. **A driven build has one more command, `harness_pointer`, that hands its own window an event
   as the system would.** It takes a `HarnessEvent` (`src-tauri/src/wire.rs`): a move, a press or
   release of the left button with its click count, a turn of the wheel, a key down or up with
   what it types, its key code and the modifiers held. Points are the page's CSS pixels.
2. **The event is made in the process and given to the web view's own responder methods**
   (`mouseDown:`, `mouseUp:`, `mouseDragged:`, `scrollWheel:`, `keyDown:`, `keyUp:`), which is
   where a real event ends up. It never enters the system's event stream. WebKit then does what it
   does for a hand: it hit-tests, hovers, focuses, places the caret, decides whether a click
   follows, types, scrolls; and the page sees `isTrusted` true.
3. **It exists only where the WebDriver server does.** The AppKit half
   (`src-tauri/src/native_input.rs`) is compiled only into a debug build with the `e2e` feature.
   The command is registered in every build, so the IPC surface is one list, and refuses unless
   `harness::driven` holds: the feature, a debug build and `PIARY_E2E=1`.
4. **What an event is and where it lands is pure** (`harness::native_event`, driven by
   `cargo test`); the module that sends it holds the messages and nothing to decide.
5. **The answer says what the event left of the user's own**: the cursor's position before and
   after, and whether the window was the key window after. A spec holds both
   (`e2e-app/pointer.spec.ts`), beside the check every spec file already runs that the app was
   never in front (`e2e-app/helpers/focus.ts`).
6. **The page has no call for it.** Nothing in `src/bridge.ts` names it; a spec reaches it through
   the driver (`Driver.pointer`, `Driver.click` in `e2e-app/helpers/instance.ts`), and the
   contract test records why the page does not (`tests/contract/ipc.test.ts`).

## What was measured, and is now relied on

Each line was a wrong first guess.

- **Only the web view's own methods deliver.** `-[NSWindow sendEvent:]` and
  `-[NSApplication sendEvent:]` delivered no mouse event to a driven window, with the window
  ignoring the mouse (as a driven one does, so the user's clicks pass through it) and with that
  switched off for the event; why was not found. Handing the event to the view needs no change
  to the window.
- **A move is sent as a left-mouse-dragged event with no button down.** A mouse-moved event
  handed to the view of a driven window reached the page as nothing, by every route; a dragged
  one reaches it as a `mousemove` with no button, and hover follows.
- **The view runs under the title bar.** The page's top is below the view's by the difference
  between the content view and the window's content layout rect.
- **AppKit has no constructor for a scroll.** A Quartz scroll event is made, converted with
  `+[NSEvent eventWithCGEvent:]` and released; it is never posted. The converted event has no
  window, and the web view reads its location as window coordinates, so the point is given to
  Quartz as the point in the window, turned top-down.
- **A key needs no key window.** A key-down handed to the view types, and Tab moves the focus,
  while `document.hasFocus()` is false.
- **A press is held.** A release sent in the same instant gives the page no time to answer the
  press, and hides what a real press does.

## What it does not do

- **A drag with the button held.** Between a press and a release handed over this way, every
  move still reaches the page with `buttons` 0, and an editor that follows a drag by its
  `buttons` drops the selection: a press, four moves and a release selected nothing.
- **A composed character.** A dead key reaches the page as a dead key and composes nothing: the
  key after it types its own letter. An event that names the finished character types it.
- **A menu's chord, as far as is known.** A key handed to the view does not go the way a pressed
  one does, through the application and its menu bar first. Whether a chord of the menu bar
  reaches its item this way was not measured, and nothing relies on it.
- **Make the window drawn.** A transition, an animation frame or a timer of a window that is not
  being drawn (a locked screen; another app full-screen in its own Space) stands still whatever
  events arrive. A spec holds what script sets, not what fades in.
- **Make the window the front one.** `document.hasFocus()` stays false and the canvas draws no
  caret. That is the rule kept, not a gap left.

## Consequences

- Layer 4 can hold a hover, a real click and a real key where only the real app joins the
  halves. Which command a chord means is still a pure question, and the page layer is still
  where key handling is tested: this is no licence to move those up.
- AppKit and Quartz are called by message and by five C functions, with no new crate:
  `objc2-foundation` gains the `NSGeometry` and `objc2-core-foundation` features for points and
  rects. A message AppKit refuses is a panic in a debug build; the command turns it into a
  refusal, so a caller is never left waiting.
- The rules above are WebKit's and AppKit's as measured on the macOS this was built on. A release
  that changes one shows as `e2e-app/pointer.spec.ts` failing, which is what the spec is for.
