# ADR 0034 — Sign-in is a panel over pi's own login, carried by Piary's extension

**Status:** accepted (2026-11-14). Supersedes [ADR 0032](0032-sign-in-is-pis-own-login-in-a-terminal.md).

## Context

ADR 0032 ran pi's own `/login` in a terminal in the document, because pi's RPC mode has no login
command and the terminal kept every credential out of the app. Walked by the user, the terminal is not
a sign-in a person should be handed: a TUI menu, a typed `/quit` to finish, and a terminal block left
in the conversation afterwards. Sign-out (`/logout`, the same way) had the same shape, and it was
offered when only an environment key existed, where it could remove nothing.

Three facts, probed against pi 1.0.4, make a panel possible without a second login implementation:

- **An extension command runs over RPC with no provider configured.** `prompt "/name"` runs a
  registered extension command before any model is involved, and writes no transcript entry and no
  turn events.
- **pi's own login code is public.** `ModelRuntime` (exported by pi-coding-agent) has `login`,
  `logout`, `listCredentials`, `getProviders` and `getProviderAuthStatus` — what pi's interactive
  `/login` itself calls. `ModelRuntime.create()` reads and writes pi's own credential file, honouring
  `PI_CODING_AGENT_DIR`.
- **An extension's questions reach the page.** `ctx.ui.input`/`notify` become `extension_ui_request`s
  on the RPC stream — the channel the `cell` verdicts and canvas edits already use (ADR 0031,
  ADR 0033).

## Decision

**Sign-in and sign-out are a panel in the document, over pi's own login code run by Piary's extension.**

1. **pi does the login.** `pi-extension/login.ts` registers `/piary-login` and `/piary-logout`. The
   first lists every provider and method pi offers, with what is configured, asks the page which one,
   and runs `ModelRuntime.login` with an interaction whose prompts and events go to the page. The
   second lists what pi has *stored* and runs `logout` on the one picked. pi writes and removes its own
   credential file; the app still writes no `auth.json`.
2. **The page draws it.** Questions arrive as `input` dialogs titled `piary:login` carrying a JSON
   step (`choose`, `prompt`, `stored`), news as notices prefixed `piary:login ` (`event`, `done`). The
   page shows them in the ask slot the inline sign-in offer already uses (`chat.setAsk`): a searchable
   provider list, a password field for a key, a button that opens the provider's sign-in page in the
   browser, a device code, a field for a pasted code. A cancel at any step ends the flow. A flow that
   sent the user to the browser brings the window back to the front when it ends.
   pi asks for a pasted code while it waits for the browser, and withdraws the question when the
   browser answers first; no answer to a withdrawn question is not a cancel
   (`pi-extension/login-answer.ts`) — read as one, it aborted the code exchange that follows.
3. **A typed key passes through the page once.** It goes from the field to pi in the dialog answer
   and is not kept, logged or written by the app: the diagnostic log records an answer to any
   extension dialog by its length alone (`diag.rs`). This is the one thing ADR 0032 had that this
   does not: the app now carries a key in transit.
4. **The command returns at once and the flow runs on.** pi answers the `prompt` that ran a command
   only when its handler returns, and the app waits 30 s for an answer (`REQUEST_TIMEOUT`); a browser
   sign-in takes longer. The handler starts the flow and returns; the dialogs keep working after it
   has.
5. **The window's pi runs it.** It is started if it is not running. When the flow ends with a change,
   that pi is stopped, so the next send starts one that reads the new credential — the rule ADR 0032
   had, for the same reason: the running pi's own runtime does not see a file another runtime wrote.
6. **The user's own extension copy may be older.** When the user's pi settings install `pi-ui-views`
   themselves, theirs runs (ADR 0030), and an older copy has no `/piary-login`. The page asks pi's
   command list first and, when the command is missing, says to update the package rather than
   sending a prompt pi would hand the model.
7. **Ways in are unchanged:** the `/login` row of the creation menu, the model menu's `Sign in…` row
   while pi lists no models, the inline ask after a prompt refused for want of a provider, and the
   model menu's `Sign out…` row while pi lists models — beside `Sign in to another provider…`,
   because pi answers with every provider it is signed in to, and a second adds models rather than
   replacing the first.
8. **A row says what a provider costs that pi does not.** Anthropic bills a Claude plan used from a
   third-party app to extra usage and refuses every request without it; its account row says so
   before the user picks it (`offerNote`), rather than leaving them to learn it from a refused prompt.

## Consequences

- No terminal is opened for sign-in or sign-out; the login terminal's arguments and its typing timer
  are gone.
- Sign-out offers only what pi stored. A key from the environment is not offered, because it is not
  pi's to remove; the panel says so when nothing is stored.
- `/piary-login` depends on `ModelRuntime`'s shape. A pi that changes it fails the flow with pi's own
  error in the panel, which is visible (ADR 0011), not silent.
- Anthropic subscriptions used from a third-party app draw from paid extra usage; a request without
  it is refused, and the refusal is shown under the prompt.

## Lessons

- **A protocol gap is not a UI gap.** pi's RPC mode lacking a login command looked like it forced a
  terminal. The extension API already carried both halves — a command to start it, a dialog channel
  to ask through — so the gap closed without the app owning a login.
