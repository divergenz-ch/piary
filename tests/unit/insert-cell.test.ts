// One way to insert a cell — run `pnpm build` first, then
// `node --test tests/unit/insert-cell.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, NOTE_MARKER, YOU_MARKER, emptyDocument } from "../../dist/document/format.js";
import type { CellMode } from "../../dist/document/run.js";
import { insertCellAt } from "../../dist/document/run.js";

/** Apply the splice the way the editor does. */
const apply = (md: string, mode: CellMode, at: number, id?: string) => {
	const s = insertCellAt(md, at, mode, id);
	return { md: md.slice(0, s.from) + s.insert + md.slice(s.to), caret: s.caret };
};

/** Which line the caret lands on, counted from the cell's marker line. */
const caretOffsetFromMarker = (md: string, caret: number, marker: string) => {
	const lines = md.split("\n");
	let at = 0;
	let caretLine = -1;
	let markerLine = -1;
	lines.forEach((l: string, i: number) => {
		if (caret >= at && caret <= at + l.length && caretLine < 0) caretLine = i;
		if (l === marker && markerLine < 0) markerLine = i;
		at += l.length + 1;
	});
	return { caretLine, markerLine, delta: caretLine - markerLine, lines };
};

/** The reference shape: the trailing prompt slot an empty page already has. */
const SLOT = emptyDocument("web-abc");

test("the trailing slot is the shape everything else must match", () => {
	const tail = parseDocument(SLOT).segments.at(-1);
	const { delta } = caretOffsetFromMarker(SLOT, SLOT.length, YOU_MARKER);
	assert.ok(tail, "the empty page ends in a segment");
	assert.equal(tail.kind, "user");
	assert.equal(delta, 2, "marker, a separator blank, then the caret's line");
});

test("a markdown cell at the end of the page lands in the slot's shape", () => {
	const md = "Q1\n\n<!-- pi -->\n\nA1\n";
	const out = apply(md, "markdown", md.replace(/\s+$/, "").length);
	const { delta } = caretOffsetFromMarker(out.md, out.caret, NOTE_MARKER);
	assert.equal(delta, 2, "same as the trailing slot");
	assert.deepEqual(parseDocument(out.md).segments.map((s) => s.kind), ["user", "assistant", "note"]);
});

test("a markdown cell mid-page lands in the same shape", () => {
	// The reported bug: the caret used to sit a line lower than this, with an
	// extra blank line under it.
	const md = `Alpha gamma\n\n${YOU_MARKER}\n\nQ2\n`;
	const out = apply(md, "markdown", "Alpha gamma".length);
	const { delta } = caretOffsetFromMarker(out.md, out.caret, NOTE_MARKER);
	assert.equal(delta, 2, "same as the trailing slot, wherever it lands");
	assert.deepEqual(parseDocument(out.md).segments.map((s) => s.kind), ["user", "note", "user"]);
});

test("typing the first character leaves a well-formed document", () => {
	// The defect this pins: the caret's own line used to double as the blank
	// line before the next marker, so the first character eaten it and the file
	// came out as `notes\n<!-- you -->`.
	const md = `Alpha gamma\n\n${YOU_MARKER}\n\nQ2\n`;
	const out = apply(md, "markdown", "Alpha gamma".length);
	const typed = out.md.slice(0, out.caret) + "notes" + out.md.slice(out.caret);
	assert.match(typed, /<!-- pi:note -->\n\nnotes\n\n<!-- you -->/, "a blank line either side of the prose");
	const segs = parseDocument(typed).segments;
	assert.deepEqual(segs.map((x) => x.kind), ["user", "note", "user"]);
	assert.equal(segs[1].text, "notes");
});

test("the caret's line is empty and inside the cell it opened", () => {
	const md = `Alpha gamma\n\n${YOU_MARKER}\n\nQ2\n`;
	const out = apply(md, "markdown", "Alpha gamma".length);
	const { lines, caretLine } = caretOffsetFromMarker(out.md, out.caret, NOTE_MARKER);
	assert.equal(lines[caretLine], "", "the caret rests on an empty line");
	const note = parseDocument(out.md).segments.find((s) => s.kind === "note");
	assert.ok(note, "the insert should have written a note segment");
	assert.ok(out.caret >= note.bodyFrom && out.caret <= note.to, "…which belongs to the new cell");
});

test("a prompt cell gets the same treatment", () => {
	const md = `Alpha gamma\n\n${YOU_MARKER}\n\nQ2\n`;
	const out = apply(md, "prompt", "Alpha gamma".length);
	const { delta } = caretOffsetFromMarker(out.md, out.caret, YOU_MARKER);
	assert.equal(delta, 2);
	assert.deepEqual(parseDocument(out.md).segments.map((s) => s.kind), ["user", "user", "user"]);
});

test("a JavaScript cell puts the caret inside its fence", () => {
	const md = `Alpha gamma\n\n${YOU_MARKER}\n\nQ2\n`;
	const out = apply(md, "js", "Alpha gamma".length, "abc123");
	const seg = parseDocument(out.md).segments.find((s) => s.kind === "cell");
	assert.ok(seg, "the insert should have written a cell segment");
	assert.equal(seg.id, "abc123");
	assert.ok(out.caret > seg.bodyFrom && out.caret < seg.to, "the caret is in the cell's body");
	assert.equal(out.md.slice(out.caret - 1, out.caret), "\n", "…on the blank line inside the fence");
	assert.ok(out.md.slice(out.caret).startsWith("\n```"), "…right before the closing fence");
});

test("inserting normalizes whatever whitespace the anchor had", () => {
	const md = `Alpha gamma   \n\n\n\n${YOU_MARKER}\n\nQ2\n`;
	const out = apply(md, "markdown", "Alpha gamma".length);
	assert.ok(!/ \n/.test(out.md), "no trailing spaces left on a line");
	// The slack the anchor carried is gone: the cell sits in the canonical shape
	// regardless of what it was dropped into.
	assert.match(out.md, /Alpha gamma\n\n<!-- pi:note -->\n\n\n\n<!-- you -->/);
});

test("an empty cell mid-page has one more body line than one at the end", () => {
	// Not an inconsistency: the extra line is the blank before the next marker,
	// which the end of the page does not need. The caret sits on the second body
	// line in both, which is what makes them feel the same.
	const atEnd = apply("Q1\n", "markdown", 2);
	const midPage = apply(`Q1\n\n${YOU_MARKER}\n\nQ2\n`, "markdown", 2);
	const body = (out: { md: string }) => {
		const note = parseDocument(out.md).segments.find((s) => s.kind === "note");
		assert.ok(note, "the insert should have written a note segment");
		return out.md.slice(note.bodyFrom, note.to);
	};
	assert.equal(body(atEnd), "\n", "a blank line, then the caret's line ends the page");
	assert.equal(body(midPage), "\n\n\n", "…plus the blank before the next marker");
	// The part that has to match, and does: where the caret sits.
	assert.equal(caretOffsetFromMarker(atEnd.md, atEnd.caret, NOTE_MARKER).delta, 2);
	assert.equal(caretOffsetFromMarker(midPage.md, midPage.caret, NOTE_MARKER).delta, 2);
});
