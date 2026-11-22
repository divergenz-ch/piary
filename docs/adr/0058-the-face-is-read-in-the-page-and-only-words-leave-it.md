# ADR 0058 — The face is read in the page, and only words leave it

**Status:** accepted (2026-11-17); amended by [ADR 0057](0057-the-face-is-switched-from-a-pill-beside-the-model-after-the-user-agrees.md)
(decision 8 is replaced: a camera that cannot be had is said by the pill; and nothing is read
before the user has agreed to what is sent) and by
[ADR 0059](0059-what-the-camera-reads-and-what-was-sent-can-be-looked-at.md) (the camera's picture
may be shown to the user, by the detector module's own element) and by
[ADR 0060](0060-the-face-reading-an-answer-goes-with-the-next-message.md) (decision 7: the camera
is also on for a few seconds after an answer appears). Amends [ADR 0015](0015-capture-is-a-native-sidecar.md): reading the
camera to analyse a face is not capture and does not go through the sidecar. Recording stays
where ADR 0015 put it.
Its number is later than its date: it was drafted as 0054, the number the cell lock's record
took on `main` first, so ADR 0055 to 0057 cite a record numbered after them.

## Context

Piary can tell the agent what the user's face did while they typed a message: a few lines of
plain words at the end of the message, never in the document (`docs/face-format.md`). Two
experiments settled what those words are and that a fixed rule in the app writes them. What
they left open is where the face is read.

ADR 0015 put every use of the camera in a Swift helper, for reasons that are about recording:
ScreenCaptureKit has no webview equivalent, `getDisplayMedia` is unreliable in a WKWebView,
and a high-bitrate stream should not ride an IPC channel. It also said `getUserMedia` works in
a Tauri WKWebView only with a permission delegate answering.

Reading a face needs something else: expression scores per frame. On macOS the choices are
few. Apple's Vision framework gives 2D landmarks and three head angles and no expression
scores. ARKit's face tracking does not exist on macOS. MediaPipe's Face Landmarker gives 52
expression scores and a head transform, under Apache-2.0, and ships for the web as wasm; its
native Swift package is iOS only. The research toolkits that output facial action units
directly are licensed for non-commercial use.

So the fastest route to expression scores on a Mac runs in the page. Whether the page can
have the camera in a built app was a fact about a running system, and it was measured
(`spike/face/FINDINGS.md` on the spike branch): in a release bundle launched through
LaunchServices, `getUserMedia` resolved on `tauri://localhost` with no handler of ours, the
model loaded from the bundle with no network, and one detection took 19 ms on the CPU
delegate against a camera delivering a frame every 66 ms.

## Decision

**The face is read in the page.** A lazy chunk asks for the camera with `getUserMedia`, runs
MediaPipe's Face Landmarker on the frames, and emits samples: a score per facial action unit,
the head's pose, how many faces. Everything after that is the app's own pure code.

1. **Only samples leave the detector module.** No frame, image or landmark array is written
   to disk, sent over IPC, logged, or handed to another module. A sample is numbers: the
   model's expression scores by name, the head's transform, how many faces.
   `app/face/mediapipe.ts` is the only importer of
   `@mediapipe/tasks-vision`, lint-enforced.
2. **Two seams.** What reads frames is a source of samples (`SampleSource`: start, stop,
   samples, states); another platform, or a native reader on this one, is a second source.
   What the rest of the app asks is a detector (`FaceDetector`: start, stop, clear, the steps
   so far), and turning samples into steps is the app's own pure code
   (`src/document/face-episodes.ts`), the same for every source.
3. **A driven run never gets the camera.** Rust says what reads the face (`face_source`): the
   camera, or in a run a harness drives a script or nothing. A test that opened the camera
   would need a person in front of it, and would light the user's camera while they work. A
   script holds steps, or samples that go through the same reading as the camera's.
4. **The CPU delegate.** As fast as the GPU delegate on the machine measured, without its
   five-second first detection.
5. **Every second frame is read**, 7.5 a second at the 15 the camera is asked for. A
   detection on every frame is what the reading costs; a blink still spans a sample or two.
6. **The model and the wasm ship in the app.** Nothing is fetched while it runs. `pnpm
   face:assets` copies the wasm from the installed package and fetches the model once, held to
   a checksum, into a git-ignored directory the page's build takes in; `pnpm app:build` runs
   it, so a bundle cannot be made without them. A face is read at the version that was
   tested, with no network, as a chart is drawn (ADR 0043).
7. **The camera is on only while it is being used for this**: the preference is on, the
   window is in front, and the user has typed in a prompt within the last 20 seconds. It goes
   off when pi takes the message. Stopping ends the track, which is what turns the system's
   indicator off. The first moment of typing after a stop is not seen: the alternative is a
   camera that is always on.
   What the face looks like at rest is kept across those stops and across messages, as the
   last minute of samples watched: a score is a movement only against a rest, and a message
   that began with none would take a frown worn from its first key for the rest itself. The
   first message after the app starts has no such minute: nothing is read in its first two
   seconds, and an expression held from before them is not seen at all.
8. **A camera that cannot be had is said once**, on the status line: refused, absent, or why
   it failed. The message goes without a block.
9. **Recording is still ADR 0015's.** A capture the user asks for goes through the helper.
   The two never share a stream.

## Consequences

- A new runtime dependency, `@mediapipe/tasks-vision`, pinned exactly, with about 18 MB of
  wasm and model that compress to about 8 MiB in the bundle. The app grows from 5.7 MiB to
  about 14.
- ADR 0015's sentence that a webview camera request is silently denied without a delegate
  does not hold for the wry this app builds against: the default grants, and only the
  system's prompt appears. It may have been true of an earlier version.
- The usage description in `Info.plist` now also has to say that the camera is read while
  typing, not only when recording.
- A signed release needs the camera entitlement under Hardened Runtime. Unverified until
  there is a certificate.
- **What this detector can name is less than the format can say**, and is a property of the
  detector. On recordings of a person making each movement on request, the model's scores for
  widened eyes, a wrinkled nose, raised cheeks and lowered mouth corners did not move, and a
  ratio of landmark distances tried for the mouth's corners moved more with the head's pitch
  than with the mouth, and was taken out again. Its squint score sits high at rest and follows the brows. It cannot tell
  lips pressed from lips rolled in or bitten, so all three are said as pressed. It names brows
  raised and lowered, a smile, lips pressed, the jaw dropped, eyes closed, and the head's
  poses and movements.
- **A turned head moves the expression scores by itself.** Tipped down eight degrees, the
  brow-lowering score rose by 0.17 with no brow moved. So the face is read only on a head
  near its rest, and that score is corrected for a downward tilt.
- **Left and right are the person's own**, and which sign of the transform is which was
  settled by recordings, not by reading the model's documentation.
- **The reading costs about 30% of one core** on the machine measured (an M2: 23% in WebKit's
  content process, 6.5% in its GPU process, 2% in the app), at 7.5 detections a second with
  nothing drawn. That is twice the budget first set. Decision 7 is what bounds it: the cost is
  paid while the user types and for 20 seconds after.
- One face, one sitting, one light. The thresholds are starting points held in one object
  (`FaceTuning`), and the recordings are the place a tuning bug is reproduced.

## Not chosen

- **Apple Vision in the helper.** Free and native, and it fits ADR 0015 as written. It gives
  no expression scores, so the feature would start with weeks of deriving them from 2D points.
- **The helper captures and sends frames to the page.** Keeps the camera native and moves
  frames across a process boundary for no gain while the page can have the camera itself. It
  is the fallback if a signed build cannot.
- **MediaPipe's Python package as a second sidecar.** The same model and outputs behind a
  bundled Python runtime of over 100 MB.
- **A model call that reads the frames.** Frames would leave the machine.

## Lessons

- **An ADR's facts age with its dependencies.** "Silently denied without the delegate" was
  written about a running system and stopped being true when the system changed. The
  decision it supported still stands; the sentence does not.
- **The question that decides the architecture is again a permission question answered by a
  run**, as in ADR 0015: one built app and two minutes in front of it replaced a page of
  reasoning about delegates and secure contexts.
