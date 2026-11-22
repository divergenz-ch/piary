# ADR 0043 — The agent draws an answer through an A2UI catalog

**Status:** accepted (2026-11-15). Builds on ADR 0030 (the prompt and tools ship with the app and
answer to evals) and ADR 0031 (the agent proposes, the app enforces).

## Context

An answer meant to be looked at (figures in tiles, a comparison, a chart, an explainer with a
slider) was drawn by the agent as a cell: JavaScript it wrote, with its own colours, fonts and
layout each time. Two things went wrong. The answers did not look like one product, since each
carried about three hand-written colours and whatever type the library defaulted to. And code can
fail: of 18 such answers in the experiment, 3 showed a failing cell.

Three ways to draw were built and judged blind, pair against pair, on six cases three times each:
cells as they were, a kit of Piary functions for cells to call, and A2UI, where the agent sends a
description of the surface and the page draws it. A2UI was preferred to the kit in 16 of 18 pairs;
when the kit arm was taught the same composition (a headline, stat tiles, one chart, a takeaway)
that fell to 11 against 4. What stayed A2UI's alone is that a description can be checked before it
is drawn: 0 of 18 answers broken, where 6 of the taught kit's 18 had a cell that did not compile.

## Decision

- **An answer to look at is an `a2ui` view.** The agent calls `view` with template `a2ui` and the
  body of one surface, `{ components, dataModel? }`, built from Piary's catalog: the A2UI v1.0
  basic components and five of Piary's own (Stat, Table, Compare, Chart, Callout). The page draws
  it in Piary's type and tokens; a payload carries no colour and no style
  (`src/components/views/a2ui-*.ts`, `document-format.md` §views).
- **A payload is checked before it is drawn, and a refusal names one fault.** The `view` tool runs
  the payload through the same processor, catalog and strict validation the page renders with
  (`pi-extension/a2ui.ts`, against a serialized copy of the catalog that
  `tests/contract/a2ui-copies.test.ts` holds to the page's). A payload the page would refuse is
  refused while the agent can still fix it, with the fault at a JSON pointer. The page checks again
  when it draws and shows a refusal in the open, never a blank.
- **The check runs in the packaged app too.** Its `Resources/pi-extension/` has no
  `node_modules`, so `@a2ui/web_core` does not resolve there. `pnpm build` bundles the processor
  into `pi-extension/a2ui-core.bundle.js` (about 270 kB, git-ignored, shipped with the extension),
  and the tool imports the package where it resolves and the bundle where it does not, so a run
  from the repository checks with the installed dependency and the app with the same version
  bundled. `tests/contract/a2ui-check-packaged.test.ts` copies the package to a directory with no
  dependencies and holds that a catalog fault is refused there. With neither, the tool still
  checks the payload's shape and its formulas and answers "ok (the surface was not checked here:
  …)": an extension run from a checkout nobody built.
- **Cells stay, for what a description cannot hold:** data that lives in a workspace file (a cell
  reads it with `FileAttachment` and follows the file), a calculation the user asks to see as code
  they can edit, a drawing, a simulation or an animation, and a change to an existing cell.
