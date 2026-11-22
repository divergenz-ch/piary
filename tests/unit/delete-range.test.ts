// Deleting a dragged selection — run `pnpm build` first, then
// `node --test tests/unit/delete-range.test.ts`.
//
// The knife the buffer's change filter left no room for. `deleteSegment` takes
// what you pointed at and `deleteBlockText` takes a conversation; this takes
// what you HIGHLIGHTED, which is the only one of the three whose span the
// writer draws by hand. So most of what is pinned here is the span: exactly the
// characters inside it, the markers of the segments it covers whole, and — this
// is the whole point — not one character outside it.
import test from "node:test";
import assert from "node:assert/strict";
import {
	BLOCK_MARKER,
	documentMessages,
	NOTE_MARKER,
	parseDocument,
	serializeArtifact,
	serializeCell,
	YOU_MARKER,
} from "../../dist/document/format.js";
import { artifactsFrom } from "../../dist/document/cells.js";
import { deleteRange } from "../../dist/document/run.js";

const segs = (md: string) => parseDocument(md).segments;
const kinds = (md: string) => segs(md).map((s) => s.kind);
/** The gesture, as the editor asks it: drag from `from` to `to` in `md`. */
const drag = (md: string, from: number, to: number, insert = "") => deleteRange(md, segs(md), from, to, insert);
/** Offset of `needle` inside `md`, plus `skip` characters. */
const at = (md: string, needle: string, skip = 0) => md.indexOf(needle) + skip;

// A whole turn — reasoning, a tool round trip, the reply — then a second
// exchange, some page prose, and the slot you type in next.
const PAGE = [
	"<!-- you -->", "", "chart it", "",
	"<!-- pi:thinking -->", "", "weighing it up", "",
	"<!-- pi:tool bash #t1 -->", "", "```json", '{"cmd":"ls"}', "```", "",
	"<!-- pi:result #t1 -->", "", "```", "a.txt", "```", "",
	"<!-- pi -->", "", "here you go", "",
	NOTE_MARKER, "", "some prose", "",
	"<!-- you -->", "",
].join("\n");

test("the page under test has the shape the rest of these assume", () => {
	assert.deepEqual(kinds(PAGE), ["user", "thinking", "toolCall", "toolResult", "assistant", "note", "user"]);
});

// -- the span, and only the span ----------------------------------------------

test("mid-body to mid-body: both ends keep their heads, everything between goes", () => {
	// The gesture that did nothing at all before: drag from inside the prompt to
	// inside the reply and press Backspace.
	const step = drag(PAGE, at(PAGE, "chart it", 5), at(PAGE, "here you go", 4));
	assert.ok(step, "the drag is answered");
	assert.deepEqual(kinds(step.md), ["user", "assistant", "note", "user"], "the work between the two ends is gone");
	assert.ok(step.md.includes("chart"), "the prompt keeps what was above the selection");
	assert.ok(step.md.includes("you go"), "the reply keeps what was below it");
	assert.ok(!step.md.includes("chart it"), "and loses what was inside it");
	assert.ok(!step.md.includes("here you"), "on both sides");
});

test("the two halves do NOT merge — a marker is a role, not decoration", () => {
	// Folding the reply's leftover under the `<!-- you -->` head would make the
	// writer the author of what pi said, and the next send would replay it so.
	const step = drag(PAGE, at(PAGE, "chart it", 5), at(PAGE, "here you go", 4));
	assert.ok(step, "the drag is answered");
	const { messages } = documentMessages(step.md);
	const user = messages.find((m) => m.role === "user");
	assert.ok(user, "the prompt is still a user message");
	assert.ok(!JSON.stringify(user.content).includes("you go"), "the reply's tail is still pi's");
});

test("nothing outside the span moves, character for character", () => {
	const from = at(PAGE, "here you go", 4);
	const step = drag(PAGE, from, at(PAGE, "some prose", 4));
	assert.ok(step, "the drag is answered");
	assert.equal(step.md.slice(0, from), PAGE.slice(0, from), "everything above the drag is byte-identical");
	assert.ok(step.md.endsWith(`prose\n\n${YOU_MARKER}\n`), "and everything below it");
});

