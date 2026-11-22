# The pi document format (v1)

A conversation with pi is one markdown file. The file is the interface: you
write into it, the agent writes back into it, and any markdown editor or
renderer (iA Writer, Obsidian, GitHub) shows a clean document — because all
machine structure lives in HTML comments, which render as nothing.

Design goals, in priority order:

1. **A plain markdown file is a valid conversation.** A file with no markers
   at all is one pending user message. You can start a conversation by
   writing prose in any editor and handing the file to pi.
2. **Renders clean everywhere.** Markers are HTML comments; payloads (tool
   arguments, tool output) are fenced code blocks. No custom syntax.
3. **Parseable back into turns.** The segment grammar below is regular; a
   parser needs one line-scan.

## Frontmatter

Optional YAML frontmatter identifies the file:

```markdown
---
pi: v1
session: web-ab12cd34
---
```

`pi` is the format version, `session` the pi session id the document is bound
to. Tools that create documents write it; hand-written files may omit it (the
session is then inferred from filename or assigned on first send).

**The version rule.** A missing frontmatter, or a frontmatter with no `pi` key,
is `v1` — a plain markdown file is a valid conversation and stays one. A reader
that meets a `pi` value it does not recognise **may render the file but must
not rewrite it**: it saves nothing over that file and says so, rather than
writing it back in the version it does know. A silent rewrite would drop
whatever the newer version added, with nothing to report it. This is the same
stance the parser takes toward an unknown marker (§Parsing rules), one level
up: preserve what you do not understand, never downgrade it. The planned `v2`
(§Message reconstruction — honouring edits to earlier turns) will be written as
`pi: v2`, so a `v1` reader refuses it rather than flattening its history.

The version is the `pi` key's scalar value inside the frontmatter, compared as
a string after YAML quoting and surrounding whitespace are removed: `pi: v1`,
`pi: "v1"` and `pi: 'v1'` are the same version, and a `pi: v9` line in the
body is prose. A `pi` key with an empty value is present but names no version
a reader knows, so it is refused like any other unknown value rather than read
as `v1`.

## The document is the history

The buffer is the conversation, not a view of it. Editing a completed prompt,
correcting a result, or moving a block changes the document; the next send
rewrites the session transcript from it, wholesale (`POST /session/rebuild`
→ `messagesFrom`). There is no diff, no branch, no fork, and nothing ever
re-runs on its own — the rewrite only makes the transcript agree with what
you already see.

Two consequences, both deliberate:

1. **Edits are destructive.** With no sibling branches, the replaced history
   is gone from the transcript. `.backups/<id>/` in the document directory keeps rolling snapshots of each
   document: at most one a minute, the newest fifty
   (`adr/0018-what-a-crash-may-take.md`). Put `pi-docs/` under git if you want
   real history.
2. **A rebuild drops thinking signatures.** The document never carried them
   (`serializeAssistant` writes `c.thinking`, not `c.thinkingSignature`), so
   a rebuilt prefix has unsigned reasoning. Providers accept this; you lose
   reasoning continuity across the rewrite, not correctness.

Provider metadata the document cannot carry — usage, model, timestamps — is
restored position for position from the entries being replaced, so an
untouched message keeps its real numbers. Block structure rides along: a
`pi:block` marker becomes a `block-new` custom entry, so `document → JSONL →
document` is the identity, folds included. The `.md` file is therefore a
rendering, not a store — delete it and the transcript rebuilds it whole.

**Copying runs that the other way.** A session can be duplicated
(`POST /session/duplicate`): the document is written out whole under a new sid,
with only its frontmatter's `session` key rebound, and the copy's transcript is
*seeded* rather than copied — the latest `session_info`, `model_change`,
`thinking_level_change` and custom entry of each type, which is exactly what
`rebuildSession` already carries across a rewrite. The messages are not written
by the copy at all; they arrive on its first send, when the buffer disagrees
with an unset baseline and the ordinary rebuild builds them from the document.
Attachments are not copied either — the store is flat, so the copy references
the same bytes. That still forks no history: the copy is a second conversation
that starts where the first had got to, and the two diverge from there. Note
that a document holding `pi:view subsession` blocks copies those verbatim, so
the copy's cards point at the *original's* children.

