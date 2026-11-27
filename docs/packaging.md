# Packaging the app

How `Piary.app` is built, what is in it, and what the release path still needs.
Running it in development is `running-the-app.md`. The framework decision and its costs are ADR 0014; capture's
permission model is ADR 0015.

**Status: a build for both kinds of Mac is made, signed, notarized and checked
by one command**, given a Developer ID certificate and notarization credentials
in the environment (§4). What that build does on a Mac that has never run it
has not been looked at (§6). ADR 0062 is how the app reaches other people.

---

## 1. Building

```sh
pnpm sidecar:build   # the Swift capture helper (needs the macOS toolchain)
pnpm app:bundle      # Piary.app, in src-tauri/target/release/bundle/macos/
```

`pnpm app:bundle` runs `pnpm app:build` first (Vite builds the page into
`app/dist/`, which `frontendDist` points at). The sidecar is **not** built by it:
`swiftc` is a separate toolchain, and a Rust-only machine should still be able to
build everything else.

`pnpm app:build` also runs `pnpm face:assets`, which puts what the face detector
loads beside the page: MediaPipe's wasm, copied from the installed package, and
its model, fetched once and held to a checksum (ADR 0058). A build that cannot
get them fails there, by name. The first build on a machine needs the network
for the model; later ones do not.

**A release ships a pi, and only a release does** (ADR 0069). `pnpm app:release` runs
`pnpm pi:bundle`, which fetches pi's standalone build for each architecture from pi's
release, holds each to a checksum and unpacks it into the git-ignored
`src-tauri/pi-bundled/`; the release build then signs their four Mach-O files and names
the two directories as resources for that one `tauri build`. `pnpm app:bundle`, `pnpm app`
and the driven build fetch nothing and ship no pi. The version is the
`@earendil-works/pi-coding-agent` that `package.json` pins, and the script refuses a pin
that moved without it. The first release build on a machine needs the network for 64 MB
of archives.

**Size: 13.9 MiB** for one architecture, of which about 8 are that wasm and
model, compressed, and 28.8 MiB for both, before the pi a release ships. That pi is
167 MB on disk for the two architectures, so a release's `Piary.app` is 196 MB, most of
it pi; the decision and what it buys are ADR 0069's. The app's own size is still worth
stating because it is most of why the shell is Tauri (ADR 0014) — a
bundled-Chromium equivalent is around 150 MB. The release profile does the
work: `lto`, `codegen-units = 1`, `opt-level = "s"`, `strip`.

```
Piary.app/Contents/
├── Info.plist          NSCameraUsageDescription, LSMinimumSystemVersion 13.0
├── MacOS/piary         the app
├── MacOS/piary-capture the Swift capture helper (ADR 0015)
├── Resources/          the built page, with `face/` (the detector's wasm and model)
├── Resources/pi-extension/  Piary's own pi package (`view`, `cell`, the skill),
│                       passed to every pi the app starts (`src-tauri/src/extension.rs`)
└── Resources/pi/       a release only: pi's standalone build in `arm64/` and `x64/`, with
                        its licence, run when the Mac has no pi of its own (ADR 0069)
```

**The helper's placement is load-bearing, not tidy.** macOS resolves a privacy
permission against the *responsible process*, and responsibility is inherited
across spawn — so a helper inside the bundle uses the app's grant and the user is
asked once, about Piary. A helper anywhere else is its own responsible process
and asks for its own. `bundle.externalBin` is what puts it there; Tauri requires
the target triple in the source filename and strips it on the way in, which is
why `pnpm sidecar:build` writes both names.

**The icon is drawn once, in `src-tauri/icons/icon.svg`**, and the files beside it are made
from it: `pnpm tauri icon src-tauri/icons/icon.svg`, keeping the five the bundle
names (`tauri.conf.json`) and discarding the Windows, iOS and Android sets the
command also writes. The drawing leaves the margin a macOS icon has around its
rounded square, so the Dock shows it the size of its neighbours.

## 2. The DMG needs a GUI session

`pnpm app:dmg` builds one, and **it is not part of `app:bundle`.** The DMG step
drives Finder through AppleScript to arrange the disk image's window, so it
needs a logged-in session and an automation grant. Without them it fails with:

