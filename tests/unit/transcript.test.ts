// The transcript rewrite the app runs before a send — run `pnpm build` first,
// then `node --test tests/unit/transcript.test.ts`.
//
// `rebuildEntries` is the rebuild's rule (ADR 0002, ADR 0021): entries in, as
// `get_entries` hands them over, and entries out, for Rust to write after the
// header. This file is its specification. Rows about the file itself — the
// header surviving, the leaf being the last line once written — belong to the
// writer, `src-tauri/src/transcript.rs`, and are tested there.
import test from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry as PiSessionEntry } from "@earendil-works/pi-coding-agent";
import { blocksFrom, documentMessages, parseDocument, serializeFile, serializeMessages } from "../../dist/document/format.js";
import { activeBranch, serializeBranch } from "../../dist/document/branch.js";
import { carriedState, latestCellState, rebuildEntries } from "../../dist/document/transcript.js";
import { historyOf } from "../../dist/document/run.js";
import { unpaired } from "../helpers/pairing.ts";

/** One entry, read by the fields these assertions touch. ADR 0002: the schema
 *  is pi's, so this is a loose view, not a model of it. */
interface Entry {
	id?: string;
	parentId?: string | null;
	type?: string;
	customType?: string;
	message?: AgentMessage;
	name?: string;
	modelId?: string;
	thinkingLevel?: string;
	data?: unknown;
	timestamp?: unknown;
	[key: string]: unknown;
}

const usage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3 } };

/** A deterministic clock: ids `n0`, `n1`, … and one fixed instant. */
function clock() {
	let n = 0;
	return { now: () => "2026-02-02T00:00:00.000Z", newId: () => `n${n++}` };
}

/** A transcript as `get_entries` answers it: message entries, parent-chained,
 *  and the leaf they end on. */
function transcriptOf(messages: readonly AgentMessage[], extra: readonly Entry[] = []) {
	let parentId: string | null = null;
	const entries: Entry[] = messages.map((message, i) => {
		const id = `e${i}`;
		const entry = { id, parentId, type: "message", message, timestamp: "2026-01-01T00:00:00.000Z" };
		parentId = id;
		return entry;
	});
	entries.push(...extra);
	return { entries, leafId: extra.length ? (extra.at(-1)?.id ?? parentId) : parentId };
}

/** Rebuild `transcript` from `md` with a fresh deterministic clock. */
function rebuild(transcript: { entries: Entry[]; leafId: string | null }, md: string): Entry[] {
	return rebuildEntries(transcript.entries as PiSessionEntry[], transcript.leafId, documentMessages(md), clock()) as Entry[];
}

const messagesOf = (entries: readonly Entry[]): AgentMessage[] =>
	entries.filter((e) => e.type === "message").flatMap((e) => (e.message ? [e.message] : []));

const firstText = (m: AgentMessage | undefined): string | undefined => {
	const content = (m as { content?: unknown } | undefined)?.content;
	const part = Array.isArray(content) ? (content[0] as { type?: string; text?: string } | undefined) : undefined;
	return part?.type === "text" ? part.text : undefined;
};

/** The rebuilt entries read back as the document they render. */
const documentOf = (entries: readonly Entry[]): string =>
	serializeBranch(activeBranch(entries as readonly PiSessionEntry[], entries.at(-1)?.id ?? null));

const original: AgentMessage[] = [
	{ role: "user", content: [{ type: "text", text: "first question" }], timestamp: 1000 },
	{ role: "assistant", content: [{ type: "text", text: "first answer" }], api: "anthropic-messages", provider: "anthropic", model: "claude-x", usage, stopReason: "stop", timestamp: 2000 },
	{ role: "user", content: [{ type: "text", text: "second question" }], timestamp: 3000 },
	{ role: "assistant", content: [{ type: "text", text: "second answer" }], api: "anthropic-messages", provider: "anthropic", model: "claude-x", usage, stopReason: "stop", timestamp: 4000 },
] as AgentMessage[];

