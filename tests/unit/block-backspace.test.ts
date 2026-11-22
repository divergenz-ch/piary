// Backspace at the head of an empty block — run `pnpm build` first, then
// `node --test tests/unit/block-backspace.test.ts`.
//
// The buffer's change filter treats marker lines as structure, which left one
// gesture with nowhere to go: an empty block could be typed into existence and
// never taken back out from the keyboard. `emptyBlockBackspace` is that gesture,
// and most of what is pinned here is what it must REFUSE — a Backspace that
// quietly swallowed a paragraph would be the worse bug of the two.
import test from "node:test";
import assert from "node:assert/strict";
import { BLOCK_MARKER, blocksFrom, NOTE_MARKER, parseDocument, serializeCell, YOU_MARKER } from "../../dist/document/format.js";
import { emptyBlockBackspace, insertCellAt } from "../../dist/document/run.js";

const parse = (md: string) => {
	const { segments } = parseDocument(md);
	return { segments, blocks: blocksFrom(segments) };
};
/** The gesture, as the editor asks it: at `pos` in `md`. */
const press = (md: string, pos: number) => {
	const { segments, blocks } = parse(md);
	return emptyBlockBackspace(md, segments, blocks, pos);
};
/** Body offset of the nth segment carrying `marker`. */
const bodyOf = (md: string, marker: string, n = 0) => {
	let at = -1;
	for (let i = 0; i <= n; i++) at = md.indexOf(marker, at + 1);
	return at + marker.length + 1;
};
const kinds = (md: string) => parse(md).segments.map((s) => s.kind);

// A finished exchange with an empty markdown block under it — what the `+`
// gutter leaves behind once you delete the heading you had typed into it.
const withNote = (() => {
	const base = `${YOU_MARKER}\n\nchart it\n\n<!-- pi -->\n\nhere you go\n\n${YOU_MARKER}\n\n`;
	const at = base.lastIndexOf(YOU_MARKER);
	const s = insertCellAt(base, at, "markdown");
	return { md: base.slice(0, s.from) + s.insert + base.slice(s.to), caret: s.caret };
})();

test("the page under test has the shape the rest of these assume", () => {
	assert.deepEqual(kinds(withNote.md), ["user", "assistant", "note", "user"]);
	assert.equal(parse(withNote.md).blocks.length, 3);
});

// -- what it takes -------------------------------------------------------------

test("one press from where the caret rests takes the empty block", () => {
	// The caret sits one line below the head, on a blank line the format
	// collapses to a sliver — a rule that only fired at `bodyFrom` spent the
	// first press on something nobody can see.
	const step = press(withNote.md, withNote.caret);
	assert.ok(step?.md, "the block goes");
	assert.ok(!step.md.includes("pi:note"), "marker line and all");
	assert.deepEqual(kinds(step.md), ["user", "assistant", "user"]);
	assert.equal(step.md.slice(step.caret - 11, step.caret), "here you go", "the caret lands at the end of the block above");
});

test("every blank line of an empty body is the same press", () => {
	const { segments } = parse(withNote.md);
	const note = segments.find((s) => s.kind === "note");
	assert.ok(note, "the page under test carries the empty note");
	const seen = new Set<string>();
	for (let pos = note.bodyFrom; pos <= note.to; pos++) {
		const step = press(withNote.md, pos);
		assert.ok(step?.md, `no gesture at +${pos - note.bodyFrom}`);
		seen.add(`${step.md}@${step.caret}`);
	}
	assert.equal(seen.size, 1, "the whole blank body is one gesture, not a walk through it");
});

test("an empty prompt block goes the same way as an empty note", () => {
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n${YOU_MARKER}\n\n\n\n${NOTE_MARKER}\n\nkept\n\n${YOU_MARKER}\n\n`;
	const step = press(md, bodyOf(md, YOU_MARKER, 1) + 1);
	assert.ok(step?.md);
	assert.deepEqual(kinds(step.md), ["user", "assistant", "note", "user"], "the empty prompt block is gone, nothing else is");
	assert.ok(step.md.includes("kept"));
});

test("the fold marker binding the tail slot to the block leaves with it", () => {
	// `insertMarkdownCell`'s shape: prose, then a `pi:block` so the prompt slot
	// folds into the block the prose opened. Orphaned, that marker would fold the
	// slot into whatever block precedes it instead — a block nobody touched.
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n${NOTE_MARKER}\n\n\n\n${BLOCK_MARKER}\n\n${YOU_MARKER}\n\n`;
	assert.deepEqual(kinds(md), ["user", "assistant", "note", "block", "user"]);
	const step = press(md, bodyOf(md, NOTE_MARKER) + 1);
	assert.ok(step?.md);
	assert.deepEqual(kinds(step.md), ["user", "assistant", "user"], "the note and its fold marker both go");
	assert.equal(parse(step.md).blocks.length, 2, "the slot opens a block of its own again");
});