```
Finder got an error: AppleEvent timed out. (-1712)
Failed running AppleScript
```

That reads as a packaging bug and is not one — the `.app` built fine. On a
headless runner, or over SSH, build the `.app` and make the DMG elsewhere.

**The step also needs the volume name `Piary` free.** It mounts its working
image as `/Volumes/Piary` and arranges that volume; with an earlier disk image
still open in Finder the working image is mounted under another name and the
step fails with `error running bundle_dmg.sh`, after the whole build.
`pnpm app:release --dmg` checks for the volume before it builds anything and
says to eject it.

**A release is the disk image under a version tag** (ADR 0062). The version is written in
`package.json`, which `src-tauri/tauri.conf.json` names as its own; `src-tauri/Cargo.toml` and
`Cargo.lock` repeat it, and `tests/contract/version.test.ts` fails while they differ. The tag is
that version with a `v`, and must be: the app reads a release's tag as its version (ADR 0064).

It is cut in three commands, each stopping where a person decides (`scripts/release.ts`):

```sh
make pre-release   # the version the commits call for, and the notes
make release       # the signed, notarized disk image, uploaded as a draft
make publish       # the tag, and the draft made public
```

1. **`make pre-release` changes nothing tracked.** It reads the commits since the last
   `v*` tag and suggests the next version by what they are (semver.org): a new feature
   moves the middle number, fixes alone the last, and a breaking change the first, or
   the middle one before 1.0.0. A change under a scope no user sees (`test`, `release`,
   `evals`, …) counts as neither. `VERSION=0.2.0` chooses another. It writes the notes
   to `release/notes.md` and the decision to `release/plan.json`, both git-ignored, and
   prints them. The notes are worded by `claude -p` from the commits when there is one
   on PATH, run away from the checkout with no tool and none of the user's settings;
   with none, or when what it wrote carries a foreign link, a machine's path, an
   outside id or a commit hash, they are the commits' own summaries under *New* and
   *Fixed* (`PLAIN=1` asks for those). The file is the notes: edit it freely.
2. **`make release` builds what was prepared, and only that.** It refuses a checkout
   that is not `main`, is not clean, has moved since `pre-release` or lacks origin's
   commits; a tag or a release that already exists; and an environment without §4's
   variables. Then it writes the version into the three files, commits that here
   without pushing, builds with `pnpm app:release --dmg --notarized`, which fails
   rather than make an image that is not notarized, and uploads the image with the
   notes as a **draft** release. A draft is seen only by the repository's own people
   and creates no tag: its page is the release as it will read, and the image beside
   it is the file to try. The command ends with how to take it all back.
3. **`make publish` builds nothing.** It refuses if the checkout moved since the build,
   the draft is gone, or the image was rebuilt since it was uploaded. It pushes `main`,
   tags the built commit, pushes the tag, checks origin's tag is that commit, and only
   then makes the draft public: a release published before its tag exists is given
   one by GitHub, unannotated and wherever `main` stands. `PRERELEASE=1` publishes a
   build not meant for everyone: the app never announces a pre-release as the newest
   version (ADR 0064), and until a release without it exists the app's check for one
   is answered with 404.

`DRY=1` on the last two runs every check and prints each command it would run,
changing nothing. A published version is never built again or given another file: a
mistake is the next version's to fix.

## 3. Running the built app

```sh
open src-tauri/target/release/bundle/macos/Piary.app
```

`PI_DOC_DIR` still works, which is the easy way to point a built app at a
scratch directory rather than real conversations.

**An ad-hoc signed build keeps its TCC grants only as long as its code
signature and path are unchanged**, so a rebuild loses them. That is a
development tax, not a shipping problem, and the sign of hitting it is a
permission that was granted a minute ago being denied now. `tccutil reset
ScreenCapture ch.divergenz.piary` clears the slate.

## 4. Signing and notarization

A build other people can open is signed with a **Developer ID Application**
certificate and notarized by Apple. Both come from the environment and nothing
names them in the repository (ADR 0062): with the variables below set,
`pnpm app:release --dmg` does all of it, and with none it makes the ad-hoc
build.

