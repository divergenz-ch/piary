# face/1: the renderings and the code form the experiment tried

The format itself is `docs/face-format.md`: the timeline, the codes, the filter and the block
the agent is shown (`clipped`). This file keeps what only the experiment has: the wordings that
lost and the code form. `timeline.ts` holds them, over the app's own types
(`src/document/face.ts`), and `tests/unit/face-format.test.ts` holds them to this document.

The examples are of the timeline in `docs/face-format.md` §The timeline.

Two other renderings were tried and are kept in `timeline.ts` as arms of the experiment
(`results/rendering.md`). One spends more words:

`phrases`
```
[face]
- 0.6 s after your answer appeared: brows lowered (marked) + lips pressed (slight), 1.8 s
- while typing "drop the cache line": brows lowered (marked), 2.3 s
- paused 6.2 s after "still ship by Friday": inner brows raised (slight) + outer brows raised (slight), 1.4 s; then brows lowered (marked), 2.0 s; then lips sucked in (slight), 0.8 s
- typed then deleted "this is ridiculous": brows lowered (severe), 1.1 s
```

and one fewer, which one model misread: its pause line does not say that the quoted text
came before the pause.

`telegraphic`
```
[face]
read 0.6 brows lowered marked+lips pressed slight 1.8
typing "drop the cache line" brows lowered marked 2.3
pause "still ship by Friday" 6.2 inner brows raised slight+outer brows raised slight 1.4 > brows lowered marked 2.0 > lips sucked in slight 0.8
deleted "this is ridiculous" brows lowered severe 1.1
```

`words` is the first experiment's shape and the baseline: `phrases` with a header that says
what the block is, an excerpt written `"…text…"` and never elided, and an occurrence written
out (`(occurrence 2 of it)`).

No rendering comes with a legend in the system prompt. One that needs a legend to be read has
failed.

## The code form, and why the agent does not get it

The same constructs were first written with FACS codes, and with a fixed name per code:

```abnf
block    = "[face/1]" 1*( LF line )
line     = read / typing / pause / deleted
read     = "r" SP seconds SP run            ; seconds since the answer appeared
typing   = "t" SP anchor SP run             ; text typed during the run
pause    = "p" SP anchor SP seconds SP run  ; text before the caret, then the pause's length
deleted  = "d" SP quoted SP run             ; text typed and removed
run      = step *( " > " step )             ; steps in time order
step     = unit *( "+" unit ) SP seconds    ; movements held together, then for how long
unit     = code intensity
code     = 1*2DIGIT                         ; a FACS code
intensity = "A" / "B" / "C" / "D" / "E"
anchor   = quoted [ "#" 1*DIGIT ]           ; "#2": the second occurrence in the message
quoted   = <a JSON string>                  ; JSON's escapes; may hold one "…"
seconds  = 1*DIGIT "." DIGIT
```

```
[face/1]
r 0.6 4C+24B 1.8
t "drop the cache line" 4C 2.3
p "still ship by Friday" 6.2 1B+2B 1.4 > 4C 2.0 > 28B 0.8
d "this is ridiculous" 4D 1.1
```

`parseCodes` reads such a block back into the timeline it was written from, and the test holds
that round trip for every case: it is the proof that the constructs and the anchor rules lose
nothing and are unambiguous. As something to show an agent it failed. Models misread the
numbers without a legend, one model misread them with it, and the legend costs more input
tokens on every turn than the compact block saves (`results/decode.md`).