**Where the machine is disposable** the transcript
is the ephemeral half — it lives only for the lifetime of the machine.  The
document file together with its stored attachment bytes are the whole of what
is durable — as of their last save, which is a bound, not every keystroke
(`adr/0018-what-a-crash-may-take.md` states what each kind of failure may
take).  That
means: lose the document, lose the conversation.  The transcript is
reconstructed from it on the next rebuild, so it need not
survive.

## Segments

The document body is a sequence of **segments**. A segment starts at a
**marker** — an HTML comment alone on its own line — and runs until the next
marker or end of file. Text before the first marker (after frontmatter) is a
`user` segment with no marker.

| Marker | Segment | Content |
| --- | --- | --- |
| `<!-- you -->` | user | prose the user wrote |
| `<!-- pi -->` | assistant | prose the agent wrote |
| `<!-- pi:thinking -->` | thinking | the agent's reasoning |
| `<!-- pi:tool NAME #ID -->` | tool call | one fenced ```` ```json ```` block: the call arguments |
| `<!-- pi:result #ID -->` | tool result | one fenced block: the output |
| `<!-- pi:result #ID error -->` | tool result (failed) | one fenced block: the error output |
| `<!-- pi:view NAME #ID -->` | view | one fenced ```` ```json ```` block: the view's data payload |
| `<!-- pi:cell MODE #ID -->` | cell | one fenced block: the cell's source (fence language = MODE) |
| `<!-- pi:artifact @NAME -->` | artifact | empty — opens a block; the cells written under it are its members |
| `<!-- pi:file MIME #ID -->` | attachment | one line: `![name](url)` for an image, `[name](url)` otherwise |
| `<!-- pi:note -->` | note | page prose the user wrote — material on the page, not a prompt |
| `<!-- pi:aside -->` | aside | what the agent said without being asked — see **An unasked reply** |
| `<!-- pi:block -->` | block marker | empty — placed immediately before a `<!-- you -->` |

Marker grammar (exactly one space after `<!--` and before `-->`):

```
^<!-- (you|pi|pi:thinking|pi:tool [^\s#]+ #[\w-]+|pi:result #[\w-]+( error)?|pi:view [^\s#]+ #[\w-]+|pi:cell [^\s#]+ #[\w-]+( @[^\s>]+)?|pi:artifact @[^\s>]+|pi:file [^\s#]+ #[^\s>]+|pi:note|pi:aside|pi:block) -->$
```

`NAME` is the tool name, `ID` the provider's tool-call id; a result's `#ID`
links it to its call. For a view, `NAME` is the view template's name and
`#ID` its stable view id. For a cell, `MODE` is the cell's language (`js`,
`ts`, `md`, …) and `#ID` its stable cell id — the identity that survives
edits and addresses redefinition. An `@GROUP` token on a cell marker is the older form of the same idea and
still parses; the marker below is what is written now.

### Artifacts

An **artifact** is several cells that read as one thing — an app, a chart with
its controls. `<!-- pi:artifact @NAME -->` opens a block, and the cells written
under it are its members. A renderer that runs cells gathers their output into
one frame there, with every member's source a click away inside it; everywhere
else the marker is an empty comment and the cells are ordinary code fences.

It is a block, not a derivation. That is the whole design: it has a position of
its own, so moving it is moving a block and nothing computes where it goes, and
a cell belongs to it by being inside it rather than by carrying a token that
has to agree with something. A cell nobody grouped is its own artifact and
needs no marker — its own fence is already a movable segment; a marker is for
making SEVERAL cells one thing.

**A name may be declared more than once, and the cells gather.** A block is
contiguous, so a turn that adds to an artifact cannot write into a block a
hundred lines above — its own prose, its thinking and the user's prompt are in
between. It writes the marker again instead, and the second marker means
"these belong to `@NAME` too", not "here is a second `@NAME`". A reader
collects every declaration of one name into one artifact, anchored at the
**first** of them: later turns add to an artifact, they do not move it. A
renderer that reads one artifact per marker instead will key several of them by
the same name and show the cells of only one — the rest go missing, hidden as
members of a frame that is not on the page.

