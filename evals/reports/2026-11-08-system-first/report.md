# Eval report

- **date:** 2026-11-08T12:15:22.104Z
- **pi:** 1.0.4
- **prompt:** pi-extension/system-prompt.md
- **models:** openai-codex/gpt-5.6-luna, anthropic/claude-sonnet-5-5
- **cases:** 18

| Job | openai-codex/gpt-5.6-luna | anthropic/claude-sonnet-5-5 |
| --- | --- | --- |
| cell | 4/5 cases · 40/41 checks | 5/5 cases · 41/41 checks |
| edit-file | 2/2 cases · 14/14 checks | 2/2 cases · 14/14 checks |
| explain | 4/5 cases · 42/43 checks | 2/5 cases · 40/43 checks |
| fix-and-run | 1/1 cases · 7/7 checks | 1/1 cases · 7/7 checks |
| fix-conversation | 1/1 cases · 9/9 checks | 1/1 cases · 9/9 checks |
| mid-document | 1/2 cases · 14/15 checks | 1/2 cases · 13/15 checks |
| view | 2/2 cases · 16/16 checks | 2/2 cases · 16/16 checks |
| **all** | 15/18 cases · 142/145 checks | 14/18 cases · 140/145 checks |

## Regressions against the compared report

- change-keeps-controls · openai-codex/gpt-5.6-luna · a cell holds "view(Inputs.": in no cell call's source
- context-both-sides · anthropic/claude-sonnet-5-5 · at most 60 words: 78 words

## Failing checks

### change-keeps-controls — openai-codex/gpt-5.6-luna

[AI DRAFT] Changing a drawing keeps the controls the user may already have moved

- **a cell holds "view(Inputs.":** in no cell call's source
- tools called: cell

### context-both-sides — openai-codex/gpt-5.6-luna (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **mentions "borealis":** not found
- tools called: none

### context-both-sides — anthropic/claude-sonnet-5-5 (known gap)

[AI DRAFT] A mid-page prompt needs the text above and below it

- **at most 60 words:** 78 words
- **mentions "borealis":** not found
- tools called: none

### document-voice — anthropic/claude-sonnet-5-5

[AI DRAFT] The answer keeps the document's language and voice

- **at most 90 words:** 109 words
- tools called: none

### edited-history — openai-codex/gpt-5.6-luna

[AI DRAFT] The user's correction to an earlier answer is the truth

- **mentions "wednesday":** not found
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 204 words
- tools called: read

### short-fact — anthropic/claude-sonnet-5-5

[AI DRAFT] A one-line question gets a one-line answer

- **at most 60 words:** 64 words
- tools called: none

