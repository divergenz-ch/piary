# ADR 0040 — Cells read the workspace, and the agent shows a command on purpose

**Status:** accepted (2026-11-15). Narrows ADR 0013's rule that pi's `bash` output streams into a
terminal panel; extends ADR 0026's own-scheme pattern to the workspace.

## Context

Usability testing showed three related failures:

- **Charts made from typed numbers.** Asked to chart `sales.csv`, the agent typed the monthly totals
  into the cell's source and sorted the months alphabetically. A cell could not read the file:
  `FileAttachment(name)` resolved against the page's bundle origin, and nothing served the workspace
  to the webview. The skill said that it could.
- **A panel for every command.** Every agent `bash` that printed anything opened a terminal panel in
  the answer, so a request done in six commands left six panels for commands the user never asked to
  see. The user's note on the issue: a command gets a panel when the user needs to see or follow its
  output, or asked for a terminal, not because the agent ran it.
- **Answers that repeated output and were never checked.** Numbers were retyped from output already
  on the page, and a renamed file broke the folder's own naming pattern.

## Decision

- **The workspace is a read-only scheme.** Rust answers `piary-workspace://localhost/<path>` with
  the workspace file (`src-tauri/src/workspace_files.rs`). The page gives the notebook engine that
  root as its `fileBase`, and every cell's `FileAttachment` resolves against it
  (`notebook-cells.md` §Files).
  - The guard refuses `..`, a hidden file or directory, a symlink leading out of the workspace, and a
    file over 50 MiB, all answered as not found.
  - A workspace that is `/` or the home directory serves nothing. A Finder launch without `PI_CWD`
    resolves to `/`.
  - Nothing is cached.
- **A panel is the agent's choice.** Piary's extension registers `terminal`, which is pi's own
  `bash` under the name that means "the user sees this" (`pi-extension/terminal.ts`). Only its
  output streams into a panel.
  - A `bash` still running after 3 s also gets a panel, so a build or a server can be watched.
  - Any other command is the folded step under its call (`app/output-panels.ts`).
  - The choice is the agent's because whether the user wants to watch is in what they asked, not in
    the command. The user's `/terminal` is unchanged.
- **The prompt asks for the forms and for checking** (`pi-extension/system-prompt.md`):
  - a cell working from a file reads the file;
  - a result is said once and pointed at;
  - `terminal` is used only for a command the user should see run;
  - before replying, the agent checks what it made against what was asked, from the cell's source
    and data, since a cell's tool result says only that it ran.
- The eval set gains four cases for this (csv-to-chart, ab-test-skeptic, invoice-rename,
  show-command-output) and a `files.exist` check. On anthropic/claude-sonnet-5-5 the prompt went from
  17/24 to 20/24 cases. The one regression, a known-gap case running a few words over its limit, was
  accepted.

## Declined

- **Serve only files the agent has read this session.** This would stop a cell in a document the
  agent never touched from reading anything, but it would also stop the user's own hand-written
  cells. The user chose the workspace bound and to write the exposure down.
- **A content security policy that forbids cells' outbound requests.** This would close
  exfiltration broadly, but it would break cells that fetch from the web, and it is a question of its
  own.
- **Decide panels by a rule on the command** (its name, its output length). Nothing in a command
  says whether the user wants to watch it.

## Consequences

- **The exposure, accepted by the user.** Cells run when a document opens, and the page has no CSP.
  A cell in any document opened in a workspace can therefore read that workspace's non-hidden files
  and send them over the network. The guard keeps this to the workspace and nothing wider.
- **The 3 s long-run panel is a stand-in.** A long process wants a surface of its own, not a block in
  the answer. When it gets one, this rule goes.
- `bash` output in a document reads the same before and after. The panel was page material and the
  `pi:result` was always the record (ADR 0013), so no document format changed.
