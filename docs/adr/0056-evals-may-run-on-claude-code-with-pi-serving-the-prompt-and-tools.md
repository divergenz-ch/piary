# ADR 0056 — An eval run may ask through Claude Code, with pi serving the prompt and the tools

**Status:** accepted (2026-11-18). Builds on ADR 0004 (it is the user's own pi that runs) and
ADR 0030 (the prompt and tools ship with the app and answer to evals).

## Context

`pnpm eval` answers every case with the user's own pi, which calls the model on pi's own
credential: an API key, billed per token. Experiments run the cases many times, and the
person running them also holds a Claude plan.

A pi that calls the model cannot use that plan. Two routes were tried on 2026-11-18. pi's
own sign-in with a Claude account, and `pi-claude-code`, which sends pi's request through
the `claude` CLI: Anthropic answers both with "Third-party apps now draw from your extra
usage, not your plan limits". The refusal is made on Anthropic's side, from the shape of the
request.

`claude -p` asked directly is accepted on the plan, with a system prompt of the caller's own
and tools served over the Model Context Protocol.

## Decision

- **A second harness, for evals only.** `pnpm eval --harness claude` asks each case through
  `claude -p`. The app is untouched: it runs pi, and so does `pnpm eval` without the flag.
- **pi is hosted with no model behind it.** For each case `evals/claude/host.ts` creates a
  session of the user's own pi (`createAgentSession`, imported from the managed install, so
  ADR 0004 holds), with Piary's extension and prompt file loaded as the app loads them. It
  hands the runner the system prompt pi would send, and serves pi's tools on stdio. Every
  tool call the model makes runs in pi's code; what a tool asks the page is answered by the
  stand-in a pi run uses (`evals/page.ts`).
- **Claude Code is given nothing of its own**: no built-in tool, no user settings, an empty
  directory, no credential from the environment. A run that used one, offered the model any
  other tool, or was charged to extra usage is not scored as an answer.
- **The refusal is not worked around.** Nothing here makes pi's request look like Claude
  Code's. If Anthropic stops taking `claude -p` on a plan, this harness stops, loudly, and
  evals run on pi.
- **A history goes in as the document's text.** `claude -p` takes one message and no past.
  The report marks such cases.
- **A case that turns on the skill is left out**, by the tag `needs pi`. Under Claude Code
  the model almost never opens the skill file, so those cases fail for a reason that is not
  the prompt's.
- **A prompt change ships on a pi run.** The claude harness compares two wordings on one
  harness; `--compare` refuses a report of the other.

## Why not

- **Disguising pi's requests as first-party.** It would work until it did not, and it is
  getting round a billing check.
- **Reimplementing Piary's tools for Claude Code.** A second copy of every description and
  check, drifting from the one that ships. Hosting pi keeps one.
- **Claude Code's own tools in place of pi's `read`, `bash`, `edit`, `write`.** Other names,
  schemas and descriptions, and the checks name pi's.
- **Replaying the history as past turns.** `claude -p` takes assistant messages on its input
  stream only sometimes, and a fabricated session file is another tool's private format.
- **An MCP dependency.** Four methods of JSON-RPC are written out in `evals/claude/mcp.ts`.

## Consequences

- An experiment's runs cost plan limits, shared with the person's own Claude Code sessions,
  instead of API credits.
- Measured against a pi report of the same prompt and cases, 264 to 267 of 271 checks agree
  over four runs, where two pi runs agree on 269 (`evals/README.md` §The claude harness).
- Two things differ in what the model reads, both said in the prompt after pi's text: its
  tools are listed as `mcp__pi__<name>`, and a tool description past Claude Code's 2048
  character cut is given whole.
- The harness leans on `session.systemPrompt` and `session.agent.state.tools` of pi's SDK,
  and on Claude Code's `stream-json` output. A pi or Claude Code upgrade can break it; it
  fails its cases saying what it saw.
