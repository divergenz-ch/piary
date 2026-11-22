// What Piary's A2UI components show, before any DOM: a stat tile's figure and
// delta, a table's cells, a decision matrix's verdicts and a chart's Plot
// options. The elements only draw these (src/components/views/a2ui-*.ts), so
// the reading of the data — data order, the good direction, the margins a
// six-digit tick needs — is held here. Run `pnpm build` first.
import assert from "node:assert/strict";
import test from "node:test";
import { chartPlan, compareModel, formatFigure, statModel, tableModel, THEME_RAMP } from "../../dist/document/a2ui-figures.js";

const n = (value: number, digits = 2) => value.toLocaleString(undefined, { maximumFractionDigits: digits });

test("a currency unit goes before the number, any other unit after it", () => {
	assert.equal(formatFigure(480000, "$"), `$${n(480000)}`);
	assert.equal(formatFigure(26, "€"), "€26");
	assert.equal(formatFigure(-1200, "$"), `−$${n(1200)}`, "the sign leads the currency");
	assert.equal(formatFigure(91, "%"), "91%");
	assert.equal(formatFigure(2.4, "h"), "2.4 h");
	assert.equal(formatFigure(0.03), "0.03");
	assert.equal(formatFigure("n/a", "$"), "n/a", "a string is shown as written");
	assert.equal(formatFigure(102, "$k"), "$102k", "a currency in thousands reads as one figure");
	assert.equal(formatFigure(-1.5, "€M"), "−€1.5M");
	assert.equal(formatFigure(90, " days"), `90\u00a0days`, "a unit written with its own space gets one space");
});

test("a stat's delta is signed and arrowed, and coloured by whether its direction is good", () => {
	assert.deepEqual(statModel({ label: "Opened", value: 412, delta: 32, good: "down" }), {
		label: "Opened",
		value: "412",
		delta: "▲ +32",
		tone: "destructive",
		note: "",
	});
	assert.equal(statModel({ label: "First reply", value: 2.4, unit: "h", delta: -0.7, good: "down" }).tone, "success");
	assert.equal(statModel({ label: "First reply", value: 2.4, unit: "h", delta: -0.7 }).delta, "▼ −0.7 h");
	assert.equal(statModel({ label: "CSAT", value: 91, unit: "%", delta: "+3 pts", good: "up" }).tone, "success", "a written delta's sign counts");
	assert.equal(statModel({ label: "x", value: 1, delta: 4 }).tone, "muted", "no good direction, no verdict");
	assert.equal(statModel({ label: "x", value: 1, delta: 0, good: "up" }).delta, "0");
	assert.equal(statModel({ label: "Cash", value: 480000, unit: "$", note: "in the bank" }).value, `$${n(480000)}`);
	assert.equal(statModel({ label: "x", value: Number.NaN }).value, "—", "a value that did not compute shows as missing");
});

test("a table reads rows of objects or of arrays, and puts numbers at the end in a column of numbers", () => {
	const model = tableModel([{ key: "size" }, { key: "v1", label: "v1 (ms)" }], [
		{ size: "1 KB", v1: 0.08 },
		{ size: "10 MB", v1: 910 },
	]);
	assert.deepEqual(model.head, [
		{ label: "size", align: "start" },
		{ label: "v1 (ms)", align: "end" },
	]);
	assert.deepEqual(model.body, [
		[{ text: "1 KB", align: "start" }, { text: "0.08", align: "end" }],
		[{ text: "10 MB", align: "start" }, { text: "910", align: "end" }],
	]);
	assert.deepEqual(tableModel(undefined, [{ a: 1, b: true }]).head.map((h) => h.label), ["a", "b"], "the columns default to the first row's keys");
	assert.deepEqual(tableModel(["Plan", "Seats"], [["Team", 12]]).body[0]!.map((c) => c.text), ["Team", "12"]);
	assert.equal(tableModel([{ key: "b" }], [{ b: true }]).body[0]![0]!.text, "Yes");
	assert.equal(tableModel([{ key: "p", unit: "$" }], [{ p: 26 }]).body[0]![0]!.text, "$26");
});

const VENDORS = [
	{ name: "Sentry", price: 26, retention: 90, sso: "yes" },
	{ name: "Rollbar", price: 21, retention: 30, sso: "enterprise only" },
	{ name: "Honeybadger", price: 19, retention: 45, sso: "no" },
];

