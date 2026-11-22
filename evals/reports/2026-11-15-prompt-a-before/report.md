# Eval report

- **date:** 2026-11-15T18:48:13.129Z
- **pi:** 1.0.4
- **prompt:** ../../../..<tmp>/prompt-before.md
- **draw:** a2ui
- **models:** anthropic/claude-sonnet-5-5
- **cases:** 32

| Job | anthropic/claude-sonnet-5-5 |
| --- | --- |
| cell | 12/14 cases · 111/113 checks |
| edit-file | 2/3 cases · 23/26 checks |
| explain | 2/5 cases · 40/43 checks |
| fix-and-run | 2/2 cases · 16/16 checks |
| fix-conversation | 3/3 cases · 23/23 checks |
| mid-document | 2/3 cases · 22/23 checks |
| view | 2/2 cases · 16/16 checks |
| **all** | 25/32 cases · 251/260 checks |

## Failing checks

### batch-qc-chart — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] Off-spec batches are charted from the file, and the chart has the batches on it

- **at most 80 words:** 122 words
- tools called: bash, read, bash, cell

### context-both-sides — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **mentions "borealis":** not found
- tools called: bash

### csv-to-chart — anthropic/claude-sonnet-5-5

[AI DRAFT] A monthly chart reads its CSV and runs January to December

- **at most 60 words:** 65 words
- tools called: bash, read, bash, cell

### document-voice — anthropic/claude-sonnet-5-5

[AI DRAFT] The answer keeps the document's language and voice

- **at most 90 words:** 115 words
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 203 words
- tools called: bash

### invoice-rename — anthropic/claude-sonnet-5-5

[AI DRAFT] Renamed invoices follow the folder's own pattern, and the total owed checks out

- **leaves 2026-10-07 Ostara.txt in place:** missing
- **leaves 2026-10-11 Kettle.txt in place:** missing
- **leaves 2026-10-21 Ostara.txt in place:** missing
- tools called: bash, bash, bash

### short-fact — anthropic/claude-sonnet-5-5

[AI DRAFT] A one-line question gets a one-line answer

- **at most 60 words:** 61 words
- tools called: none

