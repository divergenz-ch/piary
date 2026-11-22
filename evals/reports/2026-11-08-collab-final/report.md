# Eval report

- **date:** 2026-11-08T10:25:16.277Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md
- **models:** openai-codex/gpt-5.6-luna, anthropic/claude-sonnet-5-5
- **cases:** 18

| Job | openai-codex/gpt-5.6-luna | anthropic/claude-sonnet-5-5 |
| --- | --- | --- |
| cell | 5/5 cases · 41/41 checks | 5/5 cases · 41/41 checks |
| edit-file | 2/2 cases · 14/14 checks | 2/2 cases · 14/14 checks |
| explain | 4/5 cases · 42/43 checks | 2/5 cases · 40/43 checks |
| fix-and-run | 1/1 cases · 7/7 checks | 1/1 cases · 7/7 checks |
| fix-conversation | 1/1 cases · 9/9 checks | 1/1 cases · 9/9 checks |
| mid-document | 1/2 cases · 14/15 checks | 1/2 cases · 14/15 checks |
| view | 0/2 cases · 14/16 checks | 2/2 cases · 16/16 checks |
| **all** | 14/18 cases · 141/145 checks | 14/18 cases · 141/145 checks |

## Regressions against the compared report

- edited-history · openai-codex/gpt-5.6-luna · mentions "wednesday": not found
- short-fact · anthropic/claude-sonnet-5-5 · at most 60 words: 75 words

## Failing checks

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

- **at most 90 words:** 120 words
- tools called: none

### edited-history — openai-codex/gpt-5.6-luna

[AI DRAFT] The user's correction to an earlier answer is the truth

- **mentions "wednesday":** not found
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 200 words
- tools called: read

### short-fact — anthropic/claude-sonnet-5-5

[AI DRAFT] A one-line question gets a one-line answer

- **at most 60 words:** 75 words
- tools called: none

### two-versions-diff — openai-codex/gpt-5.6-luna

[AI DRAFT] A change between two versions is shown as a diff view

- **calls view:** called only nothing
- tools called: none

