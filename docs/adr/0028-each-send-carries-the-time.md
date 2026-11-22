# ADR 0028 — Each send carries the time, on the message, and the document never holds it

**Status:** accepted (2026-11-02).

## Context

Piary passes pi no system prompt of its own. pi's default prompt names the
working directory but not the date. So a question about today, or anything
that depends on it, was answered from the model's training data. A system
prompt of Piary's own is wider work, and it waits on evals. Facts that change are
not prompt work: they belong to the send.

There were three ways to hand pi the time:

- **`--append-system-prompt`.** It is fixed when pi starts, and the app's pi
  is resident for hours and across midnight, so it goes stale.
- **A pi extension** (`-e`, `before_agent_start`). It is pi-native, but it is
  a file the app must ship and locate, and it depends on the user's own pi
  having that hook (ADR 0004).
- **A line on the user message.** It needs neither, and it has a precedent in
  the `[attached: …]` line (`document-format.md` §Attachments).

## Decision

- **Every message the app hands pi ends with one line naming the wall
  clock:** `[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]`. That is
  the weekday, the ISO date, the time to the minute, the IANA zone and the UTC
  offset, taken from the webview's clock and `Intl`, which is the user's
  machine. It goes last, after any `[attached: …]` lines.
  - `src/document/turn-context.ts` builds it.
  - `app/now.ts` stamps it, used by the prompt in `app/turn.ts` and the
    child's prompt in `app/subsessions.ts`.
  - Steering and follow-up take it too when they land.
- **The document never holds it.** One rule covers every reader:
  `serializeUser` drops a user message's trailing `[now: …]` lines, every one,
  when a transcript is written as a document (`document-format.md`
  §Serialization rules). That applies to:
  - the history compare before a send (ADR 0021), which therefore reads no
    edit and does not rebuild;
  - a document rendered from a transcript (`app/boot.ts`);
  - the subsession mirror (ADR 0027).

  A rule at each reader would have been three rules to keep in step.
- **The compare reads the document the same way.** `app/history.ts` drops a
  document user message's trailing `[now: …]` lines before comparing, and it
  does so in place, so a rebuild writes the text the next compare reads.
  Without this, a prompt whose own last line looks like the stamp differs from
  the transcript after its first rebuild, and every later send rebuilds again.
  Stripping every trailing line, not only the last, is what lets a stamp after
  such a line read like the line alone.
- **The offset is computed, not named.** It is the zone's wall clock read as
  UTC, less the instant, so an engine without `longOffset` time-zone names
  still writes a correct `UTC±hh:mm`.
- **No OS or working-directory line.** The app is macOS only (ADR 0014), and
  pi's own prompt names the cwd.

## Consequences

- pi's transcript holds each prompt with the line it was sent with. A rebuild
  writes the history from the document, so past lines are gone after one. pi
  needs only the current line, and the send going out carries it.
- A user's own prompt whose last lines are literally `[now: …]` loses them
  from the history and from a document read back from a transcript. This is
  accepted: the line has to look like something. It costs at most one rebuild,
  never one per send.
- What this does **not** settle is a Piary system prompt and its evals.
