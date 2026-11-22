// A run written as text, with no editor — run `pnpm build` first, then
// `node --test tests/integration/mirror.test.ts`.
//
// A child session's run is written while no canvas shows it, so the text it
// leaves must be exactly what the canvas would have left for the same events.
// The equality rows drive the real `<document-chat>` and the mirror through one
// script each and compare the documents; where they differ, the mirror is the
// copy and is wrong.
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { closeMirror, mirrorError, mirrorFinal, mirrorPartial, mirrorText, mirrorToolResult, mirrorUser, openMirror } from "../../dist/document/mirror.js";
import { PI_PLACEHOLDER, serializeUser } from "../../dist/document/format.js";
import { mount, settle, unmount } from "../helpers/editor.ts";

const assistant = (text: string, call?: string): AssistantMessage =>
	({
		role: "assistant",
		content: [{ type: "text", text }, ...(call ? [{ type: "toolCall", id: call, name: "bash", arguments: { command: "ls" } }] : [])],
		api: "openai-responses",
		provider: "openai",
		model: "gpt-x",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: call ? "toolUse" : "stop",
		timestamp: 0,
	}) as AssistantMessage;

const toolResult = (id: string, text: string, isError = false): ToolResultMessage => ({
	role: "toolResult",
	toolCallId: id,
	toolName: "bash",
	content: [{ type: "text", text }],
	isError,
	timestamp: 0,
});

/** One step of a run, as `app/turn.ts` hands it to the canvas. */
type Step =
	| { kind: "partial"; text: string }
	| { kind: "final"; text: string; call?: string }
	| { kind: "result"; id: string; text: string; isError?: boolean }
	| { kind: "user"; text: string }
	| { kind: "error"; message: string };

const START = "<!-- you -->\n\nsay hi\n\n";

/** The script through the real canvas, as `Turn` drives it. */
async function onCanvas(steps: readonly Step[]): Promise<string> {
	const { el } = await mount(START);
	try {
		el.streaming = true;
		await settle();
		el.beginTurn();
		for (const step of steps) {
			if (step.kind === "partial") el.applyAssistantPartial(assistant(step.text));
			else if (step.kind === "final") el.finalizeAssistant(assistant(step.text, step.call));
			else if (step.kind === "result") el.appendToolResult(toolResult(step.id, step.text, step.isError));
			else if (step.kind === "user") el.appendUserMessage(serializeUser(step.text), true);
			else el.appendError(step.message);
			await settle();
		}
		el.endTurn();
		el.streaming = false;
		await settle();
		return el.getDocument();
	} finally {
		unmount(el);
	}
}

/** The same script through the mirror. */
function onMirror(steps: readonly Step[]): string {
	let m = openMirror(START);
	for (const step of steps) {
		if (step.kind === "partial") m = mirrorPartial(m, assistant(step.text));
		else if (step.kind === "final") m = mirrorFinal(m, assistant(step.text, step.call));
		else if (step.kind === "result") m = mirrorToolResult(m, toolResult(step.id, step.text, step.isError));
		else if (step.kind === "user") m = mirrorUser(m, serializeUser(step.text));
		else m = mirrorError(m, step.message);
	}
	return closeMirror(m);
}

const SCRIPTS: Record<string, Step[]> = {
	"one answer": [{ kind: "final", text: "Hi." }],
	"partials, then a final": [
		{ kind: "partial", text: "H" },
		{ kind: "partial", text: "Hi th" },
		{ kind: "final", text: "Hi there." },
	],
	"an error": [
		{ kind: "partial", text: "Work" },
		{ kind: "error", message: "the provider refused" },
	],
	"two answers around a delivered message": [
		{ kind: "final", text: "First." },
		{ kind: "user", text: "[cell report] #a failed: x" },
		{ kind: "final", text: "Fixed." },
	],
	"a tool's result between its call and the answer": [
		{ kind: "final", text: "Listing.", call: "t1" },
		{ kind: "result", id: "t1", text: "a.txt\nb.txt" },
		{ kind: "final", text: "Two files." },
	],
	"a tool that failed": [
		{ kind: "final", text: "Trying.", call: "t1" },
		{ kind: "result", id: "t1", text: "no such file", isError: true },
		{ kind: "final", text: "It is not there." },
	],
	"nothing at all": [],
};

for (const [name, steps] of Object.entries(SCRIPTS)) {
	test(`the mirror writes what the canvas writes: ${name}`, async () => {
		assert.equal(onMirror(steps), await onCanvas(steps));
	});
}

test("opening a run puts the placeholder under the last prompt, and a fresh prompt below", () => {
	const m = openMirror(START);
	assert.equal(m.current, PI_PLACEHOLDER);
	assert.ok(mirrorText(m).startsWith(START));
	assert.ok(m.tail.includes("<!-- you -->"));
});

test("a cell redefined with no mode named keeps its mode in the mirror too", () => {
	const cell = (id: string, args: Record<string, string>): AssistantMessage => ({
		...assistant(""),
		content: [{ type: "toolCall", id, name: "cell", arguments: args }],
	});
	let m = openMirror(START);
	m = mirrorFinal(m, cell("t1", { source: "q = 3", mode: "ojs", id: "q" }));
	m = mirrorPartial(m, cell("t2", { source: "q = 4", id: "q" }));
	assert.ok(mirrorText(m).includes("<!-- pi:cell ojs #q -->\n\n```ojs\nq = 4"), "the partial");
	m = mirrorFinal(m, cell("t2", { source: "q = 4", id: "q" }));
	assert.ok(mirrorText(m).includes("<!-- pi:cell ojs #q -->\n\n```ojs\nq = 4"), "and the final");
});

test("a partial replaces the one before it; an empty one keeps the placeholder", () => {
	let m = openMirror(START);
	m = mirrorPartial(m, assistant(""));
	assert.equal(m.current, PI_PLACEHOLDER, "nothing to show yet");
	m = mirrorPartial(m, assistant("one"));
	m = mirrorPartial(m, assistant("one two"));
	assert.ok(mirrorText(m).includes("one two"));
	assert.ok(!mirrorText(m).includes("one\n\n<!-- pi -->\n\none two"));
});

test("a final message is committed, and the next one starts after it", () => {
	let m = openMirror(START);
	m = mirrorFinal(m, assistant("first"));
	m = mirrorPartial(m, assistant("second"));
	const text = mirrorText(m);
	assert.ok(text.indexOf("first") < text.indexOf("second"));
});

test("the mirror returns new values and leaves the old ones alone", () => {
	const before = openMirror(START);
	const snapshot = { ...before };
	mirrorFinal(before, assistant("x"));
	assert.deepEqual(before, snapshot);
});