test("a decision matrix strikes what fails a must, and marks the best of the options still standing", () => {
	const model = compareModel({
		options: VENDORS,
		criteria: [
			{ key: "price", label: "Price / seat", best: "min", unit: "$" },
			{ key: "retention", label: "Retention (days)", best: "max" },
			{ key: "sso", label: "SSO", must: { oneOf: ["yes"] } },
		],
		pick: "Sentry",
	});
	assert.deepEqual(
		model.options.map((o) => [o.name, o.fails, o.pick]),
		[
			["Sentry", [], true],
			["Rollbar", ["SSO"], false],
			["Honeybadger", ["SSO"], false],
		],
	);
	const [price, retention, sso] = model.rows;
	assert.deepEqual(price!.cells.map((c) => [c.text, c.best, c.fails]), [
		["$26", true, false],
		["$21", false, false],
		["$19", false, false],
	], "the cheapest that fails a must is not crowned");
	assert.deepEqual(retention!.cells.map((c) => c.best), [true, false, false]);
	assert.deepEqual(sso!.cells.map((c) => c.fails), [false, true, true]);
	assert.deepEqual(
		compareModel({ options: VENDORS, criteria: [{ key: "retention", must: { min: 45 } }] }).options.map((o) => o.fails.length),
		[0, 1, 0],
	);
});

const plain = (plan: ReturnType<typeof chartPlan>) => plan.marks.map((m) => m.type);

test("a chart keeps categories in the order the data gives them, never sorted", () => {
	const days = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => ({ day, opened: [96, 88, 79, 81, 68][i] }));
	const plan = chartPlan({ data: days, mark: "bar", x: "day", y: "opened" }, { width: 900, palette: ["c3", "c1", "c5"] });
	assert.deepEqual(plan.options.x?.domain, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
	assert.equal(plan.options.x?.label, null, "category names read alone, so the key is not printed under them");
	assert.deepEqual(plain(plan), ["barY", "ruleY"]);
	assert.equal(plan.marks[0]!.options.fill, "c3", "one series is drawn in the first palette colour");
	assert.equal(plan.options.width, 900, "it fills the width it is given");
	assert.ok(plan.options.height >= 240 && plan.options.height <= 360, `a sensible height (${plan.options.height})`);
});

test("a series colours by the palette in data order, and grouped bars sit side by side", () => {
	const rows = ["1 KB", "100 KB"].flatMap((size) => ["v2", "v1"].map((parser, i) => ({ size, parser, ms: i + 1 })));
	const plan = chartPlan({ data: rows, mark: "bar", x: "size", y: "ms", series: "parser", layout: "group" }, { width: 800, palette: ["a", "b"] });
	assert.deepEqual(plan.options.color, { domain: ["v2", "v1"], range: ["a", "b"], legend: true });
	assert.deepEqual(plan.options.fx?.domain, ["1 KB", "100 KB"]);
	assert.equal(plan.marks[0]!.options.fx, "size");
	assert.equal(plan.marks[0]!.options.x, "parser");
});

test("the value axis leaves room for six-digit ticks with their unit", () => {
	const cash = [0, 1, 2].map((month) => ({ month, cash: 480000 - month * 26000 }));
	const plan = chartPlan({ data: cash, mark: "line", x: "month", y: "cash", unit: "$" }, { width: 900, palette: ["c"] });
	assert.ok(plan.options.marginLeft >= 7 * `$${n(480000)}`.length, `marginLeft ${plan.options.marginLeft}`);
	assert.equal((plan.options.y?.tickFormat as (v: number) => string)(480000), `$${n(480000)}`);
	assert.equal(plan.options.y?.label, null, "the unit on every tick says what the axis is");
});

test("horizontal bars take their categories down the side, whichever key the agent named first", () => {
	const answers = [
		{ question: "Setup was easy", share: 68 },
		{ question: "Docs answered my questions", share: 32 },
	];
	const plan = chartPlan({ data: answers, mark: "barH", x: "question", y: "share" }, { width: 900, palette: ["c"] });
	assert.equal(plan.marks[0]!.type, "barX");
	assert.equal(plan.marks[0]!.options.y, "question");
	assert.equal(plan.marks[0]!.options.x, "share");
	assert.deepEqual(plan.options.y?.domain, ["Setup was easy", "Docs answered my questions"]);
	assert.ok(plan.options.marginLeft >= 7 * "Docs answered my questions".length, "the longest label fits");
});

