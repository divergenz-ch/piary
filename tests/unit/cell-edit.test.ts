// Editing a cell: mode, duplicate, delete — run `pnpm build` first, then
// `node --test tests/unit/cell-edit.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
	parseDocument,
	documentMessages,
	messagesFrom,
	serializeMessages,
	blocksFrom,
	blockKeyOf,
	deleteBlockText,
	serializeArtifact,
	serializeCell,
	NOTE_MARKER,
	BLOCK_MARKER,
} from "../../dist/document/format.js";
import { artifactsFrom } from "../../dist/document/cells.js";
import { cellMode, setCellMode, duplicateCell, deleteCell, cellSpan, moveCell, moveCellByOffset } from "../../dist/document/run.js";

const segs = (md: string) => parseDocument(md).segments;
const kinds = (md: string) => segs(md).map((s) => s.kind);

const PAGE = `${NOTE_MARKER}\n\n## Q3 revenue\n\nprose\n\n${BLOCK_MARKER}\n\n<!-- you -->\n\nchart it\n\n<!-- pi -->\n\nhere you go\n\n<!-- you -->\n\n`;

test("the page under test has the shape the rest of these assume", () => {
	assert.deepEqual(kinds(PAGE), ["note", "block", "user", "assistant", "user"]);
});

// -- which cells have a mode ------------------------------------------------------

test("cellMode names the authored kinds and refuses the rest", () => {
	const s = segs(PAGE);
	assert.equal(cellMode(s[0]), "markdown");
	assert.equal(cellMode(s[2]), "prompt");
	assert.equal(cellMode(s[3]), null, "a reply has no mode control in v1");
	assert.equal(cellMode(s[1]), null, "a fold marker is not a cell");
});

// -- changing the mode ------------------------------------------------------------

test("markdown becomes a prompt — a marker rewrite and nothing else", () => {
	const s = segs(PAGE);
	const next = setCellMode(PAGE, s[0], "prompt");
	assert.ok(next, "the mode change is answered");
	assert.deepEqual(kinds(next), ["user", "block", "user", "assistant", "user"]);
	assert.ok(next.startsWith("<!-- you -->\n\n## Q3 revenue\n\nprose"));
});

test("a prompt becomes markdown and keeps its answer", () => {
	const s = segs(PAGE);
	const next = setCellMode(PAGE, s[2], "markdown");
	assert.ok(next, "the mode change is answered");
	assert.deepEqual(kinds(next), ["note", "block", "note", "assistant", "user"]);
	assert.ok(next.includes("here you go"), "the answer stays — deleting is a separate act");
	// …and the pair the model sees is well formed.
	const msgs = documentMessages(next).messages;
	assert.deepEqual(msgs.map((m) => m.role), ["custom", "custom", "assistant"]);
});

test("markdown ⇄ prompt round-trips to the identical document", () => {
	const s = segs(PAGE);
	const there = setCellMode(PAGE, s[0], "prompt");
	assert.ok(there, "the mode change out is answered");
	const back = setCellMode(there, segs(there)[0], "markdown");
	assert.equal(back, PAGE);
});

test("switching to the mode a cell already is changes nothing", () => {
	const s = segs(PAGE);
	assert.equal(setCellMode(PAGE, s[0], "markdown"), null);
	assert.equal(setCellMode(PAGE, s[2], "prompt"), null);
});

test("a reply has no mode control", () => {
	assert.equal(setCellMode(PAGE, segs(PAGE)[3], "markdown"), null);
});

test("prose becomes a code cell with a fenced body and a stable id", () => {
	const md = `${NOTE_MARKER}\n\n1 + 1\n`;
	const next = setCellMode(md, segs(md)[0], "js", "abc123");
	assert.ok(next, "the mode change is answered");
	assert.deepEqual(kinds(next), ["cell"]);
	assert.equal(segs(next)[0].id, "abc123");
	assert.match(next, /```js\n1 \+ 1\n```/);
});

test("a body carrying backticks is fenced wide enough to survive", () => {
	const md = `${NOTE_MARKER}\n\nuse \`\`\`js fences\n`;
	const next = setCellMode(md, segs(md)[0], "js", "abc123");
	assert.ok(next, "the mode change is answered");
	assert.deepEqual(kinds(next), ["cell"], "the fence must not close early");
	assert.ok(next.includes("````"));
});

