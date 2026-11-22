# ADR 0063 — The page asks GitHub for the newest release, one window an hour, and a pill says so

**Status:** accepted (2026-11-22). Where the notice appears and how often the app checks were
put to the user and decided that day. Carries out rule 5 of
[ADR 0062](0062-piary-reaches-other-people-as-one-build-on-github-releases.md); builds on
[ADR 0048](0048-preferences-are-the-apps-own-file-and-every-window-hears-a-change.md).

## Context

ADR 0062 decided that the app says when a newer version exists, and left how. Four things made
the how a decision. The app had never made a request of its own to anyone: every call so far was
pi's, to a provider the user signed in to. Rust has no HTTP client, and a new crate needs
approval. The app is many windows, each its own page, so anything a page does at boot happens
once per window. And the version was written in three files, none of which the running app read.

## Decision

1. **The page makes the request; Rust decides whether it may.** The window that is given the
   turn asks `api.github.com` for the repository's latest release with `fetch`
   (`app/update.ts`): the webview already has an HTTP client and GitHub answers any origin, so no
   crate is added. The request carries no token and nothing of the user's.
2. **One request an hour for the app, not per window.** A page asks Rust for the turn
   (`update_claim`) at launch, when a preference changes and every five minutes; Rust grants one
   an hour (`update::CHECK_EVERY`) and keeps nothing on disk about it, so each launch checks
   once. The window that read a release tag hands it to Rust (`update_found`), which keeps it for
   windows opened later (`update_state`) and tells every window (`update-latest`).
3. **A preference switches the check off, and Rust is where it is read.** `updateCheck`, on by
   default, under *Updates* in the Preferences window. Off, `update_claim` grants no turn to any
   window, so no request is made, and a notice already showing goes. It is the only call the app
   itself makes to GitHub.
4. **The notice is a pill in the model chip, left of the model.** `Update 0.2.0`, outlined and still. Its
   menu says which version is available and which this is, opens the download page, and
   dismisses. It is not the status line, which is for what was refused, lost or ended
   (ADR 0011), and it covers none of the document. Only a document's window shows it, and not
   during the tour.
5. **A dismissed version is not announced again; the next one is.** The version is kept as the
   `updateDismissed` preference, so dismissing in one window dismisses in all and outlives the
   launch.
6. **What counts as newer.** GitHub's `releases/latest` names the newest release that is neither
   a draft nor a pre-release. Its tag is read as three numbers, with or without the `v`, and
   compared by number with the app's own (`app/update-check.ts`). A tag that is not three
   numbers is no version and announces nothing.
7. **The button opens an address the app builds.** The release's page is written from the
   repository's name and the version's numbers; no link in the answer is opened, and `open_url`
   takes web addresses only (ADR 0034).
8. **A check that fails says nothing to the user.** No network, a refusal (a 404 while no
   release is published, a rate limit) and an answer naming no version are each one line in the
   log (`PAGE update …`) and nothing on screen; the next turn tries again.
9. **A driven run never asks GitHub.** Where to ask is Rust's to say (`harness::update_source`,
   as for the face's camera): GitHub, or in a driven run the answer `PIARY_UPDATE_SCRIPT` names,
   or nowhere. A suite that asked would make a request per launch and pass or fail by what is
   released that day.
10. **Help → Check for Updates… asks now.** It is the user asking, so neither the hour nor the
    `updateCheck` preference refuses it (`update_claim` with `asked`), and the hour is counted
    again from it. Its outcome is said on the status line either way: the newer version, that
    this build is the newest, or why the check could not be made. A newer version it finds
    shows its pill in that window even if it was dismissed or the check is off, until it is
    dismissed there. The tour holds the item like any other (ADR 0038); the Preferences, Import
    and Export windows do not answer it.
11. **The version is written in `package.json`.** `tauri.conf.json` names that file as its
    version, so the bundle and the running app (`package_info`) read it from there. Cargo cannot,
    so `Cargo.toml` and `Cargo.lock` repeat it, held by `tests/contract/version.test.ts`.

## Not chosen

- **The request from Rust.** With no HTTP crate it is `/usr/bin/curl` in a child process: a
  second way for the app to reach the network, parsed from a pipe, to save the page a `fetch` it
  can already make.
- **The time of the last check kept on disk**, so several launches in a day make one request. It
  is a stored timestamp to spare a request GitHub allows sixty of an hour.
- **A bar across the top of the window, or the status line.** A bar takes a line of the canvas
  until dismissed; the status line would share one line with a save that failed.
- **Announcing a pre-release.** Nobody who downloaded a release asked to be moved to one.

## Not decided

- **Whether an update installs itself** (ADR 0062). The pill's menu is where an Install row
  would go.

## Consequences

- Until a release that is not a pre-release is published, GitHub answers 404 and every check is
  a line in the log.
- A release is heard of within an hour by an app left open, and at the next launch by one that
  was not.
- An app left open with the network down retries once an hour, never sooner.
- A release tag must be `vX.Y.Z` for anyone to hear of it; `tests/contract/version.test.ts`
  holds the version the tag is cut from to that shape.
