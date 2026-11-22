# Eval report

- **date:** 2026-11-15T14:47:02.814Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md
- **draw:** a2ui
- **models:** anthropic/claude-sonnet-5-5
- **cases:** 31

| Job | anthropic/claude-sonnet-5-5 |
| --- | --- |
| cell | 12/13 cases · 99/100 checks |
| edit-file | 3/3 cases · 26/26 checks |
| explain | 3/5 cases · 41/43 checks |
| fix-and-run | 2/2 cases · 16/16 checks |
| fix-conversation | 3/3 cases · 23/23 checks |
| mid-document | 2/3 cases · 22/23 checks |
| view | 2/2 cases · 16/16 checks |
| **all** | 27/31 cases · 243/247 checks |

## Regressions against the compared report

None: of 247 checks the two runs share, none that passed before fails now.

## Failing checks

### context-both-sides — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **mentions "borealis":** not found
- tools called: bash

### csv-to-chart — anthropic/claude-sonnet-5-5

[AI DRAFT] A monthly chart reads its CSV and runs January to December

- **at most 60 words:** 84 words
- tools called: bash, read, bash, cell

### document-voice — anthropic/claude-sonnet-5-5

[AI DRAFT] The answer keeps the document's language and voice

- **at most 90 words:** 107 words
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 183 words
- tools called: bash