// -- duplicate ----------------------------------------------------------------------

test("duplicating a prompt puts a fresh copy below it, with no answer", () => {
	const s = segs(PAGE);
	const next = duplicateCell(PAGE, s[2]);
	assert.ok(next, "the duplicate is answered");
	assert.deepEqual(kinds(next), ["note", "block", "user", "user", "assistant", "user"]);
	const users = segs(next).filter((x) => x.kind === "user" && x.text);
	assert.deepEqual(users.map((u) => u.text), ["chart it", "chart it"]);
});

test("a duplicated code cell gets a fresh id — a copy stands beside, it does not redefine", () => {
	const md = "<!-- pi:cell js #aaa -->\n\n```js\n1\n```\n";
	const next = duplicateCell(md, segs(md)[0], "bbb");
	assert.ok(next, "the duplicate is answered");
	assert.deepEqual(segs(next).map((x) => x.id), ["aaa", "bbb"]);
});

test("duplicating page material copies the prose", () => {
	const next = duplicateCell(PAGE, segs(PAGE)[0]);
	assert.ok(next, "the duplicate is answered");
	assert.deepEqual(kinds(next), ["note", "note", "block", "user", "assistant", "user"]);
});

// -- delete ---------------------------------------------------------------------------

test("deleting a prompt takes its answer with it", () => {
	const next = deleteCell(PAGE, segs(PAGE), 2);
	assert.ok(next, "the delete is answered");
	assert.deepEqual(kinds(next), ["note", "user"], "prompt, answer and its fold marker all go");
	assert.ok(!next.includes("here you go"));
	assert.ok(next.includes("prose"), "the page material above is untouched");
});

test("deleting page material leaves the prompt below it standing", () => {
	const next = deleteCell(PAGE, segs(PAGE), 0);
	assert.ok(next, "the delete is answered");
	assert.ok(next.includes("chart it"));
	assert.ok(!next.includes("prose"));
});

test("deleteCell will not take a reply — that is `deleteSegment`'s job", () => {
	// This gesture is "the cell, and what answered it". A reply is neither, and
	// widening it here would have made "delete the prompt" mean two things.
	assert.equal(deleteCell(PAGE, segs(PAGE), 3), null);
});

test("cellSpan stops at the cell's last inked character", () => {
	const s = segs(PAGE);
	assert.equal(PAGE.slice(...Object.values(cellSpan(PAGE, s[0]))), `${NOTE_MARKER}\n\n## Q3 revenue\n\nprose`);
});

// -- move ---------------------------------------------------------------------------

test("a prompt moves with its answer", () => {
	const s = segs(PAGE);
	// Move the prompt (index 2, with its reply) above the page material.
	const next = moveCell(PAGE, s, 2, 0);
	assert.ok(next, "the move is answered");
	assert.deepEqual(kinds(next), ["user", "assistant", "note", "user"]);
	const order = next.indexOf("chart it") < next.indexOf("prose");
	assert.ok(order, "the prompt and its answer landed above the prose");
	assert.ok(next.includes("here you go"), "the answer travelled with it");
});

test("page material moves below the prompt", () => {
	const s = segs(PAGE);
	const next = moveCell(PAGE, s, 0, null);
	assert.ok(next, "the move is answered");
	assert.ok(next.indexOf("prose") > next.indexOf("chart it"));
	assert.deepEqual(kinds(next), ["user", "assistant", "note", "user"]);
});

test("a move to the end parks above the pending prompt, never below it", () => {
	const next = moveCell(PAGE, segs(PAGE), 0, null);
	assert.ok(next, "the move is answered");
	assert.equal(kinds(next).at(-1), "user", "the empty slot stays last");
	const last = segs(next).at(-1);
	assert.ok(last, "the page has a last segment");
	assert.equal(last.text, "", "…and stays empty");
});

test("moving a cell onto itself is a no-op", () => {
	assert.equal(moveCell(PAGE, segs(PAGE), 0, 0), null);
});

test("a reply cannot be moved on its own", () => {
	assert.equal(moveCell(PAGE, segs(PAGE), 3, 0), null);
});

test("the page's empty trailing prompt is not a cell to move", () => {
	// Dropped above the note, it left a bare prompt marker there and a block
	// nobody touched ending in an empty prompt.
	assert.equal(moveCell(PAGE, segs(PAGE), 4, 0), null);
	assert.equal(moveCell(PAGE, segs(PAGE), 4, 2), null);
});

