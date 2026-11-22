// Removing ONE segment — run `pnpm build` first, then
// `node --test tests/unit/delete-segment.test.ts`.
//
// The scalpel beside the two knives. `deleteCell` takes a prompt with its
// answer and `deleteBlockText` takes a whole conversation; this takes what you
// pointed at, machine-written segments included. Most of what is pinned here is
// what must NOT move: a delete that quietly widened its span would be the same
// bug three times over.
import test from "node:test";
import assert from "node:assert/strict";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import type { DocSegmentKind } from "../../dist/document/format.js";
import {
	BLOCK_MARKER,
	blocksFrom,
	documentMessages,
	NOTE_MARKER,
	parseDocument,
	serializeArtifact,
	serializeCell,
	YOU_MARKER,
} from "../../dist/document/format.js";
import { artifactsFrom } from "../../dist/document/cells.js";
import { answerRange, deleteCell, deleteSegment } from "../../dist/document/run.js";

const segs = (md: string) => parseDocument(md).segments;
const kinds = (md: string) => segs(md).map((s) => s.kind);
/** Index of the nth segment of `kind` — one parse, or the objects would differ. */
const at = (md: string, kind: DocSegmentKind, n = 0) => {
	const all = segs(md);
	let seen = 0;
	for (let i = 0; i < all.length; i++) if (all[i].kind === kind && seen++ === n) return i;
	return -1;
};

// A whole turn: reasoning, a tool round trip, the reply, then a second
// exchange and the slot you type in next.
const PAGE = [
	"<!-- you -->", "", "chart it", "",
	"<!-- pi:thinking -->", "", "weighing it up", "",
	"<!-- pi:tool bash #t1 -->", "", "```json", '{"cmd":"ls"}', "```", "",
	"<!-- pi:result #t1 -->", "", "```", "a.txt", "```", "",
	"<!-- pi -->", "", "here you go", "",
	"<!-- you -->", "", "wider", "",
	"<!-- pi -->", "", "done", "",
	"<!-- you -->", "",
].join("\n");

test("the page under test has the shape the rest of these assume", () => {
	assert.deepEqual(kinds(PAGE), [
		"user", "thinking", "toolCall", "toolResult", "assistant",
		"user", "assistant", "user",
	]);
});

// -- every kind goes, and takes nothing with it --------------------------------

test("the reply goes and the prompt that asked for it stays", () => {
	// The whole point. Before this, dropping a bad answer cost you the prompt.
	const next = deleteSegment(PAGE, segs(PAGE), 4);
	assert.ok(next, "the delete is answered");
	assert.deepEqual(kinds(next), ["user", "thinking", "toolCall", "toolResult", "user", "assistant", "user"]);
	assert.ok(!next.includes("here you go"), "the answer is gone");
	assert.ok(next.includes("chart it"), "the prompt is not");
	assert.ok(next.includes("weighing it up") && next.includes("a.txt"), "and neither is the work under it");
});

test("thinking, a call and a result each go alone", () => {
	const cases: ReadonlyArray<readonly [index: number, gone: string, kept: string]> = [
		[1, "weighing it up", "here you go"],
		[2, '"cmd":"ls"', "a.txt"],
		[3, "a.txt", '"cmd":"ls"'],
	];
	for (const [index, gone, kept] of cases) {
		const next = deleteSegment(PAGE, segs(PAGE), index);
		assert.ok(next, `segment ${index} is deletable`);
		assert.ok(!next.includes(gone), `${gone} went`);
		assert.ok(next.includes(kept), `${kept} stayed`);
	}
});

test("a prompt goes WITHOUT its answer — the line between this and deleteCell", () => {
	const next = deleteSegment(PAGE, segs(PAGE), 0);
	assert.ok(next, "the delete is answered");
	assert.ok(!next.includes("chart it"), "the prompt is gone");
	assert.ok(next.includes("here you go"), "its reply is still standing");
	// …and the older gesture still means what it always meant.
	const whole = deleteCell(PAGE, segs(PAGE), 0);
	assert.ok(whole, "deleteCell is answered too");
	assert.ok(!whole.includes("chart it") && !whole.includes("here you go"), "deleteCell still takes both");
});

