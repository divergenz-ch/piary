// What the `cell` tool tells the agent about a cell the page ran
// (`docs/notebook-cells.md` §Policy). Imports the .ts directly.
import test from "node:test";
import assert from "node:assert/strict";
import { parseVerdict, UNVERIFIED, verdictText } from "../../pi-extension/verdict-text.ts";

const WRITTEN = "ok — cell #d0b039";

test("a cell that threw is a failed call naming the error, the attempt and the id to redefine", () => {
	const said = verdictText("d0b039", { verdict: "failed", error: "Plot.arc is not a function", attempt: 1, limit: 3 }, WRITTEN);
	assert.equal(said.failed, true);
	assert.match(said.text, /Plot\.arc is not a function/);
	assert.match(said.text, /attempt 1 of 3/);
	assert.match(said.text, /id "d0b039"/);
});

test("the last allowed failure tells the agent to stop and report", () => {
	const said = verdictText("d0b039", { verdict: "give-up", error: "boom", attempt: 3, limit: 3 }, WRITTEN);
	assert.equal(said.failed, true);
	assert.match(said.text, /Stop rewriting it/);
});

test("a cell that ran is ok, and a cell waiting on a later one is not a failure", () => {
	assert.deepEqual(verdictText("a", { verdict: "ok" }, WRITTEN), { text: "ok — cell #a ran.", failed: false });
	const waiting = verdictText("a", { verdict: "waiting", name: "pieData" }, WRITTEN);
	assert.equal(waiting.failed, false);
	assert.match(waiting.text, /`pieData`/);
});

test("a chart with no data is a failed call naming what is empty, and leaves a way out when empty is the answer", () => {
	const said = verdictText("d0b039", { verdict: "empty", cell: "d0b039", names: ["checked"], attempt: 1, limit: 3 }, WRITTEN);
	assert.equal(said.failed, true);
	assert.match(said.text, /cell #d0b039 ran, but its chart shows no data \(attempt 1 of 3\): `checked` has no rows\./);
	assert.match(said.text, /tell the user so plainly/);
	const downstream = verdictText("d0b039", { verdict: "empty", cell: "f00d", names: [] }, WRITTEN);
	assert.match(downstream.text, /cell #d0b039 ran, but the chart in cell #f00d shows no data\./);
	assert.equal(parseVerdict('{"verdict":"empty","cell":"a","names":[]}')?.verdict, "empty");
});

test("an artifact that shows nothing is a failure to fix, and a slow cell is unverified", () => {
	assert.equal(verdictText("a", { verdict: "blank" }, WRITTEN).failed, true);
	const slow = verdictText("a", { verdict: "running" }, WRITTEN);
	assert.equal(slow.failed, false);
	assert.match(slow.text, /not verified/);
});

test("no answer, or an answer that is not a verdict, is the write-time text marked unverified", () => {
	assert.equal(parseVerdict(undefined), null);
	assert.equal(parseVerdict("not json"), null);
	assert.equal(parseVerdict('{"verdict":"maybe"}'), null);
	assert.deepEqual(verdictText("d0b039", parseVerdict("{}"), WRITTEN), { text: `${WRITTEN}${UNVERIFIED}`, failed: false });
	assert.deepEqual(parseVerdict('{"verdict":"ok"}'), { verdict: "ok" });
});
