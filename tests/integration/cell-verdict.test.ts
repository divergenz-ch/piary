// How a cell the turn wrote ran — the verdict the `cell` tool hands the agent
// (`docs/notebook-cells.md` §Policy). The real <document-chat> under jsdom, the
// real engine. `pnpm build` first, then
// `node --test tests/integration/cell-verdict.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { mount, settle, unmount } from "../helpers/editor.ts";
import { emptyDocument } from "../../dist/document/format.js";
import type { DocumentChat } from "../../dist/components/DocumentChat.js";

/** Long enough for the engine to load and run a cell, short against a test's
 *  patience: the verdict's own quiet period is 400 ms. */
const BOUND_MS = 5_000;

const assistant = (content: AssistantMessage["content"]): AssistantMessage => ({
	role: "assistant",
	content,
	api: "",
	provider: "",
	model: "",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
	timestamp: 0,
});

/** A turn writes `cells` as tool calls and finalizes the message, the way pi's
 *  `message_end` arrives before the tools run. */
async function written(cells: { id: string; source: string }[]): Promise<DocumentChat> {
	const { el } = await mount(emptyDocument("x"));
	el.streaming = true;
	await settle();
	el.beginTurn();
	const message = assistant(
		cells.map(({ id, source }) => ({ type: "toolCall" as const, id: `toolu_${id}`, name: "cell", arguments: { source, id } })),
	);
	el.applyAssistantPartial(message);
	el.finalizeAssistant(message);
	return el;
}

test("a cell that throws is failed, with the runtime's message", async () => {
	const el = await written([{ id: "pie", source: "({}).arc([1, 2])" }]);
	const verdict = await el.cellVerdict("pie", BOUND_MS);
	assert.equal(verdict.verdict, "failed");
	assert.match((verdict as { error: string }).error, /arc/);
	unmount(el);
});

test("a cell that does not compile is failed, with the compiler's message", async () => {
	const el = await written([{ id: "jsx", source: "const W = () => <div>hi</div>;" }]);
	const verdict = await el.cellVerdict("jsx", BOUND_MS);
	assert.equal(verdict.verdict, "failed");
	unmount(el);
});

test("a cell that runs clean is ok", async () => {
	const el = await written([{ id: "two", source: "1 + 1" }]);
	assert.deepEqual(await el.cellVerdict("two", BOUND_MS), { verdict: "ok" });
	unmount(el);
});

test("a reference to a name no cell declares yet is waiting, not failed", async () => {
	const el = await written([{ id: "use", source: "pieData.length" }]);
	assert.deepEqual(await el.cellVerdict("use", BOUND_MS), { verdict: "waiting", name: "pieData" });
	unmount(el);
});

test("the verdict is on the cell's current definition, not the one it replaced", async () => {
	const el = await written([{ id: "fix", source: "({}).arc([1, 2])" }]);
	assert.equal((await el.cellVerdict("fix", BOUND_MS)).verdict, "failed");
	el.streaming = true;
	el.beginTurn();
	const again = assistant([{ type: "toolCall", id: "toolu_fix2", name: "cell", arguments: { source: "2 + 2", id: "fix" } }]);
	el.applyAssistantPartial(again);
	el.finalizeAssistant(again);
	assert.deepEqual(await el.cellVerdict("fix", BOUND_MS), { verdict: "ok" });
	unmount(el);
});

