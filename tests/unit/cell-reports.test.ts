// The rule for telling pi a cell failed (`docs/notebook-cells.md` §Policy) —
// pure, so it runs straight from source: `node --test tests/unit/cell-reports.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { CellReports } from "../../app/cell-reports.ts";

test("a cell failure becomes a one-line cell report", () => {
	const reports = new CellReports();
	assert.equal(reports.report({ id: "bx", error: "boom", key: "bx|boom" }), "[cell report] #bx failed: boom");
});

test("an artifact that shows nothing becomes an artifact report", () => {
	const reports = new CellReports();
	assert.equal(
		reports.report({ id: "a1", error: "ran, but displays nothing", key: "@chart|blank", scope: "@chart" }),
		"[artifact report] @chart ran, but displays nothing",
	);
});

test("the same failure twice is reported once, keyed on the stable key, not the text", () => {
	const reports = new CellReports();
	assert.ok(reports.report({ id: "bx", error: "boom at 1:4", key: "bx" }));
	assert.equal(reports.report({ id: "bx", error: "boom at 1:5", key: "bx" }), null);
});

test("a failure with no key dedupes on id and error", () => {
	const reports = new CellReports();
	const detail = { id: "bx", error: "boom" } as { id: string; error: string; key: string };
	assert.ok(reports.report(detail));
	assert.equal(reports.report({ ...detail }), null);
	assert.ok(reports.report({ ...detail, error: "other" }), "a different error is a different report");
});

test("a fourth distinct failure in one run is not reported", () => {
	const reports = new CellReports();
	for (const id of ["a", "b", "c"]) assert.ok(reports.report({ id, error: "x", key: id }));
	assert.equal(reports.report({ id: "d", error: "x", key: "d" }), null);
});

test("reset gives a fresh budget and forgets what was reported", () => {
	const reports = new CellReports();
	for (const id of ["a", "b", "c"]) reports.report({ id, error: "x", key: id });
	reports.reset();
	assert.ok(reports.report({ id: "a", error: "x", key: "a" }), "reported again after the reset");
	assert.ok(reports.report({ id: "d", error: "x", key: "d" }));
});