test("a moved page stays a valid document and rebuilds in the new order", () => {
	const next = moveCell(PAGE, segs(PAGE), 2, 0);
	assert.ok(next, "the move is answered");
	const msgs = documentMessages(next).messages;
	assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "custom"]);
});

test("moving a bare leading prompt below something keeps its marker", () => {
	const md = `bare lead\n\n${NOTE_MARKER}\n\nprose\n`;
	assert.deepEqual(kinds(md), ["user", "note"]);
	const next = moveCell(md, segs(md), 0, null);
	assert.ok(next, "the move is answered");
	assert.deepEqual(kinds(next), ["note", "user"]);
	assert.equal(segs(next)[1].text, "bare lead");
});

test("moving onto a bare leading cell gives that one a marker too", () => {
	const md = `bare lead\n\n${NOTE_MARKER}\n\nprose\n`;
	const next = moveCell(md, segs(md), 1, 0);
	assert.ok(next, "the move is answered");
	assert.deepEqual(kinds(next), ["note", "user"]);
	assert.equal(segs(next)[0].text, "prose");
	assert.equal(segs(next)[1].text, "bare lead");
});

test("a moved cell opens a block where it lands, and leaves no stale fold behind", () => {
	const s = segs(PAGE);
	// The prompt's fold marker binds it to the prose above; move it to the top.
	const next = moveCell(PAGE, s, 2, 0);
	assert.ok(next, "the move is answered");
	assert.ok(!next.startsWith(BLOCK_MARKER), "the marker did not travel");
	assert.equal(kinds(next).filter((k) => k === "block").length, 0, "and none was stranded");
});

test("moving the cell a fold pointed at leaves no leading marker", () => {
	const next = moveCell(PAGE, segs(PAGE), 0, null);
	assert.ok(next, "the move is answered");
	assert.notEqual(kinds(next)[0], "block");
});

// -- move by offset: what a drag reports ------------------------------------------
//
// The canvas's drag names cells by where their markers sit, not by index
// (`cell-move`'s `{from, beforeFrom}`), and the host resolves those offsets
// against the document as it is when the drop lands.

test("a move by offsets is the move by indices", () => {
	const s = segs(PAGE);
	assert.equal(moveCellByOffset(PAGE, s[2].from, s[0].from), moveCell(PAGE, s, 2, 0));
});

test("an offset no cell starts at moves nothing", () => {
	const s = segs(PAGE);
	assert.equal(moveCellByOffset(PAGE, s[2].from + 1, s[0].from), null);
});

test("an end-of-page drop parks the cell above the pending prompt", () => {
	const s = segs(PAGE);
	const next = moveCellByOffset(PAGE, s[0].from, null);
	assert.ok(next, "the move is answered");
	assert.equal(next, moveCell(PAGE, s, 0, null));
	assert.equal(segs(next).at(-1)?.text, "", "the empty slot stays last");
});

test("a drop gap that names no cell sends the cell to the end, not nowhere", () => {
	// The gap's offset went stale under the drag: that reads as "the end",
	// never as "refuse".
	const s = segs(PAGE);
	const next = moveCellByOffset(PAGE, s[0].from, s[2].from + 1);
	assert.ok(next, "the move is answered");
	assert.equal(next, moveCell(PAGE, s, 0, null));
});

// -- an artifact moves and goes whole ------------------------------------------------
//
// One frame on the page, several spans in the text: a turn that adds to an
// existing artifact writes the marker again, because it cannot reach into a
// block a hundred lines above. Everything below is about the two never
// disagreeing.

/** Two turns, each adding a cell to @app — the shape every multi-turn artifact
 *  has, fold markers and all. */
const TWO_TURNS = [
	"<!-- you -->", "", "chart it", "",
	"<!-- pi -->", "", "here you go", "",
	BLOCK_MARKER, serializeArtifact("app"), "", serializeCell("js", "a", "1"), "",
	"<!-- you -->", "", "wider", "",
	"<!-- pi -->", "", "done", "",
	BLOCK_MARKER, serializeArtifact("app"), "", serializeCell("js", "b", "2"), "",
	"<!-- you -->", "",
].join("\n");

