// Step 3 format vocabulary — run `pnpm build` first, then `node --test tests/unit/format.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { parseDocument, blocksFrom, prefixPendingUser, prefixPrompt, withPromptPrefixes, serializeMessages, serializeUser, serializeView, documentMessages, ASIDE_MARKER, messagesFrom, BLOCK_MARKER, NOTE_MARKER, NOTE_TYPE, wrapNote, emptyDocument, rewriteRefusal, escapeBody, attachmentNote, documentLabel, renameDocument } from "../../dist/document/format.js";

const kinds = (md: string) => parseDocument(md).segments.map((s) => s.kind);

test("three user segments derive three blocks", () => {
	const md = "Q1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\nQ2\n\n<!-- pi -->\n\nA2\n\n<!-- you -->\n\nQ3\n";
	const blocks = blocksFrom(parseDocument(md).segments);
	assert.deepEqual(
		blocks.map((b) => ({ opensAt: b.opensAt, members: b.members })),
		[
			{ opensAt: 0, members: [0, 1] },
			{ opensAt: 2, members: [2, 3] },
			{ opensAt: 4, members: [4] },
		],
	);
	assert.deepEqual(blocks.map((b) => b.name), ["Q1", "Q2", "Q3"]);
});

test("pi:block folds the following user segment into the previous block", () => {
	const md = `Q1\n\n<!-- pi -->\n\nA1\n\n${BLOCK_MARKER}\n\n<!-- you -->\n\nfollow-up\n`;
	assert.deepEqual(kinds(md), ["user", "assistant", "block", "user"]);
	const blocks = blocksFrom(parseDocument(md).segments);
	assert.equal(blocks.length, 1);
	assert.deepEqual(blocks[0].members, [0, 1, 2, 3]);
});

test("pi:block with nothing to fold into opens a block normally", () => {
	const md = `${BLOCK_MARKER}\n\n<!-- you -->\n\nQ1\n`;
	const blocks = blocksFrom(parseDocument(md).segments);
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].name, "Q1");
});

test("pi:view round-trips: marker with name + #id, payload fence", () => {
	const data = { file: "src/a.ts", oldText: "x", newText: "y" };
	const md = `Q1\n\n${serializeView("diff", "v1", data)}\n\n<!-- you -->\n\n`;
	const segs = parseDocument(md).segments;
	assert.deepEqual(kinds(md), ["user", "view", "user"]);
	const view = segs[1];
	assert.equal(view.name, "diff");
	assert.equal(view.id, "v1");
	const payload = view.text.split("\n").slice(1, -1).join("\n");
	assert.deepEqual(JSON.parse(payload), data);
});

test("pi:view without #id degrades to opaque", () => {
	const md = "Q1\n\n<!-- pi:view diff -->\n\n```json\n{}\n```\n";
	assert.deepEqual(kinds(md), ["user", "opaque"]);
});

test("heading names the block; first line is the fallback", () => {
	const md = "## Rename the parser\n\nplease do it\n\n<!-- pi -->\n\nok\n\n<!-- you -->\n\njust a question\nsecond line\n";
	const blocks = blocksFrom(parseDocument(md).segments);
	assert.deepEqual(blocks.map((b) => b.name), ["Rename the parser", "just a question"]);
});

// Fixture builders. The provider block and timestamps are inert: `serializeMessages`
// reads `role`, `content` and `customType` only, so these fields cannot reach an
// assertion — they are here to complete pi's message type.
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (...parts: AssistantMessage["content"]): AgentMessage => ({ role: "assistant", content: parts, api: "", provider: "", model: "", usage, stopReason: "stop", timestamp: 0 });
const user = (content: UserMessage["content"]): AgentMessage => ({ role: "user", content, timestamp: 0 });