test("a cell redefined with no mode named keeps the mode it has", async () => {
	const { el } = await mount(emptyDocument("x"));
	el.streaming = true;
	await settle();
	el.beginTurn();
	const first = assistant([{ type: "toolCall", id: "toolu_q1", name: "cell", arguments: { source: "quarter = 3", mode: "ojs", id: "quarter" } }]);
	el.applyAssistantPartial(first);
	el.finalizeAssistant(first);
	assert.deepEqual(await el.cellVerdict("quarter", BOUND_MS), { verdict: "ok" });
	// `quarter = 4` is a cell in ojs and an assignment to nothing in js.
	const again = assistant([{ type: "toolCall", id: "toolu_q2", name: "cell", arguments: { source: "quarter = 4", id: "quarter" } }]);
	el.applyAssistantPartial(again);
	el.finalizeAssistant(again);
	assert.deepEqual(await el.cellVerdict("quarter", BOUND_MS), { verdict: "ok" });
	assert.deepEqual(
		[...el.getDocument().matchAll(/<!-- pi:cell (\S+) #quarter -->/g)].map((m) => m[1]),
		["ojs", "ojs"],
		"both definitions are written as ojs",
	);
	unmount(el);
});

test("a cell that never settles within the bound is running", async () => {
	const el = await written([{ id: "slow", source: "new Promise(() => {})" }]);
	assert.deepEqual(await el.cellVerdict("slow", 800), { verdict: "running" });
	unmount(el);
});

const LIMIT = "Plot.ruleY([99.0])";
const chartOf = (data: string) => `Plot.plot({marks: [${LIMIT}, Plot.dot(${data}, {x: "lot", y: "purity"})]})`;
const LOTS = '[{lot: "B-1", date: new Date("2026-08-03"), purity: 99.4}, {lot: "B-2", date: new Date("2026-09-01"), purity: 98.7}]';

test("a chart drawn from no rows is empty, naming the value that has none", async () => {
	// A date compared with a string keeps nothing: the cell runs, and its chart
	// shows the limit line alone.
	const el = await written([{ id: "qc", source: `const rows = ${LOTS};\nconst inScope = rows.filter((r) => r.date >= "2026-08-01");\ndisplay(${chartOf("inScope")});` }]);
	assert.deepEqual(await el.cellVerdict("qc", BOUND_MS), { verdict: "empty", cell: "qc", names: ["inScope"] });
	unmount(el);
});

test("a chart with rows is ok, an empty highlight over it included", async () => {
	const source = `const rows = ${LOTS};\nconst failing = rows.filter((r) => r.purity < 90);\ndisplay(Plot.plot({marks: [${LIMIT}, Plot.dot(rows, {x: "lot", y: "purity"}), Plot.dot(failing, {x: "lot", y: "purity", stroke: "red"})]}));`;
	const el = await written([{ id: "qc", source }]);
	assert.deepEqual(await el.cellVerdict("qc", BOUND_MS), { verdict: "ok" });
	unmount(el);
});

test("an empty value nothing charts is ok: no lot failing is an answer", async () => {
	const el = await written([{ id: "qc", source: `const failing = ${LOTS}.filter((r) => r.purity < 90);\ndisplay(failing.length);` }]);
	assert.deepEqual(await el.cellVerdict("qc", BOUND_MS), { verdict: "ok" });
	unmount(el);
});

test("the cell that computes the data answers for the chart another cell draws from it", async () => {
	const data = (after: string) => `const rows = ${LOTS};\nconst inScope = rows.filter((r) => r.date >= ${after});`;
	const el = await written([
		{ id: "data", source: data('"2026-08-01"') },
		{ id: "chart", source: chartOf("inScope") },
	]);
	assert.deepEqual(await el.cellVerdict("chart", BOUND_MS), { verdict: "empty", cell: "chart", names: ["inScope"] });
	assert.deepEqual(await el.cellVerdict("data", BOUND_MS), { verdict: "empty", cell: "chart", names: ["inScope"] }, "the fix belongs in #data, so its verdict says so");
	// The fix: the data cell is redefined, and the chart it feeds has rows.
	el.streaming = true;
	el.beginTurn();
	const fixed = assistant([{ type: "toolCall", id: "toolu_data2", name: "cell", arguments: { source: data('new Date("2026-08-01")'), id: "data" } }]);
	el.applyAssistantPartial(fixed);
	el.finalizeAssistant(fixed);
	assert.deepEqual(await el.cellVerdict("data", BOUND_MS), { verdict: "ok" });
	unmount(el);
});
