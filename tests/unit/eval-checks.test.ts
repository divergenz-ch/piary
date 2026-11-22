// The eval runner's pure half: where an answer lands, and what each automatic
// check says about a turn. The runner drives a real pi; these are the rules it
// scores by, held here with hand-built turns so a check that passes everything
// (or fails everything) shows up without a model.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { TurnCalls } from "../../evals/calls.ts";
import { parseCase } from "../../evals/case.ts";
import { type Observed, runChecks, wordCount } from "../../evals/checks.ts";
import { answerProse, answerText, placeAnswer, target, turnOf } from "../../evals/place.ts";
import { parseDocument } from "../../src/document/format.ts";
import { promptEnd } from "../../src/document/run.ts";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (...parts: AssistantMessage["content"]): AgentMessage => ({ role: "assistant", content: parts, api: "", provider: "", model: "", usage, stopReason: "stop", timestamp: 0 });
const user = (content: UserMessage["content"]): AgentMessage => ({ role: "user", content, timestamp: 0 });

const MID = "# Plan\n\nIntro.\n\n<!-- you -->\n\nAnswer here, please.\n\n<!-- pi:note -->\n\nNotes below.\n";

test("a mid-page answer lands under its prompt and before what followed", () => {
	const { segment } = target(MID, "Answer here");
	const placed = placeAnswer(MID, segment, answerText([assistant({ type: "text", text: "Here it is." })]));
	assert.ok(placed.startsWith(MID.slice(0, promptEnd(MID, segment))));
	const kinds = parseDocument(placed).segments.map((s) => s.kind);
	assert.deepEqual(kinds, ["user", "user", "assistant", "note"]);
	assert.ok(placed.indexOf("Here it is.") < placed.indexOf("Notes below."));
});

test("a trailing prompt's answer is followed by a fresh prompt slot", () => {
	const md = "What is 2+2?\n";
	const placed = placeAnswer(md, target(md).segment, answerText([assistant({ type: "text", text: "4" })]));
	assert.match(placed, /What is 2\+2\?\n\n<!-- pi -->\n\n4\n\n<!-- you -->\n\n$/);
});

