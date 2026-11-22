// The arithmetic behind Piary's `calc` and `series` A2UI functions: a surface
// derives values from its data model with them (a balance from a slider's
// rate), because the basic catalog's functions have none. A formula is parsed,
// never run as code, and a payload whose formula would fail is refused with
// where and why, so the agent can fix it. Run `pnpm build` first.
import assert from "node:assert/strict";
import test from "node:test";
import { calc, expressionProblems, parseExpression, series } from "../../dist/document/a2ui-expr.js";

test("a formula reads with the precedence a reader expects", () => {
	assert.equal(calc("1 + 2 * 3"), 7);
	assert.equal(calc("(1 + 2) * 3"), 9);
	assert.equal(calc("2 ^ 3 ^ 2"), 512, "power is right-associative");
	assert.equal(calc("-2 ^ 2"), -4, "a leading minus applies after the power");
	assert.equal(calc("10 % 4"), 2);
	assert.equal(calc("1.5e3 / 3"), 500);
});

test("a formula reads its variables, and a numeric string counts as its number", () => {
	assert.equal(calc("p * (1 + r / 100) ^ n", { p: 1000, r: "5", n: 2 }), 1102.5);
});

test("the functions a teacher's or a founder's sum needs are there", () => {
	assert.equal(calc("round(2.345, 2)"), 2.35);
	assert.equal(calc("round(2.5)"), 3);
	assert.equal(calc("min(3, 1, 2) + max(3, 1, 2)"), 4);
	assert.equal(calc("if(x > 3, 1, 0)", { x: 4 }), 1);
	assert.equal(calc("if(x >= 3 , 10, 20)", { x: 2 }), 20);
	assert.equal(calc("floor(log10(1000)) + ceil(0.2) + abs(-1) + sqrt(9) + pow(2, 3)"), 16);
	assert.ok(Math.abs(calc("log(exp(2))") - 2) < 1e-12);
});

test("a value that is not a number makes the result not a number, rather than a wrong figure", () => {
	assert.ok(Number.isNaN(calc("p * 2", { p: "lots" })));
	assert.ok(Number.isNaN(calc("p * 2", { p: undefined })));
});

test("a series is one row per step, each column a formula over the index and the variables", () => {
	const rows = series({
		from: 0,
		to: 3,
		index: "year",
		columns: { balance: "round(p * (1 + r / 100) ^ year)", growth: "balance - p" },
		vars: { p: 1000, r: 10 },
	});
	assert.deepEqual(rows, [
		{ year: 0, balance: 1000, growth: 0 },
		{ year: 1, balance: 1100, growth: 100 },
		{ year: 2, balance: 1210, growth: 210 },
		{ year: 3, balance: 1331, growth: 331 },
	]);
	assert.deepEqual(
		series({ from: 0, to: 1, step: 0.5, index: "t", columns: { v: "t * 2" } }).map((r) => r.v),
		[0, 1, 2],
	);
	assert.ok(series({ from: 0, to: 1e9, index: "i", columns: { v: "i" } }).length <= 1000, "a runaway range is capped");
});

test("a formula that would fail is a problem with its reason, not a blank surface", () => {
	assert.match(String((parseExpression("1 +") as { problem: string }).problem), /end of the formula/);
	assert.match(String((parseExpression("2 ** 3") as { problem: string }).problem), /\*/);
	assert.match(String((parseExpression("eval(1)") as { problem: string }).problem), /eval/);
	assert.match(String((parseExpression("round()") as { problem: string }).problem), /round/);
});

test("a payload's formulas are found wherever they sit, and an unknown name is named", () => {
	const payload = {
		components: [
			{ id: "root", component: "Column", children: ["a", "b"] },
			{ id: "a", component: "Text", text: { "@call": "formatNumber", args: { value: { "@call": "calc", args: { expr: "p * x", vars: { p: { "@path": "/p" } } } } } } },
			{
				id: "b",
				component: "Chart",
				mark: "line",
				x: "year",
				y: "balance",
				data: { call: "series", args: { from: 0, to: 5, index: "year", columns: { balance: "p * year", bad: "(year" }, vars: { p: 1 } } },
			},
		],
	};
	assert.deepEqual(expressionProblems(payload), [
		{ code: "EXPRESSION_INVALID", path: "/components/1/text/args/value/args/expr", message: 'calc: "p * x" names x, which is not one of its vars (p).' },
		{ code: "EXPRESSION_INVALID", path: "/components/2/data/args/columns/bad", message: 'series: "(year" is missing a closing parenthesis.' },
	]);
	assert.deepEqual(expressionProblems({ components: [{ id: "root", component: "Text", text: "plain" }] }), []);
});

test("a series row may read the previous row, so a running balance needs no closed form", () => {
	// A founder's runway: cash moves by last month's revenue less a fixed burn,
	// and revenue grows on last month's. Month 0 is the start's values.
	const rows = series({
		from: 0,
		to: 36,
		index: "month",
		start: { revenue: 12, cash: 480 },
		columns: { revenue: "prev_revenue * (1 + g / 100)", cash: "prev_cash + prev_revenue - 38" },
		vars: { g: 5 },
	});
	assert.deepEqual(rows[0], { month: 0, revenue: 12, cash: 480 });
	assert.equal(rows[1]!.cash, 454);
	const lowest = rows.reduce((low, row) => (row.cash! < low.cash! ? row : low));
	assert.deepEqual([lowest.month, Math.round(lowest.cash!)], [24, 102]);
	assert.deepEqual(
		series({ from: 1, to: 3, index: "n", start: { total: 1 }, columns: { total: "prev_total * 2", half: "prev_total / 2" } }),
		[
			{ n: 1, total: 1, half: 0.5 },
			{ n: 2, total: 2, half: 0.5 },
			{ n: 3, total: 4, half: 1 },
		],
		"a column not in start is computed on the first row too, its prev_ reading the start",
	);
});

test("a previous-row name is known only for a column, and on the first row only through start", () => {
	const chart = (args: Record<string, unknown>) => ({ components: [{ id: "root", component: "Chart", mark: "line", x: "m", y: "c", data: { "@call": "series", args } }] });
	assert.deepEqual(expressionProblems(chart({ from: 0, to: 3, index: "m", start: { c: 1 }, columns: { c: "prev_c + 1" } })), []);
	assert.deepEqual(
		expressionProblems(chart({ from: 0, to: 3, index: "m", columns: { c: "prev_c + 1" } })).map((p) => p.message),
		['series: "prev_c + 1" reads prev_c on the first row, where there is no previous row: give c a value in start.'],
	);
	assert.match(expressionProblems(chart({ from: 0, to: 3, index: "m", start: { c: 1 }, columns: { c: "prev_d + 1" } }))[0]!.message, /prev_d/);
});
