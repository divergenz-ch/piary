// The hard bounds on one run (`docs/notebook-cells.md` §Policy). Imports the
// .ts directly; the clock is passed in.
import test from "node:test";
import assert from "node:assert/strict";
import { PAST_CALLS, PAST_TIME, RUN_LIMIT_MS, RUN_TOOL_CALLS, RunLimits } from "../../app/run-limits.ts";

test("a run is stopped past its tool-call limit, not at it", () => {
	const limits = new RunLimits();
	limits.start(0);
	for (let i = 0; i < RUN_TOOL_CALLS; i++) limits.toolCall();
	assert.equal(limits.passed(1), null);
	limits.toolCall();
	assert.equal(limits.passed(1), PAST_CALLS);
});

test("a run is stopped at its time limit", () => {
	const limits = new RunLimits();
	limits.start(1_000);
	assert.equal(limits.passed(1_000 + RUN_LIMIT_MS - 1), null);
	assert.equal(limits.passed(1_000 + RUN_LIMIT_MS), PAST_TIME);
});

test("a new run starts both counts again", () => {
	const limits = new RunLimits();
	limits.start(0);
	for (let i = 0; i <= RUN_TOOL_CALLS; i++) limits.toolCall();
	limits.start(RUN_LIMIT_MS * 2);
	assert.equal(limits.passed(RUN_LIMIT_MS * 2 + 1), null);
});

test("the agent's estimate is clamped between a minute and the hard bound", async () => {
	const { budgetMs, DEFAULT_BUDGET_MS, MIN_BUDGET_MS } = await import("../../app/run-limits.ts");
	assert.equal(budgetMs(3), 3 * 60_000);
	assert.equal(budgetMs(0.01), MIN_BUDGET_MS);
	assert.equal(budgetMs(600), RUN_LIMIT_MS);
	assert.equal(budgetMs("ten"), DEFAULT_BUDGET_MS);
	assert.equal(budgetMs(Number.NaN), DEFAULT_BUDGET_MS);
});

test("the steer names the estimate and asks pi to report and ask", async () => {
	const { budgetSteer } = await import("../../app/run-limits.ts");
	assert.match(budgetSteer(3 * 60_000), /^\[budget\] 3 min reached — stop here, report .* ask the user whether to continue\.$/);
});
