# ADR 0025 — The app keeps widget state in its own store, and writes it into the transcript only through a rebuild

**Status:** accepted (the user signed off the store, and chose the first-open read, on 2026-10-28).
Applies ADR 0002 and ADR 0021 to widget state.

## Context

A cell's widgets — a `view()` slider, a `state()` value — have state that must survive a reload. The
document carries none of it: widget state was moved out of the `.md` precisely so the file is
authoritative for nothing it can't carry (`notebook-cells.md`). An earlier prototype kept it as a
`pi-ui-cell-state` custom entry **appended to pi's transcript** while pi runs, read back
latest-wins over the whole file.

The app can't do that, for reasons checked against pi itself rather than assumed:

1. **It breaks a session not yet prompted.** pi writes its file lazily: it holds entries in memory
   until the first message, then creates the file with `openSync(path, "wx")`, which fails if the
   file exists (`session-manager.js:800` in pi 1.0.4; `:794-813` in the pinned 1.1.0). A page of
   cells that has never been prompted is the ordinary case for widget state, and seeding a file under
   it makes the first prompt throw `EEXIST`.
2. **A running pi does not see the append.** `get_entries` answers from memory; an externally
   appended entry was absent from the running pi's reply (observed, pi 1.0.4). Restoring would mean
   Rust scanning pi's file, which ADR 0021 rules out.
3. **Chaining needs Rust to parse the last line's `id`,** which ADR 0021 also rules out; an
   unchained append hands pi an empty history after a restart.

## Decision

**The app's own store, mirrored into the transcript by every rebuild.**

- **The store.** One JSON file per document at `<app data>/cell-state/<workspace slug>/<doc id>.json`,
  written by Rust (`src-tauri/src/cell_state.rs`) behind the document store's id guard and atomic
  writer, capped at 4 MiB.
  - **Not beside the document,** which may be committed to the user's repo.
  - **Not in pi's sessions directory,** which is pi's.
  - **The workspace slug** keeps two workspaces' `welcome` documents apart.
- **Restore and save.** The page always tells the canvas what was kept, or `null` for none, right
  after `setDocument`; the canvas neither restores nor saves until it is told. Each `cell-state-save`
  is written in order and silently: a lost slider position is not something the user acts on.
- **Rebuilds carry it.** `rebuildEntries` takes the page's state and writes it in place of whatever
  the transcript carried, so the transcript stays a faithful copy and never holds a stale value.
- **State already in a transcript shows on the first open.** For a document with cells and no record
  yet, the page starts the session's pi once, reads `get_entries`, takes the latest
  `pi-ui-cell-state`, and records the answer — `null` included, "checked, nothing there" — so no
  later open asks again. A file holding `null` and no file at all are kept apart, on disk and on the
  wire. A pi that cannot be asked records nothing, so the next open tries again.

## Consequences

- **No second transcript write path.** Rust touches pi's file only for a rebuild (ADR 0021).
- **A document's first open may start pi early:** only when it has cells and no record, once.
- **What a crash may take:** a state change still inside the canvas's 500 ms debounce (ADR 0018's
  table).
- **A future session copy** must copy the store file with the document.