test("an edited prompt lands in the transcript; metadata survives", () => {
	const edited = serializeMessages(original).replace("second question", "SECOND question, edited");
	const msgs = messagesOf(rebuild(transcriptOf(original), edited));
	assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
	assert.equal(firstText(msgs[2]), "SECOND question, edited");
	// The document carries none of this — it is zipped back by position.
	const answer = msgs[3];
	assert.ok(answer?.role === "assistant", "the second answer came back as an assistant message");
	assert.deepEqual(answer.usage, usage);
	assert.equal(answer.model, "claude-x");
	assert.equal(msgs[1]?.timestamp, 2000);
});

test("the chain is a line: every entry parents the one before it", () => {
	const entries = rebuild(transcriptOf(original), serializeMessages(original));
	assert.equal(entries[0]?.parentId, null);
	for (let i = 1; i < entries.length; i++) assert.equal(entries[i]?.parentId, entries[i - 1]?.id, `entry ${i} chains`);
	// v3 leaf-on-load is the last line, so the tail must be the newest message.
	assert.equal(firstText(messagesOf(entries).at(-1)), "second answer");
});

test("a deleted block shortens history; an inserted one starts with fresh metadata", () => {
	const shortened = rebuild(transcriptOf(original), serializeMessages(original.slice(0, 2)));
	assert.equal(messagesOf(shortened).length, 2, "history shrank to what the document shows");

	const grown = `${serializeMessages(original)}\n\n<!-- you -->\n\nthird question\n`;
	const msgs = messagesOf(rebuild(transcriptOf(original), grown));
	assert.equal(msgs.length, 5);
	const inserted = msgs[4];
	assert.ok(inserted, "the inserted prompt is in the transcript");
	assert.equal(firstText(inserted), "third question");
	assert.ok(inserted.timestamp > 0, "an inserted message gets a real timestamp, not the placeholder 0");
});

test("block structure survives the transcript: document → entries → document", () => {
	// Block 2's prompt is a follow-up folded into block 1; only two prompts
	// open blocks. That shape must come back out of the transcript alone.
	const md = serializeMessages(original, new Set([original[2]!]));
	assert.ok(md.includes("<!-- pi:block -->"), "fixture actually folds");
	const entries = rebuild(transcriptOf(original), md);
	assert.equal(entries.filter((e) => e.customType === "block-new").length, 1, "one opener → one block-new entry");
	assert.equal(documentOf(entries), md, "document → transcript → document is identity, folds included");
});

test("session state survives the rewrite: model, thinking, name, custom state", () => {
	// State entries spliced into the chain the way a live session accrues them:
	// stale picks first, the ones that must win later.
	const state = [
		{ type: "model_change", provider: "anthropic", modelId: "claude-stale" },
		{ type: "model_change", provider: "anthropic", modelId: "claude-haiku-4-5" },
		{ type: "thinking_level_change", thinkingLevel: "off" },
		{ type: "session_info", name: "my doc" },
		{ type: "custom", customType: "pi-ui-extensions", data: { disabled: ["npm:x"] } },
		{ type: "custom", customType: "block-new", data: {} }, // must NOT carry — rebuilt from the document
	];
	let parentId = "e3";
	const extra = state.map((e, i) => {
		const entry = { ...e, id: `s${i}`, parentId, timestamp: "2026-01-01T00:00:01.000Z" };
		parentId = entry.id;
		return entry;
	});
	const after = rebuild(transcriptOf(original, extra), serializeMessages(original));
	const models = after.filter((e) => e.type === "model_change");
	assert.equal(models.length, 1, "only the latest model survives");
	assert.equal(models[0]?.modelId, "claude-haiku-4-5");
	assert.equal(after.find((e) => e.type === "thinking_level_change")?.thinkingLevel, "off");
	assert.equal(after.find((e) => e.type === "session_info")?.name, "my doc");
	assert.deepEqual(after.find((e) => e.customType === "pi-ui-extensions")?.data, { disabled: ["npm:x"] });
	// block-new count must match a control rebuild without state entries: the
	// document's own openers, none carried from the replaced branch.
	const control = rebuild(transcriptOf(original), serializeMessages(original));
	assert.equal(
		after.filter((e) => e.customType === "block-new").length,
		control.filter((e) => e.customType === "block-new").length,
		"stale block-new markers do not carry",
	);
	// State rides ahead of the messages; the leaf is still the newest message.
	assert.equal(after.at(-1)?.type, "message");
	for (let i = 1; i < after.length; i++) assert.equal(after[i]?.parentId, after[i - 1]?.id, `entry ${i} chains`);
});

