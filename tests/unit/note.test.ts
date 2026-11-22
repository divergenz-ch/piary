// Markdown cells (`pi:note`) — run `pnpm build` first, then
// `node --test tests/unit/note.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	parseDocument,
	blocksFrom,
	opensBlock,
	serializeMessages,
	serializeNote,
	documentMessages,
	messagesFrom,
	wrapNote,
	unwrapNote,
	NOTE_MARKER,
	NOTE_TYPE,
	BLOCK_MARKER,
	emptyDocument,
	type DocSegmentKind,
} from "../../dist/document/format.js";
import { blockOpeners, serializeBranch } from "../../dist/document/branch.js";

// pi-coding-agent pins its OWN copy of pi-agent-core, so a transcript entry's
// message type has to come off SessionEntry rather than from pi-agent-core
// directly — the two resolutions are not assignable to each other.
type Message = Extract<SessionEntry, { type: "message" }>["message"];

const kinds = (md: string) => parseDocument(md).segments.map((s) => s.kind);
const note = (text: string): Message => ({
	role: "custom",
	customType: NOTE_TYPE,
	content: wrapNote(text),
	display: true,
	timestamp: 0,
});
const user = (text: string): Message => ({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
// api/provider/model/usage/stopReason/timestamp are inert here: branch.ts reads
// role, content and customType only. They are filled so the fixture satisfies
// pi's own message type rather than a narrower local one.
const assistant = (t: string): Message => ({
	role: "assistant",
	content: [{ type: "text", text: t }],
	api: "",
	provider: "",
	model: "",
	usage,
	stopReason: "stop",
	timestamp: 0,
});

const chain = (messages: readonly Message[], prefix = "e"): SessionEntry[] =>
	messages.map((message, i) => ({
		type: "message",
		id: `${prefix}${i + 1}`,
		parentId: i === 0 ? null : `${prefix}${i}`,
		timestamp: "",
		message,
	}));

// -- the marker ---------------------------------------------------------------

test("pi:note parses as a note segment carrying its prose", () => {
	const md = `${NOTE_MARKER}\n\n## Q3 revenue\n\nNumbers came in Tuesday.\n\n<!-- you -->\n\nchart it\n`;
	assert.deepEqual(kinds(md), ["note", "user"]);
	assert.equal(parseDocument(md).segments[0].text, "## Q3 revenue\n\nNumbers came in Tuesday.");
});

test("a note is prose in the buffer, distinct from a reactive pi:cell md", () => {
	const md = `${NOTE_MARKER}\n\nprose\n\n<!-- pi:cell md #c1 -->\n\n\`\`\`md\nreactive\n\`\`\`\n`;
	assert.deepEqual(kinds(md), ["note", "cell"]);
});

test("a pi:note is opaque to the pre-note grammar and round-trips verbatim", () => {
	// The grammar's `pi:\S[^>]*` fallback is what older parsers land on.
	const PRE_NOTE =
		/^<!-- (you|pi|pi:thinking|pi:tool ([^\s#]+) #([^\s>]+)|pi:result #([^\s>]+)( error)?|pi:block|pi:\S[^>]*) -->$/;
	const m = PRE_NOTE.exec(NOTE_MARKER);
	assert.ok(m, "the note marker must still match the older marker grammar");
	assert.equal(m[1], "pi:note");
	// …and nothing in it needs escaping, so the text survives a rewrite.
	const md = `${NOTE_MARKER}\n\nprose\n`;
	assert.equal(parseDocument(md).segments[0].from, 0);
});

// -- the model's view ---------------------------------------------------------

test("a note reaches the model labelled as page material", () => {
	const md = `${NOTE_MARKER}\n\n## Still to check\n\nMargins by SKU.\n`;
	const [msg] = messagesFrom(md);
	assert.equal(msg.role, "custom");
	assert.equal(msg.customType, NOTE_TYPE);
	assert.equal(msg.content, "<page-note>\n## Still to check\n\nMargins by SKU.\n</page-note>");
});

test("unwrapNote is the inverse, and a wrapper-less transcript reads verbatim", () => {
	assert.equal(unwrapNote(wrapNote("prose")), "prose");
	assert.equal(unwrapNote("hand written, no wrapper"), "hand written, no wrapper");
	assert.equal(unwrapNote([{ type: "text", text: wrapNote("from parts") }]), "from parts");
});

test("document → messages → document is the identity, wrapper included", () => {
	const md = `${NOTE_MARKER}\n\n## Q3 revenue\n\nNumbers came in Tuesday.\n\n<!-- you -->\n\nchart it\n\n<!-- pi -->\n\ndone\n`;
	const round = serializeMessages(messagesFrom(md));
	assert.equal(round, `${md.trimEnd()}\n\n<!-- you -->\n\n`);
});

test("an empty note carries no message", () => {
	assert.deepEqual(messagesFrom(`${NOTE_MARKER}\n\n\n`), []);
	assert.equal(serializeNote(wrapNote("   ")), "");
});

// -- blocks -------------------------------------------------------------------

test("a block can start with anything: a note opens one", () => {
	const md = `${NOTE_MARKER}\n\nplain prose, no heading\n\n<!-- you -->\n\nask\n`;
	const blocks = blocksFrom(parseDocument(md).segments);
	assert.equal(blocks.length, 2);
	assert.equal(blocks[0].opensAt, 0);
	assert.equal(blocks[0].name, "plain prose, no heading");
});

test("a note's block takes its name from a heading when it has one", () => {
	const md = `${NOTE_MARKER}\n\n## Q3 revenue\n\nprose\n`;
	assert.equal(blocksFrom(parseDocument(md).segments)[0].name, "Q3 revenue");
});

test("the fold marker folds a prompt into the block its prose opened", () => {
	const md = `${NOTE_MARKER}\n\n## Q3 revenue\n\nprose\n\n${BLOCK_MARKER}\n\n<!-- you -->\n\nchart it\n`;
	assert.deepEqual(kinds(md), ["note", "block", "user"]);
	const blocks = blocksFrom(parseDocument(md).segments);
	assert.equal(blocks.length, 1);
	assert.deepEqual(blocks[0].members, [0, 1, 2]);
	assert.equal(blocks[0].name, "Q3 revenue");
});

test("opensBlock names exactly the authored kinds", () => {
	const candidates: DocSegmentKind[] = [
		"user",
		"note",
		"assistant",
		"thinking",
		"toolCall",
		"toolResult",
		"view",
		"cell",
		"block",
		"opaque",
	];
	assert.deepEqual(candidates.filter(opensBlock), ["user", "note", "cell"]);
});

test("documentMessages reports a note that opens a block", () => {
	const md = `${NOTE_MARKER}\n\nprose\n\n<!-- you -->\n\nask\n`;
	assert.deepEqual([...documentMessages(md).openers], [0, 1]);
});

test("a folded note opens nothing", () => {
	const md = `Q1\n\n<!-- pi -->\n\nA1\n\n${BLOCK_MARKER}\n\n${NOTE_MARKER}\n\naside\n`;
	assert.deepEqual([...documentMessages(md).openers], [0]);
});

// -- the transcript side ------------------------------------------------------

test("blockOpeners treats a note entry as authored", () => {
	const branch: SessionEntry[] = [
		{ type: "custom", customType: "block-new", id: "b1", parentId: null, timestamp: "" },
		...chain([note("prose"), user("ask"), assistant("A")]).map((e, i) => ({ ...e, parentId: i === 0 ? "b1" : e.parentId })),
	];
	const openers = blockOpeners(branch);
	assert.ok(openers.has("e1"), "the note opens the block");
	assert.ok(!openers.has("e2"), "the prompt below it folds in");
});

test("serializeBranch renders a note back into the document", () => {
	// No block-new anywhere: the legacy prefix rule opens a block per authored
	// entry, so nothing folds and no marker is written.
	const branch = chain([note("## Q3 revenue\n\nprose"), user("ask"), assistant("A")]);
	const body = serializeBranch(branch);
	assert.match(body, /^<!-- pi:note -->\n\n## Q3 revenue\n\nprose\n\n/);
	assert.deepEqual(kinds(body), ["note", "user", "assistant", "user"]);
});

test("serializeBranch folds a prompt into the block its prose opened", () => {
	const branch: SessionEntry[] = [
		{ type: "custom", customType: "block-new", id: "b1", parentId: null, timestamp: "" },
		...chain([note("## Q3 revenue\n\nprose"), user("ask"), assistant("A")]).map((e, i) =>
			i === 0 ? { ...e, parentId: "b1" } : e,
		),
	];
	const body = serializeBranch(branch);
	assert.deepEqual(kinds(body), ["note", "block", "user", "assistant", "user"]);
	// Structure survives the trip back: only the note opens, so a rebuild writes
	// one block-new and the fold is restored from the transcript, not the file.
	assert.deepEqual([...documentMessages(body).openers], [0]);
});

// -- the empty page ---------------------------------------------------------------

test("an empty document opens with a prompt slot, not a bare region", () => {
	const md = emptyDocument("web-abc");
	const s = parseDocument(md).segments;
	assert.deepEqual(kinds(md), ["user"], "one segment: the open prompt");
	assert.equal(s[0].text, "", "…and it is empty, waiting");
	assert.ok(s[0].bodyFrom > s[0].from, "it carries its marker, so the YOU label renders");
});

test("the empty page already opens a block, so the first keystroke does not", () => {
	// The caret used to drop a whole block-gap on the first character because the
	// block came into being at that moment. The slot opens it up front instead.
	const md = emptyDocument("web-abc");
	assert.equal(blocksFrom(parseDocument(md).segments).length, 1);
	const typed = `${md}H`;
	assert.equal(blocksFrom(parseDocument(typed).segments).length, 1, "still one block — nothing opened");
});

test("an empty page carries no message", () => {
	assert.deepEqual(messagesFrom(emptyDocument("web-abc")), []);
});

test("frontmatter round-trips through the empty page", () => {
	const md = emptyDocument("web-abc");
	assert.equal(parseDocument(md).frontmatter, "---\npi: v1\nsession: web-abc\n---");
});