test("the neighbours are left alone, character for character", () => {
	const next = deleteSegment(PAGE, segs(PAGE), 1);
	assert.ok(next, "the delete is answered");
	assert.equal(next.slice(0, next.indexOf("<!-- pi:tool")), PAGE.slice(0, PAGE.indexOf("<!-- pi:thinking")));
});

test("taking the first thing on the page leaves no blank line above the second", () => {
	// There is no gap to close before the start of the file. Closing one anyway
	// opened the document on two blank lines — its lost first segment, written
	// down — and every later delete stacked another pair on top.
	const next = deleteSegment(PAGE, segs(PAGE), 0);
	assert.ok(next, "the delete is answered");
	assert.ok(!next.startsWith("\n"), `the page opens on its marker, not on air: ${JSON.stringify(next.slice(0, 20))}`);
	assert.match(next, /^<!-- pi:thinking -->/);
});

test("an opaque marker nobody understands can still be removed", () => {
	const md = `<!-- you -->\n\nq\n\n<!-- pi:future -->\n\n?\n\n${YOU_MARKER}\n\n`;
	assert.equal(kinds(md)[1], "opaque");
	const next = deleteSegment(md, segs(md), 1);
	assert.ok(next, "the delete is answered");
	assert.ok(!next.includes("pi:future"));
});

// -- what travels with the segment ---------------------------------------------

test("a fold marker leaves with the segment it binds", () => {
	// Orphaned, it would fold whatever came next into the block above instead —
	// silently changing a block nobody touched.
	const md = [
		"<!-- you -->", "", "q1", "",
		"<!-- pi -->", "", "a1", "",
		BLOCK_MARKER, "", "<!-- you -->", "", "q2", "",
		"<!-- pi -->", "", "a2", "",
		YOU_MARKER, "",
	].join("\n");
	assert.equal(blocksFrom(segs(md)).length, 2, "the fold makes q2 a continuation, not a block");
	const next = deleteSegment(md, segs(md), at(md, "user", 1));
	assert.ok(next, "the delete is answered");
	assert.ok(!next.includes("q2"), "the prompt went");
	assert.ok(!next.includes(BLOCK_MARKER), "and so did the marker that folded it");
	assert.ok(next.includes("a2"), "its reply stayed, as a prompt-only delete promises");
});

test("page material takes its fold marker too", () => {
	const md = `<!-- you -->\n\nq\n\n<!-- pi -->\n\na\n\n${BLOCK_MARKER}\n\n${NOTE_MARKER}\n\nprose\n\n${YOU_MARKER}\n\n`;
	const next = deleteSegment(md, segs(md), at(md, "note"));
	assert.ok(next, "the delete is answered");
	assert.ok(!next.includes("prose") && !next.includes(BLOCK_MARKER));
});

test("a fold marker addressed on its own un-folds what was under it", () => {
	// Removing a fold IS this: the segment below stops being a continuation.
	const md = `<!-- you -->\n\nq1\n\n<!-- pi -->\n\na1\n\n${BLOCK_MARKER}\n\n<!-- you -->\n\nq2\n\n`;
	assert.equal(blocksFrom(segs(md)).length, 1, "the fold makes q1 and q2 one block");
	const next = deleteSegment(md, segs(md), at(md, "block"));
	assert.ok(next, "the delete is answered");
	assert.equal(blocksFrom(segs(next)).length, 2, "q2 opens a block of its own now");
	assert.ok(next.includes("q1") && next.includes("q2"), "nothing else moved");
});

// -- artifacts ------------------------------------------------------------------

const TWO_TURNS = [
	"<!-- you -->", "", "chart it", "",
	"<!-- pi -->", "", "here you go", "",
	BLOCK_MARKER, serializeArtifact("app"), "", serializeCell("js", "a", "1"), "",
	"<!-- you -->", "", "wider", "",
	"<!-- pi -->", "", "done", "",
	BLOCK_MARKER, serializeArtifact("app"), "", serializeCell("js", "b", "2"), "",
	"<!-- you -->", "",
].join("\n");

