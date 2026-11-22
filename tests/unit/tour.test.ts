// The first-run tour is a document like any other, and parses as one
// (ADR 0037) — run `pnpm build` first, then `node --test tests/unit/tour.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { TOUR } from "../../app/tour.ts";
import { parseDocument } from "../../dist/document/format.js";

test("the tour is notes around a cell, a seeded exchange, and an empty prompt last", () => {
	const segments = parseDocument(TOUR).segments;
	assert.deepEqual(
		segments.map((s) => s.kind),
		["note", "cell", "note", "user", "assistant", "note", "user"],
	);
	assert.equal(segments.at(-1)!.text.trim(), "", "the tail is an empty prompt for the caret");
	assert.match(segments[3]!.text, /three names for a houseplant/);
});

test("the tour carries no line the app writes into a prompt at send time", () => {
	assert.doesNotMatch(TOUR, /^\[(now|attached|cell values|artifact)[:\]]/m);
});