Two cells with the same `#ID` are a redefinition, resolved the way they are
anywhere: the last one defines the cell. That holds across declarations too, so
a redefinition on a later turn supersedes the fence written on an earlier one.

### Views

A view is decoration over data: a UI that knows the template renders the
segment as a widget; everywhere else the JSON fence shows as an honest code
block. A `pi:view` marker missing its `#ID` doesn't match the grammar and
degrades to an opaque segment — same rendering, still safe.

Some views are **live**: their content arrives after the segment is written,
rather than being read out of the payload. `pi:view terminal #ID` is one — a
running command's output, rendered into a terminal grid. The grammar is
unchanged, and that is the point: a live view is a `pi:view` like any other,
so a document holding one still opens as clean markdown and still degrades to
a visible fence in any other tool.

What a live view's payload carries is therefore what **identifies** it, never
what it displayed: a terminal's scrollback is not document content, and a
reload shows a line saying a terminal ran here rather than replaying a dead
process. Contrast `cell-state`, whose payload IS the user's data and is
restored. The dividing line for any future live view: state the user authored
persists; output a process emitted does not.

`pi:view a2ui #ID` is a UI surface in [A2UI](https://a2ui.org) v1.0. Its
payload is the body of one `createSurface` message without the envelope:
`{ "components": [...], "dataModel"?: {...} }`. `components` is a flat list of
`{ "id", "component", ...props }`, one of them with `"id": "root"`, and children
are referenced by id. A UI renders the body as one v1.0 message. It supplies the
version, a surface of the block's own, and its catalog's id. A payload that is
already A2UI (one message, a list of them, or `{ "messages": [...] }`) is read
the same way, pointed at that surface and catalog. Piary's catalog is the basic
v1.0 catalog plus the components `Stat`, `Table`, `Compare`, `Callout` and
`Chart` and the functions `calc` and `series`, which evaluate an arithmetic
formula (never code) over values from the data model; its catalog document,
with every schema, is `pi-extension/a2ui-catalog.ts`. A payload the catalog
refuses, or one holding a formula that would not evaluate, renders as the
refusal, never as an empty surface. A view whose call
has an `error` result is an attempt the tool refused. It is shown as such, and
is not the answer. A view whose message is still streaming holds only part of
its surface. It is not judged until the message is whole.

### Cells

A cell is live code: a UI that runs cells (see
[notebook-cells.md](./notebook-cells.md)) keeps the source editable as
document text and renders the evaluated output below the fence; everywhere
else the fence shows as an honest code block. Two cells with the same `#ID`
are a redefinition — the *last* one in document order defines the cell, and
earlier ones stay visible as history. A cell in a mode the UI can't run
(unknown, or database-backed) parses but never executes.

### An unasked reply

A `pi:aside` segment is something the agent said that nobody asked for: the app showed it
what the user's face did while reading the answer above (`docs/face-format.md`), with no
message of the user's, and it chose to add a sentence or two. It sits under the answer it is
about, inside that answer's block, and opens no block of its own.

```markdown
<!-- pi -->

The idempotency key expires after 30 seconds.

<!-- pi:aside -->

An idempotency key is a token that lets the server ignore a repeated request.

<!-- you -->
```

In a transcript it is two messages: a user message that is a face block and nothing else, and
the assistant message that answers it.

- **Transcript → document.** A user message with no word of the user's (only a face block,
  with or without a time line) is written as nothing. The assistant message right after it,
  when it is words alone, is written as a `pi:aside` segment, its thinking left out. Its
  text `[silent]`, or no text, is the agent choosing to say nothing: that is written as
  nothing too, so a silent exchange is in the transcript and never in the document. A reply
  that made a tool call is written as an ordinary answer.
- **Document → transcript.** A `pi:aside` segment is those two messages again. The document
  never held the face block, so the user message says only that there was one:
  `[face]` and, on the next line, `(what the face did is not kept)`. That text is itself read
  back as a message with no word of the user's.
