# Eval report

- **date:** 2026-11-14T14:33:36.650Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md
- **models:** openai-codex/gpt-5.6-luna
- **cases:** 20

| Job | openai-codex/gpt-5.6-luna |
| --- | --- |
| cell | 4/5 cases · 40/41 checks |
| edit-file | 2/2 cases · 14/14 checks |
| explain | 4/5 cases · 42/43 checks |
| fix-and-run | 1/1 cases · 7/7 checks |
| fix-conversation | 3/3 cases · 23/23 checks |
| mid-document | 1/2 cases · 14/15 checks |
| view | 0/2 cases · 14/16 checks |
| **all** | 15/20 cases · 154/159 checks |

## Regressions against the compared report

- change-keeps-controls · openai-codex/gpt-5.6-luna · a cell holds "view(Inputs.": in no cell call's source
- csv-to-table · openai-codex/gpt-5.6-luna · calls view: called only budget, read

## Failing checks

### change-keeps-controls — openai-codex/gpt-5.6-luna

[AI DRAFT] Changing a drawing keeps the controls the user may already have moved

- **a cell holds "view(Inputs.":** in no cell call's source
- tools called: cell

### context-both-sides — openai-codex/gpt-5.6-luna (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **mentions "borealis":** not found
- tools called: none

### csv-to-table — openai-codex/gpt-5.6-luna

[AI DRAFT] Tabular data is shown as a table view

- **calls view:** called only budget, read
- tools called: budget, read

### edited-history — openai-codex/gpt-5.6-luna

[AI DRAFT] The user's correction to an earlier answer is the truth

- **mentions "wednesday":** not found
- tools called: none

### two-versions-diff — openai-codex/gpt-5.6-luna

[AI DRAFT] A change between two versions is shown as a diff view

- **calls view:** called only nothing
- tools called: none

