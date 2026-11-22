# Piary views — pi package

The agent side of Piary's view blocks (blocks-plan step 11):

- `view.ts` — a pi extension registering the `view(template, data)` tool.
  It only returns `ok`: the tool call's transcript entry is the artifact.
  Piary serializes it as a `<!-- pi:view TEMPLATE #id -->` block and renders
  the template; any other markdown renderer shows an honest JSON fence.
- `cell.ts` — the `cell` tool: a reactive code cell. Under the Piary app it
  answers once the page has run the cell (`docs/notebook-cells.md` §Policy).
- `draw-mode.ts` — what `view` and `cell` say of themselves, by draw mode
  (`PIARY_DRAW`: `a2ui` by default, `free` for cells; ADR 0044). Read once, when
  the tools register.
- `canvas-edit.ts` — the `canvas_edit` tool: changes prose already in the
  document by quoting it. Under the Piary app the page applies the change and
  answers whether it did (ADR 0033); anywhere else the call fails saying so.
- `login.ts` — `/piary-login` and `/piary-logout`: the Piary app's sign-in
  panel, over pi's own login code (ADR 0034). The command runs pi's
  `ModelRuntime` and asks every question through the page.
- `budget.ts` — the `budget` tool: the agent's estimate of how long a run's
  work should take, which the app enforces as a soft limit (ADR 0031).
- `terminal.ts` — the `terminal` tool: pi's own `bash` under the name that
  shows the command to the user. Under the Piary app its output streams into a
  terminal panel in the answer, where a `bash` call's is a folded step
  (`app/output-panels.ts`).
- `SKILL.md` — the `view-templates` skill advertising the template inventory
  and payload schemas to the agent. The catalog lives here, in the agent's
  context, not as a UI secret.

## Enable

**The desktop app needs nothing installed:** it starts every pi with
`--extension <this directory>` (the bundle carries a copy in
`Resources/pi-extension/`), unless the user's own pi settings already install a
package named `pi-ui-views` — then theirs runs, because two copies both
registering `cell` make pi exit at startup.

For plain `pi` in a terminal, install it from the project pi runs in:

```bash
pi install -l /path/to/pi-ui/pi-extension
```

`-l` writes the package into the project's `.pi/settings.json` (shareable);
omit it for user-wide install (`~/.pi/agent/settings.json`). Then:

- `pi list` shows the package and its resources.
- `pi config` (Tab switches scope) enables/disables the tool and the skill
  individually.
- Try without installing: `pi -e /path/to/pi-ui/pi-extension`.

Type resolution (`@earendil-works/pi-coding-agent`, `typebox`) happens when
pi loads the extension — this directory is deliberately outside Piary's own
tsconfig.

## Check

Ask pi to "show that as a table": a `view` tool call arrives in the
transcript, and the Piary document renders the template block. The same
templates are user-insertable without a run via the document's `/` menu and
block menu ("view over artifact").
