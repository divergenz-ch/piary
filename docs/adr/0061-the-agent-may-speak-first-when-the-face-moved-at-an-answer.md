# ADR 0061 — The agent may speak first, when the user's face moved at an answer

**Status:** accepted (2026-11-21). The seven rules below were each put to the user and decided
that day. Builds on [ADR 0060](0060-the-face-reading-an-answer-goes-with-the-next-message.md).

## Context

A reading of the user's face at an answer (ADR 0060) waits for the next message. Often there
is none: the user frowns at a word they do not know, and says nothing. The experiment found
that a model shown such a reading by itself, with no message, can add the sentence that was
missing, or rightly say nothing; that Sonnet and Opus did and Haiku never spoke; and that no
model can tell a frown at the answer from a frown at something else in the room.

Letting the agent write into the document unasked changes how the canvas behaves (ADR 0010),
so none of it was built before it was decided.

## Decision

1. **When.** Six seconds after a turn ends in an answer, with no key since, the reading open
   (ADR 0060: the window in front, the answer in sight, a new answer) and holding at least one
   line that is marked or stronger and half a second or longer, whatever the user's own filter
   passes on with a message (`unaskedThreshold`). Once for an answer. What the agent says
   unasked opens no reading, so it never answers itself.
2. **Which models.** Any model is tried. After three silent replies in a row the agent is not
   asked again that session (`SILENT_RUN_MAX`), and a short list of models known never to
   speak is not asked at all (`NEVER_SPEAK`, Haiku to begin with). The list keeps out; a model
   not on it is tried.
3. **Where it stands.** A block kind of its own, `pi:aside`, under the answer it is about and
   inside that answer's block (`docs/document-format.md` §An unasked reply). It is drawn in
   the flow, set apart and labelled "agent · unasked". It is put there as one edit, with the
   caret and the reader's place left alone. Showing such blocks as comments beside the answer
   is a later presentation of the same marker.
4. **Dismissing it.** *Not helpful*, on the block: one click removes it (undo brings it back)
   and the agent is not asked again in this conversation's session. The switch stays on.
5. **Silence.** The agent answers `[silent]`, or nothing, when it has nothing to add. That is
   drawn as nothing and stays in pi's transcript: a transcript is read as a document with a
   face-only message and a silent reply written as nothing, so the pair is no difference and
   the next send rewrites nothing.
6. **Cost.** Each asking is one request to the model. The face's panel says how many times
   the agent was asked this session, and how often it spoke and stayed silent.
7. **Its switch.** The `faceSpeaks` preference, off by default: a row under Camera in
   Preferences and a row in the pill's menu, writing the same key. It means something only
   while a face is read. It has no key.

**How it is asked.** `Turn.aside` hands pi the block and a time line as a prompt with no
prompt on the page: no turn opens, no badge shows, and pi's events for it are kept off the
canvas. The reply is not streamed, since nothing can be drawn until it is known not to be
silence. A message the user sends meanwhile cuts it off first.

## Consequences

- **A format change.** `pi:aside` is a marker kind, with its spec section and tests. Read
  back as a transcript it is two messages; the face-only one says `[face]` and, under it, that
  what the face did is not kept, because the document never held it.
- A reader of the file that does not know the marker shows nothing for it, as for any marker.
- A removed aside is still in pi's transcript until the next send, which then rewrites the
  history, as for any block the user deletes.
- An asking that reaches for a tool, or asks the page a question, is stopped at that moment
  and counts as not asked: nothing may act with nothing on the page to show it. What it left
  in pi's transcript is a difference the next send rewrites away.
- Silence is recognised as the guidance words it, and as models were seen to write it in the
  experiment: empty, `[silent]` in any case, quoted or with a full stop, or `∅` (`isSilent`).
- A key after the asking has gone does not take the reply back: it lands under the answer,
  above where the user is typing, and the caret stays put. A message sent meanwhile does cut
  it off.
- The back-off and the counts live as long as the window's page does, which is one
  conversation's stay in it.
- In the experiment a model shown a reading that meant nothing still spoke in a quarter of
  the cases (Sonnet and Opus, 3 of 12 each). Dismissal and the back-off are what answer that.
- **Not run against a real model in the app.** Every automated check scripts pi. The
  experiment measured the same guidance on real models, outside the app.
- pi's guidance for the face (`pi-extension/face-guidance.md`) already says what to do with a
  message that is only a block. It is given to pi whenever a face is read, not only with this
  switch on.
- One new canvas event, `aside-dismiss`, answered by the face's module.
- With a real camera, how often a reaction to something off the screen makes the agent speak
  can only be measured in use. The reading's gates, once per answer, the back-off and the
  dismissal bound it; it ships off.

## Not chosen

- **Under the same answer, as more of its text.** Another editor could not tell it was
  unasked, and pi would hold two messages where the document showed one.
- **Dropping a silent exchange from pi's transcript.** That is a rewrite and a restart of pi
  before the user's next message, each time.
- **A list of models allowed to speak.** It would go stale with every model, and the models
  are the user's own pi's.
- **Streaming the reply into the page.** A reply that turns out to be `[silent]` would have
  been drawn and taken away.
