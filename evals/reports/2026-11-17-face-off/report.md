# Eval report

- **date:** 2026-11-17T10:21:41.823Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md
- **draw:** a2ui
- **models:** anthropic/claude-sonnet-5-5
- **cases:** 33

| Job | anthropic/claude-sonnet-5-5 |
| --- | --- |
| cell | 14/15 cases · 123/124 checks |
| edit-file | 3/3 cases · 26/26 checks |
| explain | 4/5 cases · 42/43 checks |
| fix-and-run | 2/2 cases · 16/16 checks |
| fix-conversation | 3/3 cases · 23/23 checks |
| mid-document | 2/3 cases · 22/23 checks |
| view | 2/2 cases · 16/16 checks |
| **all** | 30/33 cases · 268/271 checks |

## Failing checks

### batch-qc-chart — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] Off-spec batches are charted from the file, and the chart has the batches on it

- **at most 80 words:** 102 words
- tools called: bash, read, bash, bash, cell

### context-both-sides — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **mentions "borealis":** not found
- tools called: bash

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 192 words
- tools called: bash

