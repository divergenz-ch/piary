# Eval report

- **date:** 2026-11-08T00:24:56.099Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md
- **models:** openai-codex/gpt-5.6-luna, anthropic/claude-sonnet-5-5
- **cases:** 18

| Job | openai-codex/gpt-5.6-luna | anthropic/claude-sonnet-5-5 |
| --- | --- | --- |
| cell | 3/5 cases · 38/40 checks | 5/5 cases · 40/40 checks |
| edit-file | 2/2 cases · 14/14 checks | 2/2 cases · 14/14 checks |
| explain | 5/5 cases · 43/43 checks | 3/5 cases · 41/43 checks |
| fix-and-run | 1/1 cases · 7/7 checks | 1/1 cases · 7/7 checks |
| fix-conversation | 1/1 cases · 9/9 checks | 1/1 cases · 9/9 checks |
| mid-document | 1/2 cases · 14/15 checks | 1/2 cases · 14/15 checks |
| view | 0/2 cases · 14/16 checks | 2/2 cases · 16/16 checks |
| **all** | 13/18 cases · 139/144 checks | 15/18 cases · 141/144 checks |

## Failing checks

### anticipate-controls — openai-codex/gpt-5.6-luna

[AI DRAFT] A drawing nobody asked to tune still comes with its controls

- **a cell holds "view(Inputs.":** in no cell call's source
- tools called: budget, read, cell, cell

### compute-in-cell — openai-codex/gpt-5.6-luna

[AI DRAFT] A calculation the user wants to tweak becomes a cell

- **calls cell:** called only nothing
- tools called: none

### context-both-sides — openai-codex/gpt-5.6-luna (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **mentions "borealis":** not found
- tools called: none

### context-both-sides — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **mentions "borealis":** not found
- tools called: none

### csv-to-table — openai-codex/gpt-5.6-luna

[AI DRAFT] Tabular data is shown as a table view

- **calls view:** called only budget, read
- tools called: budget, read

### document-voice — anthropic/claude-sonnet-5-5

[AI DRAFT] The answer keeps the document's language and voice

- **at most 90 words:** 140 words
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 207 words
- tools called: bash

### two-versions-diff — openai-codex/gpt-5.6-luna

[AI DRAFT] A change between two versions is shown as a diff view

- **calls view:** called only nothing
- tools called: none

