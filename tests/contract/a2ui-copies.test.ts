// The `view` tool's copy of the a2ui renderer, held to the page's.
//
// The extension cannot import `src/`, so it keeps four copies: the catalog
// (`pi-extension/a2ui-catalog.ts`, the page's serialized), the wrapping of a
// payload into messages, the validation config, and the formula check behind
// `calc` and `series` (`pi-extension/a2ui-expr.ts`). If any drifts, the tool
// tells the agent `ok` for a surface the page then shows as an error, or
// refuses one the page would have drawn. So each is checked by behaviour: the
// same payloads, through both, must be refused for the same reasons.
import assert from "node:assert/strict";
import test from "node:test";
import { MessageProcessor } from "@a2ui/web_core/v1_0";
import { a2uiMessages, refusalLine } from "../../dist/document/a2ui.js";
import * as pageExpr from "../../dist/document/a2ui-expr.js";
import { A2UI_VALIDATION, piaryCatalog } from "../../dist/components/views/a2ui-catalog.js";
import * as extension from "../../pi-extension/a2ui.ts";
import { A2UI_EXAMPLE, A2UI_GUIDE } from "../../pi-extension/a2ui-guide.ts";
import { A2UI_CATALOG } from "../../pi-extension/a2ui-catalog.ts";
import * as toolExpr from "../../pi-extension/a2ui-expr.ts";

test("the tool checks against the catalog the page renders with", () => {
	assert.deepEqual(
		A2UI_CATALOG,
		piaryCatalog.toJson(),
		"pi-extension/a2ui-catalog.ts has drifted from src/components/views/a2ui-catalog.ts — after `pnpm build`, " +
			"replace the object after `A2UI_CATALOG: Record<string, unknown> = ` with the output of " +
			`node --input-type=module -e 'import { piaryCatalog } from "./dist/components/views/a2ui-catalog.js"; ` +
			`console.log(JSON.stringify(piaryCatalog.toJson(), null, "\\t"))'`,
	);
});

const components = (...list: unknown[]) => ({ components: list });

/** Payloads the page draws, and payloads it refuses — one per kind of refusal. */
const PAYLOADS: Array<[string, unknown]> = [
	[
		"a card",
		{
			components: [
				{ id: "root", component: "Card", child: "body" },
				{ id: "body", component: "Column", children: ["title", "seats"] },
				{ id: "title", component: "Text", text: "## Team plan" },
				{ id: "seats", component: "Text", variant: "caption", text: { "@call": "formatString", args: { value: "${/seats} seats" } } },
			],
			dataModel: { seats: 12 },
		},
	],
	["an orphan, which is allowed", components({ id: "root", component: "Text", text: "x" }, { id: "spare", component: "Text", text: "y" })],
	["a full v1.0 message", { version: "1.0", createSurface: { surfaceId: "x", catalogId: "y", components: [{ id: "root", component: "Text", text: "x" }] } }],
	["unknown component", components({ id: "root", component: "Gauge", data: [1] })],
	["dangling child", components({ id: "root", component: "Card", child: "missing" })],
	["missing root", components({ id: "top", component: "Text", text: "x" })],
	["v0.9 variant", components({ id: "root", component: "Text", text: "x", variant: "h1" })],
	["unknown property", components({ id: "root", component: "Text", text: "x", color: "red" })],
	["hyphenated id", components({ id: "root", component: "Card", child: "the-body" }, { id: "the-body", component: "Text", text: "x" })],
	["unknown function", components({ id: "root", component: "Text", text: { "@call": "sum", args: {} } })],
	["no components", { rows: [] }],
	// Piary's components and functions: each drawn, and each refused for a wrong value.
	[
		"Piary's figures",
		{
			components: [
				{ id: "root", component: "Column", children: ["kpi", "table", "pick", "note", "chart"] },
				{ id: "kpi", component: "Stat", label: "Opened", value: 412, unit: "%", delta: "+3 pts", good: "down", note: { "@path": "/n" } },
				{ id: "table", component: "Table", columns: ["a", { key: "b", label: "B", align: "end", unit: "$" }], rows: [{ a: 1, b: 2 }], caption: "x" },
				{
					id: "pick",
					component: "Compare",
					options: { "@path": "/vendors" },
					criteria: [{ key: "price", best: "min", unit: "$" }, { key: "sso", must: { oneOf: ["yes", true] } }, { key: "days", must: { min: 30 } }],
					pick: "Sentry",
				},
				{ id: "note", component: "Callout", tone: "warning", title: "Watch", text: "x" },
				{
					id: "chart",
					component: "Chart",
					mark: "line",
					x: "year",
					y: "balance",
					series: "plan",
					yScale: "log",
					unit: "€",
					height: 300,
					data: { "@call": "series", args: { from: 0, to: { "@path": "/years" }, index: "year", columns: { balance: "p * (1 + r / 100) ^ year" }, vars: { p: 1, r: { "@path": "/r" } } } },
				},
			],
			dataModel: { n: "vs 380", vendors: [], years: 10, r: 5 },
		},
	],
	["a calc value", components({ id: "root", component: "Stat", label: "x", value: { "@call": "calc", args: { expr: "p * 2", vars: { p: { "@path": "/p" } } } } })],
	["Stat: a good direction that is not one", components({ id: "root", component: "Stat", label: "x", value: 1, good: "sideways" })],
	["Stat: a colour of its own", components({ id: "root", component: "Stat", label: "x", value: 1, color: "red" })],
	["Stat: no value", components({ id: "root", component: "Stat", label: "x" })],
	["Table: a column with a stray key", components({ id: "root", component: "Table", columns: [{ key: "a", width: 3 }], rows: [] })],
	["Compare: a must that is not one", components({ id: "root", component: "Compare", options: [], criteria: [{ key: "a", must: { equals: 1 } }] })],
	["Callout: a tone that is not one", components({ id: "root", component: "Callout", tone: "loud", text: "x" })],
	["Chart: a mark that is not one", components({ id: "root", component: "Chart", mark: "pie", x: "a", y: "b", data: [] })],
	["Chart: no y", components({ id: "root", component: "Chart", mark: "bar", x: "a", data: [] })],
	["calc: a formula that is not a string", components({ id: "root", component: "Stat", label: "x", value: { "@call": "calc", args: { expr: 3 } } })],
	["series: no index", components({ id: "root", component: "Table", rows: { "@call": "series", args: { from: 0, to: 2, columns: { v: "1" } } } })],
	["calc: a formula that does not parse", components({ id: "root", component: "Stat", label: "x", value: { "@call": "calc", args: { expr: "2 ** 3" } } })],
	["series: a name it is not given", components({ id: "root", component: "Table", rows: { "@call": "series", args: { from: 0, to: 2, index: "i", columns: { v: "i * k" } } } })],
	[
		"series: a running balance, its scenarios named in the legend and its ratings on a ramp",
		components(
			{ id: "root", component: "Column", children: ["cash", "scale"] },
			{
				id: "cash",
				component: "Chart",
				mark: "line",
				x: "m",
				y: ["c5"],
				labels: { c5: "5% growth" },
				data: { "@call": "series", args: { from: 0, to: 24, index: "m", start: { c5: 480, r5: 12 }, columns: { r5: "prev_r5 * 1.05", c5: "prev_c5 + prev_r5 - 38" } } },
			},
			{ id: "scale", component: "Chart", mark: "barH", x: "q", y: "n", series: "a", scheme: "diverging", data: [] },
		),
	],
	["series: a previous row on the first", components({ id: "root", component: "Table", rows: { "@call": "series", args: { from: 0, to: 2, index: "i", columns: { v: "prev_v + 1" } } } })],
	["Chart: a scheme that is not one", components({ id: "root", component: "Chart", mark: "bar", x: "a", y: "b", scheme: "rainbow", data: [] })],
];

