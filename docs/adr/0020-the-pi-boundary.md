# ADR 0020 — The pi boundary: a relay knows no shapes, a translation names pi's types

**Status:** accepted. Extends [ADR 0002](0002-transcript-is-pis-own.md) — which separates pi's RPC
wire from its JSONL transcript — with the third thing it leaves open: pi's **message model**, and
which parts of Piary may know it. Does not amend 0002; nothing in it changes.

## Context

The two halves of the app take opposite positions on coupling to pi, and only one of them says so.

- **The Rust relay refuses pi's shapes, in writing.** `src-tauri/src/session.rs`'s header states it
  as a rule: the page sends `{type, …}`, the relay adds a correlation id and passes `data` through,
  so a field added upstream is not a change there. What it does know is pi's **envelope**
  (`type`, `id`, `"response"`, `success`, `error`) and **two command names by name**: `prompt`,
  refused while the app quits (`commands.rs` `pi_send`), and `extension_ui_response`, which pi
  answers by doing rather than replying (`NO_REPLY`). The `timedOut` mark on a late reply is
  Piary's own field, not pi's (ADR 0019 §4). The page reads pi's `get_state.isStreaming` for the
  silence probe (`app/turn.ts`), untyped and defensively — the relay still never looks.
- **The TypeScript core imports pi's types.** `src/document/format.ts` (`AgentMessage` from
  `pi-agent-core`; `AssistantMessage`, `ToolResultMessage`, `ToolCall`, `TextContent`,
  `ThinkingContent`, `Usage`, `JsonValue`, `JsonObject` from `pi-ai`), `branch.ts` and `modes.ts`
  (`SessionEntry` from `pi-coding-agent`). Outside the core: the canvas
  (`src/components/DocumentChat.ts`) and the app's page (`app/turn.ts`, `app/history.ts` and their
  neighbours). Every one is `import type`: no `dist/*.js` file imports a pi package —
  only the `.d.ts` files name them — so `src/document/*` is still pure (ADR 0006).
- **The versions are three different things.** `package.json` declares `pi-agent-core` and `pi-ai`
  as peers at `"*"` and as devDependencies at `^1.1.0`; `pi-coding-agent` is pinned exactly
  (`1.1.0`). The binary that actually produces the messages is the user's own pi — the app runs
  only that, with no bundled fallback (`src-tauri/src/pi_cli.rs`). On the machine this was written
  on, the types are 1.1.0 and `pi` on PATH is 1.0.4.

A reader of `session.rs` would reasonably take its rule to be the app's rule, and a reader of
`package.json` would reasonably take `"*"` for an oversight. Neither is the case, and neither was
written down.

## Decision

### 1. The rule is by role, not by language

**A layer that passes pi's data through knows none of its shapes. A layer that must construct or
interpret pi's data names pi's types, at a named edge.**

The relay is the first kind: knowing a payload would buy it nothing and cost it a change per pi
release, which is why the capture sidecar follows the same rule (ADR 0015). The rebuild is the
second kind: `documentMessages` must build `{role: "assistant", content, api, provider, usage, …}`
whether or not it is typed, so the knowledge of pi's model exists either way. Untyped, it would be a
copy of that model the compiler cannot see; typed, a pi release that renames a field fails the
typecheck instead of a send. So the asymmetry is correct, and `session.rs`'s rule is a relay's rule.
Its header says that much and no more.

The envelope and the two command names the relay does know are the wire's, not the model's — the
same distinction 0002 draws, one level down. A third command the relay must name is a change to that
list, made in its header in the same commit.

The transcript itself the Rust side touches in one place: a rebuild, which writes the entries the
page computed after the file's header line, kept verbatim or seeded, and parses none of them
(ADR 0021).

### 2. The document's own model imports nothing from pi

The edge is drawn inside `src/document/*`, not around it:

- **The document's model** — `DocSegment`, `DocBlock`, `DocCell`, `DocArtifact`, the marker
  constants, `parseDocument`, `blocksFrom` — is Piary's, and names no pi type. A new type in that
  model is declared here; a pi type appearing in a `DocSegment`'s shape is a breach of this ADR.
