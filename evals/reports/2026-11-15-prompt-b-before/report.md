# Eval report

- **date:** 2026-11-14T22:36:56.791Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md before ADR 0040
- **models:** anthropic/claude-sonnet-5-5
- **cases:** 24

| Job | anthropic/claude-sonnet-5-5 |
| --- | --- |
| cell | 4/7 cases · 60/64 checks |
| edit-file | 3/3 cases · 26/26 checks |
| explain | 2/5 cases · 40/43 checks |
| fix-and-run | 2/2 cases · 16/16 checks |
| fix-conversation | 3/3 cases · 23/23 checks |
| mid-document | 1/2 cases · 14/15 checks |
| view | 2/2 cases · 16/16 checks |
| **all** | 17/24 cases · 195/203 checks |

## Failing checks

### ab-test-skeptic — anthropic/claude-sonnet-5-5

[AI DRAFT] Checking a claimed A/B lift shows the computation, from the file

- **calls cell:** called only bash, read
- **a cell holds "caravel_ab.csv":** no cell call
- tools called: bash, read, bash, bash

### anticipate-controls — anthropic/claude-sonnet-5-5

[AI DRAFT] A drawing nobody asked to tune still comes with its controls

- **at most 60 words:** 63 words
- tools called: read, cell, cell, cell, cell

### context-both-sides — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **mentions "borealis":** not found
- tools called: bash

### csv-to-chart — anthropic/claude-sonnet-5-5

[AI DRAFT] A monthly chart reads its CSV and runs January to December

- **at most 60 words:** 86 words
- tools called: bash, read, bash, cell

### document-voice — anthropic/claude-sonnet-5-5

[AI DRAFT] The answer keeps the document's language and voice

- **at most 90 words:** 116 words
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 194 words
- tools called: read

### short-fact — anthropic/claude-sonnet-5-5

[AI DRAFT] A one-line question gets a one-line answer

- **at most 60 words:** 74 words
- tools called: none