- An empty `pi:aside` segment is no message.

A reader that does not know the marker treats it as opaque (§Parsing rules) and shows nothing.

### Notes

A `pi:note` segment is prose the user put on the page — a heading, notes, a
paragraph of context — that is **not addressed to the agent**. A `<!-- you -->`
segment is a prompt: sending it asks for an answer. A note is never sent and
never answered; it is material the agent reads the way it reads anything else
on the page.

```markdown
<!-- pi:note -->

## Q3 revenue

Numbers came in Tuesday.

<!-- you -->

chart it
```

Its body is ordinary markdown, so everywhere else it is just prose under an
invisible comment. It is distinct from a `pi:cell md` cell, which is reactive
source a cell UI evaluates; a note is plain text and runs nothing.

A note is authored, so it **opens a block** the way a user segment does, named
by its first heading or first line, and `<!-- pi:block -->` before the next
`<!-- you -->` folds that prompt into the note's block. An empty note carries
nothing (see **Message reconstruction**).

### Snippets

A **snippet** is a selection the user quoted into a prompt for follow-up: a
blockquote whose first line is `> [!snippet]`.

An **artifact scope** does the same job for a different question: a single
unquoted line `[artifact] NAME — edit by id`, written by the UI when you send
from a block that already holds an artifact, so the agent edits that artifact
instead of building a second one beside it. `NAME` is the artifact's name
without its `@` (`the one above` for an artifact with none), cut to 14
characters with a trailing `…` when longer; the cell ids the agent needs are
already on the `pi:cell` markers above, so the line only has to say which. One line and no
quote prefix on purpose — the same shape the `[cell values]` prefix uses,
because a quoted multi-line prefix comes back from the transcript split at 40
characters and stops being a chip.

A **cell-values line** `[cell values] JSON` is the page's named cell exports at
send time, one JSON object on one line, so the agent sees what the user set
(a slider, a checkbox) without asking. The UI writes it only when the values
differ from the last such line above the prompt.

These two lines are the prompt's **prefixes**. They stand at the head of the
prompt being run, wherever that prompt is on the page, the cell values first,
each followed by a blank line. They are written into the prompt in the document
and sent to the agent with it, so both hold the same text. A prompt run again
gets the newer line in place of an older one of the same kind, never a second
copy.

Both are content, not grammar — the parser sees ordinary user text, the agent reads the quote as part of the
prompt, and every other markdown tool renders a quote (GitHub: an alert). A
UI may fold the run behind a label line, the way it folds any other machine
step; quoting is also the escape, since a `> `-prefixed line can no longer
match the marker or fence scanners.

```markdown
<!-- you -->

> [!snippet]
> A monad is a monoid in the category of endofunctors.

Explain that in one sentence, without the jargon.
```

### Block markers

Blocks are derived, not stored: every user segment opens a block, and so do a
note (see **Notes**) and an attachment (see **Attachments**) — a prompt written under one joins its
block rather than starting another. A cell does not open one: it is material
(the artifact a turn produced, or one you inserted into the block you were
reading), and the rail is a list of intents. The one exception is a cell at the
head of a document, which opens the first block so a page composed cells-first
still reads as blocks.

The one persisted override is `<!-- pi:block -->`, placed *immediately before* the
`<!-- you -->` it merges into the previous block — never replacing it. A
parser without block support sees an empty opaque segment followed by a
normal user turn; the conversation is untouched.

A heading names the block: the first `#`–`######` heading line of the opening
user text is the block's name, falling back to its first line. A block an
attachment opens is named after the file instead — its body is a markdown link,
and `![shot.png](/attachments/shot-ab12.png)` in the rail tells you nothing you
wanted to know. The file is
the single source of truth for names — renaming a block edits the heading.

### Attachments

A `pi:file` segment is a file the user handed to the agent. The bytes live in
`attachments/` beside the document; the segment holds a reference to them.

```markdown
<!-- pi:file image/png #a1b2c3 -->

![shot.png](/attachments/shot-a1b2c3.png)

<!-- you -->

what is wrong with this layout?
```

