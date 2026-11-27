# ADR 0068 — pi is found where a terminal would find it, or is the one the user chose

**Status:** accepted (2026-11-27). Extended by
[ADR 0069](0069-a-release-ships-pi-for-a-mac-with-none.md), which adds the pi a release ships as a
fifth place. Amends
[ADR 0004](0004-the-users-own-pi-runs.md): which pi is "the user's own" has two more answers.
Implementation: `src-tauri/src/pi_cli.rs`, `src-tauri/src/shell_env.rs`.

## Context

ADR 0004 runs the `pi` on `PATH`, and names `PI_CLI` as the way to run another. Both are answers
for an app started from a terminal. A packaged `Piary.app` is started from the Finder, and there
both fail:

- **The Finder's `PATH` is not the user's.** An app the Finder launched inherits launchd's
  environment, whose `PATH` is `/usr/bin:/bin:/usr/sbin:/sbin`. A pi installed by its own
  installer is linked into `~/.local/bin` or a like directory, which the user's shell puts on
  `PATH` in its startup files. launchd reads none of them. So the app said there was no pi on
  `PATH` to a user whose terminal runs `pi`.
- **Finding pi is not enough to run it.** pi is a Node program (`#!/usr/bin/env node`). Run with
  launchd's `PATH`, a pi that was found still ends with `env: node: No such file or directory`,
  because Node is on the shell's `PATH` too, and often only on the interactive shell's: a version
  manager is as a rule set up in `.zshrc`, not `.zprofile`.
- **`PI_CLI` is not something a Finder user can set.** An environment variable has to be set for
  launchd, which no user does. The message that named it named nothing they could act on, and
  there was no way to say "run this pi" from inside the app, nor to go from one pi to another.

## Decision

1. **The login shell is asked for its `PATH`, once.** At startup, off the main thread, the app runs
   the user's shell (`$SHELL`, else the account's) as an interactive login shell and reads the
   `PATH` it ends up with (`shell_env::read`). Interactive, because that is where a version manager
   lives. The value is read between two marks, since startup files print what they like; the shell
   gets a session of its own, since an interactive shell reaches for the terminal; and it is waited
   for five seconds (`shell_env::BOUND`), after which the app goes on with the `PATH` it has. The
   answer is taken when its closing mark arrives, not when the shell's output closes: a startup
   file that leaves an agent running in the background holds that output open. A
   driven run asks no shell: a test is not to depend on the startup files of the Mac it runs on.
2. **pi is looked for in four places, in order** (`pi_cli::resolve`):
   1. `PI_CLI`, as before: a locally built pi, or a test double.
   2. **The pi the user chose**, the `piPath` preference.
   3. `pi` on the process's `PATH`, skipping dependency bins, as before.
   4. `pi` on the login shell's `PATH`, by the same rule.

   The process's `PATH` comes before the shell's so that an app started from a terminal runs what
   that terminal would, and nothing about such a launch changes.
3. **What the app starts is given the shell's `PATH` too** (`shell_env::merged`). When the shell's
   names every directory the process has, which is a Finder launch, a pi session and a terminal
   are started with the shell's `PATH` as it is: the user's tools come before the system's, as in
   their terminal. Otherwise the process's own directories come first and the shell's are added
   after them, so a launch from a terminal or a package script keeps what it put first. That is
   what lets pi find its Node, and lets the commands pi runs find the user's git, package manager
   and compiler rather than the system's.
4. **The user chooses a pi in the Preferences window.** A `pi` topic there says which pi would run
   and how it came to be that one (found on `PATH`, found on the shell's `PATH`, chosen here, named
   by `PI_CLI`), with two buttons: `Choose…`, which opens the system's file panel, and
   `Find it for me`, which empties the choice. Rust shows the panel and keeps the answer
   (`pi_choose`); the page names no path. A change stops each document window's pi once no turn
   runs (`app/pi-choice.ts`), so the next message starts the one chosen.
5. **A chosen pi that is gone is said, not looked past.** If the file the user chose is not there,
   no other pi is run in its place: the message names the path and where to choose again. Running
   a pi the user did not point at is ADR 0004's failure, reached quietly.
6. **A message says what the user can do.** With no pi anywhere it names installing pi and
   choosing one in Settings. It does not name `PI_CLI`.

The app still bundles no pi. Whether it should is a separate decision, with its own costs (a
runtime to ship and sign, and a pinned pi beside the user's packages), and is not made here.

## Consequences

- A `Piary.app` opened from the Finder runs the pi a terminal runs, with no setting.
- The app starts one shell at launch. Its startup files run, as they do for every terminal the
  user opens; what they print is dropped.
- A shell that gives no answer (none found, an unusual shell that takes no `-lic`, startup files
  that never finish) leaves the app where it was before this decision: the process's `PATH`, and
  the choice in Settings, which needs neither.
- The log says what the shell answered (`SHELL PATH …`), so a pi that was not found can be
  diagnosed from a Finder launch.

## Lessons

- **Every suite launched the app from a shell, so none could fail for this.** `pnpm app`, the
  page specs and the driven app all inherit a developer's full `PATH`. The check that fails is a
  launch with launchd's environment: `env -i HOME="$HOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin`
  before the built binary (`docs/running-the-app.md`).
- **A found program is not a runnable one.** What a script's `#!` line needs has to be on the
  `PATH` of the process that runs it, which is why the child's `PATH` is part of this decision and
  not only the lookup.
- **A fix the user cannot apply is not a fix named.** An environment variable is a developer's
  control. A message for someone who double-clicked an icon names a menu item.