test("block-new entries chain like any other: the leaf is still the last entry", () => {
	const md = serializeMessages(original, new Set([original[2]!]));
	const entries = rebuild(transcriptOf(original), md);
	assert.equal(entries[0]?.parentId, null);
	for (let i = 1; i < entries.length; i++) assert.equal(entries[i]?.parentId, entries[i - 1]?.id, `entry ${i} chains`);
	assert.equal(entries.at(-1)?.type, "message", "the tail is a message, not a marker");
});

/** Cells: the shape that once bricked a session on rebuild (see the rebuild
 *  test of the same name). */
const withCells: AgentMessage[] = [
	{ role: "user", content: [{ type: "text", text: "build me a counter" }], timestamp: 1000 },
	{
		role: "assistant",
		content: [
			{ type: "text", text: "Here it is:" },
			{ type: "toolCall", id: "toolu_01AAAAAAAAAAAAAAAAmpKv8u", name: "cell", arguments: { source: "const n = 1", mode: "js", group: "counter" } },
			{ type: "toolCall", id: "toolu_01BBBBBBBBBBBBBBBBwirre4", name: "cell", arguments: { source: "htl.html`${n}`", mode: "js", group: "counter" } },
		],
		api: "anthropic-messages", provider: "anthropic", model: "claude-x", usage, stopReason: "stop", timestamp: 2000,
	},
	{ role: "toolResult", toolCallId: "toolu_01AAAAAAAAAAAAAAAAmpKv8u", toolName: "cell", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 2100 },
	{ role: "toolResult", toolCallId: "toolu_01BBBBBBBBBBBBBBBBwirre4", toolName: "cell", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 2200 },
] as AgentMessage[];

test("a document holding cells rebuilds with every tool call answered", () => {
	const msgs = messagesOf(rebuild(transcriptOf(withCells), serializeMessages(withCells)));
	const { dangling, orphans } = unpaired(msgs);
	assert.deepEqual(dangling, [], "no tool_use without a tool_result — this is the 400");
	assert.deepEqual(orphans, [], "and no tool_result without its call in the message before it");
});

for (const [customType, data] of [
	["pi-ui-cell-state", { v: 2, views: { slider: 42 }, store: {} }],
	["pi-ui-extensions", { disabled: ["npm:example"] }],
] as const) {
	test(`${customType} survives an agent write from its in-memory leaf`, () => {
		// The bridge appended a snapshot without moving the resident agent's leaf,
		// so the agent's next entry branched from e3, not from that snapshot.
		// `get_entries` returns every entry, side branches included.
		const extra = [
			{ id: "old", parentId: "e3", type: "custom", customType, data: { stale: true } },
			{ id: "snapshot", parentId: "old", type: "custom", customType, data },
			{ id: "abandoned-mode", parentId: "snapshot", type: "custom", customType: "plan-mode-state", data: { enabled: true } },
			{ id: "agent", parentId: "e3", type: "session_info", name: "live" },
		];
		const transcript = transcriptOf(original, extra);
		const branch = activeBranch(transcript.entries as PiSessionEntry[], transcript.leafId);
		const copyState = carriedState(transcript.entries as PiSessionEntry[], branch) as Entry[];
		assert.deepEqual(copyState.find((e) => e.customType === customType)?.data, data, "copies keep the latest snapshot too");
		assert.equal(copyState.some((e) => e.customType === "plan-mode-state"), false, "extension-owned state remains branch-scoped");

		const after = rebuild(transcript, serializeMessages(original));
		const snapshots = after.filter((e) => e.customType === customType);
		assert.equal(snapshots.length, 1);
		assert.deepEqual(snapshots[0]?.data, data);
		assert.equal(after.find((e) => e.type === "session_info")?.name, "live");
		assert.equal(after.some((e) => e.customType === "plan-mode-state"), false);
	});
}

