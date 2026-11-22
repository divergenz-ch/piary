# Eval report

- **date:** 2026-11-15T18:58:26.978Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md
- **draw:** a2ui
- **models:** anthropic/claude-sonnet-5-5
- **cases:** 33

| Job | anthropic/claude-sonnet-5-5 |
| --- | --- |
| cell | 13/15 cases · 122/124 checks |
| edit-file | 3/3 cases · 26/26 checks |
| explain | 3/5 cases · 41/43 checks |
| fix-and-run | 2/2 cases · 16/16 checks |
| fix-conversation | 3/3 cases · 23/23 checks |
| mid-document | 2/3 cases · 22/23 checks |
| view | 2/2 cases · 16/16 checks |
| **all** | 28/33 cases · 266/271 checks |

## Regressions against the compared report

None: of 260 checks the two runs share, none that passed before fails now.

## Failing checks

### batch-qc-chart — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] Off-spec batches are charted from the file, and the chart has the batches on it

- **at most 80 words:** 127 words
- tools called: bash, read, bash, cell, cell, cell, cell

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

- **at most 90 words:** 115 words
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 235 words
- tools called: bash

