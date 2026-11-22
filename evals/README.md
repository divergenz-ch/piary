# Evals

How we know whether a change to Piary's system prompt (`pi-extension/system-prompt.md`)
made pi better or worse. Each **case** is a real-looking conversation document with one
prompt to answer and a list of what a good answer does. A runner gives every case to a
real pi, on each eval model, and checks the answers.

Evals are **not** part of `pnpm verify` or `make ci`: a model's answer is not the same
twice, so a gate built on it would fail at random. Run them whenever a question needs
an answer. Model calls are cheap.

## A case

One folder under `cases/`, named for what it tests:

```
cases/fix-broken-cell/
  doc.md        the conversation, in the document format (docs/document-format.md)
  case.json     what a good answer does
  workspace/    optional: files the workspace starts with
```

`case.json`:

| Key | Meaning |
| --- | --- |
| `title` | One line. Starts with `[AI DRAFT] ` until a person has reviewed the case. |
| `tags` | Holds `"AI DRAFT"` exactly when the title does. `"known gap"` marks a case that fails for a reason no prompt can fix, named in its rubric. `"needs pi"` marks a case the claude harness leaves out (below). |
| `job` | `explain`, `mid-document`, `edit-file`, `fix-and-run`, `cell`, `view` or `fix-conversation`. |
| `canvas` | Which canvas behaviours it covers: `caret-placement`, `edited-history`, `context-both-sides`, `cell-redefine`, `markers-intact`, `fix-conversation`. Can be empty. |
| `caret` | Text that occurs once in `doc.md`, inside the prompt to answer. Leave it out to answer the last prompt. |
| `file` | The conversation's file name, when it matters (`pie-diagram.md`). |
| `rubric` | Plain sentences: what a good answer does. People read these now; a grader reads them later. |
| `checks` | What the runner checks by itself, below. |

`checks`, all optional:

| Key | Passes when |
| --- | --- |
| `tools.must` / `tools.mustNot` | pi called every tool in `must` and none in `mustNot` (`cell`, `view`, `bash`, `terminal`, `edit`, `write`, `read`). |
| `cellRedefines` | pi redefined that cell `#id` through the `cell` tool. |
| `files.changed` / `files.unchanged` | Those workspace files changed, or stayed byte-identical. |
| `files.exist` | Those workspace files exist once the turn is over: a file the answer creates or renames into. |
| `conversationUntouched` | pi's own tools never touched the conversation file. On for every case. |
| `maxWords` | The answer's prose (its text, not the source of a cell or the data of a view) is at most this long. |
| `mentions` | The answer's prose contains each of these, in any case. |
| `cellMentions` | Each of these occurs, exactly as written, in the source of at least one of the answer's `cell` calls. |

## Adding a case

Copy the folder of a case that is close to yours, change `doc.md` and `case.json`,
and run `pnpm test:smoke` (or just `node --test tests/unit/eval-cases.test.ts`): it
checks that the document parses, that the prompt is where `caret` says, that any cell
the case names exists, and that every file `checks` names is in `workspace/`. A case
you wrote yourself has no `[AI DRAFT]` in its title or tags.

Every bad answer seen in real use is a good case: save the document, cut it down to
what matters, and say in `rubric` what the right answer would have done.

## Running

```sh
pnpm eval                                   # every case, both eval models, Piary's prompt
pnpm eval --no-prompt                       # the same against pi's default prompt
pnpm eval --case fix-broken-cell            # one case (repeat --case for more)
pnpm eval --model anthropic/claude-sonnet-5-5
pnpm eval --prompt /tmp/candidate.md --compare evals/reports/<last>/report.json
pnpm eval --draw free                       # pi started in free drawing (ADR 0044); a2ui when left out
```

It runs **your own pi** (the release `~/.pi/agent/install/current-version` names, or
`PI_CLI` pointing at a `cli.js`), with your pi credentials and settings, the way the app
does. Each case gets a fresh temporary workspace and a session rebuilt from the document
above the prompt; the conversation file sits outside the workspace, so a pi that edits it
is caught. Four turns run at once (`--jobs`).