/** What the page shows for `data`: nothing when it renders, else each refusal. */
function pageRefusals(data: unknown): string[] {
	const shaped = a2uiMessages(data, "check");
	if ("problem" in shaped) return [shaped.problem];
	const formulas = pageExpr.expressionProblems(data).map(refusalLine);
	if (formulas.length) return formulas;
	const processor = new MessageProcessor([piaryCatalog], () => {}, { validationConfig: A2UI_VALIDATION });
	try {
		return processor.processMessagesWithErrors(shaped.messages as never).map((m) => refusalLine(m.error));
	} finally {
		processor.dispose();
	}
}

test("the tool wraps a payload into the messages the page wraps it into", () => {
	for (const [name, data] of PAYLOADS) assert.deepEqual(extension.a2uiMessages(data, "s"), a2uiMessages(data, "s"), name);
});

test("the tool refuses what the page refuses, for the same reasons, and passes what it draws", async () => {
	for (const [name, data] of PAYLOADS) {
		const page = pageRefusals(data);
		const tool = await extension.checkA2ui(data);
		if (!page.length) {
			// Plain "ok" is the check having run: a skipped check says why.
			assert.deepEqual(tool, { note: "ok" }, `${name}: the page draws it, so the tool answers ok`);
			continue;
		}
		assert.ok("problem" in tool, `${name}: the page refuses it (${page.join("; ")}), so the tool must too`);
		for (const line of page) {
			// A union refused whole lists every alternative it tried, and the
			// catalog's JSON form of a union tries one fewer than its zod form; the
			// refusal up to that list — code, path, component, property — is the same.
			const tried = line.split("Expected").length > 2 ? line.slice(0, line.indexOf("Expected")) : line;
			assert.ok(tool.problem.includes(tried), `${name}: the tool's answer names "${tried}"`);
		}
	}
});

test("the tool judges a formula as the page evaluates it", () => {
	const formulas = ["p * (1 + r / 100) ^ n", "-2 ^ 2", "round(2.345, 2)", "if(x >= 3, 1, 0)", "max(1, 2, 3) % 2", "1 +", "2 ** 3", "eval(1)", "round()", "(p", ""];
	const vars = { p: 1000, r: "5", n: 2, x: 3 };
	for (const expr of formulas) {
		assert.deepEqual(toolExpr.parseExpression(expr), pageExpr.parseExpression(expr), expr);
		assert.deepEqual(toolExpr.calc(expr, vars), pageExpr.calc(expr, vars), expr);
	}
	for (const [name, data] of PAYLOADS) assert.deepEqual(toolExpr.expressionProblems(data), pageExpr.expressionProblems(data), name);
});

test("the example the view tool teaches is drawn by the page and passed by the tool", async () => {
	assert.deepEqual(pageRefusals(A2UI_EXAMPLE), []);
	assert.deepEqual(await extension.checkA2ui(A2UI_EXAMPLE), { note: "ok" });
	assert.ok(A2UI_GUIDE.includes(JSON.stringify(A2UI_EXAMPLE)), "the description carries the example as checked");
});