- **The translation** names pi's types, and only it: `serializeMessages` /
  `serializeAssistant` / `serializeToolResult` (pi → document), `documentMessages` /
  `messagesFrom` (document → pi), and the transcript readers `branch.ts` / `modes.ts` over
  `SessionEntry`.
- **Views of pi's data** — the message and tool renderers in `src/components/` and `src/tools/` —
  render pi's messages as pi shaped them, and take its types for the same reason the translation
  does.

### 3. There is an anticorruption layer, and it is `format.ts`'s pair of directions

The document's model is **not** pi's model with a different serialisation. Blocks, artifacts,
cells, notes, views, snippets and attachments have no pi counterpart; pi's provider metadata,
session tree and branches have no document counterpart (ADR 0002 restores the one and the document
deliberately lacks the other). The translation between them is lossy in both directions, and the
loss is enumerated rather than discovered: `document-format.md` §Message reconstruction and
§Replaying a document as a transcript for the document's side, ADR 0002's `META` list and carried
state for pi's.

Two honest limits on that claim. The translation builds pi's messages by hand and casts them
(`as unknown as AgentMessage`), so the compiler checks the parts it assembles, not each whole
message. And the segment vocabulary — `toolCall`, `toolResult`, `thinking` — borrows pi's words,
because those are the things the document records; the words are shared, the types are not.

### 4. What the publishable format depends on

ADR 0001 says another tool could implement `document-format.md` without this code. That claim
holds, and it is narrower than "Piary's parser is portable":

- **The grammar is pi-free.** Markers, segments, blocks, the escaping rule, the rebuild rule as
  text — an outside implementer needs nothing from pi to read or write a document.
- **The replay mapping is pi's.** §Message reconstruction maps segments onto pi's `AgentMessage[]`.
  A tool driving a different agent writes its own mapping; the spec's is one implementation of that
  step, for pi.
- **`format.ts` is not portable as a file**, because the model and the translation share it.
  Lifting the parser out means leaving the translation's functions behind, which §2 makes a clean
  cut — nothing in the model reaches into them.

### 5. No local copies of pi's types

Declaring Piary-owned message types in `src/document/` that pi's are structurally assignable to was
considered and declined. The translation's target *is* pi's model; a local copy that must track it is
the same coupling with a second definition to keep in step, and the assignability check it would
offer needs a site that imports pi's types anyway. **Revisit when a second agent backend arrives:**
then the translation becomes per-backend and the core does need a message type of its own.

### 6. The pi peers stay at `"*"`, on purpose

- **The peer constrains nothing at runtime.** `src/` imports pi's packages only as types; the built
  JavaScript loads none of them. The peer says which `.d.ts` a consumer's compiler reads, nothing
  more.
- **No range in this package can know what runs.** The messages come from the user's own pi
  (ADR 0004), installed independently and upgraded on its own schedule. A peer range would warn a
  consumer whose pi differs, and guarantee nothing about the binary — the same false confidence
  ADR 0004 records as `Class extends value undefined`: a version declared in one place, a different
  one running.
- **The version the compiler checks against is chosen elsewhere, deliberately.** The
  devDependencies (`^1.1.0`) are what the typecheck reads, and they move in step with the pinned
  `pi-coding-agent` dependency. **A pi upgrade is one change to all three**, and it is the change
  where the translation is re-checked against the new types.

Version skew between the types and the running binary is therefore carried by **tolerance, not by
the types**: `messagesFrom` never throws, the page reads pi's reply fields defensively, and the
relay passes fields it does not know straight through.

## Consequences

- `docs/HANDBOOK.md` §Dependency Policy points here for the `"*"`, since `package.json` cannot carry the
  reason itself.
- `session.rs`'s header states the relay's rule as a relay's rule, and lists what of the wire it
  does know.
- No code changes beyond that header: the imports stay, and §2's edge is already where the code draws it.

## Lessons

- **"Knows nothing of X" is a role's property, not a codebase's.** Written once at the top of a
  module, a good rule reads as a house rule; say whose rule it is.
- **A type checks the build's version, not the running one.** When the binary is the user's, the
  type is a statement about intent and the tolerance in the code is the statement about reality.
  Both are needed; neither substitutes.
- **An unexplained `"*"` reads as an oversight however deliberate it was.** A choice that looks like
  a gap needs its reason somewhere a reader of the file will find it.
