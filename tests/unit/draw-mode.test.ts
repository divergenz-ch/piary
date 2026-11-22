// Which way of drawing `PIARY_DRAW` names (ADR 0044). The app normalises the
// value before it starts pi, and the extension reads it again for a pi started
// anywhere else. `node --test tests/unit/draw-mode.test.ts`
import assert from "node:assert/strict";
import test from "node:test";
import { drawMode } from "../../pi-extension/draw-mode.ts";

test("only `free` is free drawing; unset, a2ui and anything else are a2ui", () => {
	assert.equal(drawMode("free"), "free");
	assert.equal(drawMode(undefined), "a2ui");
	assert.equal(drawMode("a2ui"), "a2ui");
	assert.equal(drawMode(""), "a2ui");
	assert.equal(drawMode("FREE"), "a2ui");
	assert.equal(drawMode("cells"), "a2ui");
});
