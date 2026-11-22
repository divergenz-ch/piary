# Eval report

- **date:** 2026-11-14T10:26:05.139Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md
- **models:** openai-codex/gpt-5.6-luna, anthropic/claude-sonnet-5-5
- **cases:** 19

| Job | openai-codex/gpt-5.6-luna | anthropic/claude-sonnet-5-5 |
| --- | --- | --- |
| cell | 5/5 cases · 41/41 checks | 4/5 cases · 40/41 checks |
| edit-file | 2/2 cases · 14/14 checks | 2/2 cases · 14/14 checks |
| explain | 4/5 cases · 42/43 checks | 3/5 cases · 41/43 checks |
| fix-and-run | 1/1 cases · 7/7 checks | 1/1 cases · 7/7 checks |
| fix-conversation | 2/2 cases · 16/16 checks | 2/2 cases · 16/16 checks |
| mid-document | 1/2 cases · 14/15 checks | 1/2 cases · 13/15 checks |
| view | 1/2 cases · 15/16 checks | 2/2 cases · 16/16 checks |
| **all** | 16/19 cases · 149/152 checks | 15/19 cases · 147/152 checks |

## Regressions against the compared report

- anticipate-controls · anthropic/claude-sonnet-5-5 · at most 60 words: 62 words
- two-versions-diff · openai-codex/gpt-5.6-luna · calls view: called only nothing

## Failing checks

### anticipate-controls — anthropic/claude-sonnet-5-5

[AI DRAFT] A drawing nobody asked to tune still comes with its controls

- **at most 60 words:** 62 words
- tools called: read, cell, cell, cell, cell, cell

### context-both-sides — openai-codex/gpt-5.6-luna (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **mentions "borealis":** not found
- tools called: none

### context-both-sides — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **at most 60 words:** 76 words
- **mentions "borealis":** not found
- tools called: none

### document-voice — anthropic/claude-sonnet-5-5

[AI DRAFT] The answer keeps the document's language and voice

- **at most 90 words:** 116 words
- tools called: none

### edited-history — openai-codex/gpt-5.6-luna

[AI DRAFT] The user's correction to an earlier answer is the truth

- **mentions "wednesday":** not found
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 199 words
- tools called: read

### two-versions-diff — openai-codex/gpt-5.6-luna

[AI DRAFT] A change between two versions is shown as a diff view

- **calls view:** called only nothing
- tools called: none