test("a log scale draws its bars from the scale's floor, not from zero", () => {
	const plan = chartPlan(
		{ data: [{ p: "a", ms: 0.03 }, { p: "b", ms: 910 }], mark: "bar", x: "p", y: "ms", yScale: "log" },
		{ width: 600, palette: ["c"] },
	);
	assert.equal(plan.options.y?.type, "log");
	assert.equal(plan.marks[0]!.options.y1, 0.01);
	assert.equal(plan.marks[0]!.options.y2, "ms");
	assert.deepEqual(plain(plan), ["barY"]);
	assert.deepEqual(plan.options.y?.ticks, [0.01, 0.1, 1, 10, 100, 1000], "one tick per power of ten");
	const series = chartPlan(
		{ data: [{ p: "a", s: "v1", ms: 0.03 }, { p: "a", s: "v2", ms: 910 }], mark: "bar", x: "p", y: "ms", series: "s", yScale: "log" },
		{ width: 600, palette: ["c"] },
	);
	assert.equal(series.marks[0]!.options.fx, "p", "a series of log bars stands side by side, since it cannot stack");
	assert.equal(series.marks[0]!.options.x, "s");
});

test("several value keys draw as one series each, as a series call's columns come", () => {
	const rows = [0, 1].map((year) => ({ year, balance: 1000 + year * 50, paidIn: 1000 + year * 10 }));
	const plan = chartPlan({ data: rows, mark: "line", x: "year", y: ["balance", "paidIn"] }, { width: 800, palette: ["a", "b"] });
	assert.deepEqual(plan.options.color?.domain, ["balance", "paidIn"]);
	const line = plan.marks[0]!;
	assert.equal(line.data.length, 4, "one row per value");
	assert.deepEqual(line.data[1], { year: 0, series: "paidIn", value: 1000 });
	assert.equal(line.options.y, "value");
	assert.equal(line.options.stroke, "series");
});

test("a value axis ends on a round tick above the tallest value, and leaves room for it", () => {
	const days = ["Mon", "Tue"].map((day, i) => ({ day, opened: [96, 88][i] }));
	const plan = chartPlan({ data: days, mark: "bar", x: "day", y: "opened" }, { width: 900, palette: ["c"] });
	assert.equal(plan.options.y?.nice, true, "96 stands under a tick, not above the last one");
	const cash = [{ m: 0, cash: 96_000 }, { m: 1, cash: 90_000 }];
	const wide = chartPlan({ data: cash, mark: "line", x: "m", y: "cash", unit: "$" }, { width: 900, palette: ["c"] });
	assert.ok(wide.options.marginLeft >= 7 * "$100,000".length, `the rounded-up top tick fits (${wide.options.marginLeft})`);
	const log = chartPlan({ data: [{ p: "a", ms: 0.03 }, { p: "b", ms: 910 }], mark: "bar", x: "p", y: "ms", yScale: "log" }, { width: 600, palette: ["c"] });
	assert.equal(log.options.y?.nice, undefined, "a log axis keeps its power-of-ten ticks");
});

test("a line of amounts starts at zero unless its values sit in a narrow band far from it", () => {
	const plan = (values: number[]) =>
		chartPlan({ data: values.map((v, year) => ({ year, v })), mark: "line", x: "year", y: "v" }, { width: 900, palette: ["c"] });
	assert.equal(plan([1000, 1000, 7612]).options.y?.zero, true, "a balance growing from 1,000 is read against zero");
	assert.equal(plan([101, 104, 99]).options.y?.zero, undefined, "a reading near 100 keeps its band");
	assert.equal(plan([480, 120, -40]).options.y?.zero, undefined, "a line that crosses zero shows it already");
});

test("shares that add up to a whole run to 100, not to the next round tick past it", () => {
	const rows = [
		{ q: "Docs", a: "Disagree", pct: 39.2 },
		{ q: "Docs", a: "Neutral", pct: 28.8 },
		{ q: "Docs", a: "Agree", pct: 32.1 },
	];
	const plan = chartPlan({ data: rows, mark: "barH", x: "q", y: "pct", series: "a", unit: "%" }, { width: 900, palette: ["c"] });
	assert.deepEqual(plan.options.x?.domain, [0, 100]);
	assert.equal(plan.options.x?.nice, undefined);
});

