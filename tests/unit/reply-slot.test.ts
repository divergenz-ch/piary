// Answering a block: where a follow-up lands, and what a quoted selection
// carries into it — run `pnpm build` first, then
// `node --test tests/unit/reply-slot.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, snippetQuote, BLOCK_MARKER, YOU_MARKER } from "../../dist/document/format.js";
import { replySlot, type ReplySlot } from "../../dist/document/run.js";

// Three blocks: two answered prompts and a pending tail.
const MD = [
	"Q1",
	"",
	"<!-- pi -->",
	"",
	"A1",
	"",
	"<!-- you -->",
	"",
	"Q2",
	"",
	"<!-- pi -->",
	"",
	"A2",
	"",
	"<!-- you -->",
	"",
	"",
].join("\n");

const segs = (md: string) => parseDocument(md).segments;

/** Apply a ReplySlot the way the editor would, and report where the caret sat. */
function apply(md: string, slot: ReplySlot | null) {
	assert.ok(slot, "expected a slot");
	const { changes, caret } = slot;
	const next = Array.isArray(changes)
		? md
		: md.slice(0, changes.from) + changes.insert + md.slice(changes.to);
	return { next, caret, typed: `${next.slice(0, caret)}█${next.slice(caret)}` };
}

/** Offset of the nth occurrence of `needle`. */
const at = (md: string, needle: string, n = 1) => {
	let i = -1;
	for (let k = 0; k < n; k++) i = md.indexOf(needle, i + 1);
	assert.notEqual(i, -1, `no ${needle} #${n}`);
	return i;
};

test("the document under test has the shape the rest of these assume", () => {
	assert.deepEqual(segs(MD).map((s) => s.kind), ["user", "assistant", "user", "assistant", "user"]);
});

// -- answering a block ---------------------------------------------------------

test("a slot is staged in the block the position names, not at the foot of the page", () => {
	const { next } = apply(MD, replySlot(MD, segs(MD), at(MD, "A1")));
	// The fold marker and its prompt land under A1 — inside block 1 — and the
	// page's own trailing slot is untouched.
	assert.match(next, /A1\n\n<!-- pi:block -->\n\n<!-- you -->\n\n<!-- you -->\n\nQ2/);
	assert.equal(next.slice(MD.indexOf("Q2")).includes("A2"), true, "the page below is not rewritten");
});

test("the staged slot folds into the block, so the answer is not a new intent", () => {
	const { next } = apply(MD, replySlot(MD, segs(MD), at(MD, "Q1")));
	const kinds = segs(next).map((s) => s.kind);
	// `block` immediately before the new `user` is what makes it a fold.
	assert.deepEqual(kinds.slice(0, 4), ["user", "assistant", "block", "user"]);
});

test("the caret lands on the slot's own empty line", () => {
	const { next, caret } = apply(MD, replySlot(MD, segs(MD), at(MD, "A1")));
	const line = next.slice(next.lastIndexOf("\n", caret - 1) + 1, next.indexOf("\n", caret));
	assert.equal(line, "", "the caret is on a line of its own");
	assert.ok(next.slice(0, caret).endsWith(`${YOU_MARKER}\n`), "and it is the line under the prompt marker");
});

test("a block that already ends in an open prompt is appended to, not given a second slot", () => {
	const once = apply(MD, replySlot(MD, segs(MD), at(MD, "A1")));
	const twice = replySlot(once.next, segs(once.next), at(once.next, "A1"));
	assert.ok(twice, "the block still resolves to a slot");
	assert.deepEqual(twice.changes, [], "no second slot is staged");
	// The caret goes to the end of what is already in the slot.
	assert.equal(once.next.slice(0, twice.caret).endsWith(`${BLOCK_MARKER}\n\n${YOU_MARKER}\n`), true);
});

test("the page's trailing prompt is a slot like any other", () => {
	const slot = replySlot(MD, segs(MD), MD.length - 1);
	assert.ok(slot, "the trailing prompt resolves to a slot");
	assert.deepEqual(slot.changes, [], "the tail is already open — nothing to stage");
});

test("a document with no blocks has nowhere to answer", () => {
	assert.equal(replySlot("", segs(""), 0), null);
});

// -- quoting a selection into it -----------------------------------------------

const QUOTE = snippetQuote("A1");

test("a quote rides into the slot in the same edit that stages it", () => {
	const { next } = apply(MD, replySlot(MD, segs(MD), at(MD, "A1"), QUOTE));
	assert.match(next, /A1\n\n<!-- pi:block -->\n\n<!-- you -->\n\n> \[!snippet\]\n> A1\n/);
	// Still block 1's business — the tail below is untouched.
	assert.match(next, /<!-- you -->\n\nQ2\n/);
});

test("the caret clears the quote by a blank line, or markdown eats the question", () => {
	const { next, caret } = apply(MD, replySlot(MD, segs(MD), at(MD, "A1"), QUOTE));
	const typed = next.slice(0, caret) + "explain this" + next.slice(caret);
	// A prose line directly under a blockquote is a lazy continuation OF the
	// quote. One blank line is what keeps the question a question.
	assert.match(typed, /> A1\n\nexplain this/);
});

test("quoting into a slot that is already open appends below what is there", () => {
	// Stage the slot, type into it at the caret it handed back, then quote.
	const staged = apply(MD, replySlot(MD, segs(MD), at(MD, "A1")));
	const withText = staged.next.slice(0, staged.caret) + "first thought" + staged.next.slice(staged.caret);
	const { next } = apply(withText, replySlot(withText, segs(withText), at(withText, "A1"), QUOTE));
	assert.match(next, /first thought\n\n> \[!snippet\]\n> A1/);
});

test("a quote into the empty trailing prompt does not pad against nothing", () => {
	const { next } = apply(MD, replySlot(MD, segs(MD), MD.length - 1, QUOTE));
	// The tail slot is empty, so the quote opens it with no leading blank run.
	assert.match(next, /<!-- you -->\n\n> \[!snippet\]\n> A1\n/);
	assert.doesNotMatch(next, /<!-- you -->\n\n\n/);
});

// -- addressing ----------------------------------------------------------------

test("a position resolves to the block that OPENS at or before it", () => {
	// Inside A2 — block 2. The slot must not land in block 1.
	const { next } = apply(MD, replySlot(MD, segs(MD), at(MD, "A2")));
	assert.match(next, /A2\n\n<!-- pi:block -->\n\n<!-- you -->/);
	assert.doesNotMatch(next, /A1\n\n<!-- pi:block -->/);
});

test("an artifact folded into the block above answers there, not on its own", () => {
	const md = [
		"draw it",
		"",
		"<!-- pi -->",
		"",
		"here",
		"",
		BLOCK_MARKER, // folds the artifact into the prompt's block
		"<!-- pi:artifact @chart -->",
		"",
		"<!-- pi:cell js #a -->",
		"",
		"```js",
		"1",
		"```",
		"",
	].join("\n");
	const blocks = parseDocument(md).segments;
	// A click on the frame reports the artifact marker's offset; the fold means
	// the block that owns it opened three segments earlier.
	const { next } = apply(md, replySlot(md, blocks, md.indexOf("<!-- pi:artifact")));
	// One block, so the slot goes after the artifact — the end of that block.
	assert.match(next, /```\n\n<!-- pi:block -->\n\n<!-- you -->/);
	assert.deepEqual(
		parseDocument(next).segments.map((s) => s.kind),
		["user", "assistant", "block", "artifact", "cell", "block", "user"],
	);
});