test("a span that covers only whole segments takes only those", () => {
	const step = drag(PAGE, at(PAGE, "<!-- pi:thinking -->"), at(PAGE, "<!-- pi -->\n\nhere"));
	assert.ok(step, "the drag is answered");
	assert.deepEqual(kinds(step.md), ["user", "assistant", "note", "user"]);
	assert.ok(step.md.includes("chart it") && step.md.includes("here you go"), "the turn around them is untouched");
});

// -- what the span leaves standing ---------------------------------------------

test("a head emptied of all its text is left standing, not swallowed", () => {
	// One gesture must never take more than it was shown. The empty block that
	// is left is `emptyBlockBackspace`'s business, and one more press takes it.
	const body = at(PAGE, NOTE_MARKER) + NOTE_MARKER.length + 2;
	const step = drag(PAGE, body, PAGE.lastIndexOf(YOU_MARKER) + YOU_MARKER.length + 2);
	assert.ok(step);
	assert.ok(step.md.includes(NOTE_MARKER), "the note's head is still there");
	assert.ok(!step.md.includes("some prose"), "its body is not");
	const note = segs(step.md).find((s) => s.kind === "note");
	assert.ok(note, "the note segment survived");
	assert.equal(note.text, "", "an empty block, with the caret in it");
	assert.equal(step.caret, note.bodyFrom, "and never inside the marker line above it");
});

test("the page's own trailing slot survives a drag that runs into it", () => {
	const step = drag(PAGE, at(PAGE, "some prose", 4), PAGE.length);
	assert.ok(step);
	assert.match(step.md, /<!-- you -->\n*$/, "it is where you type next");
	assert.deepEqual(kinds(step.md), ["user", "thinking", "toolCall", "toolResult", "assistant", "note", "user"]);
});

test("a fence the drag ends inside survives whole", () => {
	// Half a fence is not a document: the cell compiler reports errors in code
	// nobody wrote. Snap INWARD — the fence keeps every character it had.
	const step = drag(PAGE, at(PAGE, "chart it", 5), at(PAGE, '{"cmd":"ls"}', 6));
	assert.ok(step);
	assert.ok(step.md.includes('{"cmd":"ls"}'), "the call's payload is intact");
	assert.deepEqual(kinds(step.md), ["user", "toolCall", "toolResult", "assistant", "note", "user"], "only the thinking between them went");
});

test("a fence the drag starts inside survives whole too", () => {
	const step = drag(PAGE, at(PAGE, "a.txt", 2), at(PAGE, "here you go", 4));
	assert.ok(step);
	assert.ok(step.md.includes("a.txt"), "the result's payload is intact");
	assert.ok(step.md.includes("you go") && !step.md.includes("here you"), "and the reply lost exactly its head");
});

// -- what travels with a covered segment ---------------------------------------

test("a fold marker inside the span goes with the block it bound", () => {
	// Orphaned, it would fold whatever came next into the block above instead —
	// silently changing a block nobody touched.
	const md = `${YOU_MARKER}\n\nq1\n\n<!-- pi -->\n\na1\n\n${BLOCK_MARKER}\n\n${YOU_MARKER}\n\nq2\n\n<!-- pi -->\n\na2\n\n${YOU_MARKER}\n\n`;
	const step = drag(md, at(md, "a1", 1), at(md, "a2", 1));
	assert.ok(step);
	assert.ok(!step.md.includes(BLOCK_MARKER), "the fold left with the prompt it folded");
	assert.ok(!step.md.includes("q2"), "and so did the prompt itself");
	// Two replies in a row, because that is what was left: the span ended inside
	// the second one, so its head stands over the tail of its own text.
	assert.deepEqual(kinds(step.md), ["user", "assistant", "assistant", "user"]);
	assert.ok(step.md.includes("q1"), "the block above the span is untouched");
});

