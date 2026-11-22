// The claude harness's pure half: the tool protocol the host speaks, what is
// said to `claude -p` and what is read back from it, and the page stand-in
// both harnesses share.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EDIT_REQUEST } from "../../app/canvas-edits.ts";
import { VERDICT_REQUEST } from "../../app/cell-verdicts.ts";
import { type McpTool, answer } from "../../evals/claude/mcp.ts";
import { claudeEffort, claudeModel, claudePrompt, mcpName, misrun, piName, readStream, settingsEffort, withHistory } from "../../evals/claude/wire.ts";
import { Page } from "../../evals/page.ts";
import { answerProse, answerText, refusalOf } from "../../evals/place.ts";

const TOOLS: McpTool[] = [{ name: "cell", description: "write a cell", inputSchema: { type: "object" } }];
const ok = async () => ({ content: [{ type: "text", text: "ok" }], isError: false });

test("the host lists pi's tools and answers the handshake, and a notification gets no reply", async () => {
	assert.deepEqual(await answer({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, "pi", TOOLS, ok), {
		jsonrpc: "2.0",
		id: 1,
		result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "pi", version: "0" } },
	});
	assert.deepEqual(await answer({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "pi", TOOLS, ok), { jsonrpc: "2.0", id: 2, result: { tools: TOOLS } });
	assert.equal(await answer({ jsonrpc: "2.0", method: "notifications/initialized" }, "pi", TOOLS, ok), null);
	const unknown = await answer({ jsonrpc: "2.0", id: 3, method: "resources/list" }, "pi", TOOLS, ok);
	assert.equal((unknown?.["error"] as { code: number }).code, -32601);
});

test("a call reaches the tool with the model's own call id, and an unknown tool is refused", async () => {
	const heard: unknown[] = [];
	const call = async (name: string, args: Record<string, unknown>, id: string | undefined) => {
		heard.push([name, args, id]);
		return { content: [{ type: "text", text: "ok — cell #abc123" }], isError: false };
	};
	const reply = await answer({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "cell", arguments: { source: "1 + 1" }, _meta: { "claudecode/toolUseId": "toolu_01abc123" } } }, "pi", TOOLS, call);
	assert.deepEqual(heard, [["cell", { source: "1 + 1" }, "toolu_01abc123"]]);
	assert.deepEqual(reply?.["result"], { content: [{ type: "text", text: "ok — cell #abc123" }], isError: false });
	const missing = await answer({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "edit", arguments: {} } }, "pi", TOOLS, call);
	assert.equal((missing?.["error"] as { message: string }).message, "no tool named edit");
	assert.equal(heard.length, 1, "the refused call ran nothing");
});

test("a tool's name goes out as Claude Code lists it and comes back as pi's", () => {
	assert.equal(mcpName("canvas_edit"), "mcp__pi__canvas_edit");
	assert.equal(piName("mcp__pi__canvas_edit"), "canvas_edit");
	assert.equal(piName("Bash"), "Bash", "a tool that is not pi's keeps its name, so a check sees it was called");
});

test("only an anthropic model runs, and only an effort claude takes", () => {
	assert.equal(claudeModel("anthropic/claude-sonnet-5-5"), "claude-sonnet-5-5");
	assert.throws(() => claudeModel("openai-codex/gpt-5.6-luna"), /runs anthropic\/… models only/);
	assert.equal(claudeEffort(undefined), undefined);
	assert.equal(claudeEffort("high"), "high");
	assert.throws(() => claudeEffort("off"), /takes --thinking low, medium, high, xhigh, max/);
});

test("a run that names no effort takes the pi settings', or the lowest claude has when pi's is lower", () => {
	assert.equal(settingsEffort("high"), "high");
	assert.equal(settingsEffort("off"), "low");
	assert.equal(settingsEffort(undefined), "low");
});

