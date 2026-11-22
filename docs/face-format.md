# The face format: facial movement, from a detector to the app to the agent

What a camera saw of a person's face while they read an answer and typed a message, in two
layers:

1. **Detector → app: the timeline.** Structured data (JSON) with FACS codes. This is the
   interchange form: what a face detector writes and what a program reads.
2. **App → agent: the block.** The same timeline in plain words, at the end of the user's
   message, or by itself as a message with no word of the user's, when the app asks the
   agent whether it has something to add to an answer the user's face moved at. The agent
   answers that one with a sentence or two, or with `[silent]`, which is shown as nothing
   (`docs/document-format.md` §An unasked reply). The app writes it with no model involved, after dropping what its filter drops. An
   agent is never shown a numeric code.

Both describe movements, never feelings.

Normative. `src/document/face.ts` holds the types, the filter and the block's wording, and
`tests/unit/face.test.ts` holds them to this document. How the format was chosen, and the
wordings that lost, are in `evals/spikes/face-format/`.

## What it can say

- **While typing**: the face moved while a stretch of the message was typed. The anchor is that
  text, so no clock is needed to say when.
- **A pause**: typing stopped for some seconds with the caret after some text, and the face
  went through one or more movements meanwhile.
- **Deleted**: the face moved while text was typed that is not in the message any more.
- **While reading**: the face moved some seconds after the previous answer appeared. Where the
  reader was looking is not known and neither layer has a way to claim it.

## The timeline

```json
{
  "read": { "window": 4.0, "events": [ { "at": 0.6, "run": [ { "units": [[4,"C"],[24,"B"]], "dur": 1.8 } ] } ] },
  "type": [
    { "kind": "during", "text": "drop the cache line", "run": [ { "units": [[4,"C"]], "dur": 2.3 } ] },
    { "kind": "pause", "after": "by Friday", "pause": 6.2,
      "run": [ { "units": [[1,"B"],[2,"B"]], "dur": 1.4 }, { "units": [[4,"C"]], "dur": 2.0 }, { "units": [[28,"B"]], "dur": 0.8 } ] },
    { "kind": "deleted", "text": "this is ridiculous", "run": [ { "units": [[4,"D"]], "dur": 1.1 } ] }
  ]
}
```

- `read`: movements in the first `window` seconds after the previous answer was shown. `at` is
  seconds since it was shown.
- `type`, in the order of the message's text. `during`: `text` is a substring of the final
  message, typed while the run lasted. `pause`: `after` is text just before the caret, `pause`
  the pause's length in seconds. `deleted`: `text` was typed and removed. `nth` (from 1) picks
  an occurrence when the message holds the text more than once.
- A `run` is steps in time order. A step is the `units` held together and `dur`, how long in
  seconds. A unit is a FACS code and its intensity letter.

### Codes

The FACS numbers a webcam face model can report, and the words the block says each in:

| Code | Words | Code | Words |
| --- | --- | --- | --- |
| 1 | inner brows raised | 34 | cheeks puffed |
| 2 | outer brows raised | 43 | eyes closed |
| 4 | brows lowered | 45 | blink |
| 5 | upper lids raised | 51 | head turned left |
| 6 | cheeks raised | 52 | head turned right |
| 7 | lids tightened | 53 | head up |
| 9 | nose wrinkled | 54 | head down |
| 12 | lip corners pulled up | 55 | head tilted left |
| 15 | lip corners pulled down | 56 | head tilted right |
| 17 | chin raised | 57 | head forward |
| 24 | lips pressed | 58 | head back |
| 25 | lips parted | 84 | head moved side to side |
| 26 | jaw dropped | 85 | head moved up and down |
| 28 | lips sucked in | | |
| 32 | lip bitten | | |

Intensity is FACS's letter: A trace, B slight, C marked, D severe, E maximum.

The words name a movement and never what it may mean. FACS calls 84 a head shake and 85 a head
nod; the block does not, because a nod is a yes in one place and a no in another.

## The filter

Before writing the block, the app drops blinks (45), units weaker than a threshold intensity and
steps shorter than a threshold length, then every run and entry left empty (`filtered`). It is
a rule over the timeline: no model reads the face before the agent does.

The threshold is marked (C) and 0.5 s unless the user chose otherwise (`FACE_THRESHOLD`): the
intensity may be slight (B), marked or severe (D), the length 0.3, 0.5, 1 or 2 s. Blinks are
dropped at every setting. Why a step is dropped is one of three things, in this order: it
holds nothing but blinks, nothing in it reaches the intensity, or it is too short (`dropOf`).

## The block

One block at the end of the message: a `[face]` line, then one line per timeline entry, reading
lines first and the rest in the order of the timeline. Each construct of the timeline has one
construct in the text:

| Timeline | In the text |
| --- | --- |
| a `read` event | `read <seconds>s: <run>`, the seconds since the answer appeared |
| `during` | `typing <anchor>: <run>` |
| `pause` | `pause <seconds>s after <anchor>: <run>`, the pause's length |
| `deleted` | `deleted <quoted>: <run>`, the removed text |
| a unit | the movement's words, a space, the intensity's word |
| units of one step | joined by ` + `, then a space and the step's seconds with `s` |
| steps of one run | joined in order by `, then ` |

Rules:

1. **An anchor is text of the message, exactly**, case and whitespace included, quoted with
   JSON's escapes. A program finds it with a substring search.
2. **Ambiguity is marked, not avoided.** If the message holds the anchor's text more than once,
   the anchor ends in `#n`, counting occurrences from 1.
3. **A long anchor is elided once.** Over 48 characters it is written as its first words, `…`,
   and its last words. It means the stretch from the first part to the next occurrence of the
   last part.
4. **A pause's anchor is what precedes the caret**: the last words typed before the pause, up
   to 24 characters, cut at a word.
5. **Seconds have one decimal.**
6. **Nothing to say is no block at all.** There is no empty block.
7. **The block has no blank line**: a newline in quoted text is JSON's `\n`.
8. **An entry that cannot be anchored is left out.** A `during` or `pause` entry whose text the
   message does not hold has no line; the rest of the block is written.
9. **At most 6 lines.** Past that the strongest are kept, in the order they had: a line's
   strength is its highest intensity, then its longest step.

For the timeline above, in a message that holds "…and still ship by Friday?":

```
[face]
read 0.6s: brows lowered marked + lips pressed slight 1.8s
typing "drop the cache line": brows lowered marked 2.3s
pause 6.2s after "still ship by Friday": inner brows raised slight + outer brows raised slight 1.4s, then brows lowered marked 2.0s, then lips sucked in slight 0.8s
deleted "this is ridiculous": brows lowered severe 1.1s
```

(As a timeline says it: the filter would have dropped the slight movements first.)

The block comes with no legend in the system prompt: a wording that needs one to be read has
failed.
