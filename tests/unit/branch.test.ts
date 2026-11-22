// Transcript → document projection — run `pnpm build` first, then `node --test tests/unit/branch.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, serializeMessages, messagesFrom, BLOCK_MARKER, serializeView } from "../../dist/document/format.js";
import type { SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, JsonObject, TextContent, ToolCall } from "@earendil-works/pi-ai";
import type { ParsedDocument } from "../../dist/document/format.js";
import { activeBranch, blockOpeners, serializeBranch } from "../../dist/document/branch.js";

// Deriving the message type from the entry keeps both halves of a fixture on one
// definition, so a pi version bump cannot drift them apart.
type BranchMessage = SessionMessageEntry["message"];

// -- fixture builders ---------------------------------------------------------

// `serializeBranch` and `blockOpeners` read `role`, `content` and `customType`
// only, so the provider block and timestamps below are inert filler — present to
// complete pi's message type, and unable to reach an assertion.
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const user = (text: string): BranchMessage => ({ role: "user", content: text, timestamp: 0 });
const assistant = (...content: AssistantMessage["content"]): BranchMessage => ({ role: "assistant", content, api: "", provider: "", model: "", usage, stopReason: "stop", timestamp: 0 });
const text = (t: string): TextContent => ({ type: "text", text: t });
const toolCall = (id: string, name: string, args: JsonObject): ToolCall => ({ type: "toolCall", id, name, arguments: args });
const toolResult = (id: string, out: string, isError = false): BranchMessage => ({
	role: "toolResult",
	toolCallId: id,
	toolName: "",
	content: [{ type: "text", text: out }],
	isError,
	timestamp: 0,
});

/** Chain messages into message entries e1←e2←…; returns entries in file order. */
const chain = (messages: readonly BranchMessage[], prefix = "e", parent: string | null = null): SessionEntry[] =>
	messages.map((message, i) => ({
		type: "message",
		id: `${prefix}${i + 1}`,
		parentId: i === 0 ? parent : `${prefix}${i}`,
		timestamp: "",
		message,
	}));

const docOf = (messages: readonly BranchMessage[]) => parseDocument(serializeMessages(messages));

/** Indices of non-empty user segments, in order (trailing invite is empty). */
const userSegIndices = (doc: ParsedDocument) =>
	doc.segments.flatMap((s, i) => (s.kind === "user" && s.text ? [i] : []));

// One conversation, three blocks; block 2 carries a tool round-trip.
const MESSAGES = [
	user("Q1"),
	assistant(text("A1")),
	user("## Count files\n\nQ2"),
	assistant(text("counting"), toolCall("c1", "bash", { cmd: "ls | wc -l" })),
	toolResult("c1", "14"),
	assistant(text("A2: 14 files")),
	user("Q3"),
	assistant(text("A3")),
];
const ENTRIES = chain(MESSAGES);
const LEAF = ENTRIES[ENTRIES.length - 1].id;
// user entries: e1, e3, e7

// -- tests --------------------------------------------------------------------

test("activeBranch walks parentId from the leaf, not file order", () => {
	// a dead sibling branch forked at e2, listed after the real one
	const dead = chain([user("other Q2"), assistant(text("other A2"))], "x", "e2");
	const branch = activeBranch([...ENTRIES, ...dead], LEAF);
	assert.deepEqual(branch.map((e) => e.id), ENTRIES.map((e) => e.id));
	assert.deepEqual(activeBranch(ENTRIES, "x1"), []);
});


const blockNew = (id: string): SessionEntry => ({ type: "custom", customType: "block-new", id, parentId: null, timestamp: "" });
const msg = (id: string, message: BranchMessage): SessionEntry => ({ type: "message", id, parentId: null, timestamp: "", message });

test("blockOpeners: no block-new anywhere → every user entry opens (legacy)", () => {
	const branch = [msg("u1", user("Q1")), msg("a1", assistant(text("A1"))), msg("u2", user("Q2"))];
	assert.deepEqual(blockOpeners(branch), new Set(["u1", "u2"]));
});

test("blockOpeners: fold is the unmarked default; block-new opens", () => {
	const branch = [
		blockNew("b1"),
		msg("u1", user("Q1")),
		msg("a1", assistant(text("A1"))),
		msg("u2", user("follow-up")),
		blockNew("b2"),
		msg("u3", user("Q2")),
	];
	assert.deepEqual(blockOpeners(branch), new Set(["u1", "u3"]));
});

test("blockOpeners: climbs through non-message entries between block-new and prompt", () => {
	const mc: SessionEntry = { type: "model_change", id: "m1", parentId: null, timestamp: "", provider: "p", modelId: "m" };
	const branch = [blockNew("b1"), msg("u1", user("Q1")), msg("a1", assistant(text("A1"))), blockNew("b2"), mc, msg("u2", user("Q2"))];
	assert.deepEqual(blockOpeners(branch), new Set(["u1", "u2"]));
	// …and a non-message entry alone does not open anything.
	const folded = [blockNew("b1"), msg("u1", user("Q1")), msg("a1", assistant(text("A1"))), mc, msg("u2", user("follow-up"))];
	assert.deepEqual(blockOpeners(folded), new Set(["u1"]));
});

test("blockOpeners: legacy prefix survives a later opening", () => {
	// A pre-step-14 session gains a block-new: the old turns keep one block per
	// send; fold-by-default starts after the first opening.
	const branch = [
		msg("u1", user("Q1")),
		msg("a1", assistant(text("A1"))),
		msg("u2", user("Q2")),
		blockNew("b1"),
		msg("u3", user("Q3")),
		msg("a3", assistant(text("A3"))),
		msg("u4", user("follow-up")),
	];
	assert.deepEqual(blockOpeners(branch), new Set(["u1", "u2", "u3"]));
});

test("serializeBranch folds per block-new entries; legacy branches stay unmarked", () => {
	const branch = [blockNew("b1"), msg("u1", user("Q1")), msg("a1", assistant(text("A1"))), msg("u2", user("follow-up"))];
	const body = serializeBranch(branch);
	assert.ok(body.includes(`${BLOCK_MARKER}\n\n<!-- you -->\n\nfollow-up`));
	const legacy = serializeBranch(branch.slice(1));
	assert.ok(!legacy.includes(BLOCK_MARKER));
	// Fold markers are decoration: they carry no message either way.
	assert.deepEqual(messagesFrom(body).map((m) => m.role), messagesFrom(legacy).map((m) => m.role));
});