test("the prompt is pi's, then how its tools are listed, then any description Claude Code would cut", () => {
	const guide = "Draw an answer. ".repeat(200);
	const tools = [
		{ name: "view", description: guide },
		{ name: "cell", description: "Write a cell." },
	];
	const names = "In this session each tool named above is listed with the prefix `mcp__pi__`: `view`, `cell`. Wherever a tool is named without it, that tool is meant.";
	const prompt = claudePrompt("You are pi.\n", tools);
	assert.ok(prompt.startsWith(`You are pi.\n\n${names}\n`));
	assert.ok(prompt.includes(`<tool_description name="mcp__pi__view">\n${guide}\n</tool_description>`));
	assert.ok(!prompt.includes("Write a cell."), "a description the tool list shows whole is not said twice");
	assert.equal(claudePrompt("You are pi.\n", [{ name: "cell", description: "Write a cell." }]), "You are pi.\n\nIn this session each tool named above is listed with the prefix `mcp__pi__`: `cell`. Wherever a tool is named without it, that tool is meant.\n");
});

// A run as `claude -p --output-format stream-json --verbose` prints it: one
// content block per assistant event, a tool's result as a user message.
const line = (event: unknown) => JSON.stringify(event);
const INIT = line({ type: "system", subtype: "init", tools: ["mcp__pi__cell"], apiKeySource: "none" });
const LIMIT = { type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType: "five_hour", isUsingOverage: false } };
const RUN = [
	"Warning: this sign-in ends soon.",
	INIT,
	line({ type: "assistant", message: { id: "msg_1", model: "claude-sonnet-5-5", content: [{ type: "thinking", thinking: "" }] } }),
	line({ type: "assistant", message: { id: "msg_1", model: "claude-sonnet-5-5", content: [{ type: "text", text: "Here is the cell." }] } }),
	line({ type: "assistant", message: { id: "msg_1", model: "claude-sonnet-5-5", content: [{ type: "tool_use", id: "toolu_01abc123", name: "mcp__pi__cell", input: { source: "1 + 1" } }] } }),
	line(LIMIT),
	line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_01abc123", content: [{ type: "text", text: "ok — cell #abc123" }] }] } }),
	line({ type: "assistant", message: { id: "msg_2", model: "claude-sonnet-5-5", content: [{ type: "text", text: "It adds one and one." }] } }),
	line({ type: "result", subtype: "success", is_error: false, result: "It adds one and one." }),
];