test("serializeMessages writes the fold marker for folded user messages", () => {
	const messages = [
		user("Q1"),
		assistant({ type: "text", text: "A1" }),
		user("follow-up"),
	];
	const md = serializeMessages(messages, new Set([messages[2]]));
	assert.ok(md.includes(`${BLOCK_MARKER}\n\n<!-- you -->\n\nfollow-up`));
	const segs = parseDocument(md).segments;
	const blocks = blocksFrom(segs);
	// Q1's block holds the folded follow-up; only the trailing invite opens another.
	assert.equal(blocks.length, 2);
	assert.ok(blocks[0].members.includes(segs.findIndex((s) => s.kind === "user" && s.text === "follow-up")));
	// Without the fold set the same messages open a block per prompt.
	assert.equal(blocksFrom(parseDocument(serializeMessages(messages)).segments).length, 3);
});

test("prefixPendingUser mirrors the transcript's prefixed prompt exactly", () => {
	const line = '[cell values] {"done":["Stretch dough"]}';
	// The doc's trailing prompt must parse to the same text serializeUser
	// stores in the transcript — that equality is what keeps alignment clean.
	const want = parseDocument(serializeUser(`${line}\n\nWhat is done?`)).segments[0].text;
	const md = "intro\n\n<!-- pi -->\n\nhi\n\n<!-- you -->\n\nWhat is done?\n";
	const prefixed = parseDocument(prefixPendingUser(md, line)).segments.at(-1);
	assert.ok(prefixed, "the prefixed document still ends in a segment");
	assert.equal(prefixed.text, want);
	// Marker with no blank line before the text (hand-edited docs) works too.
	const tight = "intro\n\n<!-- pi -->\n\nhi\n\n<!-- you -->\nWhat is done?\n";
	const tightPrefixed = parseDocument(prefixPendingUser(tight, line)).segments.at(-1);
	assert.ok(tightPrefixed, "the tight document still ends in a segment");
	assert.equal(tightPrefixed.text, want);
	// No non-empty trailing prompt → unchanged (the echo splice covers those sends).
	const bare = "intro\n\n<!-- pi -->\n\nhi\n";
	assert.equal(prefixPendingUser(bare, line), bare);
});

test("a prompt run again carries one snapshot of the cell values, the newer, and keeps its scope line", () => {
	const scope = "[artifact] spiral — edit by id";
	const once = withPromptPrefixes("Make it red", ['[cell values] {"turns":6}', scope]);
	assert.equal(once, `[cell values] {"turns":6}\n\n${scope}\n\nMake it red`);
	assert.equal(withPromptPrefixes(once, ['[cell values] {"turns":15}']), `[cell values] {"turns":15}\n\n${scope}\n\nMake it red`);
	assert.equal(withPromptPrefixes("Make it red", []), "Make it red");
});

test("prefixPrompt writes into the prompt it is given, mid-page too, and the page reads the text the transcript stores", () => {
	const line = '[cell values] {"turns":6}';
	const md = "<!-- you -->\n\nfirst\n\n<!-- pi -->\n\nok\n\n<!-- you -->\n\ndraft\n";
	const segments = parseDocument(md).segments;
	const out = parseDocument(prefixPrompt(md, segments[0], [line])).segments;
	assert.equal(out[0].text, parseDocument(serializeUser(`${line}\n\nfirst`)).segments[0].text);
	assert.equal(out.at(-1)?.text, "draft", "the draft below is left alone");
});

test("escaped markers in bodies neither split segments nor open blocks", () => {
	const md = "Q1 mentions\n\n<!--  pi:block -->\n\n<!--  pi:view diff #v1 -->\n\nstill Q1\n";
	const segs = parseDocument(md).segments;
	assert.equal(segs.length, 1);
	assert.equal(segs[0].kind, "user");
	assert.ok(segs[0].text.includes("<!-- pi:block -->"));
	assert.equal(blocksFrom(segs).length, 1);
});

// --- The escaping round-trip (document-format.md §Serialization rules) -------
// Escaping is what stops content from smuggling structure, so its contract is a
// property, not an example: for any text, a body written with `escapeBody`
// parses back to that text with its edges trimmed, and nothing else changes.
// Two rows first, each a counterexample the property once found; then the
// property itself over a seeded generator, so a failure names a reproducible
// input.

/** Write `t` as a prompt between two markers and read it back. */
const roundTrip = (t: string) => parseDocument(`<!-- you -->\n\n${escapeBody(t)}\n\n<!-- pi -->\n\nend\n`).segments;

