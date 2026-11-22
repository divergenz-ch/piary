# ADR 0021 — The app rebuilds through the wire: read by `get_entries`, written whole by Rust

**Status:** accepted. Applies [ADR 0002](0002-transcript-is-pis-own.md) to the app; does not amend
it. Narrows [ADR 0020](0020-the-pi-boundary.md) §1's statement that the Rust side never touches pi's
transcript to exactly one line of it, the header.

## Context

The document is the history (ADR 0002). When the document above a prompt is not what pi's
transcript holds — an edited answer, a deleted block, a re-run — the transcript is rewritten from the
document before the prompt goes. The app's send handed pi the prompt alone, so after any such edit the page showed one
conversation and pi remembered another.

The app has three parts that could hold the rewrite — the page, the Rust session layer, and pi —
and the obvious shape is ruled out: a rewrite that starts by reading pi's
JSONL file, which the Rust relay is written never to do (`session.rs`'s header, ADR 0020 §1), and
which ADR 0002 permits only as far as the few entries a rebuild must carry.

Two facts about pi's RPC decide it, both checked by hand against pi 1.0.4:

- **`get_entries` hands over the transcript.** Every entry, side branches included, plus `leafId` —
  everything the rewrite reads, and not the session header line. A transcript with a sibling branch
  written by hand came back with the sibling's entry in the list.
- **`get_state` names the file.** Its `sessionFile` is the path pi will write, reported before pi has
  written anything — a session that has never had a turn has a path and no file.

## Decision

**The page computes the rewrite; Rust writes it; nothing reads pi's file but pi.**

1. **Read over the wire.** The transcript the rewrite starts from is `get_entries`' answer. No
   component of the app reads pi's JSONL from disk.
2. **The rewrite is a pure page function**, `rebuildEntries` in `src/document/transcript.ts`:
   entries and leaf in, the entries to write after the header out. It carries the whole rule — carried state, the role-matched metadata zip, every system message pi
   wrote on the branch, in order and ahead of the history (the document never holds one), `block-new` ahead of
   each opener, the snapshot types read over the whole transcript. It is the translation side of
   ADR 0020 and names pi's types to do it.
3. **Rust writes the file whole, and knows only its header.** One command replaces a session's
   transcript at the path `get_state` reported, refusing any path not named `*_{sid}.jsonl`: it stops
   that session's pi first (shutdown hooks may append, and the file must end at the leaf), keeps the
   existing first line byte for byte — or, when there is no file, seeds the header pi itself would
   write — and writes the header plus one line per entry atomically and durably. It does not restart
   pi; the next start loads the new file. It never parses an entry.
4. **Compare what each would tell pi, not their text.** Whether the history changed is decided by
   running both the document above the prompt and the transcript rendered as a document
   (`serializeBranch`) through `documentMessages`, and comparing the messages that come out. Block
   openers are left out: a plain send after a rebuild adds a block-opening prompt with no `block-new`
   in the transcript, so counting openers rebuilt on every send after the first rebuild — and the
   model never hears block structure, which lives in the document. The same conversation has more than one spelling — the transcript renders a leading
   prompt bare where the page writes its marker, the page may carry frontmatter, the gap before the
   next prompt is layout — and a text compare reads each as an edit, which restarts pi on every
   send. The first version compared text and did exactly that on an unedited document.
5. **Fetch the baseline on every send.** A cache of what the transcript holds, advanced after each
   turn, would save a round trip. The app asks pi each time: it is a local call to a pi
   that is already running, and a cache brings in hard bookkeeping (a head edited
   mid-turn, an abandoned run, a superseded fetch) to save milliseconds.
6. **The region opens first.** The history is measured before the turn's region opens — a re-run's
   answer is cut below the prompt, so it is never in it — and the rebuild runs behind a region
   already on screen, because a rebuild restarts pi and that takes seconds. A rebuild that fails takes
   the region back out and says why.
7. **The restarted pi is put back on the model it ran.** pi restores a session's model from the last
   thing on its branch that names one: a `model_change`, or a reply, which names the model that
   answered it. A rewritten transcript carries the `model_change` first and ends on a reply the
   document kept, so pi comes back on that reply's model. The send therefore reads `get_state`
   before the rewrite and again after the restart, and when the model differs it sends `set_model`
   and the effort back (`keepModel` in `app/history.ts`). A refusal fails the sync like any other
   step: the prompt is not sent, the status line says which model pi is on and which it would not
   take, and the chip asks pi again.

## Consequences

- **The rule has one implementation,** `rebuildEntries`, and `tests/unit/transcript.test.ts` holds
  it row by row.
- **The header is the one place Rust touches pi's transcript format** — kept verbatim, or seeded as
  `{"type":"session","version":3,"id","timestamp","cwd"}`, the header pi itself writes.
- **Known limits, each owned elsewhere:**
  - **Attachments — closed by ADR 0026.** Rebuilt user messages carry their images, normalized to
    pi's limits in the page, and the compare counts them.
  - **`block-new` on a plain send.** A send at the tail that opens a block appends no `block-new`;
    block structure reaches the transcript at the next rebuild,
    which derives it from the document's openers.
  - **Rebuilding while the prompt is typed** is latency, not correctness, and is not done here.

## Lessons

- **A supported read beats a parsed file.** `get_entries` returns the transcript's entries over the
  interface pi documents, so the rewrite reads nothing pi did not hand it — and Rust needs no knowledge
  of where pi keeps its files, because pi says.
- **Ask pi for the state you need; do not arrange its file to produce it.** A model picked in the
  chip did nothing whenever the next send rewrote the history: the rewrite kept the pick's
  `model_change`, at the front, and pi restored from the old reply at the end. Writing the entry last
  would have fixed that one order and tied the app to pi's restore rule, which is pi's to change
  (ADR 0002), and it would still miss a rewrite to an empty history, where pi restores nothing.
  `set_model` after the restart depends on neither. An error that named no provider hid all of
  this, so a refusal now names the provider and model pi says it went to (`refusalText`).
