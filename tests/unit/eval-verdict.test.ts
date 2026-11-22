// The eval's stand-in for the page's cell verdict: a compile check, and the
// reply the runner writes back for every dialog a tool opens.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CellVerdicts, MAX_FIXES_PER_CELL, VERDICT_REQUEST } from "../../app/cell-verdicts.ts";
import { TurnCalls } from "../../evals/calls.ts";
import { compileVerdict, dialogReply } from "../../evals/verdict.ts";

const js = (source: string) => ({ source, mode: "js" });

test("a cell that does not compile is answered failed, with the compiler's message", () => {
	const verdicts = new CellVerdicts();
	// A block with a return: the shape a model writes when it takes a cell for a function body.
	assert.deepEqual(compileVerdict(verdicts, "a", js("{ const a = 1; return a }")), {
		verdict: "failed",
		error: "'return' outside of function (1:15)",
		attempt: 1,
		limit: MAX_FIXES_PER_CELL,
	});
	// Declarations, then a bare JSX-like expression the parser cannot read.
	const second = compileVerdict(verdicts, "b", js("const rows = [1, 2];\n<div>{rows.length}</div>"));
	assert.equal(second?.verdict, "failed");
	assert.equal(second && "attempt" in second ? second.attempt : 0, 1, "each cell has its own count");
});

test("a cell that compiles gets no verdict, since nothing ran it", () => {
	const verdicts = new CellVerdicts();
	assert.equal(compileVerdict(verdicts, "a", js("1 + 1")), null);
	assert.equal(compileVerdict(verdicts, "a", js("htl.html`<b>hi</b>`;")), null);
	assert.equal(compileVerdict(verdicts, "a", js("const a = 1;\nconst b = a + 1;")), null);
	assert.equal(compileVerdict(verdicts, "a", { source: "# Title", mode: "md" }), null);
	assert.equal(compileVerdict(verdicts, "a", undefined), null, "a cell nobody wrote has nothing to check");
});

test("the third failed write of one cell is the give-up", () => {
	const verdicts = new CellVerdicts();
	const said = [1, 2, 3].map(() => compileVerdict(verdicts, "a", js("const = 1"))?.verdict);
	assert.deepEqual(said, ["failed", "failed", "give-up"]);
});

/** A verdict request for cell `id`, as pi's rpc mode emits it. */
const request = (id: string) => ({ type: "extension_ui_request", id: "req-1", method: "input", title: VERDICT_REQUEST, placeholder: JSON.stringify({ id }) });

test("a verdict request is answered from the latest source written under that id", () => {
	const calls = new TurnCalls();
	const verdicts = new CellVerdicts();
	const cellOf = (id: string) => calls.cell(id);
	// A fresh cell is addressed by the last six characters of its call's id.
	calls.hear({ type: "tool_execution_start", toolCallId: "call_0123abcdef", toolName: "cell", args: { source: "{ return 1 }" } });
	const failed = dialogReply(request("abcdef"), cellOf, verdicts);
	assert.equal(failed?.["id"], "req-1");
	assert.equal(JSON.parse(String(failed?.["value"])).verdict, "failed");
	// The fix redefines it by that id, and compiles: no verdict, answered at once.
	calls.hear({ type: "tool_execution_start", toolCallId: "call_9999zzzzzz", toolName: "cell", args: { id: "abcdef", source: "1" } });
	assert.deepEqual(dialogReply(request("abcdef"), cellOf, verdicts), { type: "extension_ui_response", id: "req-1", cancelled: true });
});

test("every other dialog is cancelled at once, and an event that asks nothing gets no reply", () => {
	const none = () => undefined;
	const verdicts = new CellVerdicts();
	const edit = { type: "extension_ui_request", id: "req-2", method: "input", title: "piary:canvas-edit", placeholder: "{}" };
	assert.deepEqual(dialogReply(edit, none, verdicts), { type: "extension_ui_response", id: "req-2", cancelled: true });
	assert.deepEqual(dialogReply(request("nobody"), none, verdicts), { type: "extension_ui_response", id: "req-1", cancelled: true });
	assert.equal(dialogReply({ type: "extension_ui_request", id: "req-3", method: "notify", message: "hi" }, none, verdicts), null);
	assert.equal(dialogReply({ type: "tool_execution_start", toolCallId: "x", toolName: "cell" }, none, verdicts), null);
});