test("a custom entry survives a rebuild — which is why widget state lives there", () => {
	const state = { v: 2, views: { mbView: { cx: -0.235, cy: 0.827, scale: 0.0025 } }, store: {} };
	const extra = [{ type: "custom", customType: "pi-ui-cell-state", id: "st1", parentId: "e3", timestamp: "2026-01-01T00:00:00.000Z", data: state }];
	const carried = rebuild(transcriptOf(original, extra), serializeMessages(original)).filter((e) => e.customType === "pi-ui-cell-state");
	assert.equal(carried.length, 1, "the state entry survived");
	assert.deepEqual(carried[0]?.data, state, "and it is the same state, not a default");
});

test("a prompt under an attachment keeps its own block through the transcript", () => {
	// In the DOCUMENT the attachment opens the block and the prompt joins it; in
	// the TRANSCRIPT there is no attachment, so the prompt has to be the opener.
	const IMG = { id: "a1b2c3", mime: "image/png", url: "/attachments/a1b2c3-shot.png", name: "shot.png" };
	const md = serializeMessages(original).replace(
		"<!-- you -->\n\nsecond question",
		`${serializeFile(IMG)}\n\n<!-- you -->\n\nsecond question`,
	);
	assert.ok(md.includes("pi:file"), "fixture actually carries an attachment");
	const blocks = blocksFrom(parseDocument(md).segments);
	const entries = rebuild(transcriptOf(original), md);
	assert.equal(
		entries.filter((e) => e.customType === "block-new").length,
		2,
		"both prompts open blocks in the transcript — the image cannot, it is not a message",
	);
	const back = documentOf(entries);
	assert.equal(back.includes("pi:block"), false, "the second prompt did NOT fold into the first block");
	assert.equal(blocksFrom(parseDocument(back).segments).length, blocks.length);
	assert.equal(back.includes("pi:file"), false, "the attachment is not in the transcript to write back");
});

// ── What the page's copy adds ────────────────────────────────────────────────

test("the caller's messages are not changed by the rebuild", () => {
	const history = documentMessages(serializeMessages(original));
	const before = JSON.stringify(history.messages);
	rebuildEntries(transcriptOf(original).entries as PiSessionEntry[], "e3", history, clock());
	assert.equal(JSON.stringify(history.messages), before, "metadata is zipped into new objects, not written into the input");
});

test("ids and timestamps come from the clock it is given", () => {
	const once = rebuild(transcriptOf(original), `${serializeMessages(original)}\n\n<!-- you -->\n\nnew\n`);
	const twice = rebuild(transcriptOf(original), `${serializeMessages(original)}\n\n<!-- you -->\n\nnew\n`);
	assert.deepEqual(once, twice, "same input, same clock, same output");
	assert.deepEqual(once.map((e) => e.id), once.map((_, i) => `n${i}`));
	assert.equal(once.at(-1)?.timestamp, "2026-02-02T00:00:00.000Z", "a fresh entry is stamped with the clock's now");
});