test("an artifact the span covers takes every declaration of its name", () => {
	// One marker's worth would leave the other turn's cells to re-derive the same
	// frame — the artifact would come back holding half of itself.
	const md = [
		YOU_MARKER, "", "chart it", "",
		"<!-- pi -->", "", "here you go", "",
		BLOCK_MARKER, serializeArtifact("app"), "", serializeCell("js", "a", "1"), "",
		YOU_MARKER, "", "wider", "",
		"<!-- pi -->", "", "done", "",
		BLOCK_MARKER, serializeArtifact("app"), "", serializeCell("js", "b", "2"), "",
		YOU_MARKER, "",
	].join("\n");
	const step = drag(md, at(md, "done", 2), md.lastIndexOf(YOU_MARKER) + YOU_MARKER.length + 2);
	assert.ok(step);
	assert.equal(artifactsFrom(step.md, segs(step.md)).length, 0, "no frame left");
	assert.ok(!step.md.includes("pi:artifact"), "and no marker to build one from");
	assert.ok(step.md.includes("here you go"), "the conversation stayed");
});

// -- refusals ------------------------------------------------------------------

test("a selection inside ONE body is not this gesture", () => {
	// No marker is crossed, so the buffer's own delete already handles it, and
	// taking it here would only mean re-implementing it worse.
	assert.equal(drag(PAGE, at(PAGE, "chart it"), at(PAGE, "chart it", 5)), null);
	assert.equal(drag(PAGE, at(PAGE, "here you go"), at(PAGE, "here you go", 4)), null);
});

test("an empty span is not a delete", () => {
	assert.equal(drag(PAGE, 12, 12), null);
	assert.equal(drag(PAGE, 40, 12), null, "and neither is a backwards one");
});

test("frontmatter is not content a drag can reach", () => {
	const md = `---\npi: v1\nsession: web-x\n---\n\n${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n${YOU_MARKER}\n\n`;
	const step = drag(md, 0, at(md, "a\n\n<!-- you", 1));
	assert.ok(step);
	assert.ok(step.md.startsWith("---\npi: v1\nsession: web-x\n---"), "the frontmatter is untouched");
});

test("emptying the page hands back a page, not a hole", () => {
	// `trailingPromptRepair` declines a wholly blank document on purpose, so the
	// last delete has to supply the slot itself — frontmatter and all.
	const md = `---\nsid: x\n---\n\n${YOU_MARKER}\n\nq\n\n<!-- pi -->\n\na\n\n${YOU_MARKER}\n\n`;
	const step = drag(md, at(md, "q\n"), md.length);
	assert.ok(step);
	assert.match(step.md, /^---\nsid: x\n---\n\n<!-- you -->\n\n$/);
});

// -- the same surgery, with something typed into it ------------------------------

test("what you type over a selection lands where the selection was", () => {
	const step = drag(PAGE, at(PAGE, "chart it", 5), at(PAGE, "here you go", 4), "X");
	assert.ok(step);
	assert.ok(step.md.includes("chartX"), "the character is at the junction");
	assert.equal(step.md[step.caret - 1], "X", "and the caret is behind it");
	assert.deepEqual(kinds(step.md), ["user", "assistant", "note", "user"], "the span still went");
});

test("a paste over a selection is the same gesture, longer", () => {
	const step = drag(PAGE, at(PAGE, "chart it", 5), at(PAGE, "some prose", 4), " everything");
	assert.ok(step);
	assert.ok(step.md.includes("chart everything"));
	assert.ok(step.md.includes("prose"), "the tail of the segment it ended in stayed");
});

// -- and the transcript it rebuilds into -------------------------------------------

