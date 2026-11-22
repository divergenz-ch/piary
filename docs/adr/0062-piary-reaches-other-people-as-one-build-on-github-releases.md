# ADR 0062 — Piary reaches other people as one build for both Macs, on GitHub Releases

**Status:** accepted (2026-11-22). Rules 1, 4 and 5 were put to the user and decided that day.
Builds on [ADR 0014](0014-native-application-tauri.md) and
[ADR 0015](0015-capture-is-a-native-sidecar.md).

## Context

Piary has only run on the machine that built it. Getting it to anyone else raises questions
no local build ever asked: where a binary is downloaded from, which Macs it runs on, what it
is allowed to reach on a stranger's machine, and how that person hears of the next version.

Two of them were live defects nobody could see. The capture helper was compiled for the
build machine's own macOS while the app said it ran on 13, so on anything older than the
build machine the helper would not have launched. And it called three APIs newer than 13
with no guard, which the compiler only refuses when told which system it is compiling for.

## Decision

1. **Binaries are GitHub Release assets, under a version tag.** A release is a tag `vX.Y.Z`
   on the repository, with the build attached and what changed written on it. There is no
   second place a binary lives.
2. **One bundle runs on Apple silicon and on Intel.** The release is built for
   `universal-apple-darwin`: one download, one address for a cask, one entry for an updater.
   Two builds would double every later step to save a few megabytes.
3. **Everything in the bundle is compiled for the macOS the app says it runs on**
   (`bundle.macOS.minimumSystemVersion`), the capture helper included
   (`scripts/sidecar-build.ts`). `pnpm app:release` checks the bundle it made: both
   architectures in every binary, no binary asking for a newer system, nothing in
   `Contents/MacOS/` that is not a binary, a signature that verifies
   (`scripts/release-build.ts`).
4. **The app asks for nothing it does not use.** No feature records from the microphone, so
   the app has no usage description for it and no entitlement to it, and the helper takes
   none: a signed Piary cannot open a microphone. The permission comes back in the change
   that first uses it, never ahead of it.
5. **The app says when a newer version exists.** Someone who downloaded a build has no other
   way to hear of the next one, and Tauri's updater asks the user nothing by itself, so the
   notice is the app's to draw whether or not an updater installs what it announces.
6. **Signing is the environment's.** No identity is named in `tauri.conf.json`. With none in
   the environment a release build is ad-hoc signed, which seals it and runs it under the
   Hardened Runtime with its entitlements, as a Developer ID build runs.

## Not decided

- **Whether an update installs itself.** `tauri-plugin-updater` would add an Install button
  to the notice of rule 5. It is a new crate and a private key that must never be lost, and
  it waits on approval (the dependency policy).
- **Linux and Windows.** Ports before they are packages; ADR 0014 stands.

## Consequences

- A release needs a Developer ID certificate and a notarization key before anyone else can
  open it: Gatekeeper refuses an ad-hoc build on every Mac but the one that made it.
  `docs/packaging.md` §4 is what remains.
- A universal bundle is about twice the size of one architecture's.
- A capture that should carry the user's voice cannot be built without first restoring the
  permission of rule 4, the usage description and the entitlement together.
