// A design run's counts (`evals/design/counts.ts`), held on a hand-built arm of
// three answers that end three ways, so a count that counts nothing shows.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Answer, summarise } from "../../evals/design/counts.ts";

const component = (name: string, props: Record<string, unknown> = {}) => ({ id: name.toLowerCase(), component: name, ...props });
const HEADLINE = component("Text", { text: "## Runway is 14 months" });
const TAKEAWAY = component("Callout", { text: "Cut the burn before March." });
const a2ui = (components: unknown[], failed: boolean) => ({ name: "view", args: { template: "a2ui", data: { components } }, failed });

/** Refused once, then accepted with a headline and a takeaway. */
const fixedAndComposed: Answer = { ms: 10, toolCalls: [a2ui([component("Chart")], true), a2ui([HEADLINE, component("Chart"), TAKEAWAY], false)] };
/** A cell that failed once and was fixed; a table view beside it. */
const drawnAsCell: Answer = {
	ms: 20,
	toolCalls: [
		{ name: "cell", args: { source: "{ return 1 }" }, failed: true },
		{ name: "cell", args: { source: "1" }, failed: false },
		{ name: "view", args: { template: "table", data: {} }, failed: false },
	],
};
/** Accepted without a takeaway; the composed payload after it was refused. */
const endsRefused: Answer = { ms: 30, toolCalls: [a2ui([HEADLINE, component("Chart")], false), a2ui([HEADLINE, TAKEAWAY], true)] };

test("an arm's failed calls and its composed answers are counted per answer", () => {
	const counts = summarise([fixedAndComposed, drawnAsCell, endsRefused], []);
	assert.equal(counts.refusedViews, 2);
	assert.equal(counts.failedCells, 1);
	assert.equal(counts.answersWithRefusal, 2);
	assert.equal(counts.a2uiAnswers, 2);
	assert.equal(counts.cellAnswers, 1);
	assert.equal(counts.composed, 1, "the last accepted payload decides, not a refused one after it");
});

test("a headline is a Text that starts with #, and it counts only beside a Callout", () => {
	const composed = (components: unknown[]) => summarise([{ ms: 1, toolCalls: [a2ui(components, false)] }], []).composed;
	assert.equal(composed([HEADLINE, TAKEAWAY]), 1);
	assert.equal(composed([component("Text", { text: "Runway is 14 months" }), TAKEAWAY]), 0);
	assert.equal(composed([component("Text", { text: { path: "/title" } }), TAKEAWAY]), 0);
	assert.equal(composed([HEADLINE]), 0);
});

test("a report written before calls recorded how they ended counts no failure", () => {
	const old: Answer = { ms: 1, toolCalls: [{ name: "view", args: { template: "a2ui", data: { components: [HEADLINE, TAKEAWAY] } } }] };
	const counts = summarise([old], []);
	assert.deepEqual([counts.refusedViews, counts.answersWithRefusal, counts.a2uiAnswers, counts.composed], [0, 0, 1, 1]);
});

test("a shot that drew nothing, or drew an error, is broken", () => {
	const counts = summarise(
		[],
		[
			{ name: "fine", widgets: 2, errors: 0 },
			{ name: "blank", widgets: 0, errors: 0 },
			{ name: "error", widgets: 1, errors: 1 },
		],
	);
	assert.deepEqual(counts.brokenNames, ["blank", "error"]);
});