test("a look-alike whose name holds `>` is escaped like any other marker line", () => {
	for (const line of ["<!-- pi:tool a>b #t1 -->", "<!-- pi:view a>b #v1 -->", "<!-- pi:cell js>x #c1 -->", "<!-- pi:file a>b.png #f1 -->"]) {
		const segs = roundTrip(`before\n${line}\nafter`);
		assert.deepEqual(segs.map((s) => s.kind), ["user", "assistant"], `${line} split the body`);
		assert.equal(segs[0].text, `before\n${line}\nafter`);
	}
});

test("a body that already holds an escaped look-alike keeps its extra space", () => {
	for (const line of ["<!--  you -->", "<!--   pi:block -->"]) {
		assert.equal(roundTrip(line)[0].text, line);
	}
});

/** mulberry32: a few lines of seeded PRNG, so the property needs no dependency
 *  and every run draws the same inputs. */
function prng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const HEADS = [
	"you", "pi", "pi:thinking", "pi:tool bash #t1", "pi:result #t1", "pi:result #t1 error",
	"pi:view diff #v1", "pi:cell js #c1", "pi:cell js #c1 @g", "pi:artifact @a", "pi:file a.png #f1",
	"pi:note", "pi:aside", "pi:block", "pi:future thing", "pi:tool a>b #t2", "pi:cell js>x #c2", "pi: spaced",
];
const SHAPES: ((h: string) => string)[] = [
	(h) => `<!-- ${h} -->`, // the marker itself
	(h) => `<!--  ${h} -->`, // already escaped once
	(h) => `<!--   ${h} -->`, // escaped twice
	(h) => `<!--${h} -->`, // no space: not a marker
	(h) => `  <!-- ${h} -->`, // indented
	(h) => `say <!-- ${h} --> here`, // not at line start
	(h) => `<!-- <!-- ${h} --> -->`, // nested comment
	(h) => `<!-- ${h} --> trailing`,
];
const PROSE = ["hello", "", " ", "\t", "```", "````md", "---", "> quoted", "<!-- a comment -->", "-->", "<!--", "é ✓"];
const JOINS = ["\n", "\n", "\n", "\r\n", "\r", " "];
const EDGES = ["", "", " ", "\n", "\n\n", "\t \n", "\r\n"];

test("property: any body round-trips through escapeBody and parseDocument, edges trimmed", () => {
	const rand = prng(0x5eed);
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
	for (let n = 0; n < 3000; n++) {
		const lines: string[] = [];
		for (let k = Math.floor(rand() * 7); k >= 0; k--) lines.push(rand() < 0.5 ? pick(SHAPES)(pick(HEADS)) : pick(PROSE));
		let t = pick(EDGES) + lines[0];
		for (const line of lines.slice(1)) t += pick(JOINS) + line;
		t += pick(EDGES);
		const segs = roundTrip(t);
		assert.deepEqual(
			segs.map((s) => [s.kind, s.text]),
			[["user", t.trim()], ["assistant", "end"]],
			`body ${JSON.stringify(t)}`,
		);
	}
});

// --- The format version (document-format.md §Frontmatter) ------------------
// A reader that ignores its own version marker rewrites a newer document in the
// version it knows and drops whatever the newer one added. So the version is
// read, an absent one is v1, and a version this reader does not know may be
// rendered but never written back.

test("an explicit `pi: v1` is v1, and the document may be rewritten", () => {
	const md = emptyDocument("web-abc");
	assert.equal(parseDocument(md).version, "v1");
	assert.equal(rewriteRefusal(md), null);
});

test("no frontmatter at all is v1 — a plain markdown file is a conversation", () => {
	const md = "just some prose\n\npi: v9 in the body is prose, not a version\n";
	assert.equal(parseDocument(md).frontmatter, null);
	assert.equal(parseDocument(md).version, "v1");
	assert.equal(rewriteRefusal(md), null);
});

test("frontmatter with no `pi` key is v1", () => {
	const md = "---\nsession: web-abc\ntitle: notes\n---\n\n<!-- you -->\n\nhi\n";
	assert.equal(parseDocument(md).version, "v1");
	assert.equal(rewriteRefusal(md), null);
});

