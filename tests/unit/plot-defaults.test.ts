// The defaults a cell's `Plot.plot` takes (`src/notebook/plot-defaults.ts`),
// before any DOM: which scales they touch, and that whatever the cell set
// itself is left as written. Run `pnpm build` first.
import assert from "node:assert/strict";
import test from "node:test";
import * as Plot from "@observablehq/plot";
import { plotOptions } from "../../dist/notebook/plot-defaults.js";

/** A Plot mark as Plot's own `Mark#initialize` answers it: data in, one value array per channel. */
function mark(channels: Record<string, { value: unknown[]; scale?: string }>, sort: object | null = null) {
	return { sort, initialize: () => ({ channels }) };
}

/** A mark with `value` on y and its index on x. */
const ys = (value: unknown[]) => mark({ x: { value: value.map((_, i) => i), scale: "x" }, y: { value, scale: "y" } });

const PALETTE = ["c1", "c2", "c3"];
const series = { value: ["v1", "v2", "v1", "simd"], scale: "color" };

test("a chart keeps its categories in the order the data gives them", () => {
	const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
	const options = plotOptions({ marks: [mark({ x: { value: days, scale: "x" }, y: { value: [1, 2, 3, 4, 5], scale: "y" } })] }, []);
	assert.deepEqual(options.x, { domain: days });
	assert.equal(options.y, undefined); // numbers keep Plot's own linear scale
});

test("a chart's own domain or sort wins over data order", () => {
	const x = { value: ["b", "a"], scale: "x" };
	assert.deepEqual(plotOptions({ x: { domain: ["a", "b"] }, marks: [mark({ x })] }, []).x, { domain: ["a", "b"] });
	assert.deepEqual(plotOptions({ x: { type: "point" }, marks: [mark({ x })] }, []).x, { type: "point", domain: ["b", "a"] });
	assert.equal(plotOptions({ marks: [mark({ x }, { x: "-y" })] }, []).x, undefined);
	// Dates written as strings are a time axis to Plot, not categories.
	assert.equal(plotOptions({ marks: [mark({ x: { value: ["2026-01-01", "2026-02-01"], scale: "x" } })] }, []).x, undefined);
});

test("series take the chart palette in data order", () => {
	assert.deepEqual(plotOptions({ marks: [mark({ fill: series })] }, PALETTE).color, {
		domain: ["v1", "v2", "simd"],
		range: PALETTE,
	});
	// A numeric colour channel stays a continuous scale: a categorical range would make it ordinal.
	assert.equal(plotOptions({ marks: [mark({ fill: { value: [1, 2], scale: "color" } })] }, PALETTE).color, undefined);
});

test("a chart that gives its own colour domain keeps its order and still takes the palette", () => {
	const domain = ["simd", "v2", "v1"];
	assert.deepEqual(plotOptions({ color: { domain, legend: true }, marks: [mark({ fill: series })] }, PALETTE).color, {
		domain,
		legend: true,
		range: PALETTE,
	});
	// Sorted by a mark, the order is Plot's to work out and the colours are still Piary's.
	assert.deepEqual(plotOptions({ marks: [mark({ fill: series }, { color: "-y" })] }, PALETTE).color, { range: PALETTE });
});

test("a chart that names its own colours keeps its colour scale as written, order included", () => {
	// Plot pairs a range with its own sorted domain by position: data order here would swap the colours.
	const own = (color: object) => plotOptions({ color, marks: [mark({ fill: series })] }, PALETTE).color;
	assert.deepEqual(own({ range: ["red", "green", "blue"] }), { range: ["red", "green", "blue"] });
	assert.deepEqual(own({ scheme: "reds" }), { scheme: "reds" });
	assert.deepEqual(own({ domain: ["v1"], range: ["red"] }), { domain: ["v1"], range: ["red"] });
});

test("more series than the palette holds keep Plot's own colours, so no two share one", () => {
	const fill = { value: ["a", "b", "c", "d"], scale: "color" };
	assert.deepEqual(plotOptions({ marks: [mark({ fill })] }, PALETTE).color, { domain: ["a", "b", "c", "d"] });
});

test("a chart's left margin fits its widest y tick label, numeric or categorical", () => {
	const wide = plotOptions({ marks: [ys([0, 70_000, 140_000])] }, []).marginLeft as number;
	// Plot's default 40 px holds four digits; "140,000" needs more.
	assert.ok(wide > 50, `marginLeft ${wide}`);
	assert.equal(plotOptions({ marks: [ys([1, 96])] }, []).marginLeft, undefined);
	assert.ok((plotOptions({ marks: [ys(["v1", "simdjson-port"])] }, []).marginLeft as number) > 70);
	// A y axis on the right, or none, needs no left margin.
	assert.equal(plotOptions({ y: { axis: "right" }, marks: [ys([0, 140_000])] }, []).marginLeft, undefined);
	// The chart's own tick format is what the margin is measured on.
	assert.ok((plotOptions({ y: { tickFormat: (v: number) => `${v} thousand` }, marks: [ys([0, 9])] }, []).marginLeft as number) > 50);
});

