# ADR 0054 — A cell the run is working on is locked

**Status:** accepted (2026-11-18). Extends ADR 0031 (the agent proposes, the app enforces): the
chip it derives also decides what the user can touch. ADR 0048's `cellWorkPulse` preference
stands as it is: it switches the wash, which is all it ever drew.

## Context

A run that writes a cell goes on working on it: the page judges it, the agent reads the verdict and
often redefines it, up to three times (ADR 0031). All that while the artifact was live under the
pointer. A slider moved in it was moved on a definition about to be replaced, an edit begun in its
source pane was a buffer the next redefinition contradicted, and `fix` or `change…` were dead
already because a turn was running. The only sign that the artifact was not yet the user's was a
blue chip and a faint pulse, and the pulse could be switched off.

## Decision

- **The artifact holding the cell a run is working on takes no interaction.** Its outputs, its
  source pane and its controls are `inert`: no click, no key, no focus, no widget input.
- **It lasts as long as the chip is `working`** (`app/run-status.ts`): from the `cell` call's start
  until the run moves on to a cell in another artifact or ends. Not write-to-verdict. A verdict is
  not the end of the work: the run may redefine the cell a moment later, and a lock that opened
  and closed between attempts would hand the user a widget for a second and take it back. The
  whole run is the span in which nothing shown there can be relied on.
- **It never outlasts the turn.** The lock is derived in `ArtifactBlock`, from the chip's tone and
  the turn running, and is stored nowhere. A run that finishes, fails or is stopped ends the turn,
  and a chip nobody took back cannot hold an artifact shut once the turn is over.
- **Only the rendered artifact is locked.** The chip stays readable, since it is the explanation.
  The document's markdown stays editable everywhere, the cell's fence included: the document is the
  user's text first (ADR 0005), and the turn's own region is already protected by the canvas.
- **Focus goes to the document.** `inert` drops focus held inside it to nothing, and Escape, which
  stops the run, is the document's key. Focus that was in the artifact when the lock took it is
  handed to the editor, from a source pane being typed in too: a run the user cannot stop without
  a click first is worse than a few keystrokes landing at the document's caret, which is the
  prompt they sent from unless they moved it. For the same reason a redraw that moves an artifact
  under a newer answer, which drops the focus of anything inside it, gives that focus back.
- **The preference governs the wash alone.** `cellWorkPulse` switches the faint neutral wash over
  the artifact. The lock is not a preference: it protects the user's input, where the wash is a
  matter of taste.

## Consequences

- An edit buffer open in the artifact's source pane when the run reaches it is kept, unreachable
  until the run is done, and then still there to Apply or Discard.
- A selection cannot start inside a locked artifact, and find-in-page skips it.
- The lock is as coarse as the chip: one artifact at a time, the one whose cell the run touched
  last. Other artifacts the run wrote earlier are open again.

## Not chosen

- **Write-to-verdict.** Shorter, and wrong about when the work ends (above).
- **`pointer-events: none`.** It stops the pointer and leaves the keyboard: Tab still reaches a
  slider.
- **Locking the cell's markdown too.** The canvas already keeps the user out of the running turn's
  region; anything more makes the document less the user's than it is everywhere else.
- **Tying the lock to the preference.** Switching off an animation would then switch off a
  protection.
- **Leaving the focus of a source pane to drop.** It kept the next keystrokes out of the prose,
  and left Escape reaching nobody until the user clicked the document.