0. **The entitlements are in place** (`src-tauri/Entitlements.plist`, named in
   `tauri.conf.json`): the camera, and nothing for the microphone, which the
   app does not use (ADR 0062). A Developer ID build runs under the Hardened
   Runtime, where a process without the entitlement is refused the camera with
   no prompt. `pnpm app:release` with no identity makes an ad-hoc build that
   runs hardened with the same entitlements, so the refusal can be rehearsed on
   the build machine; `pnpm app:bundle` signs nothing and cannot show it.
1. **The certificate is a Developer ID Application one**, the kind for an app
   given out outside the App Store; an Apple Distribution or Mac App
   Distribution certificate signs a build Gatekeeper refuses. Only the team's
   Account Holder can create it, from a signing request made in Keychain
   Access on the Mac that will sign, which is where the private key stays.
   Apple's *Developer ID - G2* intermediate certificate must be in the keychain
   too: a Mac with no Xcode has none, and the identity is not valid without
   it. `security find-identity -v -p codesigning` lists the identity once both
   are there. Never set the certificate to *Always Trust*.
2. **Set the credentials.** `APPLE_SIGNING_IDENTITY` is the identity as that
   command prints it, `Developer ID Application: <team> (<team id>)`. For
   notarization, either `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID`, or
   `APPLE_API_KEY`, `APPLE_API_ISSUER` and `APPLE_API_KEY_PATH`. The first is an
   Apple ID of the team with an app-specific password, never the account's own,
   and any member with the Developer role or more is accepted; the second is a
   team key, which an Account Holder or Admin creates. Keep them in a file
   outside the checkout and `source` it for the one command.
   `xcrun notarytool history` with the same credentials says whether Apple
   takes them, before any build.
3. **What the command does with them.** Tauri signs every Mach-O inside the
   bundle and then the bundle, so the Swift helper is signed with the same
   identity and entitlements; it sends the app to the notary service, waits,
   and staples the ticket. The pi a release ships is under `Resources/`, so
   `scripts/release-build.ts` signs its Mach-O files itself, before that
   build, for the Hardened Runtime and with no entitlement: it runs as fast
   without `allow-jit` (ADR 0069). **No Developer ID build holding it has been
   notarized yet**; a refusal names the file in `xcrun notarytool log <id>`. It signs the disk image and stops there, so
   `scripts/release-build.ts` notarizes and staples the image too, and fails
   unless Gatekeeper then accepts it: the image is what is downloaded. The
   command ends by saying whether the image is notarized.
4. **Checking a build by hand.**

   ```sh
   spctl -a -vv Piary.app                 # accepted, source=Notarized Developer ID
   spctl -a -vv -t open --context context:primary-signature Piary_<version>_universal.dmg
   xcrun stapler validate Piary.app       # and the .dmg
   codesign -d --entitlements - Piary.app/Contents/MacOS/piary-capture
   ```

   A submission Apple refused says why in `xcrun notarytool log <id>`, by file.