test("a quoted `pi` value is the same version", () => {
	assert.equal(parseDocument("---\npi: \"v1\"\n---\n\nhi\n").version, "v1");
	assert.equal(parseDocument("---\npi: 'v1'\n---\n\nhi\n").version, "v1");
});

test("an unknown version renders but refuses to be rewritten, and says which", () => {
	const fm = "---\npi: v2\nsession: web-abc\n---";
	const md = `${fm}\n\nQ1\n\n<!-- pi -->\n\nA1\n`;
	const parsed = parseDocument(md);
	assert.equal(parsed.version, "v2");
	assert.equal(parsed.frontmatter, fm, "the raw frontmatter survives verbatim");
	assert.deepEqual(parsed.segments.map((s) => s.kind), ["user", "assistant"], "and the body still parses");
	const refusal = rewriteRefusal(md);
	assert.ok(refusal, "a v2 document is not written back as v1");
	assert.match(refusal, /v2/);
});

test("a `pi` key with no value is not a version this reader knows", () => {
	assert.equal(parseDocument("---\npi:\n---\n\nhi\n").version, "");
	assert.ok(rewriteRefusal("---\npi:\n---\n\nhi\n"));
});

// --- messagesFrom: the inverse of serializeMessages (the rebuild path) ------
// The buffer is the history, so this round trip is what a session rebuild
// writes. Content must survive exactly; provider metadata (usage, model,
// timestamps, thinking signatures) is not in the document and is restored by
// zipping against the session's existing entries.

/** Every role this round trip produces carries `content`, but some members of
 *  pi's message union do not, so it is read through a shape naming just the
 *  field the projection compares. */
const content = (m: AgentMessage) =>
	m.role === "toolResult"
		? { role: m.role, toolCallId: m.toolCallId, toolName: m.toolName, content: m.content, isError: m.isError }
		: { role: m.role, content: (m as { content?: unknown }).content };


