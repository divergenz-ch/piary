# ADR 0057 — The face is switched from a pill beside the model, after the user agrees to what is sent

**Status:** accepted (2026-11-18). Amends [ADR 0058](0058-the-face-is-read-in-the-page-and-only-words-leave-it.md):
its decision 8 (a camera that cannot be had is said once, on the status line) is replaced by
decision 4 here, and its decision 7 gains a condition (decision 2 here). Amended by
[ADR 0059](0059-what-the-camera-reads-and-what-was-sent-can-be-looked-at.md): the pill has a panel
of its own beside its menu, and the sheet says where what was sent is seen.

## Context

Reading the user's face (ADR 0058, ADR 0055) had one control: a switch in the Preferences window.
That left three things wrong. A camera that reads a face was turned on by a tick box whose hint is
one line, with nothing saying what is sent, to whom, or how long it is kept. Nothing in the
window the user types in said whether the camera was on, off for now, or failing; a refusal was a
line on the status bar, said once and gone. And the system's first camera on a Mac beside an
iPhone can be the phone, which wakes to be one.

## Decision

1. **A pill in the model chip, last, right of the effort** (`app/face/pill.ts`). An icon and no
   words, so the chip grows by one small button. How it is drawn says where the reading stands,
   and its menu says the same in a sentence, with what can be done about it. What it shows is
   decided by pure rules (`app/face/state.ts`):

   | State | When | Menu offers |
   | --- | --- | --- |
   | off | the switch is off | Turn on |
   | ask | on, not yet agreed to (decision 2) | Read what is sent…, Turn off |
   | idle | on, the camera off until a key | Turn off |
   | starting | the camera is coming on | Turn off |
   | watching | the camera is on and a face is read | Turn off |
   | no face, two faces, head turned | the camera is on and nothing is read | Turn off |
   | no camera | none found | Try again, Turn off |
   | refused | the user or the system said no | Open System Settings, Turn off |
   | failed | the reason the camera gave | Try again, Turn off |

   Why nothing is read comes from the gates the reading itself goes through
   (`seenIn`, `src/document/face-episodes.ts`), so the pill cannot say a face is read while the
   reading drops it. The switch is still the app-wide `face` preference: the pill, the
   Preferences window, Conversation → Read My Face and `/face` all write the same key, and every
   window follows it.

2. **Nothing reads a face until the user has agreed, once, to what is sent** (`faceExplained`, a
   preference with no row in the Preferences window). Turning the switch on for the first time
   opens a sheet in the document, as sign-in does (`app/face/sheet.ts`): what is read (movements,
   never feelings), that the picture never leaves the window and is never stored, what is sent
   (an example block) and that most messages carry nothing, to whom (the provider of the model
   that answers, with the message), and that pi's transcript keeps it until the history is
   rewritten. *Turn on* keeps both keys; *Not now*, or Escape, keeps the switch off. A face switched on
   elsewhere and not yet agreed to (in the Preferences window, or by a build from before this)
   reads nothing and tells pi nothing (Rust's `Preferences::reads_face` is both keys), and the
   document window in front shows the sheet by itself: when the change arrives, when the
   window opens, or when it is come back to. Once for each time the switch is found so, never
   at a key, and never while the tour walks. Until it is answered the pill shows `ask`, whose
   menu opens the same sheet. The Preferences window's row says a document's window will ask.

3. **Which camera is read is chosen, and never a phone unasked** (`pickCamera`). The camera the
   user chose, by the system's label, while it is there (`faceCamera`); else the first that is
   this Mac's own, a label naming an iPhone, an iPad, Continuity or Desk View being passed over;
   else none, said as "no camera". With more than one camera the pill's menu lists them, once a
   camera has been read: before the system has allowed the camera it names none. A camera
   plugged in or pulled out while one is read starts the choice over. The label is kept, not the
   device id: the id is the webview's and is not known to survive a relaunch.

4. **A camera that cannot be had is the pill's to say**, for as long as it is so, and not the
   status line's. The message goes without a block. A refusal offers System Settings through a
   command of its own, `open_camera_settings`, whose address is fixed in Rust: `open_url` takes
   web addresses only, and a page that could name another scheme could name an app to run. When
   the window is come back to, a camera that was refused, absent or failing is let go, and the
   next key asks for it again.

5. **The tour reads no face.** While the tour walks a window no key starts the camera, its send
   carries no block, and the switch is held with every other menu item.

6. **A narrow window keeps the pills.** Under 44rem the session's totals leave the chip, and
   under 34rem the context meter too, before the chip would reach across the text or wrap.

## Consequences

- Two new preferences, `faceExplained` and `faceCamera`, neither a switch: the Preferences
  window's table says of each that it has no row there and where it is set, and the compiler
  still refuses a preference the window has not decided about.
- A user who had the switch on before this is shown the sheet when a document window opens,
  and nothing is read until they have agreed.
- The Preferences window's switches take no click until what is kept has been read: before
  that it would show the defaults for a moment, and a click then would be written over them.
- The detector seam says more (`app/face/detector.ts`): where the source stands, what is in view
  now, and the cameras there are. A script can say all three (`app/face/scripted.ts`), which is
  how every state above is held by a page spec with no camera.
- The sheet does not say where to see what a message carried: nothing shows that yet. When
  something does, the sheet gains the sentence.
- **Before the system has named the cameras, the first one opened is the system's own
  choice.** A webview learns the cameras' labels only once the user has allowed the camera, and
  asking for any camera is what makes the system ask. So the first start after the grant, and
  the first of any launch in which the webview lists no labels, opens the system's default for
  a moment, which may be a phone; it is closed and the Mac's own opened as soon as the names
  are known. Whether a phone wakes for that moment is a step of the manual smoke test.
- The camera's choice and its change under a running read are not held by any automated layer:
  no layer has a camera. They are steps of the manual smoke test.
- "Window not in front" is not a state of the pill. The camera goes off at once when the window
  is left, and the pill shows `idle`, whose sentence (the camera is off until you type) is true
  of it.

## Not chosen

- **A per-conversation switch.** The preference is the user's, wherever they work (ADR 0048);
  a conversation that must not be read is one the switch is turned off for while it is in front.
- **The sheet opened at the first key.** It would land in the middle of typing.
- **The sheet opened only from the pill**, for a face switched on in Preferences. Built first,
  and the first person to try it switched the face on in Preferences, typed, and got no camera
  and no word of why: a small dashed icon at the window's edge is not found.
- **Agreement in the Preferences window.** A tick box beside a line of hint is what this
  replaces.
- **`open_url` widened to the settings scheme.** One fixed address does not need a rule about
  schemes, and the rule it has is why a page cannot open an app.
- **A popover of the pill's own.** The page has one menu (`app/menu.ts`); it gained a row that
  is a sentence.
