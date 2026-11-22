# ADR 0048 — Preferences are the app's own file, and every window hears a change

**Status:** accepted (2026-11-16). A feature to be tried before it is the default
is a preference, not a constant in `app/features.ts`, which is gone.

## Context

Every behaviour of the app was fixed in code. The one switch it had, the pulse over a cell a run is
working on, was a constant of the page's build (`app/features.ts`): the same for every user, changed
by a rebuild. Some users find the pulse distracting, and more behaviours people want differently are
coming, starting with how Select All selects. The app needs a place where the user says how it
behaves, and that raises three questions: where the choice is kept, how a change reaches the windows
already open, and who opens the window.

## Decision

- **One Preferences window for the app**, titled Settings, opened by **Piary → Settings… (⌘,)**.
  Not one per document: asking again focuses the one there is.
- **Piary's behaviour in Piary's file; pi's settings stay pi's.** The preferences are one JSON
  file, `preferences.json` in the app's config directory, written whole and atomically by Rust
  (`src-tauri/src/preferences.rs`). `PIARY_PREFERENCES` names another file, which is how a driven
  run keeps its own and never reads or writes the user's. Nothing pi decides is kept there: its
  default model, its thinking level and its session toggles are in `~/.pi/agent/settings.json`,
  which pi owns and the user's other pi sessions read too.
- **Not beside the documents, and not in the webview's storage.** A preference is the user's on
  this machine, in every workspace, and must never be committed with a repo's conversations.
  `localStorage` is per webview origin, invisible to Rust, and a change there reaches no other
  window.
- **Defaults are the behaviour with no file.** A missing, unreadable or malformed file reads as
  the defaults, and a key the file lacks reads as its own default (`wire::Preferences`,
  `#[serde(default)]`), so adding a preference never invalidates a file. A default is the behaviour
  the app had before the preference existed, unless the change that adds it decides otherwise.
- **A change applies at once, in every window.** `preferences_write` keeps the file and then emits
  `preferences-changed`, with all the preferences, to every window; nothing is emitted for a write
  that failed. A page reads once at boot and follows the event (`app/preferences.ts`), and whatever
  draws from a preference redraws on it: no restart, and no watcher on the file.
- **The window shows what is kept, never what was clicked.** A control moves when its change comes
  back as the event, and a write that failed leaves it where it was and says so in the window.
  There is no Save button.
- **Settings… is a page's verb like the rest of the menu**: the focused window's page answers it by
  asking Rust for the window (`open_preferences`), so the real-app suite can open it, and the tour
  holds it as it holds every item a step does not ask for (ADR 0038). With no window focused Rust
  opens it itself: unlike every other verb it needs no window to act in.
- **The Preferences window answers the menu items that open a window** (New Document, Open…,
  Welcome) and no other: the rest act on a document, which it does not have. So the app left with
  only this window open is still a way to a document, and it is not closed with the last one.
- **A preference is declared once per layer and the layers are held together**: the Rust struct
  generates the page's type; the window's rows are keyed by that type, so a preference with no row
  does not compile; `tests/contract/preferences.test.ts` holds the page's defaults to Rust's.
- **Grouped by topic, and a topic exists once it has a row.** The pulse is under *Runs*.

## Declined

- **Writing pi's `settings.json` from Piary.** It is pi's file, with pi's schema and other readers.
- **A file watcher on the preferences file**, so an edit by hand would apply live. The window is
  the editor; a hand edit applies at the next launch.
- **A preference per window or per document.** Nothing asked for it.

## Consequences

- An older Piary that writes the file drops keys a newer one added: the file is written whole from
  the struct it knows.
- The Preferences window is a second page of the app's bundle (`app/preferences.html`), granted the
  same core capabilities as a document's window. It holds nothing to write, so it answers the
  exit sequence's flush at once (ADR 0019 §2).
- A page behaves by the defaults for the moment before its first read lands, and for good when that
  read fails: a preference is never a reason for a window not to open.
- The menu click itself is seen by no automated layer, as for every item
  (`docs/running-the-app.md`); what it calls is.