test("an empty prompt folded INTO a block takes only itself", () => {
	// A staged reply slot ("answer this block") the writer thought better of.
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n${BLOCK_MARKER}\n\n${YOU_MARKER}\n\n\n\n${NOTE_MARKER}\n\nkept\n\n${YOU_MARKER}\n\n`;
	const step = press(md, bodyOf(md, YOU_MARKER, 1) + 1);
	assert.ok(step?.md);
	assert.deepEqual(kinds(step.md), ["user", "assistant", "note", "user"], "the staged slot and its fold marker go");
	assert.ok(step.md.includes("a") && step.md.includes("kept"), "the block it was folded into is untouched");
});

// -- what it refuses -----------------------------------------------------------

test("a block with a headline in it is left standing", () => {
	// The whole reason this is not simply the block menu's delete on a key: one
	// press must never be able to swallow text.
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n${NOTE_MARKER}\n\n# Headline\n\n${YOU_MARKER}\n\n`;
	assert.equal(press(md, bodyOf(md, NOTE_MARKER)), null);
});

test("an empty prompt with an answer under it is not an empty block", () => {
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n${YOU_MARKER}\n\n\n\n<!-- pi -->\n\nanswered nothing\n\n${YOU_MARKER}\n\n`;
	const step = press(md, bodyOf(md, YOU_MARKER, 1) + 1);
	assert.equal(step, null, "the reply below it is content");
});

test("an attachment staged in the block counts as content", () => {
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n<!-- pi:file image/png #f1 -->\n\n![shot](blob:x)\n\n${YOU_MARKER}\n\n\n\n${NOTE_MARKER}\n\nkept\n\n${YOU_MARKER}\n\n`;
	const step = press(md, bodyOf(md, YOU_MARKER, 1) + 1);
	assert.equal(step, null, "the image would have gone with the prompt and pointed at nothing");
});

test("an artifact frame is never taken", () => {
	// `<!-- pi:artifact @app -->` carries no body at all, so "the body is empty"
	// is true of every frame on the page. Reading `opensBlock` here would have
	// made a Backspace beside a frame delete the artifact.
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n<!-- pi:artifact @app -->\n\n${serializeCell("js", "c1", "1 + 1")}\n\n${YOU_MARKER}\n\n`;
	const artifact = parse(md).segments.find((s) => s.kind === "artifact");
	assert.ok(artifact, "the page under test carries the frame");
	assert.equal(artifact.text, "", "the premise: an artifact marker has no body");
	assert.equal(press(md, artifact.bodyFrom), null);
});

test("a reply the agent wrote is not a block a keystroke removes", () => {
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\n\n\n${YOU_MARKER}\n\n`;
	assert.equal(press(md, bodyOf(md, "<!-- pi -->")), null, "an empty reply stays: only prose the writer authored goes");
});

test("the page's own trailing slot stays, and the caret leaves the dead end", () => {
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\nhere you go\n\n${YOU_MARKER}\n\n`;
	const step = press(md, md.length);
	assert.ok(step, "the press is answered");
	assert.equal(step.md, null, "nothing is deleted — it is where you type next");
	assert.equal(md.slice(step.caret - 11, step.caret), "here you go");
});

test("the only block on a page is not deletable by Backspace", () => {
	const md = `${YOU_MARKER}\n\n`;
	assert.equal(press(md, md.length), null, "nothing above to fall back to");
});

test("a caret outside any empty body is not this gesture", () => {
	const md = `${YOU_MARKER}\n\nchart it\n\n<!-- pi -->\n\nhere you go\n\n${YOU_MARKER}\n\n`;
	assert.equal(press(md, md.indexOf("chart it") + 3), null, "mid-word Backspace is ordinary Backspace");
});

test("a hand-written page with no marker at all is left to ordinary Backspace", () => {
	// The leading segment has no marker line, so there is no head to back into.
	const md = `\n\n${YOU_MARKER}\n\n`;
	assert.equal(press(md, 0), null);
});

// -- the caret --------------------------------------------------------------

test("the caret never lands inside a marker line", () => {
	// The block above ends in an artifact marker: "the last inked character
	// above" would be the end of a marker line, which the buffer covers with an
	// atomic range and keeps the caret out of.
	const md = `${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n<!-- pi:artifact @app -->\n\n${NOTE_MARKER}\n\n\n\n${YOU_MARKER}\n\n`;
	const step = press(md, bodyOf(md, NOTE_MARKER) + 1);
	assert.ok(step?.md);
	const seg = parseDocument(step.md).segments.find((s) => s.from <= step.caret && step.caret <= s.to);
	assert.ok(seg, "the caret lands inside some segment");
	assert.ok(step.caret >= seg.bodyFrom, `caret ${step.caret} is inside the ${seg.kind} marker line`);
});

test("frontmatter is not something the caret backs into", () => {
	const md = `---\npi: v1\nsession: web-x\n---\n\n${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n${NOTE_MARKER}\n\n\n\n${YOU_MARKER}\n\n`;
	const step = press(md, bodyOf(md, NOTE_MARKER) + 1);
	assert.ok(step?.md);
	assert.ok(step.caret > step.md.indexOf("---\n\n") + 4, "below the frontmatter");
	assert.ok(step.md.startsWith("---\npi: v1"), "and the frontmatter is untouched");
});
