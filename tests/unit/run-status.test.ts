// The run badge: what a run is doing, derived from its events (ADR 0031).
// Imports the .ts directly; the clock is passed in.
import test from "node:test";
import assert from "node:assert/strict";
import { clock, RunStatus } from "../../app/run-status.ts";

const update = (type: string) => ({ type: "message_update", assistantMessageEvent: { type } });

test("a run reads thinking, writing, then the tool it runs, with its time and its max time beside it", () => {
	const status = new RunStatus();
	assert.equal(status.label(0), "");
	assert.equal(status.budgetLabel(), "");
	status.start(0, 3 * 60_000);
	assert.equal(status.label(12_000), "thinking · 12s");
	assert.equal(status.budgetLabel(), "max time: 3m");
	status.budget(60_000);
	assert.equal(status.budgetLabel(), "max time: 1m");
	status.event(update("text_delta"));
	assert.equal(status.label(72_000), "writing · 1m12s");
	status.event({ type: "tool_execution_start", toolName: "bash", args: {} });
	assert.match(status.label(80_000), /^running bash · /);
	status.event({ type: "tool_execution_end", toolName: "bash" });
	assert.match(status.label(81_000), /^thinking · /);
});

test("a cell's chip stays blue while the run works on it, failures it goes on to fix included", () => {
	const status = new RunStatus();
	status.start(0, 60_000);
	assert.equal(status.cell(), null);
	status.event({ type: "tool_execution_start", toolName: "cell", toolCallId: "toolu_abc123", args: {} });
	assert.match(status.label(1), /^working on a cell · /, "the badge names no cell; the chip does");
	assert.deepEqual(status.cell(), { id: "abc123", tone: "working", text: "writing" });
	status.checking("abc123");
	assert.deepEqual(status.cell(), { id: "abc123", tone: "working", text: "checking" });
	status.verdict("abc123", { verdict: "failed", error: "boom", attempt: 1, limit: 3 });
	assert.deepEqual(status.cell(), { id: "abc123", tone: "working", text: "failed (1/3)" });
	status.event({ type: "tool_execution_start", toolName: "cell", toolCallId: "toolu_zzz999", args: { id: "abc123" } });
	assert.deepEqual(status.cell(), { id: "abc123", tone: "working", text: "fixing (2/3)" });
	status.verdict("abc123", { verdict: "ok" });
	assert.deepEqual(status.cell(), { id: "abc123", tone: "working", text: "ran" }, "still the run's: not green yet");
	status.end(5, null);
	assert.deepEqual(status.cell(), { id: "abc123", tone: "done", text: "ran" }, "green once the run is over");
	status.start(10, 60_000);
	assert.equal(status.cell(), null, "a new run starts clean");
});

test("a cell whose last word was a failure ends red", () => {
	const status = new RunStatus();
	status.start(0, 60_000);
	status.event({ type: "tool_execution_start", toolName: "cell", toolCallId: "toolu_abc123", args: {} });
	status.verdict("abc123", { verdict: "give-up", error: "boom", attempt: 3, limit: 3 });
	assert.equal(status.cell()?.tone, "working");
	status.end(5, null);
	assert.deepEqual(status.cell(), { id: "abc123", tone: "error", text: "failed 3× — pi stopped" });
});

test("a cell that ran over a chart with no data ends amber, naming what is empty", () => {
	const status = new RunStatus();
	status.start(0, 60_000);
	status.event({ type: "tool_execution_start", toolName: "cell", toolCallId: "toolu_abc123", args: {} });
	status.verdict("abc123", { verdict: "empty", cell: "abc123", names: ["checked"], attempt: 1, limit: 3 });
	assert.deepEqual(status.cell(), { id: "abc123", tone: "working", text: "ran · no data: checked has no rows" });
	status.end(5, null);
	assert.deepEqual(status.cell(), { id: "abc123", tone: "warning", text: "ran · no data: checked has no rows" }, "never the green `ran`");
	status.start(10, 60_000);
	status.event({ type: "tool_execution_start", toolName: "cell", toolCallId: "toolu_zzz999", args: { id: "abc123" } });
	status.verdict("abc123", { verdict: "empty", cell: "abc123", names: [], attempt: 1, limit: 3 });
	status.event({ type: "tool_execution_start", toolName: "cell", toolCallId: "toolu_yyy888", args: { id: "abc123" } });
	assert.equal(status.cell()?.text, "fixing (2/3)");
	status.verdict("abc123", { verdict: "ok" });
	status.end(15, null);
	assert.deepEqual(status.cell(), { id: "abc123", tone: "done", text: "ran" }, "a rewrite that has data is green again");
});

test("a chart left with no data stays amber through later cells, until a check that covers it finds data", () => {
	const write = (status: RunStatus, id: string) => status.event({ type: "tool_execution_start", toolName: "cell", toolCallId: `toolu_${id}`, args: { id } });
	const empty = { verdict: "empty", cell: "chart", names: ["checked"], attempt: 1, limit: 3 } as const;
	const status = new RunStatus();
	status.start(0, 60_000);
	write(status, "chart");
	status.verdict("chart", { ...empty, names: ["checked"] });
	write(status, "table");
	status.verdict("table", { verdict: "ok" }, []);
	assert.deepEqual(status.cell(), { id: "table", tone: "working", text: "ran" }, "the chip follows the run while it runs");
	status.end(5, null);
	assert.deepEqual(status.cell(), { id: "chart", tone: "warning", text: "ran · no data: checked has no rows" }, "another cell running does not make the chart green");

	status.start(10, 60_000);
	write(status, "chart");
	status.verdict("chart", { ...empty, names: ["checked"] });
	write(status, "data");
	status.verdict("data", { verdict: "ok" }, ["chart"]);
	status.end(15, null);
	assert.deepEqual(status.cell(), { id: "data", tone: "done", text: "ran" }, "the data cell's rewrite was judged by the chart it feeds");
});

test("an ended run says done or stopped, and its clock stops", () => {
	const status = new RunStatus();
	status.start(0, 60_000);
	status.wrapping();
	assert.match(status.label(1_000), /^wrapping up: budget reached · /);
	status.end(42_000, null);
	assert.equal(status.label(99_000), "done · 42s");
	status.event(update("text_delta"));
	assert.equal(status.label(99_000), "done · 42s", "a late event does not reopen it");
	status.start(100_000, 60_000);
	status.end(101_000, "Stopped: limit");
	assert.equal(status.label(200_000), "stopped · 1s");
});

test("the badge counts what pi holds queued, and an ended run holds none", () => {
	const status = new RunStatus();
	status.start(0, 60_000);
	status.queued(0);
	assert.equal(status.label(5_000), "thinking · 5s");
	status.queued(1);
	assert.equal(status.label(5_000), "thinking · 5s · 1 queued");
	status.queued(2);
	assert.equal(status.label(5_000), "thinking · 5s · 2 queued");
	status.event({ type: "queue_update", steering: ["a"], followUp: [] });
	assert.equal(status.label(5_000), "thinking · 5s · 2 queued", "the count arrives through queued(), not read off the event");
	status.end(6_000, null);
	assert.equal(status.label(9_000), "done · 6s");
	status.start(10_000, 60_000);
	assert.equal(status.label(10_000), "thinking · 0s", "a new run starts with nothing queued");
});

test("durations read as seconds, minutes, or both", () => {
	assert.equal(clock(0), "0s");
	assert.equal(clock(59_400), "59s");
	assert.equal(clock(5 * 60_000), "5m");
	assert.equal(clock(72_000), "1m12s");
});
