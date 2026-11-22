// Block drag-reorder surgery — run `pnpm build` first, then `node --test tests/unit/moveblock.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { moveBlockText, deleteBlockText, parseDocument, blocksFrom, rekeyFolds, BLOCK_MARKER, NOTE_MARKER } from "../../dist/document/format.js";

const names = (md: string) => blocksFrom(parseDocument(md).segments).map((b) => b.name);
const keyOf = (md: string, name: string) => {
	const segs = parseDocument(md).segments;
	const block = blocksFrom(segs).find((b) => b.name === name);
	assert.ok(block, `no block named ${JSON.stringify(name)}`);
	return `user:${segs[block.opensAt].from}`;
};

// Q1 is markerless (leading segment); Q3's block ends in an empty reply slot.
const md =
	"Q1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\nQ2\n\n<!-- pi -->\n\nA2\n\n" +
	`<!-- you -->\n\nQ3\n\n<!-- pi -->\n\nA3\n\n${BLOCK_MARKER}\n\n<!-- you -->\n\n`;

test("move last block before first — markerless heads survive on both sides", () => {
	const next = moveBlockText(md, keyOf(md, "Q3"), keyOf(md, "Q1"));
	assert.ok(next, "the move is answered");
	assert.deepEqual(names(next), ["Q3", "Q1", "Q2"]);
	// the folded reply-slot marker stayed at the end, not inside the moved chunk
	assert.match(next, new RegExp(`${BLOCK_MARKER}\\s*\\n+\\s*<!-- you -->\\s*$`));
	assert.equal(next.match(/<!-- pi:block -->/g)?.length, 1);
});

test("move first block to the end — lands above the trailing reply slot", () => {
	const next = moveBlockText(md, keyOf(md, "Q1"), null);
	assert.ok(next, "the move is answered");
	assert.deepEqual(names(next), ["Q2", "Q3", "Q1"]);
	assert.match(next, /A1\s*\n+\s*<!-- pi:block -->\s*\n+\s*<!-- you -->\s*$/);
});

test("no-op and impossible moves return null", () => {
	assert.equal(moveBlockText(md, keyOf(md, "Q2"), keyOf(md, "Q2")), null); // onto itself
	assert.equal(moveBlockText(md, keyOf(md, "Q1"), keyOf(md, "Q2")), null); // already there
	assert.equal(moveBlockText(md, "user:9999", null), null); // unknown block
});

test("the page's empty trailing prompt does not move", () => {
	// Moved above Q2, it left A1 ending in an empty prompt: a blank paragraph
	// under a block nobody touched, and a second slot once the page repaired its end.
	const page = "<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\nQ2\n\n<!-- pi -->\n\nA2\n\n<!-- you -->\n\n";
	const segs = parseDocument(page).segments;
	const slot = `user:${segs[segs.length - 1].from}`;
	assert.equal(moveBlockText(page, slot, keyOf(page, "Q2")), null);
	assert.equal(moveBlockText(page, slot, keyOf(page, "Q1")), null);
});

test("round trip restores block order", () => {
	const there = moveBlockText(md, keyOf(md, "Q1"), keyOf(md, "Q3"));
	assert.ok(there, "the move out is answered");
	const back = moveBlockText(there, keyOf(there, "Q1"), keyOf(there, "Q2"));
	assert.ok(back, "the move back is answered");
	assert.deepEqual(names(back), ["Q1", "Q2", "Q3"]);
});

// --- deleting a block ----------------------------------------------------
//
// Same span rule as the move, which is why they share one: a block stops
// before the page's trailing reply slot, and before the fold marker that slot
// carries. Getting that wrong deletes the place you type next.

test("delete takes the block's prompt, reply and everything under it", () => {
	const next = deleteBlockText(md, keyOf(md, "Q2"));
	assert.ok(next, "the delete is answered");
	assert.deepEqual(names(next), ["Q1", "Q3"]);
	assert.ok(!next.includes("Q2"), "the prompt is gone");
	assert.ok(!next.includes("A2"), "and so is its answer");
	assert.ok(next.includes("A1") && next.includes("A3"), "the neighbours are untouched");
});

test("deleting the last block keeps the page's trailing slot", () => {
	const next = deleteBlockText(md, keyOf(md, "Q3"));
	assert.ok(next, "the delete is answered");
	assert.ok(!next.includes("Q3") && !next.includes("A3"), "the block is gone");
	assert.match(next, /<!-- you -->\s*$/, "the page still ends somewhere to write");
	// That slot was folded into Q3 by a marker. With Q3 gone the marker would
	// fold it into Q2 instead — silently changing a block nobody touched — so it
	// goes with the block, and the slot opens one of its own.
	assert.equal(next.match(/<!-- pi:block -->/g), null, "no orphaned fold marker");
	assert.deepEqual(names(next), ["Q1", "Q2", ""], "and the slot is now its own empty block");
});