test("an empty transcript takes the document's history whole", () => {
	// pi writes its transcript lazily: a session that has never had a turn has
	// no entries, and the page material above the first prompt still has to
	// reach it.
	const entries = rebuild({ entries: [], leafId: null }, serializeMessages(original));
	assert.deepEqual(messagesOf(entries).map((m) => firstText(m)), ["first question", "first answer", "second question", "second answer"]);
});

test("metadata is never grafted across roles when a message moves position", () => {
	// A prompt inserted mid-history puts a user message where an answer used to
	// be. Zipped by position alone, it would inherit that answer's model and
	// usage — a prompt that claims to have cost tokens it never spent.
	const md = serializeMessages(original).replace("<!-- pi -->\n\nfirst answer", "<!-- you -->\n\ninserted question\n\n<!-- pi -->\n\nfirst answer");
	const msgs = messagesOf(rebuild(transcriptOf(original), md));
	assert.equal(firstText(msgs[1]), "inserted question", "the inserted prompt sits where the first answer was");
	const inserted = msgs[1] as unknown as Record<string, unknown>;
	assert.equal(inserted["model"], undefined, "it did not take the answer's model");
	assert.equal(inserted["usage"], undefined, "or its usage");
});

// ── The page's widget state, written by a rebuild ────────────────────────────
// The app keeps widget state in its own store; a rebuild writes that state into
// the transcript so the copy pi holds is faithful, and never carries a stale one.

test("the app's widget state replaces the transcript's", () => {
	const stale = { type: "custom", customType: "pi-ui-cell-state", id: "st1", parentId: "e3", data: { store: { n: 1 } } };
	const entries = rebuildEntries(
		transcriptOf(original, [stale]).entries as PiSessionEntry[],
		"st1",
		documentMessages(serializeMessages(original)),
		clock(),
		{ cellState: { store: { n: 9 } } },
	) as Entry[];
	const states = entries.filter((e) => e.customType === "pi-ui-cell-state");
	assert.equal(states.length, 1);
	assert.deepEqual(states[0]?.data, { store: { n: 9 } });
});

test("a null widget state drops a stale one", () => {
	const stale = { type: "custom", customType: "pi-ui-cell-state", id: "st1", parentId: "e3", data: { store: { n: 1 } } };
	const entries = rebuildEntries(
		transcriptOf(original, [stale]).entries as PiSessionEntry[],
		"st1",
		documentMessages(serializeMessages(original)),
		clock(),
		{ cellState: null },
	) as Entry[];
	assert.equal(entries.filter((e) => e.customType === "pi-ui-cell-state").length, 0);
});

test("the latest widget state in a transcript is found, side branches included", () => {
	const entries = [
		{ type: "custom", customType: "pi-ui-cell-state", id: "a", parentId: null, data: { store: { n: 1 } } },
		{ type: "message", id: "m", parentId: "a", message: { role: "user", content: [] } },
		// Appended without moving the agent's leaf: off the branch, and latest.
		{ type: "custom", customType: "pi-ui-cell-state", id: "b", parentId: "a", data: { store: { n: 2 } } },
	];
	assert.deepEqual(latestCellState(entries as PiSessionEntry[]), { store: { n: 2 } });
	assert.equal(latestCellState([] as PiSessionEntry[]), null);
});


// -- a steer, echoed into the document (notebook-cells.md §Policy)
//
// pi holds a delivered steer as a user message between two answers. The page
// writes it there too, folded into the running block. What these pin is that
// the app's history compare (`app/history.ts`, messages only) then sees the
// two sides agree, so the next send leaves pi's history alone — and that a
// document WITHOUT the echo disagrees, which is why the echo is required.

