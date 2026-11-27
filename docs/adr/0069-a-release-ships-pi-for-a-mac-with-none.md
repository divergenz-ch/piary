# ADR 0069 — A release ships a pi, for a Mac that has none

**Status:** accepted (2026-11-27). Amends
[ADR 0004](0004-the-users-own-pi-runs.md), whose "the app bundles none" no longer holds for a
release, and adds a fifth place to
[ADR 0068](0068-pi-is-found-where-a-terminal-finds-it-or-chosen.md)'s four. Implementation:
`scripts/pi-bundle.ts`, `scripts/release-build.ts`, `src-tauri/src/pi_cli.rs`.

## Context

ADR 0004 made the app run the user's own pi and bundle none, for two reasons. A pi other than the
one the user's packages were installed against can fail at start (`Class extends value undefined`),
and the app ships no Node to run a pi on.

Both reasons are about a user who has a pi. A person who downloads Piary and has none is told to
install a command-line tool before the app does anything, which is a poor first minute for an app
whose whole surface is a document. And the second reason has gone: pi's releases carry a
**standalone build** for each macOS architecture, one executable that holds its own runtime.

Measured on pi 1.1.0, the version this repository pins:

| | arm64 | x64 |
|---|---|---|
| Download, compressed | 31 MB | 33 MB |
| On disk | 81 MB | 86 MB |
| Mach-O files | the executable and one `.node` | the same |
| Oldest macOS | 13.0 | 13.0 |

It answers `--mode rpc` and loads Piary's packaged extension with launchd's `PATH` and no Node
anywhere. Re-signed for the Hardened Runtime it runs with no entitlement of its own: its first
reply comes in about 0.35 s with `com.apple.security.cs.allow-jit` and without it.

## Decision

1. **A release ships pi's standalone build, for both architectures.** `Piary.app` is one universal
   bundle and pi's build is per architecture, so both are in it:
   `Contents/Resources/pi/arm64/` and `pi/x64/`, each pi's archive as pi published it, with pi's
   licence beside them. The app runs the one for the architecture it is running as
   (`pi_cli::bundled_in`).
2. **It is the last place pi is looked for.** After `PI_CLI`, the user's choice, the app's `PATH`,
   the login shell's `PATH` (ADR 0068), and **pi's own install**: the launcher pi's installer
   keeps at `<agent dir>/bin/pi`, whichever directory it linked it into (`pi_cli::installed_in`).
   That last look is there for the shell that gives no `PATH`. Without it such a Mac would run the
   shipped pi beside the user's own. A pi the user has always runs instead, so ADR 0004's
   rule stands where it applies: a user with packages has the pi they were installed against, and
   that one runs. A chosen pi that is gone is still said, and the shipped one is not run in its
   place.
3. **It shares pi's own agent directory**, `~/.pi/agent`: the sign-in, the settings and the
   transcripts. Nothing is set to make it so; it is where any pi looks. A user who later installs
   pi finds their conversations and credentials there, and Piary then runs the installed one.
4. **The version shipped is the version pinned.** `scripts/pi-bundle.ts` names the pi version and
   the SHA-256 of each build, as pi's release lists them, and fetches them into the git-ignored
   `src-tauri/pi-bundled/`. The version is `package.json`'s `@earendil-works/pi-coding-agent`: the
   script refuses a pin that moved without it, and `tests/contract/pi-bundle.test.ts` holds the two
   together. A pi upgrade moves the pin, the peers' dev versions (ADR 0020 §6) and these checksums
   in one change.
5. **Only the release build ships it.** `scripts/release-build.ts` fetches the builds and names
   them as resources for that one `tauri build`; `tauri.conf.json` does not. So `pnpm app`, the
   driven build and `make ci` fetch nothing, and a development build with no pi found says so, as
   before.
6. **The release build signs it.** Each of the four Mach-O files is signed with the release's
   identity, for the Hardened Runtime, before Tauri seals the bundle and sends it to the notary
   service; after the build the script checks each is the architecture its directory says, loads on
   the oldest macOS the app accepts, and is still signed so. No entitlement is added for it.
7. **Settings says so.** The `pi` topic names the shipped pi as "the one Piary comes with: none was
   found on this Mac", and `Choose…` works as for any other.

## Consequences

- **The app grows from 29 MB to 196 MB on disk**, 167 MB of it pi, and the download by about
  64 MB, which is what pi's two archives weigh compressed. ADR 0014 chose Tauri partly for a small bundle; that is spent on the first
  minute of a user with no pi.
- **A shell that gives no `PATH` can still hide a pi**: one installed another way, through a
  package manager into a directory only the shell names. The shipped pi then runs beside it.
  Settings does not say "none was found on this Mac" in that case: it says the shell did not
  say where it keeps programs, and that `Choose…` names the pi (`PiWhich::shell_answered`).
- **A user with packages and no pi anywhere** (pi removed, settings left behind) gets the
  shipped pi loading those packages, which is ADR 0004's failure. Its signature is still the one
  the handbook names, and `Choose…` or installing pi is the way out.
- **The shipped pi is as old as the pin.** It is not updated between releases of Piary, and a
  person who wants a newer pi installs one, which then runs.
- The shipped pi finds the user's tools through the same `PATH` as any pi the app starts
  (ADR 0068 §3).
- **What a pi says on stderr is kept in the log** (`PI <session> stderr: …`), as well as said on
  the app's own stderr. A pi that will not start on someone else's Mac, the shipped one above
  all, explains itself nowhere else, and an app the Finder launched has no stderr anyone reads.

## What is not known

- **Notarization of a bundle that holds these files has not been run.** The ad-hoc build is made,
  its signature verifies, and a self-test build with the shipped pi in its resources, an empty
  home and launchd's `PATH` starts sessions on it; whether Apple's service accepts the Developer ID one is seen at the next real
  release, and a refusal names the file (`xcrun notarytool log`).
- **The x64 build has not been run on an Intel Mac.** Under Rosetta it starts, answers over RPC
  and loads the extension, after warning that the processor lacks AVX, which every Intel Mac that
  runs macOS 13 has.
- **No disk image was built**, so the download's size is pi's archives' and not a measurement.

## Lessons

- **A rule written for the user who has the thing says nothing about the user who lacks it.**
  ADR 0004's fallback would have been a second pi beside the user's own. A fallback that runs only
  when there is no pi of the user's is a different thing, and the rule's reason does not reach it.
- **Measure the entitlement before adding it.** A JavaScript runtime under the Hardened Runtime is
  where `allow-jit` is added by habit. This one starts as fast without it, so the app's
  entitlements stay the camera alone.
