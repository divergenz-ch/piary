# Packaging the app

How `Piary.app` is built, what is in it, and what the release path still needs.
Running it in development is `running-the-app.md`. The framework decision and its costs are ADR 0014; capture's
permission model is ADR 0015.

**Status: a build for both kinds of Mac is made and checked by one command.
Signing and notarization are not done** — they wait on an Apple Developer
certificate, and §4 is what to do when one arrives. ADR 0062 is how the app
reaches other people.

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

**Size: 13.9 MiB** for one architecture, of which about 8 are that wasm and
model, compressed, and 28.8 MiB for both. Worth
stating because size is most of why the shell is Tauri (ADR 0014) — a
bundled-Chromium equivalent is around 150 MB. The release profile does the
work: `lto`, `codegen-units = 1`, `opt-level = "s"`, `strip`.

```
Piary.app/Contents/
├── Info.plist          NSCameraUsageDescription, LSMinimumSystemVersion 13.0
├── MacOS/piary         the app
├── MacOS/piary-capture the Swift capture helper (ADR 0015)
├── Resources/          the built page, with `face/` (the detector's wasm and model)
└── Resources/pi-extension/  Piary's own pi package (`view`, `cell`, the skill),
                        passed to every pi the app starts (`src-tauri/src/extension.rs`)
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

**A release is the disk image under a version tag** (ADR 0062). The version is written in
`package.json`, which `src-tauri/tauri.conf.json` names as its own; `src-tauri/Cargo.toml` and
`Cargo.lock` repeat it, and `tests/contract/version.test.ts` fails while they differ. The tag is
that version with a `v`, and must be: the app reads a release's tag as its version (ADR 0063).

```sh
pnpm app:release --dmg
git tag -a v0.0.1 -m "Piary 0.0.1" && git push origin v0.0.1
gh release create v0.0.1 src-tauri/target/universal-apple-darwin/release/bundle/dmg/Piary_0.0.1_universal.dmg --prerelease --title "Piary 0.0.1" --notes-file <notes>
```

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

## 4. Signing and notarization — what to do when the certificate arrives

Not done, and **not to be trusted until verified end to end**, because of one
specific upstream problem.

0. **The entitlements are in place** (`src-tauri/Entitlements.plist`, named in
   `tauri.conf.json`): the camera, and nothing for the microphone, which the
   app does not use (ADR 0062). A Developer ID build runs under the Hardened
   Runtime, where a process without the entitlement is refused the camera with
   no prompt. **Verify on the first signed build that the camera is asked for
   once and then works** (step 19 of `docs/running-the-app.md`).
   `pnpm app:release` with no identity makes an ad-hoc build that runs hardened
   with the same entitlements, so the refusal can be rehearsed on the build
   machine; `pnpm app:bundle` signs nothing and cannot show it.
1. **Set the credentials.** `APPLE_SIGNING_IDENTITY` (or
   `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD`), plus either
   `APPLE_API_KEY`/`APPLE_API_ISSUER`/`APPLE_API_KEY_PATH` or
   `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` for notarization. Tauri signs
   every Mach-O inside the bundle and then the bundle, so the Swift helper is
   signed with the same identity automatically.
2. **Expect [tauri#11992] and verify it.** Notarization has been reported to
   reject an `externalBin` in `Contents/MacOS/` as *"nested code is modified or
   invalid"*. **Still open upstream.** The reported workaround is keychain trust
   configuration rather than a code change — sign with
   `--keychain $HOME/Library/Keychains/login.keychain-db` and set the
   certificate to *Always Trust*. **Verify a notarized build with the helper in
   it before relying on the release path**, because this is the one step that
   has no local rehearsal.
3. **Nothing but Mach-O binaries in `Contents/MacOS/`.** Developer ID signing
   treats any regular file there as nested code and rejects a non-binary, so
   never park a script or a data file beside the helper.
4. **Then check the permission story on a machine that has never run it**, which
   is the only place it is observable: Screen Recording prompts once, the prompt
   names **Piary** and not `piary-capture`, and the grant survives a relaunch.
   `docs/TEST_ARCHITECTURE.md` §7 carries this as a checklist item because no
   automated layer can see it.

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

- **A release anyone can open.** `v0.0.1` is a pre-release holding an ad-hoc signed disk
  image: Gatekeeper refuses it on another Mac until its quarantine mark is removed
  (`xattr -dr com.apple.quarantine /Applications/Piary.app`), so it is for people who know what
  they are running. The first release for everyone waits on §4.
- **An update that installs itself.** The app says when a newer version exists
  and opens its download page (ADR 0063); installing it is Tauri's updater, a
  new crate, a signing keypair and an endpoint, and is not decided (ADR 0062).
  Until a release that is not a pre-release is published, GitHub answers the
  app's check with 404, which is a line in the log and nothing on screen.
- **A second machine.** The build has only ever run on the machine that made it,
  so the "works on a clean Mac" half of the phase gate is open. An ad-hoc signed
  app will be refused by Gatekeeper elsewhere, which is exactly what signing
  fixes — so this is blocked on §4 rather than being a separate task.
- **Linux and Windows.** Out of scope (ADR 0014): macOS only until someone asks,
  and the webview-engine matrix is the cost that buys.

[tauri#11992]: https://github.com/tauri-apps/tauri/issues/11992