test("deleting a markerless leading block leaves a valid document", () => {
	const next = deleteBlockText(md, keyOf(md, "Q1"));
	assert.ok(next, "the delete is answered");
	assert.deepEqual(names(next), ["Q2", "Q3"]);
	assert.ok(!next.includes("A1"), "its reply went with it");
	assert.match(next, /^<!-- you -->/, "and what follows still opens with its marker");
});

test("delete refuses what it cannot take", () => {
	assert.equal(deleteBlockText(md, "user:99999"), null, "an unknown key");
	// A page that is only its empty prompt slot: nothing to remove.
	const bare = "<!-- you -->\n\n";
	assert.equal(deleteBlockText(bare, keyOf(bare, "")), null, "the empty trailing slot");
});

test("deleting every block in turn empties the page without corrupting it", () => {
	let doc = md;
	for (const name of ["Q1", "Q2", "Q3"]) {
		doc = deleteBlockText(doc, keyOf(doc, name)) ?? doc;
		// Whatever is left still parses into the blocks it claims to have.
		assert.deepEqual(
			names(doc),
			blocksFrom(parseDocument(doc).segments).map((b) => b.name),
		);
	}
	assert.equal(names(doc).filter((n) => n).length, 0, "nothing named is left standing");
});

// ── Folds across a move ──────────────────────────────────────────────────────
// A fold is a block head's offset. Positional mapping cannot follow text that
// moved, so a move finds each folded head again by what it says.

/** The head offset of the block named `name` in `md`. */
const headOf = (md: string, name: string) => Number(keyOf(md, name).slice("user:".length));

test("a moved block's fold follows it", () => {
	const next = moveBlockText(md, keyOf(md, "Q1"), null);
	assert.ok(next, "the move is answered");
	assert.deepEqual(rekeyFolds(md, [headOf(md, "Q1")], next), [headOf(next, "Q1")]);
});

test("a fold on a block that did not move follows its shifted offset", () => {
	const next = moveBlockText(md, keyOf(md, "Q1"), null);
	assert.ok(next, "the move is answered");
	assert.notEqual(headOf(next, "Q2"), headOf(md, "Q2"), "the fixture shifts Q2");
	assert.deepEqual(rekeyFolds(md, [headOf(md, "Q2")], next), [headOf(next, "Q2")]);
});

test("two prompts that say the same thing keep their own folds, in order", () => {
	const twin = "<!-- you -->\n\nSame\n\n<!-- pi -->\n\nA\n\n<!-- you -->\n\nOther\n\n<!-- pi -->\n\nB\n\n<!-- you -->\n\nSame\n\n<!-- pi -->\n\nC\n\n<!-- you -->\n\n";
	const segs = parseDocument(twin).segments;
	const heads = blocksFrom(segs).map((b) => segs[b.opensAt].from);
	const next = moveBlockText(twin, `user:${heads[1]}`, null);
	assert.ok(next, "the move is answered");
	const after = blocksFrom(parseDocument(next).segments).map((b) => parseDocument(next).segments[b.opensAt].from);
	// Both "Same" blocks folded: each keeps a fold, in document order.
	assert.deepEqual(rekeyFolds(twin, [heads[0], heads[2]], next), [after[0], after[1]]);
});

test("a fold whose head no longer exists is dropped", () => {
	const next = moveBlockText(md, keyOf(md, "Q1"), null);
	assert.ok(next, "the move is answered");
	assert.deepEqual(rekeyFolds(md, [9999], next), []);
});

test("a folded block that opens with prose keeps its fold across a move", () => {
	// A re-key that matched prompts only would drop a fold on a block opened
	// by prose at any move. Matched by kind and text, it follows like any other.
	const page = `${NOTE_MARKER}\n\nNotes here\n\n<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\n`;
	const segs = parseDocument(page).segments;
	const heads = blocksFrom(segs).map((b) => segs[b.opensAt].from);
	const next = moveBlockText(page, `user:${heads[0]}`, null);
	assert.ok(next, "the move is answered");
	const noteHead = parseDocument(next).segments.find((seg) => seg.kind === "note")?.from;
	assert.deepEqual(rekeyFolds(page, [heads[0]], next), [noteHead]);
});

