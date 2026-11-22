# ADR 0032 — Sign-in is pi's own `/login`, run in an app terminal

**Status:** superseded by [ADR 0034](0034-sign-in-is-a-panel-over-pis-own-login.md) (2026-11-14). Accepted 2026-11-08.

## Context

The app runs the user's own pi (ADR 0004), and pi answers with whatever it can
already reach: `~/.pi/agent/auth.json` (API keys, and the subscriptions pi has
logged in to) and the provider environment variables. When it has none, a
prompt is refused at pi's preflight, and the error lands in the document (ADR
0011). That error tells the user to run `/login`, which the app did not have.
Sign-in has to exist in the app, or an ADR has to decline it.

pi's RPC mode has no login or set-key command. The `pi auth` CLI checks and
prints, and nothing more. Login lives only in pi's interactive TUI, as the
`/login` slash command: browser OAuth with its own loopback, device codes, API
keys, for every provider pi knows.

## Decision

**Sign-in is pi's own `/login`, run in a terminal in the document.**

- **What runs.** A terminal open can ask for "the user's pi, with these
  arguments" (`TerminalRequest.pi`, `args`). Rust resolves that pi, the one a
  session starts, so a thin Finder PATH cannot pick a different one. The page
  asks for `--no-session`, so a login writes no transcript; `--no-approve`, so
  pi loads no project files and asks no project-trust question, which the typed
  Enter would otherwise answer for the user; and `--offline`, because pi takes
  no command until its startup downloads (fd, ripgrep) finish, and a fresh
  install has them to fetch. It types `/login` once pi's first output has gone
  quiet. The login terminal gets no
  `--extension` and no `PIARY_VERDICTS`, by design: it is a login, not a
  session, and nothing in it is Piary's.
- **Three ways in.** The `/login` row of the creation menu; the model menu's
  `Sign in…` row when pi lists no models; and an inline ask after a refused
  prompt, when pi has no provider.
- **Detection is pi's, never text.** "Refused" is the prompt reply's
  `success: false`. "No provider" is `get_available_models` answering an empty
  list: pi lists only the models it can authenticate, environment keys
  included. The error's wording is never matched. A failed models query, or a
  timed-out prompt (ADR 0019 §4), offers nothing: a guess must not add a wrong
  ask under an error that already says why.
- **After the login exits, this window's pi is stopped,** so the next send
  starts one that reads the new credential. Only this window's pi: another
  window's keeps running until its own next start. The stop is counted as
  expected, so no "pi stopped" notice fires. A login exit while a turn runs
  restarts nothing: that pi evidently has a provider, and stopping it would
  leave the turn waiting on nothing. `pi_stop` is sent with `keep_terminals`,
  so the user's other shells in the window stay; without it, a stop closes the
  session's terminals, as a closing window needs. No pi is started to repaint
  the model chip.

## Declined

- **B, Rust writes API keys into `auth.json`.** pi writes that file under a
  `proper-lockfile` lock (`core/auth-storage.js`), and an unlocked write can
  clobber a concurrent OAuth refresh. It needs a hand-kept list of providers,
  and it covers no OAuth at all.
- **C, a login command in Piary's bundled pi extension.** It needs pi's
  private `modelRegistry` internals, and it breaks on pi upgrades.
- **D, pi-ai's login in the webview.** The webview has no loopback for the
  OAuth redirect and no filesystem, and CORS stands in the way of the token
  endpoints.

## Consequences

- The app holds no credential, writes no `auth.json`, and knows no provider
  list. pi's own dialog decides what can be signed in to, so a provider pi adds
  is offered with no change here.
- No new crate or dependency: the app already had PTYs (ADR 0013) and resolves
  the user's pi.
- The login is a TUI in a terminal, not a form. That is pi's interface, and it
  is the same one a terminal user meets.
- No provider is excluded and no login is gated: on the user's own machine,
  the user's own pi decides.
- **Revisit when pi's RPC mode gains a login command.** That is the moment an
  in-app dialog stops costing a reimplementation.