test("a run reads back as a pi turn: the answer places and the checks see pi's tool names", () => {
	const turn = readStream(RUN);
	assert.deepEqual(turn.toolCalls, [{ name: "cell", args: { source: "1 + 1" }, failed: false }]);
	assert.deepEqual(
		turn.messages.map((m) => (m as { role: string }).role),
		["assistant", "toolResult", "assistant"],
	);
	assert.equal(answerProse(turn.messages), "Here is the cell.\n\nIt adds one and one.");
	const placed = answerText(turn.messages);
	assert.match(placed, /<!-- pi:cell js #abc123 -->/, "the cell is written under the id its tool said");
	assert.ok(!placed.includes("pi:result"), "a cell's result writes nothing, as in a pi turn");
	assert.equal(refusalOf(turn.messages), null);
	assert.equal(misrun(turn, ["cell"]), null);
});

test("a failed call is marked failed, and its result reads as an error", () => {
	const failed = RUN.map((l) => (l.includes("tool_result") ? line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_01abc123", content: "cell #abc123 failed", is_error: true }] } }) : l));
	const turn = readStream(failed);
	assert.equal(turn.toolCalls[0].failed, true);
	assert.deepEqual((turn.messages[1] as unknown as { isError: boolean; content: unknown }).content, [{ type: "text", text: "cell #abc123 failed" }]);
});

test("a run that did not go as the harness means it to is told apart from an answer", () => {
	const overage = RUN.map((l) => (l === line(LIMIT) ? line({ type: "rate_limit_event", rate_limit_info: { status: "allowed", isUsingOverage: true } }) : l));
	assert.deepEqual(misrun(readStream(overage), ["cell"]), { refused: "the request was charged to extra usage, not the plan's limits" });
	const spent = [INIT, line({ type: "rate_limit_event", rate_limit_info: { status: "rejected", rateLimitType: "five_hour" } }), line({ type: "result", subtype: "success", is_error: true, result: "Limit reached" })];
	assert.deepEqual(misrun(readStream(spent), ["cell"]), { refused: "Limit reached" });
	assert.deepEqual(misrun(readStream(RUN.map((l) => (l === INIT ? line({ type: "system", subtype: "init", tools: ["mcp__pi__cell"], apiKeySource: "ANTHROPIC_API_KEY" }) : l))), ["cell"]), {
		error: 'claude ran on a credential from "ANTHROPIC_API_KEY", not the account it is signed in to',
	});
	assert.deepEqual(misrun(readStream(RUN.map((l) => (l === INIT ? line({ type: "system", subtype: "init", tools: ["Bash", "mcp__pi__cell"], apiKeySource: "none" }) : l))), ["cell"]), {
		error: "claude offered the model Bash, mcp__pi__cell, not mcp__pi__cell",
	});
	assert.deepEqual(misrun(readStream(RUN.slice(0, 4)), ["cell"]), { error: "claude ended without a result" });
	assert.deepEqual(misrun(readStream([INIT, line({ type: "result", subtype: "error_max_turns", is_error: true })]), ["cell"]), { error: "claude stopped: error_max_turns" });
});

const ask = (title: string, payload: unknown) => ({ type: "extension_ui_request", id: "ask-1", method: "input", title, placeholder: JSON.stringify(payload) });

test("the page answers a cell that does not compile as failed, and says nothing of one that does", () => {
	const page = new Page("<!-- you -->\n\nHi\n", false, 0);
	page.hear({ type: "tool_execution_start", toolName: "cell", toolCallId: "toolu_01abc123", args: { source: "const a = 1; return a" } });
	const reply = page.hear(ask(VERDICT_REQUEST, { id: "abc123" }));
	assert.equal((JSON.parse(String(reply?.["value"])) as { verdict: string }).verdict, "failed");
	page.hear({ type: "tool_execution_start", toolName: "cell", toolCallId: "toolu_01def456", args: { source: "1 + 1" } });
	assert.deepEqual(page.hear(ask(VERDICT_REQUEST, { id: "def456" })), { type: "extension_ui_response", id: "ask-1", cancelled: true });
});

test("the page applies an edit only when the run accepts edits, each planned against the last", () => {
	const md = "<!-- you -->\n\nThe quick fox\n";
	const edit = ask(EDIT_REQUEST, { oldText: "quick", newText: "slow" });
	assert.deepEqual(new Page(md, false, md.length).hear(edit), { type: "extension_ui_response", id: "ask-1", cancelled: true });
	const page = new Page(md, true, md.length);
	assert.equal(page.hear(edit)?.["value"], JSON.stringify({ ok: true }));
	assert.match(String(page.hear(edit)?.["value"]), /error/, "the quote is gone once the first edit is applied");
});

test("the page knows which prompt is being answered, as the app's does: an answer written into it is refused", () => {
	const md = "<!-- you -->\n\nFirst\n\n<!-- pi -->\n\nOne\n\n<!-- you -->\n\nName a fox\n";
	const page = new Page(md, true, md.length);
	// An edit above the prompt moves it, and it is still the one being answered.
	assert.equal(page.hear(ask(EDIT_REQUEST, { oldText: "First", newText: "The very first" }))?.["value"], JSON.stringify({ ok: true }));
	assert.match(String(page.hear(ask(EDIT_REQUEST, { oldText: "Name a fox", newText: "Name a fox\n\nReynard" }))?.["value"]), /prompt you are answering/);
	assert.equal(page.hear(ask(EDIT_REQUEST, { oldText: "The very first", newText: "The very first\n\nAnd more" }))?.["value"], JSON.stringify({ ok: true }));
});