The body is ordinary markdown, so the attachment is a picture in iA Writer,
Obsidian and GitHub, a thumbnail in the editor (the live-markdown image widget
draws it — attachments needed no rendering code of their own), and a path the
agent can `read` when the model cannot see it. The mime type rides on the
marker so nothing has to sniff the file to know what it is.

**An attachment sits immediately before the `<!-- you -->` it belongs to**, after
any `<!-- pi:block -->`. That slot is not arbitrary. Putting attachments after
the prompt's text would end the document somewhere other than an open prompt,
and the whole send path is built on the page ending in one. In front of the
prompt, every one of those invariants is untouched — what changes instead is
that a reader looking backward for a fold marker has to look *past* the
attachments, which is what `leadIndex` / `isFolded` / `promptFrom` in
`format.ts` are for.

**An attachment opens a block, and the prompt written under it joins that
block.** Handing someone a picture is an intent, and every other authored
segment here — prose, an artifact — gets a block; an attachment that did not
was the one thing on the page you could not point at, fold, or drag. The block
is named after the file, so the rail reads `shot.png`. Several attachments on
one prompt stay one block: three images and a question is one thing you are
asking, not four. An attachment with nothing under it is simply a block on its
own.

The two sides of the format answer "does this open a block?" **differently for
the prompt under an attachment, on purpose**:

- `blocksFrom` (the document): the attachment opens, the prompt folds in.
- `documentMessages` (the transcript): the prompt is still an opener, because a
  `pi:file` never becomes a message and the prompt is the first thing in that
  block that exists at all. If it were folded here, `rebuildSession` would write
  no `block-new` for it and the next document rebuilt from the transcript would
  fold that prompt into whatever came before — structure lost, one round trip
  later. `tests/unit/attachments.test.ts` pins this.

**The document is authoritative.** The transcript stores base64, the document
stores a path, and there is no way back from the first to the second — so
`serializeMessages` writes no `pi:file` for an image it has no path for. What a
rebuild does instead is read the paths forward: `documentMessages` reports the
references it walked, and the host turns them into image content for a send
and a rebuild alike — in the desktop app, its page, reading the bytes from its
Rust store (ADR 0026). One resolver per host, so a send and a rebuild cannot
disagree about what was attached.

Only images become vision content, and only the types pi can inline (png,
jpeg, gif, webp; bmp is converted to png). pi has no document content type, so
a PDF is stored and linked — the agent opens it with its own tools, the same
bargain the terminal strikes for a dropped file. **So the prompt names it:**
for each non-image attachment, one line is appended to its prompt's message,
after the prompt's own text,

```text
[attached: paper.pdf (application/pdf) at /abs/path/to/attachments/paper-ccc.pdf]
```

the path being the file in the host's attachment store (`attachmentNote` in
`format.ts` is the line's shape; the host supplies the path). The line is in
the message, not in the document: the segment already says the same thing to
a reader.

### Example

```markdown
---
pi: v1
session: web-ab12cd34
---

How many TypeScript files are in this repo?

<!-- pi:thinking -->

A quick count with find is enough.

<!-- pi:tool bash #call_0142 -->

```json
{ "command": "find src -name '*.ts' | wc -l" }
```

<!-- pi:result #call_0142 -->

```
14
```

<!-- pi -->

There are **14** TypeScript files under `src/`.

<!-- you -->

Thanks — and how many lines total?
```

## Message reconstruction

Segments map back to pi's `AgentMessage[]`:

- A run of `thinking` / `assistant` / `tool call` segments forms one
  assistant message, its content parts in document order. The run is closed
  by a `user` or `tool result` segment.
- Each `tool result` segment is one `toolResult` message.
- Each `user` segment is one user message — except a **trailing** user
  segment, which is the *pending* message: text written but not yet sent.
- Each non-empty `note` segment is one pi `custom` message of `customType`
  `note`, its content the note's text wrapped as
  `<page-note>\nTEXT\n</page-note>`. It closes an assistant run like a user
  segment does, sits on the branch in document order, and reaches the model
  as page material — written once, never re-attached per prompt. Reading one
  back unwraps it; a `note` message with no wrapper (a hand-written
  transcript) reads as its content verbatim. An empty note is no message.
