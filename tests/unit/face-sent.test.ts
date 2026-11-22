// What a message carried of the user's face, read back from pi's transcript (app/face/sent.ts):
// asserted without a page or a pi.
import test from "node:test";
import assert from "node:assert/strict";
import { promptIn, sentOf, sentRows } from "../../app/face/sent.ts";
import { documentMessages, parseDocument } from "../../src/document/format.ts";

const NOW = "[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]";
const BLOCK = '[face]\ntyping "is 2+2": brows lowered marked 2.3s';
const MD = "<!-- you -->\n\nwhat is 2+2\n\n<!-- pi -->\n\nFour.\n\n<!-- you -->\n\nand 3+3?\n\n<!-- pi -->\n\nSix.\n\n<!-- you -->\n\nnot sent yet\n";

type Entries = Parameters<typeof sentOf>[2];
const entries = (...messages: { role: string; content: unknown }[]): Entries =>
	messages.map((message, i) => ({ type: "message", id: `e${i}`, parentId: i ? `e${i - 1}` : null, timestamp: "2026-01-01T00:00:00.000Z", message })) as unknown as Entries;
const said = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });
const HELD = entries({ role: "user", content: `what is 2+2\n\n${BLOCK}\n${NOW}` }, said("Four."), { role: "user", content: [{ type: "text", text: `and 3+3?\n${NOW}` }] }, said("Six."));

const prompts = parseDocument(MD).segments.filter((segment) => segment.kind === "user");
const at = (n: number) => prompts[n]!.from;

test("a prompt's block is the one its message in pi's transcript ends with", () => {
	assert.deepEqual(sentOf(MD, at(0), HELD, "e3"), { block: BLOCK });
	assert.equal(sentOf(MD, at(1), HELD, "e3"), "none");
});

test("a prompt pi does not hold as the document has it is not answered for", () => {
	assert.equal(sentOf(MD, at(2), HELD, "e3"), "unknown", "never sent");
	assert.equal(sentOf(MD.replace("what is 2+2", "what is 2+5"), at(0), HELD, "e3"), "unknown", "edited since");
	assert.equal(sentOf(MD, 3, HELD, "e3"), "unknown", "no prompt begins there");
	assert.equal(sentOf(MD, at(0), [], null), "unknown");
});

test("a prompt shortened since it was sent is not the message pi holds, though that begins with it", () => {
	assert.equal(sentOf(MD.replace("what is 2+2", "what is 2"), at(0), HELD, "e3"), "unknown");
});

test("a command and a subagent's prompt above do not move which message a prompt is", () => {
	const md = `<!-- you -->\n\n/compact\n\n<!-- you -->\n\n/subagent look it up\n\n<!-- pi -->\n\nDone.\n\n${MD}`;
	const mine = parseDocument(md).segments.filter((segment) => segment.kind === "user" && segment.text === "what is 2+2")[0]!;
	const written = documentMessages(md).messages.filter((message) => message.role === "user").map((message) => message.content);
	// pi holds what a rebuild would write, each with the tail a send added.
	const text = (content: unknown) => (typeof content === "string" ? content : (content as { text?: string }[]).map((part) => part.text ?? "").join(""));
	const held = entries(...written.map((content, i) => ({ role: "user", content: `${text(content)}${i === written.length - 3 ? `\n\n${BLOCK}` : ""}\n${NOW}` })));
	assert.deepEqual(sentOf(md, mine.from, held, `e${written.length - 1}`), { block: BLOCK });
});

test("attachment lines a send put after the words do not make the message a stranger", () => {
	const held = entries({ role: "user", content: `what is 2+2\n[attached: a.pdf (application/pdf) at /x/a.pdf]\n\n${BLOCK}\n${NOW}` });
	assert.deepEqual(sentOf(MD, at(0), held, "e0"), { block: BLOCK });
});

test("a block's menu asks about the first prompt in it", () => {
	assert.equal(promptIn(MD, at(0)), at(0));
	assert.equal(promptIn("<!-- pi -->\n\nAn answer with no prompt.\n", 0), null);
});

test("what is said: the block word for word, or one sentence for none and for a rewritten history", () => {
	assert.deepEqual(sentRows({ block: BLOCK }).at(-1), { note: BLOCK, verbatim: true });
	assert.match(JSON.stringify(sentRows("none")), /none was sent with it, or the history was rewritten since/);
	assert.match(JSON.stringify(sentRows("unknown")), /is not known/);
});

test("an unasked reply above a prompt does not move which message the prompt is", () => {
	const md = "<!-- you -->\n\nwhy?\n\n<!-- pi -->\n\nBecause.\n\n<!-- pi:aside -->\n\nA key is a token.\n\n<!-- you -->\n\nwhat is 2+2\n\n<!-- pi -->\n\nFour.\n\n<!-- you -->\n\n";
	const mine = parseDocument(md).segments.find((segment) => segment.kind === "user" && segment.text === "what is 2+2")!;
	const held = entries({ role: "user", content: `why?\n${NOW}` }, said("Because."), { role: "user", content: `[face]\nread 0.6s: brows lowered marked 1.8s\n${NOW}` }, said("A key is a token."), { role: "user", content: `what is 2+2\n\n${BLOCK}\n${NOW}` }, said("Four."));
	assert.deepEqual(sentOf(md, mine.from, held, "e5"), { block: BLOCK });
});

test("a sent block can be judged right or wrong, and one that was not sent cannot", () => {
	const said: string[] = [];
	const rows = sentRows({ block: BLOCK }, (verdict) => said.push(verdict));
	const choices = rows.filter((row): row is { label: string; run: () => void } => "label" in row);
	assert.deepEqual(choices.map((row) => row.label), ["It was right", "It was not"]);
	for (const row of choices) row.run();
	assert.deepEqual(said, ["right", "wrong"]);
	assert.equal(sentRows("none", () => {}).some((row) => "label" in row), false);
	assert.equal(sentRows("unknown", () => {}).some((row) => "label" in row), false);
});

