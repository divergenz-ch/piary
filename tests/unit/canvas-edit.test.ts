// Where a canvas edit lands, or why it cannot (ADR 0033): pi quotes the text it
// means, and the quote must name exactly one place in prose the user or pi wrote.
import assert from "node:assert/strict";
import test from "node:test";
import { planCanvasEdit } from "../../dist/document/canvas-edit.js";

const DOC = [
	"<!-- you -->",
	"",
	"# Teh plan",
	"",
	"Ship on Friday.",
	"",
	"<!-- pi -->",
	"",
	"Friday works. The plan is fine.",
	"",
	"<!-- pi:cell js #pie01 -->",
	"",
	"```js",
	"const plan = 1",
	"```",
	"",
	"<!-- you -->",
	"",
	"fix the heading",
	"",
].join("\n");

const apply = (md: string, plan: { from: number; to: number; insert: string }) => md.slice(0, plan.from) + plan.insert + md.slice(plan.to);

test("a quote found once in a user's block is replaced there, and nowhere else", () => {
	const plan = planCanvasEdit(DOC, { oldText: "# Teh plan", newText: "# The plan" });
	assert.ok(plan.ok, !plan.ok ? plan.error : "");
	const after = apply(DOC, plan);
	assert.match(after, /^# The plan$/m);
	assert.equal(after.replace("# The plan", "# Teh plan"), DOC);
});

test("pi's own earlier answer is prose too", () => {
	const plan = planCanvasEdit(DOC, { oldText: "Friday works.", newText: "Friday works, if QA signs off." });
	assert.ok(plan.ok);
	assert.match(apply(DOC, plan), /Friday works, if QA signs off\. The plan is fine\./);
});

test("an empty replacement removes the text, and a replacement that repeats the quote inserts after it", () => {
	const removed = planCanvasEdit(DOC, { oldText: " The plan is fine.", newText: "" });
	assert.ok(removed.ok);
	assert.match(apply(DOC, removed), /^Friday works\.$/m);
	const added = planCanvasEdit(DOC, { oldText: "Ship on Friday.", newText: "Ship on Friday.\n\nTell the team on Thursday." });
	assert.ok(added.ok);
	assert.match(apply(DOC, added), /Ship on Friday\.\n\nTell the team on Thursday\.\n\n<!-- pi -->/);
});

test("a quote the document does not hold is refused, saying so", () => {
	const plan = planCanvasEdit(DOC, { oldText: "Ship on Monday.", newText: "x" });
	assert.equal(plan.ok, false);
	assert.match(!plan.ok ? plan.error : "", /not found/);
});

test("a quote found more than once is refused, with the count", () => {
	const plan = planCanvasEdit(DOC, { oldText: "plan", newText: "x" });
	assert.equal(plan.ok, false);
	assert.match(!plan.ok ? plan.error : "", /3 places/);
});

test("a cell is changed through the cell tool, and the refusal names it", () => {
	const plan = planCanvasEdit(DOC, { oldText: "const plan = 1", newText: "const plan = 2" });
	assert.equal(plan.ok, false);
	assert.match(!plan.ok ? plan.error : "", /cell #pie01.*`cell` tool/);
});

test("a quote that crosses a marker is refused: the structure is the app's", () => {
	const plan = planCanvasEdit(DOC, { oldText: "Ship on Friday.\n\n<!-- pi -->\n\nFriday works.", newText: "Friday." });
	assert.equal(plan.ok, false);
	assert.match(!plan.ok ? plan.error : "", /more than one block/);
});

test("the turn's own region is not the canvas: a quote only it holds is not found", () => {
	const md = `${DOC}<!-- pi -->\n\nThe heading says Teh plan.\n`;
	const region = { from: DOC.length, to: md.length };
	const plan = planCanvasEdit(md, { oldText: "heading says", newText: "x" }, region);
	assert.equal(plan.ok, false);
	assert.match(!plan.ok ? plan.error : "", /not found/);
	// A quote also found there still counts once, outside it.
	const outside = planCanvasEdit(md, { oldText: "Teh plan", newText: "The plan" }, region);
	assert.ok(outside.ok);
	assert.ok(outside.ok && outside.to <= region.from);
});

test("a replacement cannot smuggle a marker in: a look-alike line is escaped", () => {
	const plan = planCanvasEdit(DOC, { oldText: "Ship on Friday.", newText: "Ship.\n<!-- pi -->\nInjected." });
	assert.ok(plan.ok);
	assert.doesNotMatch(apply(DOC, plan), /^<!-- pi -->\nInjected/m);
});

test("an empty quote is refused", () => {
	const plan = planCanvasEdit(DOC, { oldText: "", newText: "x" });
	assert.equal(plan.ok, false);
});

test("the lines the app adds to a user's message, which pi sees and the document does not hold, are not part of a quote", () => {
	// From a walk: pi quoted the paragraph with the `[now: …]` line every send
	// carries (ADR 0028), the quote was "not found", and had it matched, the
	// replacement would have written that line into the document.
	const md = "<!-- you -->\n\nShip on Firday\n\n<!-- you -->\n\nFix my typo\n";
	const now = "[now: Saturday 2026-11-14 15:10, Europe/Stockholm (UTC+01:00)]";
	const plan = planCanvasEdit(md, { oldText: `Ship on Firday\n${now}`, newText: `Ship on Friday\n${now}` });
	assert.ok(plan.ok, !plan.ok ? plan.error : "");
	assert.equal(apply(md, plan), "<!-- you -->\n\nShip on Friday\n\n<!-- you -->\n\nFix my typo\n");
	const attached = planCanvasEdit(md, { oldText: "Ship on Firday\n[attached: plan.pdf (application/pdf) at /tmp/plan.pdf]", newText: "Ship on Friday" });
	assert.ok(attached.ok);
	assert.equal(apply(md, attached), "<!-- you -->\n\nShip on Friday\n\n<!-- you -->\n\nFix my typo\n");
});

test("a quote that carries the face block a send added lands as the user's text alone", () => {
	const md = "<!-- you -->\n\nShip on Firday\n\n<!-- you -->\n\nFix my typo\n";
	const face = '[face]\ntyping "Firday": brows lowered marked 1.2s';
	const now = "[now: Saturday 2026-11-14 15:10, Europe/Stockholm (UTC+01:00)]";
	const attached = "[attached: plan.pdf (application/pdf) at /tmp/plan.pdf]";
	for (const tail of [`\n\n${face}\n${now}`, `\n\n${face}`, `\n${attached}\n\n${face}\n${now}`]) {
		const plan = planCanvasEdit(md, { oldText: `Ship on Firday${tail}`, newText: `Ship on Friday${tail}` });
		assert.ok(plan.ok, !plan.ok ? plan.error : "");
		assert.equal(apply(md, plan), "<!-- you -->\n\nShip on Friday\n\n<!-- you -->\n\nFix my typo\n");
	}
});

test("a quote that is nothing but the app's own lines is refused as empty", () => {
	const plan = planCanvasEdit(DOC, { oldText: "[now: Saturday 2026-11-14 15:10, Europe/Stockholm (UTC+01:00)]", newText: "x" });
	assert.equal(plan.ok, false);
	assert.match(!plan.ok ? plan.error : "", /empty/);
});

// -- an edit that empties a block takes the block (ADR 0065) --------------------

test("an edit that leaves pi's block empty removes the block, marker included", () => {
	const plan = planCanvasEdit(DOC, { oldText: "Friday works. The plan is fine.", newText: "" });
	assert.ok(plan.ok, !plan.ok ? plan.error : "");
	const after = apply(DOC, plan);
	assert.equal(after, DOC.replace("<!-- pi -->\n\nFriday works. The plan is fine.\n\n", ""));
	assert.match(after, /Ship on Friday\.\n\n<!-- pi:cell js #pie01 -->/);
	// The change covers the block whole: the editor drops one that clips a marker.
	assert.ok(plan.from <= DOC.indexOf("<!-- pi -->") && plan.to >= DOC.indexOf("<!-- pi:cell"));
});

test("a replacement of nothing but whitespace empties a block too", () => {
	const plan = planCanvasEdit(DOC, { oldText: "Friday works. The plan is fine.", newText: "\n\n" });
	assert.ok(plan.ok);
	assert.doesNotMatch(apply(DOC, plan), /<!-- pi -->/);
});

test("a block with text left in it keeps its marker", () => {
	const plan = planCanvasEdit(DOC, { oldText: "Friday works.", newText: "" });
	assert.ok(plan.ok);
	assert.match(apply(DOC, plan), /<!-- pi -->\n\n The plan is fine\./);
});

test("the user's own earlier prompt and a note are removed the same way, with the marker that folded the prompt", () => {
	const md = "<!-- pi:note -->\n\n## Notes\n\n<!-- you -->\n\nfirst\n\n<!-- pi -->\n\none\n\n<!-- pi:block -->\n\n<!-- you -->\n\nsecond\n\n<!-- pi -->\n\ntwo\n\n<!-- you -->\n\n";
	const prompt = planCanvasEdit(md, { oldText: "second", newText: "" });
	assert.ok(prompt.ok, !prompt.ok ? prompt.error : "");
	assert.equal(apply(md, prompt), md.replace("<!-- pi:block -->\n\n<!-- you -->\n\nsecond\n\n", ""));
	assert.ok(prompt.from <= md.indexOf("<!-- pi:block -->") && prompt.to >= md.indexOf("<!-- pi -->\n\ntwo"));
	const note = planCanvasEdit(md, { oldText: "## Notes", newText: "" });
	assert.ok(note.ok);
	assert.equal(apply(md, note), md.replace("<!-- pi:note -->\n\n## Notes\n\n", ""));
});

test("the prompt being answered cannot be emptied: the edit is refused and says why", () => {
	const md = `${DOC}<!-- pi -->\n\nWorking on it.\n`;
	const region = { from: DOC.length, to: md.length };
	const plan = planCanvasEdit(md, { oldText: "fix the heading", newText: "" }, region);
	assert.equal(plan.ok, false);
	assert.match(!plan.ok ? plan.error : "", /prompt you are answering/);
	// Changing its words is still an edit like any other.
	assert.ok(planCanvasEdit(md, { oldText: "fix the heading", newText: "fix the title" }, region).ok);
});

test("the page's trailing prompt is where the user types next: emptied, it keeps its marker", () => {
	const plan = planCanvasEdit(DOC, { oldText: "fix the heading", newText: "" });
	assert.ok(plan.ok);
	assert.match(apply(DOC, plan), /<!-- you -->\n\n\n*$/);
});