test("an artifact goes whole, every declaration of its name", () => {
	// One marker's worth would leave the other turn's cells to re-derive the
	// same frame — the artifact would come back holding half of itself.
	const markers = segs(TWO_TURNS).flatMap((s, i) => (s.kind === "artifact" ? [i] : []));
	const next = deleteSegment(TWO_TURNS, segs(TWO_TURNS), markers[0]);
	assert.ok(next, "the delete is answered");
	assert.equal(artifactsFrom(next, segs(next)).length, 0, "no frame left");
	assert.ok(!next.includes("pi:artifact"), "and no marker to build one from");
	assert.ok(next.includes("here you go") && next.includes("done"), "the conversation stayed");
});

test("an artifact marker whose cells are all gone can be cleared away", () => {
	const md = `<!-- you -->\n\nq\n\n${serializeArtifact("app")}\n\n${YOU_MARKER}\n\n`;
	const next = deleteSegment(md, segs(md), at(md, "artifact"));
	assert.ok(next, "the delete is answered");
	assert.ok(!next.includes("pi:artifact"), "an emptied frame is not permanent");
});

// -- what it refuses -------------------------------------------------------------

test("delete refuses what it cannot take", () => {
	assert.equal(deleteSegment(PAGE, segs(PAGE), segs(PAGE).length - 1), null, "the trailing slot is where you type next");
	assert.equal(deleteSegment(PAGE, segs(PAGE), -1), null, "an index below the page");
	assert.equal(deleteSegment(PAGE, segs(PAGE), 99), null, "and one past it");
});

test("emptying the page hands back a page, not a hole", () => {
	// `trailingPromptRepair` declines a wholly blank document on purpose, so the
	// last delete has to supply the slot itself — frontmatter and all.
	const md = `---\nsid: x\n---\n\n<!-- pi -->\n\nstray\n\n${YOU_MARKER}\n\n`;
	const next = deleteSegment(md, segs(md), at(md, "assistant"));
	assert.ok(next, "the delete is answered");
	assert.match(next, /^---\nsid: x\n---\n\n<!-- you -->\n\n$/);
});

test("deleting every segment in turn never corrupts what is left", () => {
	let doc = PAGE;
	for (let guard = 0; guard < 20; guard++) {
		const s = segs(doc);
		const i = s.findIndex((seg, n) => deleteSegment(doc, s, n) !== null && seg);
		if (i < 0) break;
		const next = deleteSegment(doc, s, i);
		assert.ok(next, `segment ${i} reported itself deletable`);
		doc = next;
		// Whatever is left still parses into the segments it claims to have.
		assert.deepEqual(kinds(doc), parseDocument(doc).segments.map((x) => x.kind));
	}
	assert.deepEqual(kinds(doc), ["user"], "a page you can type on");
});

// -- and the transcript it rebuilds into ------------------------------------------

test("a call whose result was deleted keeps its call, and is told so", () => {
	const next = deleteSegment(PAGE, segs(PAGE), 3);
	assert.ok(next, "the delete is answered");
	const { messages } = documentMessages(next);
	const result = messages.find((m): m is ToolResultMessage => m.role === "toolResult" && m.toolCallId === "t1");
	assert.ok(result, "the call is still answered — an unanswered tool_use is what the provider rejects");
	const [part] = result.content;
	assert.ok(part?.type === "text", "the synthesized result is text");
	assert.match(part.text, /interrupted/);
});

test("a result whose call was deleted is dropped as wreckage", () => {
	const next = deleteSegment(PAGE, segs(PAGE), 2);
	assert.ok(next, "the delete is answered");
	const { messages } = documentMessages(next);
	assert.equal(messages.some((m) => m.role === "toolResult"), false, "replaying it IS the rejection");
});

test("deleting the answer makes the prompt runnable again", () => {
	// `answerRange` is what tells the menu "run" from "run again", and what the
	// re-run cuts before it writes. With the reply gone there is nothing to cut.
	assert.notEqual(answerRange(segs(PAGE), 0), null);
	const next = deleteSegment(PAGE, segs(PAGE), 4);
	// thinking / tool traffic still sit under it; take those too and it is bare.
	assert.ok(next, "the delete is answered");
	let doc = next;
	for (const kind of ["toolResult", "toolCall", "thinking"] as const) {
		const stripped = deleteSegment(doc, segs(doc), at(doc, kind));
		assert.ok(stripped, `the ${kind} segment is deletable`);
		doc = stripped;
	}
	assert.equal(answerRange(segs(doc), 0), null, "an unanswered prompt reads as 'run'");
});