test("ordered series take a diverging or sequential ramp in their order, not the categorical palette", () => {
	const answers = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
	const rows = answers.map((a, i) => ({ q: "Setup", a, n: i + 1 }));
	const env = { width: 900, palette: ["c3", "c1"], ramp: { low: "red", mid: "grey", high: "blue", light: "pale", dark: "navy" } };
	const diverging = chartPlan({ data: rows, mark: "barH", x: "q", y: "n", series: "a", scheme: "diverging" }, env);
	assert.deepEqual(diverging.options.color?.range, [
		"red",
		"color-mix(in oklab, red 50%, grey)",
		"grey",
		"color-mix(in oklab, blue 50%, grey)",
		"blue",
	]);
	const three = chartPlan({ data: rows.slice(0, 3), mark: "barH", x: "q", y: "n", series: "a", scheme: "diverging" }, env);
	assert.deepEqual(three.options.color?.range, ["red", "grey", "blue"], "an odd count has the neutral middle");
	const two = chartPlan({ data: rows.slice(0, 2), mark: "barH", x: "q", y: "n", series: "a", scheme: "diverging" }, env);
	assert.deepEqual(two.options.color?.range, ["red", "blue"]);
	const four = chartPlan({ data: rows.slice(0, 4), mark: "bar", x: "q", y: "n", series: "a", scheme: "sequential" }, env);
	assert.equal(four.options.color?.range[0], "pale");
	assert.equal(four.options.color?.range[3], "navy");
	assert.equal(four.options.color?.range.length, 4);
});

// A diverging chart sits in a document that is black on white with one blue:
// its positive end is that blue at full strength, and its negative end is the
// theme's red taken toward the page, so the chart reads as the same product
// rather than as a warning.
test("the theme's diverging ramp runs from a softened red through the muted tone to the chart blue", () => {
	assert.match(THEME_RAMP.low, /^color-mix\(in oklab, var\(--destructive\) \d+%, var\(--background\)\)$/);
	assert.match(THEME_RAMP.mid, /var\(--muted-foreground\).*var\(--background\)/);
	assert.equal(THEME_RAMP.high, "var(--chart-3)");
	const rows = ["Disagree", "Neutral", "Agree"].map((a, i) => ({ q: "Setup", a, n: i + 1 }));
	const plan = chartPlan({ data: rows, mark: "barH", x: "q", y: "n", series: "a", scheme: "diverging" }, { width: 900, palette: ["c"], ramp: THEME_RAMP });
	assert.deepEqual(plan.options.color?.range, [THEME_RAMP.low, THEME_RAMP.mid, THEME_RAMP.high]);
	for (const colour of Object.values(THEME_RAMP)) assert.doesNotMatch(colour, /#|rgb|oklch\(/, "every stop is a token, never a literal colour");
});

test("a series or a value key is named in the legend by its label", () => {
	const rows = [0, 1].map((m) => ({ m, cash5: 480 - m, cash12: 480 + m }));
	const plan = chartPlan(
		{ data: rows, mark: "line", x: "m", y: ["cash5", "cash12"], labels: { cash5: "5% growth", cash12: "12% growth" } },
		{ width: 800, palette: ["a", "b"] },
	);
	assert.deepEqual(plan.options.color?.domain, ["5% growth", "12% growth"]);
	const long = chartPlan(
		{ data: [{ x: 1, s: "v1", y: 2 }], mark: "dot", x: "x", y: "y", series: "s", labels: { v1: "Parser 1" } },
		{ width: 800, palette: ["a"] },
	);
	assert.deepEqual(long.options.color?.domain, ["Parser 1"]);
});

test("areas of several value keys overlap from zero, since each is a total of its own, not a part", () => {
	const rows = [0, 30].map((year) => ({ year, paidIn: 1000 + year * 600, total: 1000 + year * 2270 }));
	const plan = chartPlan({ data: rows, mark: "area", x: "year", y: ["paidIn", "total"] }, { width: 800, palette: ["a", "b"] });
	const area = plan.marks.find((m) => m.type === "areaY")!;
	assert.equal(area.options.y, undefined, "a y channel would stack the totals on each other");
	assert.equal(area.options.y1, 0);
	assert.equal(area.options.y2, "value");
	const stacked = chartPlan(
		{ data: [{ m: 1, s: "a", v: 1 }, { m: 1, s: "b", v: 2 }], mark: "area", x: "m", y: "v", series: "s" },
		{ width: 800, palette: ["a", "b"] },
	);
	assert.equal(stacked.marks.find((m) => m.type === "areaY")!.options.y, "v", "parts named by a series column still stack");
});

test("a log axis spans whole powers of ten, so its lowest tick is inside the frame", () => {
	const plan = chartPlan(
		{ data: [{ s: "1 KB", ms: 0.03 }, { s: "10 MB", ms: 910 }], mark: "line", x: "s", y: "ms", yScale: "log" },
		{ width: 600, palette: ["c"] },
	);
	assert.deepEqual(plan.options.y?.domain, [0.01, 1000]);
});
