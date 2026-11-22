# Eval report

- **date:** 2026-11-07T14:22:01.838Z
- **pi:** 1.0.4
- **prompt:** none (pi's default)
- **models:** openai-codex/gpt-5.6-luna, anthropic/claude-sonnet-5-5
- **cases:** 16

| Job | openai-codex/gpt-5.6-luna | anthropic/claude-sonnet-5-5 |
| --- | --- | --- |
| cell | 2/3 cases · 22/23 checks | 3/3 cases · 23/23 checks |
| edit-file | 2/2 cases · 14/14 checks | 2/2 cases · 14/14 checks |
| explain | 4/5 cases · 42/43 checks | 2/5 cases · 40/43 checks |
| fix-and-run | 1/1 cases · 7/7 checks | 1/1 cases · 7/7 checks |
| fix-conversation | 1/1 cases · 9/9 checks | 1/1 cases · 9/9 checks |
| mid-document | 1/2 cases · 14/15 checks | 1/2 cases · 13/15 checks |
| view | 0/2 cases · 14/16 checks | 2/2 cases · 16/16 checks |
| **all** | 11/16 cases · 122/127 checks | 12/16 cases · 122/127 checks |

## Failing checks

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

- **at most 60 words:** 67 words
- **mentions "borealis":** not found
- tools called: none

### csv-to-table — openai-codex/gpt-5.6-luna

[AI DRAFT] Tabular data is shown as a table view

- **calls view:** called only read
- tools called: read

### document-voice — anthropic/claude-sonnet-5-5

[AI DRAFT] The answer keeps the document's language and voice

- **at most 90 words:** 126 words
- tools called: none

### edited-history — openai-codex/gpt-5.6-luna

[AI DRAFT] The user's correction to an earlier answer is the truth

- **mentions "wednesday":** not found
- tools called: none

### explain-function — anthropic/claude-sonnet-5-5

[AI DRAFT] Explain a function from the workspace

- **at most 180 words:** 234 words
- tools called: read

### short-fact — anthropic/claude-sonnet-5-5

[AI DRAFT] A one-line question gets a one-line answer

- **at most 60 words:** 74 words
- tools called: none

### two-versions-diff — openai-codex/gpt-5.6-luna

[AI DRAFT] A change between two versions is shown as a diff view

- **calls view:** called only nothing
- tools called: none

