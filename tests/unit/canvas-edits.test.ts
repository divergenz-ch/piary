// What the page answers the `canvas_edit` tool (ADR 0033). Imports the .ts directly.
import assert from "node:assert/strict";
import test from "node:test";
import { CanvasEdits, EDIT_REQUEST, MAX_FAILED_EDITS, requestedEdit } from "../../app/canvas-edits.ts";

const miss = { ok: false as const, error: "not found" };

test("refused edits run out at the limit, and the last answer says stop", () => {
	const edits = new CanvasEdits();
	const said = Array.from({ length: MAX_FAILED_EDITS }, () => edits.answer(miss));
	assert.deepEqual(said.slice(0, -1), Array(MAX_FAILED_EDITS - 1).fill({ error: "not found" }));
	assert.equal((said.at(-1) as { giveUp?: true }).giveUp, true);
	assert.match((said.at(-1) as { error: string }).error, /stop, and tell the user/);
	assert.deepEqual(edits.answer({ ok: true }), { ok: true });
});

test("a fresh prompt gives the whole allowance again", () => {
	const edits = new CanvasEdits();
	for (let i = 0; i < MAX_FAILED_EDITS; i++) edits.answer(miss);
	edits.reset();
	assert.deepEqual(edits.answer(miss), { error: "not found" });
});

test("only the canvas_edit dialog, carrying both texts, is a request", () => {
	const asked = { type: "extension_ui_request", id: "e1", method: "input", title: EDIT_REQUEST, placeholder: '{"oldText":"a","newText":""}' };
	assert.deepEqual(requestedEdit(asked), { requestId: "e1", edit: { oldText: "a", newText: "" } });
	assert.equal(requestedEdit({ ...asked, title: "piary:cell-verdict" }), null);
	assert.equal(requestedEdit({ ...asked, placeholder: '{"oldText":"a"}' }), null);
	assert.equal(requestedEdit({ ...asked, placeholder: "not json" }), null);
});