test("a chart's own margin wins", () => {
	assert.equal(plotOptions({ marginLeft: 30, marks: [ys([0, 140_000])] }, []).marginLeft, 30);
	assert.equal(plotOptions({ margin: 20, marks: [ys([0, 140_000])] }, []).marginLeft, undefined);
});

test("a chart's facets keep the order the data gives them, mark-level or top-level", () => {
	const rows = [{ size: "1 KB" }, { size: "100 KB" }, { size: "10 MB" }];
	const faceted = Object.assign(mark({ x: { value: ["v1", "v1", "v1"], scale: "x" } }), { data: rows, fx: "size" });
	assert.deepEqual(plotOptions({ marks: [faceted] }, []).fx, { domain: ["1 KB", "100 KB", "10 MB"] });
	const top = plotOptions({ facet: { data: rows, y: (d: { size: string }) => d.size }, marks: [mark({})] }, []);
	assert.deepEqual(top.fy, { domain: ["1 KB", "100 KB", "10 MB"] });
});

test("category labels too wide for their band are turned, so they do not run into each other", () => {
	const names = ["v1", "v2", "simdjson-port", "serde-wasm"];
	const bars = (fx: boolean) =>
		Object.assign(
			mark({ x: { value: names, scale: "x" }, y: { value: [1, 2, 3, 4], scale: "y" } }),
			fx ? { data: [{ s: "a" }, { s: "b" }, { s: "c" }], fx: "s" } : {},
		);
	const crowded = plotOptions({ marks: [bars(true)] }, [], 700);
	assert.equal((crowded.x as { tickRotate?: number }).tickRotate, -30);
	assert.ok((crowded.marginBottom as number) > 30);
	// Four bands across the whole width hold the same names flat.
	assert.equal((plotOptions({ marks: [bars(false)] }, [], 700).x as { tickRotate?: number }).tickRotate, undefined);
});

test("a chart fills the width it is given, and a numeric y axis is drawn shorter than Plot's 400 px", () => {
	const filled = plotOptions({ marks: [ys([1, 2])] }, [], 700);
	assert.equal(filled.width, 700);
	assert.ok((filled.height as number) >= 200 && (filled.height as number) <= 320, `height ${filled.height}`);
	// Categories on y size the chart by their count (Plot's own rule).
	assert.equal(plotOptions({ marks: [ys(["a", "b"])] }, [], 700).height, undefined);
});

test("a chart's own width and height win", () => {
	const own = plotOptions({ height: 500, width: 300, marks: [ys([1, 2])] }, [], 700);
	assert.deepEqual([own.width, own.height], [300, 500]);
});

// The marks above are stand-ins. These are Plot's own, so the reading of a
// mark's channels is held to the library a cell draws with.
test("Plot's own marks: a grouped bar's groups, a series' colours, and a colour written as a literal", () => {
	const rows = [
		{ day: "Mon", n: 3, team: "b" },
		{ day: "Tue", n: 1, team: "a" },
		{ day: "Fri", n: 2, team: "b" },
	];
	const bars = plotOptions({ marks: [Plot.barY(rows, { x: "day", y: "n", fill: "team" })] }, PALETTE);
	assert.deepEqual(bars.x, { domain: ["Mon", "Tue", "Fri"] });
	assert.deepEqual(bars.color, { domain: ["b", "a"], range: PALETTE });
	const grouped = plotOptions({ marks: [Plot.barY(rows, Plot.groupX({ y: "count" }, { x: "team" }))] }, PALETTE);
	assert.deepEqual(grouped.x, { domain: ["b", "a"] });
	// Bars the cell sorts by value are Plot's to order.
	assert.equal(plotOptions({ marks: [Plot.barY(rows, { x: "day", y: "n", sort: { x: "-y" } })] }, PALETTE).x, undefined);
	// `fill: "red"`, or a colour per row, is no scale: Plot draws it as written.
	const literal = plotOptions({ marks: [Plot.dot(rows, { x: "n", y: "n", fill: (d: { team: string }) => (d.team === "a" ? "red" : "#00f") })] }, PALETTE);
	assert.equal(literal.color, undefined);
});

test("Plot's own marks: a bar or a cell per number down the side keeps the height Plot gives its bands", () => {
	const rows = Array.from({ length: 35 }, (_, i) => ({ rank: i + 1, v: (i * 7) % 13, day: `d${i % 5}` }));
	assert.equal(plotOptions({ marks: [Plot.barX(rows, { y: "rank", x: "v" })] }, PALETTE, 700).height, undefined);
	assert.equal(plotOptions({ marks: [Plot.cell(rows, { x: "day", y: "rank", fill: "v" })] }, PALETTE, 700).height, undefined);
	assert.equal(plotOptions({ y: { type: "band" }, marks: [ys([1, 2, 3])] }, PALETTE, 700).height, undefined);
	// The same numbers as positions on a line are a chart read at a glance.
	assert.equal(plotOptions({ marks: [Plot.dot(rows, { x: "v", y: "rank" })] }, PALETTE, 700).height, 280);
});
