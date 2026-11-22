// Which charts count as showing no data (`src/notebook/plot-empty.ts`), on
// Plot's own marks. Run `pnpm build` first.
import assert from "node:assert/strict";
import test from "node:test";
import * as Plot from "@observablehq/plot";
import { emptyPlotData } from "../../dist/notebook/plot-empty.js";

const ROWS = [
	{ lot: "B-1", purity: 99.4 },
	{ lot: "B-2", purity: 98.7 },
];
const dots = (data: unknown[]) => Plot.dot(data, { x: "lot", y: "purity" });

test("points over no rows beside a limit line is a chart with no data", () => {
	const checked: unknown[] = [];
	assert.deepEqual(emptyPlotData({ marks: [Plot.ruleY([99.0]), Plot.frame(), dots(checked)] }), [checked]);
	assert.equal(emptyPlotData({ marks: [Plot.ruleY([99.0]), dots(checked)] })?.[0], checked, "the empty value itself, to name it by");
});

test("an empty highlight over a chart with rows is an answer, not a fault", () => {
	const failing: unknown[] = [];
	assert.equal(emptyPlotData({ marks: [dots(ROWS), Plot.dot(failing, { x: "lot", y: "purity", stroke: "red" })] }), null);
});

test("a chart with rows, or with nothing but annotations, is not flagged", () => {
	assert.equal(emptyPlotData({ marks: [dots(ROWS)] }), null);
	assert.equal(emptyPlotData({ marks: [Plot.ruleY([99.0]), Plot.frame(), Plot.gridY(), Plot.axisX(), Plot.text(["limit"])] }), null);
	assert.equal(emptyPlotData({}), null);
});

test("axes, grids, tips and nested marks do not stand in for data", () => {
	const none: unknown[] = [];
	const marks = [Plot.axisX(), Plot.gridY(), [Plot.ruleY([0]), [Plot.barY(none, { x: "lot", y: "purity" }), Plot.tip(none, { x: "lot" })]], null, undefined];
	assert.deepEqual(emptyPlotData({ marks }), [none]);
});

test("a mark given no rows to count is taken as data", () => {
	assert.equal(emptyPlotData({ marks: [Plot.dot(new Set<unknown>(), { x: "lot", y: "purity" }), dots([])] }), null);
	assert.equal(emptyPlotData({ marks: [() => null, dots([])] })?.length, 1, "a function mark draws what it likes: not counted either way");
});
