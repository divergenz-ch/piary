// Piary's own A2UI components in the real canvas: a `pi:view a2ui` block
// built from Stat, Table, Compare, Callout and Chart renders what each shows,
// in light DOM under the answer's root (so a screenshot's settle sees it), and
// a value derived with `calc`/`series` follows the slider it is bound to — the
// interactivity a surface has without running agent code.
//
// Plot is the chart's library and ships in the app (src/utils/plot.ts), so a
// chart draws here too, with its space kept until it has. What it draws, in
// which colours and at what width, is e2e/app-page.spec.ts's: jsdom lays
// nothing out.
import assert from "node:assert/strict";
import test from "node:test";
import { mount, settle, unmount } from "../helpers/editor.ts";

/** Settles until `ready` holds: the renderer loads on first connect, and a
 *  child resolves an update after its parent. */
async function until(ready: () => boolean, what: string): Promise<void> {
	for (let i = 0; i < 100 && !ready(); i++) await settle(20);
	assert.ok(ready(), `timed out waiting for ${what}`);
}

const block = (data: unknown) => `<!-- pi:view a2ui #toolu_c -->\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
const DOC = (data: unknown) => `<!-- you -->\n\nshow me\n\n<!-- pi -->\n\n${block(data)}\n\n<!-- you -->\n\n`;

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
/** A number grouped as this machine groups it. */
const g = (v: number) => v.toLocaleString();

async function rendered(data: unknown, ready: (root: Element) => boolean) {
	const mounted = await mount(DOC(data));
	const root = () => mounted.el.querySelector("[data-answer-ui]");
	await until(() => {
		const r = root();
		return !!r && (r.hasAttribute("data-answer-ui-error") || ready(r));
	}, "the surface");
	assert.equal(mounted.el.querySelector("[data-answer-ui-error]"), null, text(mounted.el.querySelector("[data-answer-ui-error]")));
	return { el: mounted.el, root: root()! };
}

test("a stat tile shows its figure with its unit, and its delta coloured by whether it is good news", async () => {
	const { el, root } = await rendered(
		{
			components: [
				{ id: "root", component: "Row", children: ["opened", "reply", "cash"] },
				{ id: "opened", component: "Stat", label: "Opened", value: 412, delta: 32, good: "down", note: "vs 380" },
				{ id: "reply", component: "Stat", label: "First reply", value: 2.4, unit: "h", delta: -0.7, good: "down" },
				{ id: "cash", component: "Stat", label: "Cash", value: { "@path": "/cash" }, unit: "$" },
			],
			dataModel: { cash: 480000 },
		},
		(r) => r.querySelectorAll(".piary-stat").length === 3,
	);
	try {
		const [opened, reply, cash] = [...root.querySelectorAll(".piary-stat")];
		assert.equal(text(opened!.querySelector(".piary-stat-value")), "412");
		assert.equal(text(opened!.querySelector(".piary-stat-delta")), "▲ +32");
		assert.equal(opened!.querySelector(".piary-stat-delta")?.getAttribute("data-tone"), "destructive", "more tickets opened is bad news");
		assert.equal(text(opened!.querySelector(".piary-stat-note")), "vs 380");
		assert.equal(reply!.querySelector(".piary-stat-delta")?.getAttribute("data-tone"), "success", "a faster reply is good news");
		assert.equal(text(cash!.querySelector(".piary-stat-value")), `$${(480000).toLocaleString()}`, "a bound value, currency first");
	} finally {
		unmount(el);
	}
});

test("a table puts a column of numbers at the end, and a decision matrix strikes the option that fails a must", async () => {
	const { el, root } = await rendered(
		{
			components: [
				{ id: "root", component: "Column", children: ["bench", "pick", "why"] },
				{ id: "bench", component: "Table", columns: ["size", { key: "v1", label: "v1 (ms)" }], rows: [{ size: "1 KB", v1: 0.08 }, { size: "10 MB", v1: 910 }] },
				{
					id: "pick",
					component: "Compare",
					options: [
						{ name: "Sentry", price: 26, sso: "yes" },
						{ name: "Honeybadger", price: 19, sso: "no" },
					],
					criteria: [
						{ key: "price", label: "Price / seat", best: "min", unit: "$" },
						{ key: "sso", label: "SSO", must: { oneOf: ["yes"] } },
					],
					pick: "Sentry",
				},
				{ id: "why", component: "Callout", tone: "warning", title: "Watch", text: "Only Sentry has SSO at this size." },
			],
		},
		(r) => !!r.querySelector(".piary-compare td") && !!r.querySelector(".piary-callout"),
	);
	try {
		const table = root.querySelector(".piary-table")!;
		assert.deepEqual([...table.querySelectorAll("th")].map(text), ["size", "v1 (ms)"]);
		assert.deepEqual([...table.querySelectorAll("tbody td")].map((td) => [text(td), td.getAttribute("data-align")]), [
			["1 KB", "start"],
			["0.08", "end"],
			["10 MB", "start"],
			["910", "end"],
		]);
		const compare = root.querySelector(".piary-compare")!;
		const heads = [...compare.querySelectorAll("thead th")];
		assert.match(text(heads[1]), /Sentry.*Recommended/);
		assert.ok(heads[2]!.hasAttribute("data-out"), "the option failing a must is out");
		const sso = [...compare.querySelectorAll("tbody tr")][1]!;
		assert.ok(sso.querySelectorAll("td")[1]!.hasAttribute("data-fails"), "its failing value is struck");
		const price = [...compare.querySelectorAll("tbody tr")][0]!;
		assert.ok(price.querySelectorAll("td")[0]!.hasAttribute("data-best"), "the best of the options still standing is marked");
		const callout = root.querySelector(".piary-callout")!;
		assert.equal(callout.getAttribute("data-tone"), "warning");
		assert.match(text(callout), /Watch.*Only Sentry has SSO/);
	} finally {
		unmount(el);
	}
});

test("a value derived with calc and a table built with series follow the slider they are bound to", async () => {
	const balance = { "@call": "calc", args: { expr: "round(p * (1 + r / 100) ^ n)", vars: { p: { "@path": "/p" }, r: { "@path": "/r" }, n: 2 } } };
	const { el, root } = await rendered(
		{
			components: [
				{ id: "root", component: "Column", children: ["rate", "after", "years"] },
				{ id: "rate", component: "Slider", label: "Rate (%)", min: 0, max: 20, value: { "@path": "/r" } },
				{ id: "after", component: "Stat", label: "After 2 years", value: balance, unit: "€" },
				{
					id: "years",
					component: "Table",
					columns: ["year", "balance"],
					rows: { "@call": "series", args: { from: 0, to: 2, index: "year", columns: { balance: "round(p * (1 + r / 100) ^ year)" }, vars: { p: { "@path": "/p" }, r: { "@path": "/r" } } } },
				},
			],
			dataModel: { p: 1000, r: 10 },
		},
		(r) => text(r.querySelector(".piary-stat-value")) === `€${g(1210)}` && r.querySelectorAll(".piary-table tbody tr").length === 3,
	);
	try {
		const slider = root.querySelector<HTMLInputElement>("input[type=range]")!;
		slider.value = "20";
		slider.dispatchEvent(new Event("input", { bubbles: true }));
		await until(() => text(root.querySelector(".piary-stat-value")) === `€${g(1440)}`, "the stat to follow the slider");
		await until(() => text(root.querySelector(".piary-table tbody tr:last-child td:last-child")) === g(1440), "the series to follow it");
	} finally {
		unmount(el);
	}
});

test("a formula that would not evaluate is refused with where and why, not drawn blank", async () => {
	const { el } = await mount(DOC({ components: [{ id: "root", component: "Stat", label: "x", value: { "@call": "calc", args: { expr: "p * (1 +" } } }] }));
	try {
		await until(() => el.querySelector("[data-answer-ui-error]") !== null, "the refusal");
		assert.match(text(el.querySelector("[data-answer-ui-error]")), /EXPRESSION_INVALID at \/components\/0\/value\/args\/expr: calc: "p \* \(1 \+"/);
	} finally {
		unmount(el);
	}
});

test("a chart keeps its space while it draws, then draws its rows with no network", async () => {
	const mounted = await mount(DOC({ components: [{ id: "root", component: "Chart", title: "Opened per day", mark: "bar", x: "day", y: "n", data: [{ day: "Mon", n: 96 }] }] }));
	try {
		const chart = () => mounted.el.querySelector(".piary-chart");
		await until(() => !!chart(), "the chart");
		assert.equal(text(chart()!.querySelector(".piary-chart-title")), "Opened per day");
		assert.ok(Number.parseInt((chart()!.querySelector<HTMLElement>(".piary-chart-plot")!).style.minHeight) >= 240, "its height is kept before it draws");
		await until(() => mounted.el.querySelector("piary-a2ui-chart[data-drawn], [data-answer-ui-error]") !== null, "the drawing");
		assert.equal(mounted.el.querySelector("[data-answer-ui-error]"), null, text(chart()));
		assert.equal(chart()!.querySelectorAll("svg [aria-label='bar'] rect").length, 1);
	} finally {
		unmount(mounted.el);
	}
});