`--cases <dir>` answers the cases of another directory, and `--signals <dir> --signal <arm>`
sends the text of `<dir>/<slug>/<arm>.md` (or `<dir>/_default/<arm>.md`) after each prompt,
before the `[now: …]` line: something the app would add to a message and the document never
holds. An arm with no file sends nothing, which is the control. Both are for experiments
(`evals/spikes/`), whose cases stay out of `cases/` so that a prompt change is not scored on them.

`--thinking <level>` starts each case's pi at that effort (`off`, `low`, `high`, …), as pi's own
`--thinking` does; left out, your pi settings decide. Each outcome records the effort pi
applied, which is the nearest level the model takes and not always the one asked for.

`--accept-edits` answers a `canvas_edit` as the app would: the edit is planned against the
conversation and reported as applied or refused, and the call is recorded with the answer.
Left out, a `canvas_edit` is cancelled, as any question pi asks a run is. A case whose prompt
is empty sends its signal alone: a message nobody typed.

`--draw` is the draw mode, passed to pi as `PIARY_DRAW` the way the app passes it, and
written in the report (`draw`). No case checks which of the two drew its answer, so a
free report compares with an a2ui one check for check.

## The claude harness

`pnpm eval --harness claude` asks each case through `claude -p`, the Claude Code CLI, on
the account it is signed in to, so a run draws on a Claude plan's limits and spends no API
credits. A pi that calls the model itself cannot run on a plan: Anthropic counts it as a
third-party app and refuses the request (ADR 0056).

```sh
pnpm eval --harness claude                                    # every case, anthropic/claude-sonnet-5-5
pnpm eval --harness claude --model anthropic/claude-haiku-5-5 --case fix-broken-cell
pnpm eval --harness claude --prompt /tmp/candidate.md --compare <a claude-harness report.json>
```

What is the same as a pi run: the prompt and the tools are your own pi's. For each case
the runner starts that pi with no model behind it (`claude/host.ts`), Piary's extension
loaded and the prompt file appended as the app does it, and takes the system prompt pi
would send and its tools: `read`, `bash`, `edit`, `write`, `view`, `cell`, `canvas_edit`,
`budget`, `terminal`. Claude Code gets that prompt as its whole system prompt and none of
its own tools; every call the model makes runs in pi's code, in the case's workspace, and
the `cell` and `canvas_edit` questions are answered by the same stand-in for the page
(`page.ts`). The turn is read back in pi's message shapes, so the placing and the checks
are the ones a pi run uses.

What differs, and so what this harness does not measure:

- **The loop is Claude Code's.** It adds its own framing around the prompt, and it names
  each tool `mcp__pi__<name>`, where pi names it `<name>`. The prompt says so in one line
  after pi's text, and the checks read pi's names.
- **A long tool description stands in the prompt.** Claude Code cuts a description in its
  tool list at 2048 characters. The `view` tool's holds the a2ui guide and is twice that,
  so it is given whole after pi's prompt, word for word.
- **The skill is rarely opened.** Under pi the model reads Piary's skill file before it
  calls `view` or `cell` in about one case in five; under Claude Code it almost never
  does. A case whose answer turns on the skill (a `table` view's payload, `view(Inputs.…)`
  in a cell) is tagged `needs pi`: this harness leaves it out, names it in the run's
  output and in the report, and a pi run scores it.
- **A history goes in as text.** pi is handed the conversation above the prompt as the
  messages it was. `claude -p` takes one message, so a case with a history gets the
  document's text above its prompt (`claude/wire.ts`), and the model reads its earlier
  cells and views as markers, not as calls it made. The report marks these cases
  `(history as text)`.