test("a cell the answer writes is serialized as its cell block, not as a tool call", () => {
	const text = answerText([assistant({ type: "toolCall", id: "call_xyz123abc", name: "cell", arguments: { source: "1+1", mode: "js", id: "a1b2c3" } })]);
	assert.match(text, /<!-- pi:cell js #a1b2c3 -->/);
	assert.doesNotMatch(text, /<!-- you -->$/);
});

test("the turn is what follows the last user message, and its prose is the text pi wrote", () => {
	const turn = turnOf([user("old"), assistant({ type: "text", text: "old answer" }), user("new"), assistant({ type: "text", text: "new answer" })]);
	assert.equal(answerProse(turn), "new answer");
});

test("the target's history is the document above the prompt only", () => {
	const md = "First question\n\n<!-- pi -->\n\nFirst answer\n\n<!-- you -->\n\nSecond question\n";
	const { history, prompt } = target(md);
	assert.equal(prompt, "Second question");
	assert.deepEqual(
		history.messages.map((m) => (m as { role: string }).role),
		["user", "assistant"],
	);
});

/** A turn that did everything right for a case asking for a cell redefinition. */
function observed(over: Partial<Observed> = {}): Observed {
	const original = "Fix it\n";
	const { segment } = target(original);
	const result = placeAnswer(original, segment, "<!-- pi -->\n\nFixed.");
	return {
		original,
		result,
		prose: "Fixed the typo in the total cell.",
		toolCalls: [{ name: "cell", args: { id: "a1b2c3", source: "const gain = view(Inputs.range([0, 10]))" } }],
		before: new Map([["a.js", "1"], ["b.js", "2"]]),
		after: new Map([["a.js", "9"], ["b.js", "2"], ["c.js", "3"]]),
		conversationBefore: "doc",
		conversationAfter: "doc",
		...over,
	};
}

const spec = parseCase(
	{
		title: "t",
		tags: [],
		job: "cell",
		canvas: [],
		rubric: ["r"],
		checks: {
			tools: { must: ["cell"], mustNot: ["edit"] },
			cellRedefines: "a1b2c3",
			files: { changed: ["a.js"], unchanged: ["b.js"], exist: ["c.js"] },
			maxWords: 10,
			mentions: ["typo"],
			cellMentions: ["view(Inputs."],
		},
	},
	"spec",
);

const failing = (seen: Observed) =>
	runChecks(spec, seen)
		.filter((r) => !r.pass)
		.map((r) => r.check);

test("a turn that does what the case asks passes every check", () => {
	assert.deepEqual(failing(observed()), []);
});

test("each check fails on the turn that breaks it, and only that one", () => {
	assert.deepEqual(failing(observed({ toolCalls: [{ name: "edit", args: {} }, { name: "cell", args: { id: "a1b2c3", source: "view(Inputs.range())" } }] })), ["never calls edit"]);
	assert.deepEqual(failing(observed({ toolCalls: [{ name: "cell", args: { source: "view(Inputs.range())" } }] })), ["redefines #a1b2c3"]);
	assert.deepEqual(failing(observed({ toolCalls: [] })), ["calls cell", "redefines #a1b2c3", "a cell holds \"view(Inputs.\""]);
	assert.deepEqual(failing(observed({ after: new Map([["a.js", "1"], ["b.js", "2"], ["c.js", "3"]]) })), ["changes a.js"]);
	assert.deepEqual(failing(observed({ after: new Map([["a.js", "9"], ["b.js", "3"], ["c.js", "3"]]) })), ["leaves b.js"]);
	assert.deepEqual(failing(observed({ after: new Map([["a.js", "9"], ["b.js", "2"]]) })), ["leaves c.js in place"]);
	assert.deepEqual(failing(observed({ conversationAfter: "doc, edited by pi" })), ["leaves the conversation file"]);
	assert.deepEqual(failing(observed({ prose: "Fixed the typo in the total cell, and also wrote a long essay." })), ["at most 10 words"]);
	assert.deepEqual(failing(observed({ prose: "Fixed it." })), ["mentions \"typo\""]);
	assert.deepEqual(failing(observed({ toolCalls: [{ name: "cell", args: { id: "a1b2c3", source: "const gain = 5" } }] })), ["a cell holds \"view(Inputs.\""]);
});

test("a result that lost a marker, or holds one the format does not know, fails the document checks", () => {
	const original = "Q1\n\n<!-- pi -->\n\nA1\n\n<!-- pi:cell js #c0ffee -->\n\n```js\n1\n```\n\n<!-- you -->\n\nQ2\n";
	const { segment } = target(original);
	const placed = placeAnswer(original, segment, "<!-- pi -->\n\nA2");
	const lost = placed.replace("<!-- pi:cell js #c0ffee -->\n\n```js\n1\n```\n\n", "");
	const checksOf = (result: string) =>
		runChecks(parseCase({ title: "t", tags: [], job: "explain", canvas: [], rubric: ["r"], checks: {} }, "doc"), observed({ original, result, toolCalls: [] }))
			.filter((r) => !r.pass)
			.map((r) => r.check);
	assert.deepEqual(checksOf(placed), []);
	assert.deepEqual(checksOf(lost), ["markers intact"]);
	assert.deepEqual(checksOf(`${placed}\n<!-- pi:bogus thing -->\n\nx\n`), ["the result parses"]);
});

test("a check naming a tool that does not exist is refused, since it could never fail", () => {
	const bad = { title: "t", tags: [], job: "explain", canvas: [], rubric: ["r"], checks: { tools: { mustNot: ["edti"] } } };
	assert.throws(() => parseCase(bad, "typo"), /names "edti"/);
});

test("an empty turn fails as unanswered", () => {
	const checks = runChecks(parseCase({ title: "t", tags: [], job: "explain", canvas: [], rubric: ["r"], checks: {} }, "x"), observed({ prose: "", toolCalls: [] }));
	assert.equal(checks.find((c) => c.check === "answers")?.pass, false);
});

test("a call is recorded with how it ended, matched by its id and not by its order", () => {
	const calls = new TurnCalls();
	calls.hear({ type: "tool_execution_start", toolCallId: "t1", toolName: "view", args: { template: "a2ui" } });
	calls.hear({ type: "tool_execution_start", toolCallId: "t2", toolName: "view", args: { template: "table" } });
	calls.hear({ type: "tool_execution_start", toolCallId: "t3", toolName: "bash", args: {} });
	// Parallel tools end in completion order, and one that never ends says nothing.
	calls.hear({ type: "tool_execution_end", toolCallId: "t2", toolName: "view", isError: false });
	calls.hear({ type: "tool_execution_end", toolCallId: "t1", toolName: "view", isError: true });
	assert.deepEqual(calls.calls, [
		{ name: "view", args: { template: "a2ui" }, failed: true },
		{ name: "view", args: { template: "table" }, failed: false },
		{ name: "bash", args: {} },
	]);
});

test("words are counted by whitespace", () => {
	assert.equal(wordCount(""), 0);
	assert.equal(wordCount("  one two\nthree "), 3);
});