const artifactsOf = (md: string) => artifactsFrom(md, parseDocument(md).segments);
/** Index of the nth `pi:artifact` marker. */
const markerAt = (md: string, n: number) => segs(md).findIndex((s, i, all) => s.kind === "artifact" && all.slice(0, i).filter((p) => p.kind === "artifact").length === n);

test("the artifact under test is one frame written across two turns", () => {
	const [art] = artifactsOf(TWO_TURNS);
	assert.equal(artifactsOf(TWO_TURNS).length, 1, "two markers, one artifact");
	assert.deepEqual(art.members.map((m) => m.id), ["a", "b"]);
	assert.equal(segs(TWO_TURNS).filter((s) => s.kind === "artifact").length, 2, "…declared twice");
});

test("moving an artifact carries every declaration of its name", () => {
	// It used to carry the addressed marker's run alone, so the cells of every
	// other turn stayed where they were — still members of the frame you thought
	// you had just picked up.
	const next = moveCell(TWO_TURNS, segs(TWO_TURNS), markerAt(TWO_TURNS, 0), 0);
	assert.ok(next, "the move is answered");
	const [art] = artifactsOf(next);
	assert.deepEqual(art.members.map((m) => m.id), ["a", "b"], "both cells travelled");
	assert.equal(segs(next).filter((s) => s.kind === "artifact").length, 1, "gathered under one marker");
	assert.ok(next.startsWith(serializeArtifact("app")), "…where it was dropped");
});

test("a moved artifact opens a block of its own", () => {
	// The repeat rule in `blocksFrom` opens nothing for a name already declared
	// above — so a marker dropped below its own siblings joined whatever block it
	// landed in, silently. Gathering leaves one declaration, which opens.
	const next = moveCell(TWO_TURNS, segs(TWO_TURNS), markerAt(TWO_TURNS, 0), null);
	assert.ok(next, "the move is answered");
	const s = segs(next);
	const own = blocksFrom(s).find((b) => s[b.opensAt].kind === "artifact");
	assert.ok(own, "the artifact is a block, not a member of the turn above it");
	assert.deepEqual(own.members.map((i) => s[i].kind), ["artifact", "cell", "cell"]);
});

test("deleting the turn an artifact came from leaves the moved artifact standing", () => {
	// The bug this pair of rules used to make between them: move the artifact out
	// of a turn, delete the turn, lose the artifact.
	const moved = moveCell(TWO_TURNS, segs(TWO_TURNS), markerAt(TWO_TURNS, 0), null);
	assert.ok(moved, "the move is answered");
	const s = segs(moved);
	const turn = blocksFrom(s).find((b) => s[b.opensAt].text === "wider");
	assert.ok(turn, "the second turn is a block");
	const next = deleteBlockText(moved, blockKeyOf(s, turn));
	assert.ok(next, "the delete is answered");
	assert.ok(!next.includes("wider"), "the turn went");
	assert.deepEqual(artifactsOf(next)[0]?.members.map((m) => m.id), ["a", "b"], "the artifact did not");
});

test("deleting a turn keeps the artifact that turn made", () => {
	// The rail's delete takes the conversation. The artifact is what the turn
	// MADE, and it has a delete of its own on its own frame.
	const s = segs(TWO_TURNS);
	const turn = blocksFrom(s).find((b) => s[b.opensAt].text === "chart it");
	assert.ok(turn, "the first turn is a block");
	const next = deleteBlockText(TWO_TURNS, blockKeyOf(s, turn));
	assert.ok(next, "the delete is answered");
	assert.ok(!next.includes("chart it") && !next.includes("here you go"), "prompt and reply went");
	assert.deepEqual(artifactsOf(next)[0].members.map((m) => m.id), ["a", "b"], "every cell stayed");
});

test("…and the cells it keeps are still one artifact, not two", () => {
	// The kept marker of a name declared in an earlier turn opens no block — the
	// frame is up there already, and these members gather to it.
	const s = segs(TWO_TURNS);
	const turn = blocksFrom(s).find((b) => s[b.opensAt].text === "wider");
	assert.ok(turn, "the second turn is a block");
	const next = deleteBlockText(TWO_TURNS, blockKeyOf(s, turn));
	assert.ok(next, "the delete is answered");
	assert.equal(artifactsOf(next).length, 1);
	assert.deepEqual(artifactsOf(next)[0].members.map((m) => m.id), ["a", "b"]);
});

