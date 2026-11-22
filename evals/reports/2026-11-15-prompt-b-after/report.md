# Eval report

- **date:** 2026-11-14T22:48:06.754Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md
- **models:** anthropic/claude-sonnet-5-5
- **cases:** 24

| Job | anthropic/claude-sonnet-5-5 |
| --- | --- |
| cell | 6/7 cases · 63/64 checks |
| edit-file | 3/3 cases · 26/26 checks |
| explain | 3/5 cases · 41/43 checks |
| fix-and-run | 2/2 cases · 16/16 checks |
| fix-conversation | 3/3 cases · 23/23 checks |
| mid-document | 1/2 cases · 13/15 checks |
| view | 2/2 cases · 16/16 checks |
| **all** | 20/24 cases · 198/203 checks |

## Regressions against the compared report

- context-both-sides · anthropic/claude-sonnet-5-5 · at most 60 words: 67 words

## Failing checks

### context-both-sides — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **at most 60 words:** 67 words
- **mentions "borealis":** not found
- tools called: bash

### csv-to-chart — anthropic/claude-sonnet-5-5

[AI DRAFT] A monthly chart reads its CSV and runs January to December

- **at most 60 words:** 101 words
- tools called: bash, read, bash, cell

### document-voice — anthropic/claude-sonnet-5-5

[AI DRAFT] The answer keeps the document's language and voice

- **at most 90 words:** 93 words
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 193 words
- tools called: bash