test("every span leaves a transcript the provider will take", () => {
	// An unanswered `tool_use` is what gets a send rejected outright. Sweep every
	// boundary pair on the page and assert the shape survives all of them.
	const stops = [
		at(PAGE, "chart it", 4), at(PAGE, "weighing it up", 4), at(PAGE, "a.txt", 2),
		at(PAGE, "here you go", 4), at(PAGE, "some prose", 4),
	];
	for (const from of stops)
		for (const to of stops) {
			const step = drag(PAGE, from, to);
			if (!step) continue;
			const { messages } = documentMessages(step.md);
			const calls = new Set(messages.flatMap((m) => (m.role === "assistant" ? (m.content ?? []) : []))
				.filter((c) => c.type === "toolCall").map((c) => c.id));
			for (const m of messages)
				if (m.role === "toolResult")
					assert.ok(calls.has(m.toolCallId), `orphan result after ${from}..${to}`);
			assert.deepEqual(kinds(step.md), parseDocument(step.md).segments.map((s) => s.kind));
		}
});

test("a span that stops AT a marker keeps the blank line holding it on its own line", () => {
	// The drag a role label catches: `atomicRanges` parks the endpoint on the
	// marker's first character, so the span ends where the marker begins and the
	// clip rule never sees it. A plain delete then closed the gap and left
	// `chart<!-- pi -->` on one line — and a marker mid-line is not a marker, so
	// the reply stopped being a turn and its text became part of the prompt.
	const step = drag(PAGE, at(PAGE, "chart it", 5), at(PAGE, "<!-- pi:thinking -->"));
	assert.ok(step);
	assert.deepEqual(kinds(step.md), kinds(PAGE), "every turn is still a turn");
	assert.ok(step.md.includes("chart\n\n<!-- pi:thinking -->"), "one blank line, no more and no less");
	assert.ok(!step.md.includes("chart it"), "and the span still went");
});

test("neither end of a span may come to rest inside a marker line", () => {
	// Unreachable with a pointer — the buffer covers marker lines with atomic
	// ranges — but a span from code used to invert here, and `cutSpans` answered
	// an inverted span by DUPLICATING the text between its ends.
	const mark = at(PAGE, "<!-- pi:thinking -->");
	assert.equal(drag(PAGE, mark + 3, mark + 10), null, "a span wholly inside one marker is nothing");
	const step = drag(PAGE, at(PAGE, "chart it", 5), mark + 10);
	assert.ok(step);
	assert.ok(!step.md.includes("<!-\n"), "no half marker");
	assert.deepEqual(kinds(step.md), kinds(PAGE), "the thinking segment is untouched — the span stopped in front of it");
	// One rule for both ends: an end in a marker line never takes that marker. A
	// span that starts in one and stays in the body under it is therefore a span
	// inside a single body, which is the buffer's own delete.
	assert.equal(drag(PAGE, mark + 3, at(PAGE, "weighing it up", 4)), null);
	const step2 = drag(PAGE, mark + 3, at(PAGE, "here you go", 4));
	assert.ok(step2);
	assert.ok(step2.md.includes("<!-- pi:thinking -->"), "the marker its end fell in survived whole");
	assert.ok(!step2.md.includes("weighing"), "and the body under it went");
});

test("no span on the page ever invents a character or lengthens it", () => {
	// The anti-widening net. Drag from every offset to every other offset on the
	// page and check the two things a delete can never do: put something there
	// that was not there, or hand back more than it was given. A rule that
	// rounded the span out to whole blocks — the other way this could have been
	// answered — fails the second one on the first drag that overshoots.
	const ink = (s: string) => s.replace(/\s+/g, "");
	const whole = ink(PAGE);
	for (let from = 0; from <= PAGE.length; from += 3)
		for (let to = from; to <= PAGE.length; to += 7) {
			const step = drag(PAGE, from, to);
			if (!step) continue;
			const got = ink(step.md);
			assert.ok(got.length <= whole.length, `${from}..${to} grew the page`);
			// Every character of the result, in order, comes from the original.
			let at = 0;
			for (const ch of got) {
				at = whole.indexOf(ch, at);
				assert.ok(at >= 0, `${from}..${to} invented ${JSON.stringify(ch)}`);
				at++;
			}
			assert.deepEqual(kinds(step.md), parseDocument(step.md).segments.map((s) => s.kind));
		}
});