5. **The helper in `Contents/MacOS/` is notarized as it is.** [tauri#11992]
   reports notarization rejecting an `externalBin` there as *"nested code is
   modified or invalid"*; this bundle is accepted with no workaround. If a
   later Tauri brings the rejection, the reported remedy is to sign with
   `--keychain $HOME/Library/Keychains/login.keychain-db`.
6. **Nothing but Mach-O binaries in `Contents/MacOS/`.** Developer ID signing
   treats any regular file there as nested code and rejects a non-binary, so
   never park a script or a data file beside the helper.
7. **What only a person can check**, on a machine that has never run the app,
   which is the only place it is observable: on a Mac with no pi, a first
   prompt is answered once signed in, and Settings names the pi as the one
   Piary comes with (ADR 0069); the disk image downloaded through
   a browser opens with no warning to override; the camera is asked for once
   and then works (step 19 of `docs/running-the-app.md`); Screen Recording
   prompts once, the prompt names **Piary** and not `piary-capture`, and the
   grant survives a relaunch. `docs/TEST_ARCHITECTURE.md` §7 carries the
   permission prompts as a checklist item because no automated layer can see
   them.

## 5. What a shipped build can tell you

Launched from Finder, the app's stdout and stderr go nowhere a user can reach.
So everything it has to say about itself is also appended to a file:

```
~/Library/Logs/ch.divergenz.piary/piary.log      the current generation
~/Library/Logs/ch.divergenz.piary/piary.1.log    the one before it
```

**Console.app lists that folder under Log Reports**, so it can be found and
read without a terminal; `open ~/Library/Logs/ch.divergenz.piary` or
`tail -f` it with one. The directory is Tauri's `app_log_dir`, named for the
bundle identifier.

`PIARY_LOG_DIR=<dir>` puts both files in `<dir>` instead (`diag::log_dir`); unset
or empty, the directory above is used. Every running Piary shares that
directory, so a run whose log must be its own names another.

The user's preferences are `preferences.json` in the app's config directory,
`~/Library/Application Support/ch.divergenz.piary/` (ADR 0048).
`PIARY_PREFERENCES=<file>` names another file, which is how a driven run keeps
its own.

What goes in it, one UTC-stamped entry each: the page's forwarded console and
its uncaught errors and rejections (`PAGE <level> …`, via
`src/forward-console.ts`), every notice the status line shows
(`PAGE notice …`), a check for a newer version that could not be made
(`PAGE update …`), every relay's note about a line it dropped (ADR 0019 §6), a
Rust panic, and every exchange with pi (`PI …`): a session's start, rebuild and
exit, each command the page sends with pi's verdict on it, and each of pi's
events but the streamed partials, which the `_end` event after them repeats
whole. An image is recorded by its length, never its bytes. In page code the
way to say something is `logLine` from `src/bridge.ts`; in Rust it is
`diag::note` (`src-tauri/src/diag.rs`), which is stderr *and* the log.

**Bounded.** A generation is rotated past `diag::LOG_CAP` (20 MiB) or
`diag::MAX_AGE` (7 days), whichever comes first, keeping one previous
generation, so the two never exceed 40 MiB; a line repeated back to back is
written once and followed by its count; an entry is cut at
`diag::ENTRY_CAP` (16 KiB) and says how much went. A failed write drops the
entry rather than failing its caller.

**Diagnostics, not telemetry. Nothing leaves the machine.** The file is written
locally and read by a person who chooses to; the app sends it nowhere, and
attaching it to a bug report is the user's act. Read it before attaching: it
holds every prompt and answer, and the page's console can carry document text.

**Why a file and not `OSLog`.** `OSLog` under a Piary subsystem is what a macOS
app is expected to use, and `log stream --predicate 'subsystem == …'` would
filter it — but it is not reachable without a dependency. `os_log` is a C macro
over `_os_log_impl`, an underscore-prefixed entry point whose argument buffer
encoding is undocumented and whose format string must sit in a dedicated
`__TEXT` section to be decoded, and a dynamic string is redacted as `<private>`
unless the format says `%{public}s`. Hand-rolled FFI to that is the fragile kind.
An `os_log` crate would do it properly and is a dependency, which needs
approval; a file, unlike `OSLog`, can be attached to a report whole. If `OSLog`
is wanted later, `diag::record` is the one place it goes. This is a property of
the bundle rather than a constraint on future work, which is why it is written
here and not as an ADR.

## 6. Not done yet

- **A release anyone can open.** The one release published, `v0.0.1`, is a pre-release
  holding an ad-hoc signed disk image: Gatekeeper refuses it on another Mac until its
  quarantine mark is removed (`xattr -dr com.apple.quarantine /Applications/Piary.app`), so it
  is for people who know what they are running. No notarized build has been published.
- **An update that installs itself.** The app says when a newer version exists
  and opens its download page (ADR 0064); installing it is Tauri's updater, a
  new crate, a signing keypair and an endpoint, and is not decided (ADR 0062).
  Until a release that is not a pre-release is published, GitHub answers the
  app's check with 404, which is a line in the log and nothing on screen.
- **A second machine.** The build has only ever run on the machine that made it,
  so the "works on a clean Mac" half of the phase gate is open: §4's last step, on a
  notarized build, is what closes it.
- **Linux and Windows.** Out of scope (ADR 0014): macOS only until someone asks,
  and the webview-engine matrix is the cost that buys.

[tauri#11992]: https://github.com/tauri-apps/tauri/issues/11992