- **The effort is one `claude` takes**: `low`, `medium`, `high`, `xhigh` or `max`, from
  `--thinking`. Left out, it is the one your pi settings start a session at, and `low`
  when that is `off`, `minimal` or unset.
- **Anthropic models only**, written `anthropic/<id>`.
- **pi's transcript is not involved**: nothing here tests the rebuild, pi's RPC or the
  verdict channel's wire.

How close it is, measured on `anthropic/claude-sonnet-5-5` against a pi report of the
same prompt, draw mode and cases (`reports/2026-11-17-face-off`): over four
whole runs 264 to 267 of 271 checks came out as pi's did, where two pi runs agree on 269.
The two cases now tagged `needs pi` differed in every run; the rest of the difference is
the word-limit checks that also flip between two pi runs.

So it answers "does this wording steer the model", for comparing two prompts, two
signals or two draw modes on the same harness. It does not answer "does this work in
the app": a prompt change still ships on a pi run (`pnpm eval`, no `--harness`).
`--compare` refuses a report of the other harness, and `report.json` names its own
(`harness`; a report with none is a pi run).

A run that is not what the harness means is not scored as an answer. A request charged
to extra usage, a spent plan limit, or Claude Code's own error is a refused turn, as
below. A run that used a credential from the environment, or offered the model any tool
that is not pi's, fails its case saying so.

The plan's limits are the ones your own Claude Code sessions draw on, four turns at a
time by default: `--jobs 1` is gentler.

## Reading a report

A run writes `report.md`, `report.json` and, per model, every case's document with the
answer placed under its prompt, as the canvas would show it. `report.md` scores each job
per model (cases that passed every check, and checks passed), then lists every failing
check with its reason and the tools pi called. `--compare` adds the regressions: every
check that passed in the older report and fails now. A prompt change is kept only when
the score goes up and that list is empty.

A turn the provider refused (a credential it will not take, a spent limit) is not an
answer. Its case fails with the provider's reason as the detail, the report lists such
turns per model under "Refused by the provider" ahead of the scores, and the run prints
them last and exits 1: a score with refused turns in it says nothing about the prompt.

## What the runner answers for a tool

In the app a `cell` call waits for the page to say how the cell ran, and pi fixes a
cell that failed (`docs/notebook-cells.md` §Policy). The runner starts pi the same way
(`PIARY_VERDICTS=1`) and answers that question with a compile check (`verdict.ts`): a
source that does not compile is answered `failed`, three times per cell at most, as the
app does; a source that compiles gets no verdict, so the tool says "not verified". The
runner never runs a cell. Any other dialog a tool opens (`canvas_edit` asks the page to
apply its edit) is cancelled at once, which the tool reads as no page.

A report is committed, so it names no directory of the machine that ran it: the case's scratch
directory, the checkout and the home directory are written `<scratch>`, `<repo>` and `~`
(`evals/scrub.ts`), and `tests/unit/eval-scrub.test.ts` fails on a report that holds a path.

Every tool call in `report.json` carries `failed`: whether the call ended as an error,
such as a `view` payload the tool refused or a cell that did not compile. A report from
before the field has none.

## Design runs

A design run answers the six `ui-*` cases several times on one model, renders every
answer in the app's own page and counts what it sees. It is how a change to what pi is
told about drawing is measured.

```sh
evals/design/run.sh <arm> [reps]            # reps defaults to 3: 18 answers
MODEL=anthropic/claude-sonnet-5-5 evals/design/run.sh a2ui-ref 3
DRAW=free evals/design/run.sh free 3        # the same cases with pi in free drawing
```

It writes `<arm>/{docs,shots,reports}/` and `<arm>/metrics.json` under `DESIGN_OUT`,
which defaults to the main checkout's git-ignored `recordings/design/`. **An arm that
already exists is deleted first**, so give each run its own name. The shots are a
Playwright run (`e2e/design-shots-flows.spec.ts`): never start one beside the node
suite or another Playwright run.

`metrics.json` (`design/counts.ts`):

