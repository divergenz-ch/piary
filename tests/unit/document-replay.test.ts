// What a document replays as, and how a copy rebinds it: the pure halves of a
// rebuild and of duplicating a conversation (ADR 0002, `document-format.md`
// §Message reconstruction). The rewrite that consumes these is
// `src/document/transcript.ts`, tested in `transcript.test.ts`.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { documentMessages, frontmatterFor, messagesFrom, parseDocument, rebindDocument, serializeMessages } from "../../dist/document/format.js";
import { unpaired } from "../helpers/pairing.ts";

// ── rebindDocument ────────────────────────────────────────────────────────────

test("rebinding moves the session key and nothing else", () => {
	const md = `---\npi: v1\nsession: web-aaaa1111\n---\n\nfirst question\n\n<!-- pi -->\n\nan answer\n\n<!-- you -->\n\n`;
	const copy = rebindDocument(md, "web-bbbb2222");
	assert.match(copy, /^---\npi: v1\nsession: web-bbbb2222\n---\n/);
	// The body is the point: same bytes, so the same offsets mean the same things.
	assert.equal(copy.slice(parseDocument(copy).bodyFrom), md.slice(parseDocument(md).bodyFrom));
	assert.equal(copy.length, md.length); // the two sids are the same width
});

test("rebinding keeps frontmatter keys it does not own", () => {
	const md = `---\npi: v1\nsession: web-aaaa1111\ncreated: 2026-01-01\n---\n\nhello\n`;
	const copy = rebindDocument(md, "web-bbbb2222");
	assert.match(copy, /session: web-bbbb2222/);
	assert.match(copy, /created: 2026-01-01/);
	assert.equal(copy.includes("web-aaaa1111"), false);
});

test("a hand-written file with no frontmatter gets one", () => {
	// The format's first design goal: a plain markdown file is a valid
	// conversation. Copying one has to produce a bound document, not a second
	// unbound file.
	const copy = rebindDocument("just some prose\n", "web-bbbb2222");
	assert.equal(copy, `${frontmatterFor("web-bbbb2222")}just some prose\n`);
});

test("frontmatter without a session key gains one", () => {
	const copy = rebindDocument(`---\npi: v1\n---\n\nhello\n`, "web-bbbb2222");
	assert.equal(copy, `---\npi: v1\nsession: web-bbbb2222\n---\n\nhello\n`);
});

// ── replaying cells ───────────────────────────────────────────────────────────

const usage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3 } };

/**
 * Two cells written in one turn, then the first redefined by id in the next.
 * The document stores no cell result; `documentMessages` synthesizes it from
 * the id it emits.
 */
const withCells = [
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
	{ role: "user", content: [{ type: "text", text: "[artifact] counter — edit by id\n\nstart at ten" }], timestamp: 3000 },
	{
		role: "assistant",
		// The redefinition: same id, same group, new source.
		content: [{ type: "toolCall", id: "toolu_01CCCCCCCCCCCCCCCCzzzzzz", name: "cell", arguments: { source: "const n = 10", mode: "js", id: "mpKv8u", group: "counter" } }],
		api: "anthropic-messages", provider: "anthropic", model: "claude-x", usage, stopReason: "stop", timestamp: 4000,
	},
	{ role: "toolResult", toolCallId: "toolu_01CCCCCCCCCCCCCCCCzzzzzz", toolName: "cell", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 4100 },
] as unknown as AgentMessage[];

/** An assistant content part, read by the two fields that identify a cell call.
 *  `arguments` is the tool's own payload — pi types it `unknown`, and the cell
 *  tool's schema lives in the format spec, not in pi's types. */
interface ContentPart {
	type: string;
	name?: string;
	arguments?: { id?: unknown; group?: unknown; source?: unknown };
}

test("a replayed redefinition still names the cell it redefines", () => {
	const md = serializeMessages(withCells);
	const calls: ContentPart[] = documentMessages(md)
		.messages.filter((m) => m.role === "assistant")
		.flatMap((m) => (m.content as readonly ContentPart[]).filter((c) => c.type === "cell" || c.name === "cell"));
	assert.equal(calls.length, 3);
	assert.deepEqual(
		calls.map((c) => [c.arguments?.id, c.arguments?.group]),
		[["mpKv8u", "counter"], ["wirre4", "counter"], ["mpKv8u", "counter"]],
		"the third call redefines the first by id, in the same group — not a fourth cell",
	);
	assert.equal(calls[2]?.arguments?.source, "const n = 10");
});

test("the document carries no widget state and no view the transcript cannot replay", () => {
	// The `.md` is a rendering. Anything only it holds is lost on rebuild, so it
	// must hold nothing that matters.
	const md = serializeMessages(withCells);
	assert.ok(!md.includes("cell-state"), "no cell-state block is written");
	assert.ok(!/<!-- pi:view /.test(md), "and no view block the transcript cannot replay");
});

test("a hand-broken pairing is repaired, not replayed as wreckage", () => {
	// A `pi:result` naming no call is the dangling tool_result the provider
	// rejects, so it is dropped; the call it orphaned still says what the agent
	// did, so it is kept and answered honestly. Either half replayed as-is is a
	// 400, which would mean one hand-edit could strand a session for good.
	const md = `Q\n\n<!-- pi:tool bash #t1 -->\n\n\`\`\`json\n{"command":"ls"}\n\`\`\`\n\n<!-- pi:result #nobody -->\n\n\`\`\`\nstray\n\`\`\`\n\n<!-- you -->\n\n`;
	const out = messagesFrom(md);
	assert.deepEqual(out.map((m) => m.role), ["user", "assistant", "toolResult"]);
	const answered = out[2];
	assert.ok(answered?.role === "toolResult", "the surviving call came back answered");
	assert.equal(answered.toolCallId, "t1", "the surviving call is the one answered");
	const body = answered.content[0];
	assert.ok(body?.type === "text", "and its body is text");
	assert.match(body.text, /interrupted/i);
	assert.deepEqual(unpaired(out), { dangling: [], orphans: [] });
});

test("every committed conversation replays with a valid tool pairing", () => {
	// The guarantee behind "edit anything, then send": whatever state a document
	// is in, replaying it must not produce a request the provider refuses. The
	// eval cases are the committed corpus of real-shaped conversations; the
	// developer's own `pi-docs/` joins it when present, and is never required.
	const root = new URL("../../evals/cases/", import.meta.url);
	const files = readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => new URL(`${entry.name}/doc.md`, root));
	const local = new URL("../../pi-docs/", import.meta.url);
	if (existsSync(local)) files.push(...readdirSync(local).filter((name) => name.endsWith(".md")).map((name) => new URL(name, local)));
	const broken = [];
	for (const file of files) {
		const { dangling, orphans } = unpaired(messagesFrom(readFileSync(file, "utf8")));
		if (dangling.length || orphans.length) broken.push(`${file.pathname} (${dangling.length} dangling, ${orphans.length} orphan)`);
	}
	assert.ok(files.length > 0, "no conversation was checked");
	assert.deepEqual(broken, [], "documents that would 400 on the next send");
});
