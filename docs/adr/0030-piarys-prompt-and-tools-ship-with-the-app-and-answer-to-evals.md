# ADR 0030 — Piary's prompt and tools ship with the app, and a prompt change answers to evals

**Status:** accepted (2026-11-07).

## Context

The app started `pi --mode rpc` with nothing of Piary's own. pi ran its default
coding-assistant prompt, so it did not know its answer lands inside a document
the user goes on editing. Piary's `view` and `cell` tools (`pi-extension/`, the
package `pi-ui-views`) reached pi only when the workspace installed them; this
repo does, through `.pi/settings.json`, so the canvas worked here by accident
and nowhere else.

A prompt is also the easiest part of the product to make worse while feeling it
got better: a change that reads well on two examples loses on ten others.

## Decision

- **The app hands every pi it starts Piary's package:** `--extension
  <pi-extension>`, from `Piary.app/Contents/Resources/pi-extension/` (a
  `bundle.resources` entry) or, in a checkout, beside `src-tauri/`
  (`src-tauri/src/extension.rs`). **Except** when the user's own pi settings
  already install a package named `pi-ui-views`: then theirs runs (ADR 0004).
  This is not a preference. pi 1.0.4 treats two different files registering
  the same tool as a fatal conflict and exits at startup, rpc mode included,
  so adding ours over theirs would break the session.
- **Piary's prompt is appended, not substituted:** `--append-system-prompt
  pi-extension/system-prompt.md`. pi keeps its own tool guidance and keeps it
  current across upgrades; Piary's file says only what is true of the canvas.
  It lives in the package directory so the bundle carries it with the tools,
  and it is passed only when the file exists, because pi reads an existing
  path as a file and appends anything else as literal prompt text. It holds
  nothing that changes between sends (ADR 0028).
- **A prompt change answers to evals.** `evals/` holds cases (a conversation
  document, the prompt in it to answer, and what a good answer does) and a
  runner, `pnpm eval`, that answers each one the way the app does: the user's
  own pi, the package and the prompt, the history rebuilt from the document
  above the prompt, the `[now: …]` line. It scores what it can check without a
  judge (the document still parses with its markers intact, tools called
  and not called, a cell redefined by id, files changed or left alone, length,
  mentions) and compares a run against an earlier report. A change is kept
  when the score rises and nothing that passed now fails.
- **Evals stay out of the gate.** Not in `pnpm verify` or `make ci`: a model's
  answer is not the same twice, and a gate that fails at random is ignored.
  They are run whenever a prompt, model or pi version changes. Model calls are
  cheap, so nobody asks first.
- **Two models:** `openai-codex/gpt-5.6-luna` and `anthropic/claude-sonnet-5-5`.
  A prompt that only works for one model family does not ship.
- **Cases are synthetic until a person reviews them**, tagged `[AI DRAFT]` in
  title and tags. No real conversation enters the repo.

## Consequences

- The first baseline (`evals/reports/baseline-default`, `evals/reports/piary-v0`):
  pi's default prompt passes 23 of 32 case runs, the minimal Piary prompt 25,
  with no check that passed under the default failing under Piary's. One run
  per case, so that is an edge, not a proof. The prompt's content is now the
  work, one change per run, against the last report.
- The baseline found two failures no prompt can fix, both now their own
  questions: a session rebuilt from a document has no leading system message,
  so pi declares its prompt after the history, as an update the model reads as
  noise; and a mid-page prompt never sees the text below it.
- The judge that would read each case's rubric is not built. It waits on hand
  labels to calibrate it against, which is product work, not engineering.
- A user who installs their own `pi-ui-views` runs their copy's tools with
  Piary's prompt. If the two drift, the prompt describes tools their copy may
  not have.
