// What the page answers the `cell` tool (`docs/notebook-cells.md` §Policy).
// Imports the .ts directly.
import test from "node:test";
import assert from "node:assert/strict";
import { CellVerdicts, MAX_FIXES_PER_CELL, noData, requestedCell, VERDICT_REQUEST } from "../../app/cell-verdicts.ts";

test("a cell failing again and again is told to stop at the limit", () => {
	const verdicts = new CellVerdicts();
	const said = Array.from({ length: MAX_FIXES_PER_CELL }, () => verdicts.answer("pie", { verdict: "failed", error: "boom" }).verdict);
	assert.deepEqual(said, [...Array(MAX_FIXES_PER_CELL - 1).fill("failed"), "give-up"]);
	assert.deepEqual(verdicts.answer("other", { verdict: "failed", error: "boom" }), { verdict: "failed", error: "boom", attempt: 1, limit: MAX_FIXES_PER_CELL });
});

test("a fresh prompt gives every cell its whole allowance again", () => {
	const verdicts = new CellVerdicts();
	for (let i = 0; i < MAX_FIXES_PER_CELL; i++) verdicts.answer("pie", { verdict: "failed", error: "boom" });
	verdicts.reset();
	assert.equal(verdicts.answer("pie", { verdict: "failed", error: "boom" }).verdict, "failed");
});

test("anything but a failure passes through unchanged", () => {
	const verdicts = new CellVerdicts();
	assert.deepEqual(verdicts.answer("a", { verdict: "ok" }), { verdict: "ok" });
	assert.deepEqual(verdicts.answer("a", { verdict: "waiting", name: "x" }), { verdict: "waiting", name: "x" });
});

test("only the cell tool's own question is a verdict request", () => {
	const asked = { type: "extension_ui_request", id: "q1", method: "input", title: VERDICT_REQUEST, placeholder: '{"id":"pie"}' };
	assert.deepEqual(requestedCell(asked), { requestId: "q1", cellId: "pie" });
	assert.equal(requestedCell({ ...asked, title: "Your name?" }), null);
	assert.equal(requestedCell({ ...asked, method: "select" }), null);
	assert.equal(requestedCell({ ...asked, placeholder: "not json" }), null);
});

test("a write that left a chart with no data counts against the cell, and the last is told to stop", () => {
	const verdicts = new CellVerdicts();
	const empty = { verdict: "empty" as const, cell: "chart", names: ["checked"] };
	assert.deepEqual(verdicts.answer("data", empty), { ...empty, attempt: 1, limit: MAX_FIXES_PER_CELL });
	for (let i = 2; i < MAX_FIXES_PER_CELL; i++) assert.equal(verdicts.answer("data", empty).verdict, "empty");
	const last = verdicts.answer("data", empty);
	assert.equal(last.verdict, "give-up");
	assert.match((last as { error: string }).error, /cell #chart shows no data \(checked has no rows\)/);
});

test("a chart with no data is worded by the names it was drawn from", () => {
	assert.equal(noData(["checked"]), "checked has no rows");
	assert.equal(noData(["inScope", "checked"]), "inScope, checked have no rows");
	assert.equal(noData([]), "the chart has no data");
});