test("deleting the artifact's own block takes the artifact", () => {
	// Moved out of its turn, the rail entry names the artifact rather than a
	// conversation — so there the delete means what it says.
	const moved = moveCell(TWO_TURNS, segs(TWO_TURNS), markerAt(TWO_TURNS, 0), null);
	assert.ok(moved, "the move is answered");
	const s = segs(moved);
	const own = blocksFrom(s).find((b) => s[b.opensAt].kind === "artifact");
	assert.ok(own, "the moved artifact is a block of its own");
	const next = deleteBlockText(moved, blockKeyOf(s, own));
	assert.ok(next, "the delete is answered");
	assert.deepEqual(artifactsOf(next), []);
	assert.ok(next.includes("chart it") && next.includes("wider"), "the conversation stays");
});

test("deleting an artifact takes every declaration of its name", () => {
	// Leftovers would re-derive as an artifact of the same name — the frame you
	// deleted, back, holding half its cells.
	const next = deleteCell(TWO_TURNS, segs(TWO_TURNS), markerAt(TWO_TURNS, 0));
	assert.ok(next, "the delete is answered");
	assert.deepEqual(artifactsOf(next), [], "nothing left to re-derive");
	assert.ok(next.includes("wider") && next.includes("here you go"), "the prose of both turns stays");
});

// -- two artifacts, nothing between them --------------------------------------------
//
// The view's drop targets used to bottom out here: the only gaps between two
// adjacent frames are the frames' own, and those asked for "the end of the
// page". The splice below is what a correct drop calls, so this pins the layer
// the fixed gap now depends on.

/** @alpha then @beta, back to back, no prose in the seam. */
const ADJACENT = [
	"<!-- you -->", "", "draw two things", "",
	"<!-- pi -->", "", "here they are", "",
	BLOCK_MARKER, serializeArtifact("alpha"), "", serializeCell("js", "a", "1"), "",
	BLOCK_MARKER, serializeArtifact("beta"), "", serializeCell("js", "b", "2"), "",
	"<!-- you -->", "",
].join("\n");

test("the artifacts under test are two frames with nothing in between", () => {
	assert.deepEqual(artifactsOf(ADJACENT).map((a) => a.key), ["@alpha", "@beta"]);
	const s = segs(ADJACENT);
	const beta = markerAt(ADJACENT, 1);
	assert.ok(
		s.slice(markerAt(ADJACENT, 0) + 1, beta).every((seg) => seg.kind === "cell" || seg.kind === "block"),
		"only alpha's own cell and a fold marker separate them",
	);
});

test("the lower of two adjacent artifacts moves above the upper one", () => {
	const next = moveCell(ADJACENT, segs(ADJACENT), markerAt(ADJACENT, 1), markerAt(ADJACENT, 0));
	assert.ok(next, "the move is not refused");
	const after = artifactsOf(next);
	assert.deepEqual(after.map((a) => a.key), ["@beta", "@alpha"], "the order flipped");
	assert.deepEqual(after.map((a) => a.members.map((m) => m.id)), [["b"], ["a"]], "each kept its own cell");
});

test("…and the upper one dropped above the lower one reorders nothing", () => {
	// It is already there. The splice still runs — the fold marker a move cuts
	// from the origin does not travel with it — so the text is not identical,
	// but nothing about the page changes.
	const next = moveCell(ADJACENT, segs(ADJACENT), markerAt(ADJACENT, 0), markerAt(ADJACENT, 1));
	const after = artifactsOf(next ?? ADJACENT);
	assert.deepEqual(after.map((a) => a.key), ["@alpha", "@beta"], "the order held");
	assert.deepEqual(after.map((a) => a.members.map((m) => m.id)), [["a"], ["b"]], "…and so did the cells");
});

test("a frame dropped on its own gap is refused outright", () => {
	// Which is what the view now asks for when you drop an artifact where it
	// already is. It used to ask for "the end of the page" instead, and got a
	// rewrite that moved nothing.
	assert.equal(moveCell(ADJACENT, segs(ADJACENT), markerAt(ADJACENT, 0), markerAt(ADJACENT, 0)), null);
	assert.equal(moveCell(ADJACENT, segs(ADJACENT), markerAt(ADJACENT, 1), markerAt(ADJACENT, 1)), null);
});