| Key | Meaning |
| --- | --- |
| `answers`, `passed` | Answers, and those that passed every eval check. |
| `rendered`, `broken`, `brokenNames` | Shots taken, and those that drew nothing or drew an error: a cell that threw, a cell that did not compile, a widget that marked itself failed. |
| `medianMs` | The median answer time. |
| `payloadCharsPerAnswer` | Characters of every cell source and view payload sent, per answer. |
| `handColorsPerAnswer` | Colour literals in those payloads, per answer. |
| `tools` | Calls per tool. |
| `refusedViews`, `failedCells` | `view` calls the tool refused, and `cell` calls that ended failed. |
| `answersWithRefusal` | Answers with at least one refused `view`. |
| `a2uiAnswers`, `cellAnswers` | Answers that called `view` with template `a2ui`, and answers that called `cell`. |
| `composed` | Answers whose last accepted a2ui payload holds a headline (a `Text` starting with `#`) and a `Callout`. |

## Judging design runs

`design/judge/` holds the scripts that compared the arms of the design-language experiment (ADR 0043)
blind, and the rule the verdicts were read by (`decision-rule.md`, written before any
verdict was read). They read arms and write under `<DESIGN_OUT>/judge/`
(`paths.mjs`), and each judge call is a `claude -p` on Opus. The arms judged are the
`ARMS` list at the top of `setup.mjs` and `sheets.mjs`; change it to judge others.

```sh
export DESIGN_OUT=<the directory the arms are in>   # unset, the scripts use the main checkout's recordings/design
mkdir -p "$DESIGN_OUT"/judge/{blind,raw,sheets,figures,blind-sheets,blind-pages,page-raw}
node evals/design/judge/setup.mjs        # blind copies of every shot, key.json, pairs.json
node evals/design/judge/pairwise.mjs     # one call per pair and order → judge/raw/
node evals/design/judge/analyse.mjs      # unblinds into verdicts.json, prints the tallies
node evals/design/judge/sheets.mjs       # contact sheets per arm, figures per case
node evals/design/judge/sheet-judge.mjs  # scores and ranks the sheets
node evals/design/judge/page-judge.mjs   # two arms again, on whole-window shots
```

`page-judge.mjs` reads `judge/pages-key.json` and the shots in `judge/blind-pages/`,
which the experiment prepared by hand; no script here builds them.

With six cases, one arm is told apart from another only at 14 of 18 decisive wins;
below that the counts in `metrics.json` are the evidence.

## Spikes

`spikes/<name>/` holds an experiment that asks what pi does with something the app does not
send yet: its own cases, the text each arm sends, a `run.sh`, a blind judge and the rule its
result is read by, written before the verdicts. `spikes/expressions/` asks what pi does when a
message carries what a camera saw of the user's face, with no camera: the blocks are written
by hand.

```sh
evals/spikes/expressions/run.sh 3          # every arm, three reps, into recordings/expressions
node evals/spikes/expressions/judge.mjs    # one Opus call per pair and order
node evals/spikes/expressions/analyse.mjs  # the tallies decision-rule.md names
```

`spikes/face-format/` asks how such a block is best built from what a webcam face model and
the keystroke log can supply: each case has a timeline of what the face did (`timeline.json`,
`spec.md`), and every block an arm sends is written from it by `build.ts`, so two arms differ
in wording and never in content. Its cases are split into `dev`, which guidance is tuned on,
and `test`, which every reported number comes from.

```sh
node evals/spikes/face-format/build.ts                # signals/<case>/<arm>.md from the timelines
node evals/spikes/face-format/decode/run.ts           # can each model read each rendering? no judge
node evals/spikes/face-format/decode/score.ts         # accuracy and tokens per rendering
PHASE=typing ARMS="none floor face@face2" evals/spikes/face-format/run.sh 3
PHASE=typing JUDGED="face@face2 floor" node evals/spikes/face-format/judge.mjs
```
