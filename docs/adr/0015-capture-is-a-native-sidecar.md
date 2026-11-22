# ADR 0015 — Capture is a native sidecar, not a webview feature

**Status:** accepted; amended by [ADR 0058](0058-the-face-is-read-in-the-page-and-only-words-leave-it.md) (reading a face is not capture and happens in the page) and by [ADR 0062](0062-piary-reaches-other-people-as-one-build-on-github-releases.md) (no microphone until a feature records from one). Depends on [ADR 0014](0014-native-application-tauri.md) for the shell, and
renders through the live-view seam in [ADR 0013](0013-inline-terminal-and-live-views.md).

## Context

Screen capture, system-audio and microphone recording, and camera access are the foundation of the
feature piary is being rebuilt toward. The obvious route in a web stack is the webview's own
`getDisplayMedia` and `getUserMedia`. On a system-webview framework that route is the weak one, and
the reasons are about macOS rather than about Tauri:

- **`getDisplayMedia` in a WKWebView is unreliable.** It has been a known permission problem for
  years ([tauri#2600]). One `WKUIDelegate` callback covers camera, microphone *and* display, and the
  display half had to be added to wry's permission kinds before it was permitted at all. Even wired
  up, WKWebView shows no picker for a display device, and the system picker has its own bugs.
- **`getUserMedia` does work** in a Tauri WKWebView — camera and microphone both — but only with
  the usage-description keys present and the delegate answering. Without the delegate, requests are
  silently denied with no prompt.
- **The native APIs are strictly more capable.** ScreenCaptureKit targets a specific window, display
  or application, captures system audio since macOS 13 and the microphone in the same stream since
  macOS 15, and can exclude the capturing app's own audio. It is a frame-delivery API — it hands
  over `CMSampleBuffer`s and leaves file writing to the caller — so streaming to another process is
  its natural mode rather than a workaround.

The question that actually decided the architecture was not about APIs. It was about permissions:
**if a helper process does the capturing, does macOS grant permission to the helper or to the app?**
If the helper needs its own grant, a sidecar means a second permission prompt, a second entry in
System Settings, and a user who has to understand why — which would have been bad enough to push
capture back into the webview despite everything above.

## Decision

**Capture runs in a Swift sidecar inside the app bundle, not in the webview.**

ScreenCaptureKit for screen and system audio; AVFoundation for camera and microphone. The sidecar is
spawned by the Rust main process and speaks a line protocol on stdio — the same shape as a PTY
(ADR 0013), which is why the existing seam fits it.

### The permission model, which is the load-bearing fact

macOS resolves a privacy permission against the **responsible process**, not the process making the
call, and responsibility is **inherited across spawn**. A helper launched from inside the app
bundle therefore resolves against the app.

This was verified rather than assumed, and the experiment is worth recording because it is
two lines of evidence that replace a page of reasoning. The same unmodified Swift binary, asking
`SCShareableContent` what it could see:

```
launched from a terminal with no Screen Recording grant:
  "screenRecording": "denied: The user declined TCCs for application, window, display capture"

the terminal was then granted Screen Recording; same binary, unchanged:
  "screenRecording": "granted", "displays": 1, "windows": 27
```

Nothing about the helper changed. Only the grant on its parent did.

The consequences, stated precisely:

- **A sidecar inside the bundle needs no prompt and no entry of its own.** One grant on the app
  covers it. This is the behaviour we want, and it is the default.
- **The usage descriptions must live in the parent app's `Info.plist`** —
  `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`. These are **mandatory, not
  polite**: TCC *kills* a process that touches the camera or the microphone without one rather than
  denying it, which presents as a crash with no permission dialog in sight.
- **Screen Recording has no usage-description key and no request API.** It is granted in System
  Settings, and the app appears in that list only *after* it has attempted a capture. A read-only
  status check does not register it, so there is nothing to show the user until something tries.
- **The failure mode to expect is the inverse of the one feared.** Not "the sidecar is denied" — in
  development the responsible process is the terminal or the editor that launched the app, so the
  grant lands on *that*, and the permission state under test is not the one that ships. Compounding
  it, TCC keys a grant to the code signature **and** the path, so an ad-hoc-signed build changes
  identity on every rebuild and loses its grant. This is a dev-loop tax, not a shipping risk. When a
  grant looks broken, check which process is actually responsible before suspecting the code.

### Media does not ride the control channel

Tauri delivers a sidecar's stdout as framed events. That is right for JSON-lines control traffic and
wrong for a high-bitrate video stream. Control goes on stdio; frames go on a dedicated pipe or a
unix socket. Starting with everything multiplexed on stdout is survivable — a prior art CLI does
exactly that successfully — but the escape hatch is named here so it is not rediscovered under load.

### Audio streams stay separate, and carry their own timestamps

With microphone capture enabled, ScreenCaptureKit delivers application audio and microphone audio as
**separate sample buffers with different format descriptions — possibly different sample rates and
channel counts — on independent clocks.** Writing both into one `AVAssetWriterInput` produces a
**corrupt, unplayable file and raises no error**. Apple's own guidance is separate writer inputs
with matching format descriptions and explicit timestamp normalization.

Piary sidesteps the muxing half of that trap by not muxing: the sidecar streams **separately
labelled streams** to the parent and mixing happens downstream, where there is full control. The
clock half does not go away, so **capture timestamps travel in the protocol framing** and the
consumer aligns them. A protocol that drops the timestamps would look correct and drift.

## Consequences

- **The capture path is framework-independent.** Nothing here depends on Tauri. If ADR 0014 were
  ever revisited, this ADR survives it — which is the reason it is a separate record rather than a
  section of that one.
- **Swift, not Rust, for the capture code.** The Rust binding crates are healthy for screen and
  audio but still churning, and **none covers AVFoundation camera well**. Swift puts screen, system
  audio, camera and microphone in one idiomatic place. Rust's job is to spawn the helper and relay
  its protocol.
- **A second language in the tree, and a third counting Rust.** Accepted for the same reason as
  Rust: the alternative is hand-rolling Objective-C bridges for an API Apple ships a first-class
  binding for.
- **The sidecar is a nested binary at release time.** Notarization rejecting an `externalBin` in
  `Contents/MacOS/` as "nested code is modified or invalid" is unresolved upstream
  ([tauri#11992]), and Developer ID signing treats *any* regular file in `Contents/MacOS/` as
  nested code — so nothing but Mach-O binaries may sit beside it. Verified end to end before the
  release path is trusted.
- **A capture renders through the live-view seam** (ADR 0013): `write`/`settle`/`dispose`, the same
  contract a terminal uses. That seam was built for changing content and a streaming capture is the
  second instance of it, which is the evidence it was the right shape.

## Lessons

- **Find the question that would change the architecture, and answer it with an experiment.** Every
  API question here was answerable from documentation. The permission question was not — the docs
  describe the mechanism, but "does my sidecar get its own prompt" is a fact about a running system.
  Two runs of one binary settled it.
- **A silent corruption deserves a louder note than an error.** The audio-buffer trap produces a
  broken file and no exception. Invariants whose violation is invisible are the ones worth writing
  into an ADR, because no test failure will ever remind anyone.
- **"Permission denied" in development usually names the wrong process.** TCC's responsible-process
  model means the grant follows whatever launched the app, which during development is a terminal.
  Hours are available to be lost here by debugging code that was correct.

[tauri#2600]: https://github.com/tauri-apps/tauri/issues/2600
[tauri#11992]: https://github.com/tauri-apps/tauri/issues/11992