// -- cells and blocks: document → messages → document ------------------------------
//
// A cell mid-conversation opens no block: it is material — the artifact a turn
// produced, or one you inserted into the block you were reading — and the rail
// is a list of intents. `blocksFrom` decides that from the document, which is
// why these fixtures round-trip identically whether or not a fold marker is
// present: the serializer's guess no longer changes what the rail shows. What
// still has to agree is message SHAPE — documentMessages flushes so an inserted
// cell stays its own message rather than merging into the answer above it.
//
// Every fixture ends with an open prompt slot, because that is what a rendered
// document always ends with; without it the round trip gains one (the slot the
// serializer appends) and the counts stop being comparable.

const CELL = "<!-- pi:cell js #c -->\n\n```js\n1\n```";
const roundTrip = (md: string) => serializeMessages(messagesFrom(md));
const blockCount = (md: string) => blocksFrom(segs(md)).length;

test("a cell the agent wrote mid-answer folds, and stays folded", () => {
	const md = `Q1\n\n<!-- pi -->\n\nA1\n\n${BLOCK_MARKER}\n\n${CELL}\n\n<!-- you -->\n\n`;
	assert.equal(blockCount(md), 2, "the answer's block, then the open slot");
	const back = roundTrip(md);
	assert.equal(blockCount(back), 2, "…and the cell still belongs to the answer");
	assert.match(back, /<!-- pi:block -->\n\n<!-- pi:cell js #c -->/);
});

test("a cell straight after a prompt belongs to that prompt", () => {
	// The document cannot tell an inserted cell from a reply that is only a
	// cell — and no longer needs to: neither opens a block.
	const md = `Q1\n\n${CELL}\n\n<!-- you -->\n\n`;
	assert.equal(blockCount(md), 2, "prompt (with the cell), slot");
	assert.equal(blockCount(roundTrip(md)), 2);
	assert.ok(!roundTrip(md).includes(BLOCK_MARKER), "and no marker was invented to say so");
});

test("a cell inserted under an answer joins its block but stays its own message", () => {
	// The flush still matters: the cell must not merge into the assistant run
	// above it, or an edit to either would rewrite the other.
	const md = `Q1\n\n<!-- pi -->\n\nA1\n\n${CELL}\n\n<!-- you -->\n\n`;
	assert.equal(blockCount(md), 2, "prompt+answer+cell, slot");
	assert.deepEqual(
		messagesFrom(md).map((m) => m.role),
		["user", "assistant", "assistant", "toolResult"],
		"the cell became its own message — and its result, which the document does not store, was synthesized behind it",
	);
	const back = roundTrip(md);
	assert.equal(blockCount(back), 2);
	assert.ok(!back.includes(BLOCK_MARKER), "and no marker was invented to say so");
});

test("every arrangement is stable under a second round trip", () => {
	for (const md of [
		`Q1\n\n<!-- pi -->\n\nA1\n\n${BLOCK_MARKER}\n\n${CELL}\n\n<!-- you -->\n\n`,
		`Q1\n\n${CELL}\n\n<!-- you -->\n\n`,
		`Q1\n\n<!-- pi -->\n\nA1\n\n${CELL}\n\n<!-- you -->\n\n`,
	]) {
		const once = roundTrip(md);
		assert.equal(roundTrip(once), once, "a second pass changes nothing");
	}
});

test("a page of folded prompts and agent cells rebuilds unchanged", () => {
	// The faithful round trip — what rebuildSession + serializeBranch do — which
	// needs the `folded` set that prompt folds live in. Without it prompts lose
	// their markers and the page fragments, so the test has to mirror the real
	// path or it measures nothing.
	const trip = (md: string) => {
		const { messages, openers } = documentMessages(md);
		const folded = new Set<AgentMessage>();
		messages.forEach((m, i) => {
			const authored = m.role === "user" || (m.role === "custom" && m.customType === "note");
			if (authored && !openers.has(i)) folded.add(m);
		});
		return serializeMessages(messages, folded);
	};
	const md = [
		"Q1",
		"",
		"<!-- pi -->",
		"",
		"A1",
		"",
		BLOCK_MARKER, // an agent cell inside that answer
		"",
		CELL,
		"",
		BLOCK_MARKER, // a follow-up prompt folded into the same block
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
	].join("\n");
	assert.equal(blockCount(md), 2, "one block of intent, then the open slot");
	const back = trip(md);
	assert.equal(blockCount(back), 2, "the rebuild keeps it whole");
	assert.equal(trip(back), back, "and settles");
});
