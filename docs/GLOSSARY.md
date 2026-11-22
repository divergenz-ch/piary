# Glossary

**Maintenance rule.** This file is checked against the language in `src/document/*` and the two
normative specs (`document-format.md`, `notebook-cells.md`). When a term here stops matching that
language, the entry is fixed or removed in the same change; if the file as a whole stops matching,
it is **deleted rather than maintained** — a stale vocabulary misleads worse than none.

It is deliberately sparse. A term is here only if it appears in `src/document/*` or a normative spec
**and** a reader new to the code cannot infer it from the word. Where a spec already defines a term, this
file points at the § and does not restate it — a second definition is a second thing to drift. Its
job is to be the index, and to settle collisions: the words below that mean more than one thing.

---

## The collisions

### settled — three meanings, unrelated

| Sense | Where | What it means |
|---|---|---|
| **The settled gate** (cells) | `notebook-cells.md` §The agent loop; `#reportSettledFailures` in `src/components/DocumentChat.ts` | Whether a turn has *finished writing* a cell, so its verdict may be reported to the agent. Positional, never a timer — defined in that § |
| **`LiveView.settle()`** (live views) | `src/document/live-views.ts`, the `LiveView` interface | "No more writes are coming": the command behind a live view ended. The view stays on screen, readable; it is not `dispose()` (ADR 0013) |
| **`settle()`** (test harness) | `tests/helpers/editor.ts` | Wait a few milliseconds so microtasks, rAF callbacks and CodeMirror's measure pass run before asserting (`TEST_ARCHITECTURE.md` §2). Says nothing about turns or cells |

A sentence that says "settled" without one of these three names is ambiguous; name the sense.

### cell — the notebook cell, and the editor's cell

- **Notebook cell** — a `pi:cell` segment: live code the reactive engine runs. `DocCell` in
  `src/document/cells.ts`. Defined in `document-format.md` §Cells and the whole of
  `notebook-cells.md`.
- **Editor cell** — any segment with a mode control, which the page lets you switch between
  `prompt` (a `<!-- you -->` segment), `markdown` (a `<!-- pi:note -->` segment — page prose the
  model reads as material on the page, never as a prompt addressed to it) and `js` (a notebook
  cell). `CellMode` / `cellMode` /
  `setCellMode` in `src/document/run.ts`. Observable's word for the control, which is why it
  overlaps. A reply or a tool call is not an editor cell.

The `markdown` mode's segment is specified in `document-format.md` §Notes.

### run — running a prompt, and a run of segments

- **Running a prompt** — sending the prompt the caret means and letting its answer land under it;
  *re-run* is doing so for a prompt that already has an answer, which replaces it. The header of
  `src/document/run.ts`; `answerRange` is what tells the two apart.
- **A run** (noun) — a contiguous stretch of segments or lines treated as one unit: the
  thinking/assistant/tool-call run that reconstructs one assistant message
  (`document-format.md` §Message reconstruction), a snippet run inside a prompt (`snippetRuns`,
  `format.ts`), one declaration's span of an artifact (`artifactRuns`, `run.ts`), cells not broken
  apart by the traffic in `IN_ARTIFACT` (`cells.ts`).

### block — the rail's unit, and the marker that merges into it

- **Block** — a derived grouping of segments: one intent in the rail, opened by an authored
  segment. `DocBlock` / `blocksFrom` in `format.ts`. Defined in `document-format.md` §Block markers.
- **Block marker** — `<!-- pi:block -->`, the one persisted override, which *folds* the following
  prompt into the previous block. Its segment kind is `"block"`, which is why a `DocSegmentKind` of
  `block` is a marker and not a block.

- **Face block** — not a block of the document at all: the `[face]` lines a send puts at the
  end of a message pi is handed, never written into the file (`docs/face-format.md`,
  `withoutAppTail`). "The block" in `app/face/*` and `src/document/face*.ts` means this one.
- **Aside** — `<!-- pi:aside -->`, what the agent said unasked. A segment inside the block of
  the answer it is about; it opens none (`document-format.md` §An unasked reply).

### branch — pi's, not the document's

**Branch** always means pi's session tree: entries chained by `parentId`, walked up from a leaf
(`activeBranch` in `src/document/branch.ts`). The document has no branches — `document-format.md`
§The document is the history says so in as many words. A document derived from a transcript is the
active branch serialized (`serializeBranch`); nothing in the document forks.

### bundle — a conversation with its files

**Bundle** (ADR 0049) — what a conversation is exported as and imported from: a folder holding its
`.md` and an `attachments/` with the files it references, or that folder zipped.
`src-tauri/src/bundle.rs` does the file work, `src/document/bundle.ts` reads the references.

---

## Terms a spec defines — read them there

| Term | Code name | Defined in |
|---|---|---|
| **marker** | `DocSegmentKind`, the `*_MARKER` constants | `document-format.md` §Segments (the marker grammar) |
| **segment** | `DocSegment`, `parseDocument` | `document-format.md` §Segments |
| **artifact** | `DocArtifact`, `artifactsFrom` | `document-format.md` §Artifacts; `notebook-cells.md` §Document integration |
| **view** / **live view** | `views.ts` / `LiveView` in `live-views.ts` | `document-format.md` §Views; ADR 0013. Static views render once; live views take content over time |
| **snippet** | `SNIPPET_MARK`, `snippetQuote` | `document-format.md` §Snippets |
| **artifact scope** | `ARTIFACT_MARK`, `artifactScope` in `cells.ts` | `document-format.md` §Snippets |
| **pending prompt** | `tailPrompt` in `run.ts` | `document-format.md` §Message reconstruction (the trailing user segment) |
| **rebuild** | `documentMessages` in `format.ts`; `rebuildEntries` in `src/document/transcript.ts` (ADR 0021) | `document-format.md` §The document is the history and §Replaying a document as a transcript; ADR 0002. A send rewrites the transcript from the document wholesale — never a diff |

---

## Terms only the code defines

**reply slot** — where a follow-up typed into a block goes: the open prompt the block already ends
in, or the `<!-- pi:block -->` + `<!-- you -->` pair that stages one. `replySlot` in
`src/document/run.ts`; returned as one change plus the caret, so staging and placing the caret are
one transaction.

**region** (the machine's region) — the span of the document a live turn writes into, held as three
offsets: `msgAnchor` (end of the last *finalized* message of the turn), `tailAnchor` (end of
everything streamed so far) and `turnAnchor` (where the turn opened). `beginTurnAt` in
`src/document/run.ts` computes where it opens; `StreamRegion` in `src/components/editor-state.ts`
holds it while the turn is live, and it is `null` between turns (ADR 0017). `msgAnchor` is what the
settled gate reads.

**subsession** (child session) — a prompt run in a session of its own: `/subagent <prompt>`
(`src/document/modes.ts`, the `subagent` mode) starts a child with its own sid, pi, transcript and
document, and the parent holds a `pi:view subsession` card for it
(`src/components/views/subsession.ts`). The card's status is pushed by the host, never stored in
the document. The parent's cards are the list of its children; there is no other register.

**carry** — the session state a rebuild or a duplicate takes across from the transcript it
replaces, because the document cannot hold it: model, thinking level, name, and the latest
per-session custom entry of each kind. `carriedState` in `src/document/transcript.ts` (widget state
lives in the app's own store, ADR 0025); the
list and the reason are ADR 0002 §Decision. Provider metadata per message is *restored position
for position* instead, which is a different mechanism with a different word.