const STEER = "[cell report] #bx failed: boom";
const steered: AgentMessage[] = [
	original[0]!,
	{ ...original[1]!, content: [{ type: "text", text: "a cell, then" }] } as AgentMessage,
	{ role: "user", content: [{ type: "text", text: STEER }], timestamp: 2500 } as AgentMessage,
	{ ...original[1]!, content: [{ type: "text", text: "fixed it" }], timestamp: 2600 } as AgentMessage,
];
const ECHOED =
	"<!-- you -->\n\nfirst question\n\n<!-- pi -->\n\na cell, then\n\n" +
	`<!-- pi:block -->\n\n<!-- you -->\n\n${STEER}\n\n<!-- pi -->\n\nfixed it\n\n`;

/** What the app's compare reads of each side: the messages, nothing else. */
const told = (md: string) => JSON.stringify(documentMessages(md).messages);

test("a steer echoed folded gives the same messages as the transcript holding it", () => {
	const held = historyOf(serializeBranch(activeBranch(transcriptOf(steered).entries as readonly PiSessionEntry[], "e3")));
	assert.equal(told(ECHOED), told(held));
	// The inversion: a document missing the steer reads as an edit.
	assert.notEqual(told(ECHOED.replace(`<!-- pi:block -->\n\n<!-- you -->\n\n${STEER}\n\n`, "")), told(held));
});

test("a rebuild from a document holding the echoed steer keeps it", () => {
	const rebuilt = rebuild(transcriptOf(original.slice(0, 2)), ECHOED);
	assert.ok(messagesOf(rebuilt).some((m) => m.role === "user" && firstText(m) === STEER));
	// The inversion: without the echo, the rebuild writes no steer.
	const without = rebuild(transcriptOf(original.slice(0, 2)), ECHOED.replace(STEER, "something else"));
	assert.ok(!messagesOf(without).some((m) => m.role === "user" && firstText(m) === STEER));
});

const systemMessage = (sections: Record<string, string>, tools: readonly string[] = []) =>
	({
		role: "system",
		content: "",
		sections,
		...(tools.length ? { toolsAdded: tools.map((name) => ({ name, description: name, parameters: {} })) } : {}),
		timestamp: 1,
	}) as unknown as AgentMessage;

const opening = "<!-- you -->\n\nhi\n\n<!-- pi -->\n\nhello\n\n<!-- you -->\n\nnext\n";

test("a rebuild keeps pi's system messages ahead of the history, every one in order", () => {
	const base = systemMessage({ preamble: "You are pi." }, ["read"]);
	const patch = systemMessage({ skills: "<skills/>" });
	const out = messagesOf(
		rebuild(
			transcriptOf([
				base,
				{ role: "user", content: "hi", timestamp: 2 } as AgentMessage,
				patch,
				{ role: "assistant", content: [{ type: "text", text: "hello" }], usage, model: "m", timestamp: 3 } as unknown as AgentMessage,
			]),
			opening,
		),
	);
	assert.deepEqual(
		out.map((m) => m.role),
		["system", "system", "user", "assistant", "user"],
	);
	assert.deepEqual(out.slice(0, 2), [base, patch]);
});

test("a system message in the old transcript does not shift the metadata zip", () => {
	const out = messagesOf(
		rebuild(
			transcriptOf([
				systemMessage({ preamble: "You are pi." }),
				{ role: "user", content: "hi", timestamp: 2 } as AgentMessage,
				{ role: "assistant", content: [{ type: "text", text: "hello" }], usage, model: "kept-model", timestamp: 3 } as unknown as AgentMessage,
			]),
			opening,
		),
	);
	const answer = out.find((m) => m.role === "assistant") as unknown as { model?: string; usage?: unknown };
	assert.equal(answer.model, "kept-model");
	assert.deepEqual(answer.usage, usage);
});

test("a system message on an abandoned branch is not carried", () => {
	const transcript = transcriptOf([{ role: "user", content: "hi", timestamp: 2 } as AgentMessage]);
	transcript.entries.push({ id: "off", parentId: null, type: "message", message: systemMessage({ preamble: "old" }), timestamp: "t" });
	assert.equal(messagesOf(rebuild(transcript, opening)).filter((m) => m.role === "system").length, 0);
});