- `file` segments are no message: their references belong to the next user
  message, which carries each image as vision content and each other file as
  one `[attached: …]` line after its text (§Attachments).
- `view`, `cell`, `block marker`, and opaque segments contribute no message —
  they are decoration and never shift a segment's position against the
  transcript.

The markdown file carries the conversational content — the text the model
reads and writes. It does not carry API metadata (timestamps, token usage,
model ids, signatures); pi's own session transcript (JSONL) remains the
authority for exact replay. In v1 the flow is append-only: sending transmits
the trailing user segment, and the agent's reply is appended by the UI.
Honoring edits to *earlier* turns (fork/rewind semantics against the pi
transcript) is deliberately out of scope for v1 and is the planned v2.

## Serialization rules

Writers (the UI, or any tool emitting this format) must:

- Separate every marker from surrounding content with a blank line.
- Size payload fences to the content: use one backtick more than the longest
  backtick run in the payload, minimum three (standard CommonMark practice),
  so tool output containing ``` fences round-trips.
- **Escape marker look-alikes in content:** a content line that would itself
  match the marker grammar is written with *two* spaces after `<!--`
  (`<!--  you -->`). Renderers still show nothing (it's a comment); parsers,
  which require exactly one space, see plain content and remove the extra
  space when extracting text. A content line that is *already* an escaped
  look-alike — `<!--`, two or more spaces, then what would be a marker with
  one — gets one more space too, so removing one space undoes exactly what
  writing added. "Line" means split on `\n` alone, as the parser splits
  lines: a line ending in `\r` is not a marker, and is not escaped. The
  round-trip is **whitespace-insensitive at
  the edges**: a body written escaped parses back to the same text without
  its leading and trailing whitespace, because segment text is trimmed
  (§Parsing rules). Everything between those edges survives exactly — marker
  look-alikes, nested comments and CRLF line endings included.
- **A user message read from a transcript drops its trailing `[now: …]`
  lines.** A host may end each message it hands the agent with one line
  naming the wall clock, such as
  `[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]`, so the model
  does not answer questions about today from its training data. That line is
  a fact about when the message was sent, not something the user wrote. Every
  line matching `^\[now: [^\]\n]*\]$` at the end of a transcript's user text
  is left out of the document, not only the last. An `[attached: …]` line
  before them stays (§Attachments), and a `[now: …]` line followed by other
  text is ordinary text. A host comparing a document with a transcript reads
  the document's user text with the same rule. A user's own prompt whose last
  lines are literally such lines is read the same way, which is an accepted
  edge: those lines are not part of the history. A document rebuilt into a
  transcript therefore carries no `[now: …]` lines; only the send that is
  going out carries the current one.
- **A user message read from a transcript drops a trailing face block.** A
  host may also end a message with a block saying what a camera saw of the
  user's face while it was typed (`face-format.md` §The block), after any
  `[attached: …]` lines and before the `[now: …]` line, with a blank line
  above it. Like the time line it is a fact about the send, not something the
  user wrote. Once the trailing `[now: …]` lines are gone, the block is a line
  that is exactly `[face]`, first in the text or after a blank line, followed
  to the end of the text by one or more lines the block's wording writes and
  nothing else; it and the blank lines above it are left out of the document.
  A `[face]` line followed by any other text is ordinary text. The host's
  compare reads the document's user text with the same rule, a user's own
  prompt that ends in literally such a block is read the same way, and a
  document rebuilt into a transcript carries no block. A message that was
  only a block serializes to nothing.
- Tool-call arguments are pretty-printed JSON in a ```` ```json ```` fence.
  Tool results are fenced with no language.
- A view's payload is pretty-printed JSON in a ```` ```json ```` fence,
  exactly one per `pi:view` marker.