- **`calc` and `series` are a formula language, not code.** A surface that derives a figure from
  its data model (a balance from a slider's rate) names a formula over its variables. It is parsed
  into a tree and walked (`src/document/a2ui-expr.ts`): numbers, names, arithmetic, comparisons and
  a fixed list of functions. Nothing the agent sends in a surface is evaluated as JavaScript.
- **Plot ships in the app, so a chart needs no network.** `@observablehq/plot` is a pinned
  dependency, loaded by one module (`src/utils/plot.ts`) as a lazy chunk on the first chart. An
  a2ui Chart and a cell's `Plot` are that one copy at that one version; the engine hands it to
  cells in place of notebook-kit's CDN import. `tests/contract/plot-in-the-app.test.ts` holds that
  no file under `src/` names Plot's CDN address.
- **The guidance has a budget, and a test holds it.** What the agent is told about a2ui lives in
  the `view` tool's description (`pi-extension/a2ui-guide.ts`), paid on every turn. It is 4,478
  characters, cut from 5,609 one design run at a time; the system prompt and the skill name no
  a2ui, and the `cell` description says only what a cell is for.
  `tests/contract/guidance-budget.test.ts` holds each ceiling as a number. Raising one owes a
  design run (`evals/README.md` §Design runs). The composition sentences and the props of Stat,
  Chart and Compare are the last text to cut: they carry most of the judged quality.
- **The A2UI dependencies are pinned exactly** (`@a2ui/lit` 0.15.0, `@a2ui/web_core` 0.15.0,
  `zod` 3.25.76). The package made four minor releases in five weeks, and the page's catalog and
  the tool's copy must be the same version. An upgrade moves all three and regenerates the copy.

## What was measured

On the reference guidance, 18 answers (six cases, three times, `anthropic/claude-sonnet-5-5`):
18 drew an a2ui surface, 17 composed it with a headline and a takeaway, none was broken and none
was refused; a median answer took 13.6 s and its payload was 1,661 characters. The same counts
held within the gate after every cut to the guidance that was kept. The blind pairs: A2UI over
cells 14 to 3, over the kit 16 to 2, and over the kit taught the same composition 11 to 4.

## Costs

- **Four runtime dependencies**, approved: the three above with ten transitive ones, and Plot
  with 38 of its own (`d3` and its modules, mostly).
- **Size.** The renderer is a lazy chunk of 497 kB (139 kB gzipped), which took `app/dist` up by
  17%; Plot is another lazy chunk of 381 kB (127 kB gzipped), 11% more. A page that shows no
  surface and no chart loads neither.
- **Prompt.** About 4.5 k characters on every turn. The kit added about 2.5 k, of which 0.8 k was
  paid on every turn and the rest read on demand.
- **Two copies of the catalog.** The packaged extension has no `node_modules`, so the tool checks
  against a generated copy (`pi-extension/a2ui-catalog.ts`), kept in step by a contract test and
  not by construction.
- **The processor ships twice.** The page's bundle holds `@a2ui/web_core` and so does the
  extension's (about 270 kB in the app), because the page and pi are separate processes. Every
  number here was measured from the repository, where the tool loads the package; the bundle is
  the same pinned version.
- **A surface cannot be redefined.** An agent that drew wrong tiles can only draw a second
  surface; a cell can be rewritten in place.

## Declined

- **The `piary` kit for cells.** A second way to draw the same thing, with its own guidance, and
  still code that can fail to compile.
- **Both ways taught at once.** Each costs prompt on every turn. Which way answers are drawn is
  one choice at a time, not two sets of guidance in one context.
- **Bundling the rest of a cell's library.** A cell's `d3`, `htl` and `Inputs` still come from the
  CDN through notebook-kit, unchanged, as does any `npm:` import a cell writes
  (`notebook-cells.md`). Only Plot was moved, because a surface's chart is not a cell and had no
  reason to need the network.

## Consequences

- A chart draws offline and is the tested version; a cell that reaches for `d3` or `Inputs` still
  needs the network.
- notebook-kit's own CDN import of Plot is still in the engine's chunk, unused: the engine's
  builtin of the same name replaces it.
- A design run does not reach a cell, so a change to the sentences that send work to a cell is
  invisible to it: such a change answers to the eval's `compute-in-cell` case, many times over.
- The design run's counts do not see a chart in the wrong scheme or fewer tiles; its shots do, and
  are read.
- The eval answers a cell's verdict with a compile check and replies on pi's wire directly, since
  pi's client has no method for it (`evals/verdict.ts`).
- A chart that fails to draw still says so in the open (`ChartElement`'s failure note), but no
  test reaches that branch now: it was held by the load failing under jsdom, which no longer
  happens, and nothing short of a mock makes Plot throw.
- An ordered series is coloured from the theme's tokens alone (`THEME_RAMP`), and a decision
  matrix uses the document's accent and muted tone: a surface has no colour of its own to drift.