test("messagesFrom round-trips every segment kind", () => {
	const msgs: AgentMessage[] = [
		{ role: "user", content: [{ type: "text", text: "Q1" }], timestamp: 0 },
		assistant(
			{ type: "thinking", thinking: "hmm" },
			{ type: "text", text: "A1" },
			{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls -la" } },
		),
		{ role: "toolResult", toolCallId: "t1", toolName: "bash", content: [{ type: "text", text: "a.txt\nb.txt" }], isError: false, timestamp: 0 },
		assistant(
			{ type: "toolCall", id: "v1", name: "view", arguments: { template: "table", data: { columns: ["a"], rows: [[1]] } } },
			{ type: "toolCall", id: "c1", name: "cell", arguments: { source: "const x = 1", mode: "js", id: "c1", group: "app" } },
		),
		// A view's answer is written and can carry real content ("the data does not
		// fit that template"), so it round-trips through the document. A cell's is
		// not written at all — `documentMessages` synthesizes it from the id it just
		// emitted, which is why the two ids can no longer disagree. Both come back,
		// in document order, real answer first.
		{ role: "toolResult", toolCallId: "v1", toolName: "view", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 0 },
		{ role: "toolResult", toolCallId: "c1", toolName: "cell", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 0 },
		{ role: "user", content: [{ type: "text", text: "Q2" }], timestamp: 0 },
		{ role: "custom", customType: NOTE_TYPE, content: wrapNote("## Context\n\npage prose"), display: true, timestamp: 0 },
	];
	const folded = new Set([msgs[6]]); // the follow-up folds into the previous block
	const md = serializeMessages(msgs, folded);
	assert.ok(md.includes(BLOCK_MARKER), "fold marker present — and must not become a message");
	assert.ok(md.includes(`${NOTE_MARKER}\n\n## Context\n\npage prose`), "a note is written as its marker and its bare prose");
	assert.deepEqual(messagesFrom(md).map(content), msgs.map(content));
});

test("messagesFrom drops the trailing pending prompt and keeps a failed result", () => {
	const md = `Q\n\n<!-- pi:tool bash #t9 -->\n\n\`\`\`json\n{"command":"nope"}\n\`\`\`\n\n<!-- pi:result #t9 error -->\n\n\`\`\`\ncommand not found\n\`\`\`\n\n<!-- you -->\n\n`;
	const out = messagesFrom(md);
	assert.deepEqual(out.map((m) => m.role), ["user", "assistant", "toolResult"]);
	const result = out[2];
	assert.ok(result?.role === "toolResult", "the failed result survives as a toolResult");
	assert.equal(result.isError, true);
	assert.equal(result.toolName, "bash", "toolName restored from the call sharing the id");
	const body = result.content[0];
	assert.ok(body?.type === "text", "the result body is text");
	assert.equal(body.text, "command not found");
});

test("a tool's live panel is not replayed as a second call with its id", () => {
	// §Rebuild rule: the panel shares its call's id and the call is answered, so
	// without the rule the panel replays as a `view` call with the SAME id — a
	// duplicate `tool_use` the provider rejects — and renames the call `view`.
	const md = "Q\n\n<!-- pi -->\n\nlisting\n\n<!-- pi:tool bash #t1 -->\n\n```json\n{\"command\":\"ls\"}\n```\n\n<!-- pi:view terminal #t1 -->\n\n```\n```\n\n<!-- pi:result #t1 -->\n\n```\na.txt\n```\n\n<!-- pi -->\n\ndone\n";
	const out = messagesFrom(md);
	const calls = out.flatMap((m) => (m.role === "assistant" ? m.content.filter((p) => p.type === "toolCall") : []));
	assert.deepEqual(calls.map((c) => [c.id, c.name]), [["t1", "bash"]], "one call, named for the tool that ran");
	const results = out.filter((m) => m.role === "toolResult");
	assert.deepEqual(results.map((r) => [r.toolCallId, r.toolName]), [["t1", "bash"]]);
});

test("messagesFrom never throws on hand-mangled payloads", () => {
	const md = "Q\n\n<!-- pi:tool bash #t1 -->\n\n```json\n{not json,,\n```\n\n<!-- pi:result #t1 -->\n\n```\nout\n```\n";
	const out = messagesFrom(md);
	const call = out[1];
	assert.ok(call?.role === "assistant", "the mangled call still lands as an assistant message");
	const part = call.content[0];
	assert.ok(part?.type === "toolCall", "and its first part is the tool call");
	assert.deepEqual(part.arguments, {}, "unparseable args degrade to {} so the call still pairs");
	const result = out[2];
	assert.ok(result?.role === "toolResult", "and the result pairs with it");
	assert.equal(result.toolCallId, "t1");
});

test("a non-image attachment is named to the agent in one line: name, mime, path", () => {
	// §Attachments: the agent opens a non-image file with its own tools, so the
	// prompt says where it is.
	assert.equal(
		attachmentNote("paper.pdf", "application/pdf", "/Users/me/.pi/agent/docs/--w--/attachments/paper-ccc.pdf"),
		"[attached: paper.pdf (application/pdf) at /Users/me/.pi/agent/docs/--w--/attachments/paper-ccc.pdf]",
	);
});

// ── A send-time [now: …] line is not document content ──────────────────────

const NOW = "[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]";

test("a user message read from a transcript drops its trailing [now: …] line", () => {
	assert.equal(serializeUser(`what day is it?\n${NOW}`), "<!-- you -->\n\nwhat day is it?");
	assert.equal(serializeUser([{ type: "text", text: `what day is it?\n${NOW}` }]), "<!-- you -->\n\nwhat day is it?");
});

test("the [now: …] line goes, and an [attached: …] line before it stays", () => {
	const attached = "[attached: notes.txt (text/plain) at /tmp/notes.txt]";
	assert.equal(serializeUser(`read this\n${attached}\n${NOW}`), `<!-- you -->\n\nread this\n${attached}`);
});

test("every trailing [now: …] line goes: a stamp after a user's own look-alike takes both", () => {
	assert.equal(serializeUser(`what\n[now: typed]\n${NOW}`), "<!-- you -->\n\nwhat");
});

test("a [now: …] line that is not the last line is the user's own text", () => {
	assert.equal(serializeUser(`${NOW}\nwhat day is it?`), `<!-- you -->\n\n${NOW}\nwhat day is it?`);
});

test("a message that is only a [now: …] line serializes to nothing", () => {
	assert.equal(serializeUser(NOW), "");
});

// ── A send-time face block is not document content ──────────────────────────

const FACE = '[face]\ndeleted "this is the second time": brows lowered severe + lips pressed marked 8.0s\ntyping "like you said": brows lowered marked 2.6s';

test("a user message read from a transcript drops its trailing face block, with the time line or without", () => {
	assert.equal(serializeUser(`do it like you said\n\n${FACE}\n${NOW}`), "<!-- you -->\n\ndo it like you said");
	assert.equal(serializeUser([{ type: "text", text: `do it like you said\n\n${FACE}\n${NOW}` }]), "<!-- you -->\n\ndo it like you said");
	assert.equal(serializeUser(`do it like you said\n\n${FACE}`), "<!-- you -->\n\ndo it like you said");
});

test("the face block goes, and an [attached: …] line before it stays", () => {
	const attached = "[attached: notes.txt (text/plain) at /tmp/notes.txt]";
	assert.equal(serializeUser(`read this\n${attached}\n\n${FACE}\n${NOW}`), `<!-- you -->\n\nread this\n${attached}`);
});

test("a [face] line the user wrote above prose of their own is the user's text", () => {
	const own = "what does this mean?\n\n[face]\nread the docs first, then decide";
	assert.equal(serializeUser(`${own}\n${NOW}`), `<!-- you -->\n\n${own}`);
	// One line of prose among the block's lines keeps the whole of it.
	const mixed = `quoting a log:\n\n[face]\ntyping "x": brows lowered marked 1.0s\nand then it stopped`;
	assert.equal(serializeUser(mixed), `<!-- you -->\n\n${mixed}`);
	// A header alone, or one not after a blank line, is no block.
	assert.equal(serializeUser("see\n\n[face]"), "<!-- you -->\n\nsee\n\n[face]");
	const glued = 'see\n[face]\ntyping "x": brows lowered marked 1.0s';
	assert.equal(serializeUser(glued), `<!-- you -->\n\n${glued}`);
});

test("a message that is only a face block serializes to nothing", () => {
	assert.equal(serializeUser(`${FACE}\n${NOW}`), "");
});

test("a conversation's label is its first heading or line, past the frontmatter and the markers", () => {
	assert.equal(documentLabel("---\npi: v1\nsession: web-1\n---\n\n<!-- you -->\n\n# The tracer\n\nBuild it\n"), "The tracer");
	assert.equal(documentLabel("<!-- you -->\n\nwhat is 2+2?\n\n<!-- pi -->\n\nFour.\n"), "what is 2+2?");
	assert.equal(documentLabel("A plain file with no markers.\nSecond line.\n"), "A plain file with no markers.");
	assert.equal(documentLabel("---\npi: v1\n---\n\n<!-- you -->\n\n"), "", "nothing written yet has no label");
	assert.equal(documentLabel(`<!-- you -->\n\n${"x".repeat(120)}`).length, 80, "cut to 80");
});

/** `md` renamed to `name`, the edit applied. */
const renamed = (md: string, name: string) => {
	const edit = renameDocument(md, name);
	assert.ok(edit, "an edit");
	return md.slice(0, edit.from) + edit.insert + md.slice(edit.to);
};

test("a rename rewrites the first heading, keeping its level", () => {
	const md = "---\npi: v1\nsession: web-1\n---\n\n<!-- you -->\n\n## The tracer\n\nBuild it\n";
	const next = renamed(md, "The renderer");
	assert.equal(next, md.replace("## The tracer", "## The renderer"));
	assert.equal(documentLabel(next), "The renderer");
});

test("a rename puts a heading over the first line when the document has none", () => {
	const md = "<!-- you -->\n\nwhat is 2+2?\n\n<!-- pi -->\n\nFour.\n";
	const next = renamed(md, "Arithmetic");
	assert.equal(next, "<!-- you -->\n\n# Arithmetic\n\nwhat is 2+2?\n\n<!-- pi -->\n\nFour.\n");
	assert.equal(documentLabel(next), "Arithmetic");
});

test("a rename of an empty conversation heads its open prompt", () => {
	const md = "---\npi: v1\nsession: web-1\n---\n\n<!-- you -->\n\n";
	const next = renamed(md, "Ideas");
	assert.equal(documentLabel(next), "Ideas");
	assert.ok(next.startsWith(md), "nothing before the open prompt changes");
});

test("a rename to nothing, or to the name it has, is no edit; a newline cannot break the heading", () => {
	const md = "<!-- you -->\n\n# Same\n\n";
	assert.equal(renameDocument(md, "  "), null);
	assert.equal(renameDocument(md, "Same"), null);
	assert.equal(documentLabel(renamed(md, "two\nlines")), "two lines");
});

// ── An unasked reply (`pi:aside`, document-format.md §An unasked reply) ──────

const FACE_ONLY = '[face]\nread 0.6s: brows lowered marked 1.8s\n[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]';
const say = (text: string, extra: unknown[] = []) => ({ role: "assistant", content: [...extra, { type: "text", text }] }) as unknown as AgentMessage;
const asked = (text: string) => ({ role: "user", content: [{ type: "text", text }] }) as unknown as AgentMessage;

test("a reply to a message that was only a face block is an aside under the answer, and the face block is nowhere", () => {
	const md = serializeMessages([asked("why?"), say("Because."), asked(FACE_ONLY), say("A key is a token.", [{ type: "thinking", thinking: "they frowned" }])]);
	assert.equal(md, `why?\n\n<!-- pi -->\n\nBecause.\n\n${ASIDE_MARKER}\n\nA key is a token.\n\n<!-- you -->\n\n`);
	assert.deepEqual(kinds(md), ["user", "assistant", "aside", "user"]);
	// It belongs to the answer's block and opens none.
	assert.deepEqual(blocksFrom(parseDocument(md).segments).map((b) => b.members), [[0, 1, 2], [3]]);
});

test("a silent reply, and one that says nothing, are in the transcript and never in the document", () => {
	for (const silent of ["[silent]", " [silent]\n", ""]) {
		assert.equal(serializeMessages([asked("why?"), say("Because."), asked(FACE_ONLY), say(silent)]), "why?\n\n<!-- pi -->\n\nBecause.\n\n<!-- you -->\n\n", JSON.stringify(silent));
	}
	// Only right after a face-only message: the same words in answer to a prompt are an answer.
	assert.match(serializeMessages([asked("say [silent]"), say("[silent]")]), /<!-- pi -->\n\n\[silent\]/);
});

test("an aside reads back as the two messages it was, the face said as not kept, and that round-trips", () => {
	const md = `why?\n\n<!-- pi -->\n\nBecause.\n\n${ASIDE_MARKER}\n\nA key is a token.\n\n<!-- you -->\n\n`;
	const messages = documentMessages(md).messages;
	assert.deepEqual(messages.map((m) => [m.role, (m as unknown as { content: { text: string }[] }).content.map((c) => c.text).join("")]), [
		["user", "why?"],
		["assistant", "Because."],
		["user", "[face]\n(what the face did is not kept)"],
		["assistant", "A key is a token."],
	]);
	assert.equal(serializeMessages(messages), md);
	assert.equal(serializeUser("[face]\n(what the face did is not kept)"), "");
	// A transcript that still holds the block and one rewritten from the document read alike.
	const held = [asked("why?"), say("Because."), asked(FACE_ONLY), say("A key is a token.")];
	assert.equal(JSON.stringify(documentMessages(serializeMessages(held)).messages), JSON.stringify(messages));
	// An empty aside is no message; a reply that called a tool is an answer, not an aside.
	assert.equal(documentMessages(`why?\n\n${ASIDE_MARKER}\n\n<!-- you -->\n\n`).messages.length, 1);
	const called = say("Looking.", [{ type: "toolCall", id: "t1", name: "bash", arguments: {} }]);
	assert.doesNotMatch(serializeMessages([asked("why?"), say("Because."), asked(FACE_ONLY), called]), /pi:aside/);
});