- A call of the `view` tool (the Piary extension's) is serialized as its
  `pi:view` block — view name = the call's `template` argument, view id = the
  tool-call id, payload = the `data` argument — not as a `pi:tool` marker.
  The call's `pi:result` is written normally — usually `ok`, sometimes a real
  answer ("the data does not fit that template"), so it is worth keeping.
- A call of the `cell` tool is likewise serialized as its `pi:cell` block —
  mode = the `mode` argument (default `js`), cell id = the `id` argument
  (redefinition) or `shortCellId(callId)`, the last six word characters of the
  tool-call id (a fresh cell), fence content = the `source` argument, fence
  language = the mode. Arguments that would break the marker grammar
  (whitespace, `#`, or `>` in mode or id) fall back to an honest `pi:tool`
  block.
- **A cell's `pi:result` is not written at all.** The call IS the cell, and its
  result says `ok`. Writing it was worse than useless: the cell marker is
  addressed by the short id while the result marker carried the raw tool-call
  id, so the two disagreed, and a document rebuilt into a transcript produced a
  `tool_use` with no matching `tool_result` — which the provider rejects
  outright. Editing an artifact's code is exactly what triggers a rebuild, so
  the gesture the artifact editor exists to invite was the one that stranded
  the session. Making the two markers agree needs a map the streaming path
  cannot carry (call and result arrive as separate events). Not writing the
  second marker needs nothing: the reader synthesizes the result from the id it
  just emitted for the call, so there is no pair left to drift.
- `<!-- pi:block -->` is written on its own, immediately before the
  `<!-- you -->` marker it folds — it never replaces the user marker.

## Parsing rules

- Frontmatter: a `---` line at offset 0, up to the next `---` line.
- Scan lines against the marker grammar; each match opens a segment.
- Segment text is everything between its marker line and the next marker,
  trimmed of the surrounding whitespace. Un-escape first, then trim: remove
  one space after `<!--` from every line that has two or more and would be a
  marker with exactly one (§Serialization rules).
- For `tool call` / `tool result` / `view` segments, the payload is the first
  fenced block in the segment; an unclosed fence (mid-stream) runs to segment
  end.
- Unknown `<!-- pi:… -->` markers: treat the segment as opaque, preserve it
  verbatim on rewrite. This is the format's extension point — `pi:file` came
  through it (see **Attachments**) — and it is how `pi:view`,
  `pi:cell`, `pi:note`, `pi:aside` and `pi:block` degrade in parsers that predate them: all parse
  as opaque segments, render as nothing (or an honest fence), and round-trip
  verbatim.

### Replaying a document as a transcript

`documentMessages` is the inverse of `serializeMessages`, and it answers to a
rule the format itself does not enforce: **every `tool_use` needs a
`tool_result`, and every `tool_result` needs its `tool_use` in the message
before it.** A document that breaks it cannot be sent at all — the provider
returns `400 unexpected tool_use_id …`, and since any edit above the prompt
rebuilds the transcript from the document, one bad shape strands the session.
So the reader repairs rather than replays verbatim:

- A **cell** is answered with a synthesized `ok`, using the id just emitted for
  the call. Answers are drained after the assistant message closes and after
  any *real* results for it, so document order survives.
- A **call the document does not answer** — a result interrupted, hand-deleted,
  or edited away — keeps its call (it still says what the agent did) and is told
  so, the same repair `healDanglingToolCalls` makes server-side. "Hand-deleted"
  is a gesture now, not only an accident: every head on the page carries a `⋯`
  that removes its own segment (`deleteSegment`, `src/document/run.ts`), so half
  a turn is a shape the page can be *asked* for.
- A **result naming no call** is dropped. It is wreckage, and replaying it is
  the rejection itself.
- A **`pi:view` with no result** was written by the host, not called by anyone
  — the `cell-state` store, a subsession card, a view lifted out of a tool
  result. It is page material: the document renders it, the transcript does not
  carry it.
- A **`pi:view` sharing a `pi:tool` call's id** is that call's live panel — a
  running command's output, streamed while it ran. It is page material too: the
  call and its `pi:result` are replayed, the panel is not, so no second call
  carries the id and the result keeps the call's tool name.
