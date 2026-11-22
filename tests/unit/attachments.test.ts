// Attachments (`pi:file`) — run `pnpm build` first, then
// `node --test tests/unit/attachments.test.ts`.
//
// An attachment sits between the fold marker and the `<!-- you -->` it belongs
// to. That slot is the whole risk: a dozen look-backs used to assume nothing
// but a fold marker could be there. These tests pin both halves — that the
// segment parses and round-trips, and that everything which reads backward
// past it still reads the same answer as before.
import test from "node:test";
import assert from "node:assert/strict";
import {
	BLOCK_MARKER,
	blockKeyOf,
	blocksFrom,
	deleteBlockText,
	documentMessages,
	fileRefOf,
	isFolded,
	leadIndex,
	messagesFrom,
	moveBlockText,
	parseDocument,
	pendingUserText,
	prefixPendingUser,
	promptFrom,
	serializeFile,
	YOU_MARKER,
} from "../../dist/document/format.js";
import { answerRange, moveCellByOffset, tailPrompt } from "../../dist/document/run.js";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { DocBlock, DocSegment } from "../../dist/document/format.js";

const kinds = (md: string) => parseDocument(md).segments.map((s) => s.kind);

/**
 * The leading text of a replayed message, or undefined when there is none.
 *
 * `documentMessages` hands back pi's own `AgentMessage` union, where only some
 * variants carry `content` and a user message's content may be a bare string.
 * The predicates below are looking for a text block, which is what this returns.
 */
const firstText = (m: AgentMessage): string | undefined => {
	const content = "content" in m ? m.content : undefined;
	if (!Array.isArray(content)) return undefined;
	const first = content[0];
	return first && typeof first === "object" && first.type === "text" ? first.text : undefined;
};
const IMG = { id: "a1b2c3", mime: "image/png", url: "/attachments/a1b2c3-shot.png", name: "shot.png" };
const PDF = { id: "d4e5f6", mime: "application/pdf", url: "/attachments/d4e5f6-report.pdf", name: "report.pdf" };

test("an image serializes to a marker plus a plain markdown image", () => {
	assert.equal(
		serializeFile(IMG),
		`<!-- pi:file image/png #a1b2c3 -->\n\n![shot.png](/attachments/a1b2c3-shot.png)`,
	);
	// Not an image: an ordinary link, so no renderer tries to draw a PDF.
	assert.equal(serializeFile(PDF), `<!-- pi:file application/pdf #d4e5f6 -->\n\n[report.pdf](/attachments/d4e5f6-report.pdf)`);
});

test("the segment parses back into the ref it was written from", () => {
	const md = `${serializeFile(IMG)}\n\n${YOU_MARKER}\n\nwhat is this?\n`;
	assert.deepEqual(kinds(md), ["file", "user"]);
	const [file] = parseDocument(md).segments;
	assert.equal(file.name, "image/png"); // mime rides on the marker — nothing sniffs
	assert.equal(file.id, "a1b2c3");
	assert.deepEqual(fileRefOf(file), IMG);
});

test("a mime or id that would break the marker grammar is refused, not written", () => {
	assert.equal(serializeFile({ ...IMG, mime: "image/png charset=x" }), "");
	assert.equal(serializeFile({ ...IMG, id: "a b" }), "");
});

test("`pi:artifact` still parses — the new alternative must not renumber its group", () => {
	const md = `<!-- pi:artifact @chart -->\n\n<!-- pi:cell js #c1 -->\n\n\`\`\`js\n1\n\`\`\`\n`;
	const segs = parseDocument(md).segments;
	assert.equal(segs[0].kind, "artifact");
	assert.equal(segs[0].name, "chart"); // read from m[12]; pi:file appends at 13/14
	assert.equal(segs[1].kind, "cell");
});

test("an unknown pi: marker is still opaque — the extension point stays open", () => {
	assert.deepEqual(kinds(`<!-- pi:sparkle -->\n\nx\n`), ["opaque"]);
});

// -- the look-back the placement costs ------------------------------------------

test("an attachment does not hide the fold marker behind it", () => {
	const md =
		`${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer\n\n` +
		`${BLOCK_MARKER}\n\n${serializeFile(IMG)}\n\n${YOU_MARKER}\n\nsecond\n`;
	const segs = parseDocument(md).segments;
	assert.deepEqual(kinds(md), ["user", "assistant", "block", "file", "user"]);
	// The `you` at index 4 is folded, even though index 3 is the attachment.
	assert.equal(leadIndex(segs, 4), 2);
	assert.equal(isFolded(segs, 4), true);
	// …so the folded prompt joins the block above instead of opening a new one.
	assert.equal(blocksFrom(segs).length, 1);
});

test("an attachment heads its block, and the prompt under it joins that block", () => {
	const md =
		`${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer\n\n` +
		`${serializeFile(IMG)}\n\n${YOU_MARKER}\n\nsecond\n`;
	const segs = parseDocument(md).segments;
	const blocks = blocksFrom(segs);
	assert.equal(blocks.length, 2, "the image and the question under it are ONE block, not two");
	// The block opens at the attachment, which is what every piece of chrome
	// anchors on — the left rule, the fold, the drag handle, the rail entry.
	assert.equal(blocks[1].opensAt, 2);
	assert.equal(segs[blocks[1].opensAt].kind, "file");
	assert.deepEqual(blocks[1].members, [2, 3]);
	// Named by the file, not by the raw markdown of its body.
	assert.equal(blocks[1].name, "shot.png");
	assert.equal(blocks[0].name, "first");
});

test("several attachments on one prompt stay one block", () => {
	const md = `${serializeFile(IMG)}\n\n${serializeFile(PDF)}\n\n${YOU_MARKER}\n\ncompare these\n`;
	const segs = parseDocument(md).segments;
	const blocks = blocksFrom(segs);
	assert.equal(blocks.length, 1, "three images and a question is one thing you are asking");
	assert.deepEqual(blocks[0].members, [0, 1, 2]);
	assert.equal(blocks[0].name, "shot.png", "named by the first of them");
});

test("an attachment with nothing under it is a block of its own", () => {
	const md = `${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer\n\n${serializeFile(IMG)}\n\n${YOU_MARKER}\n\n`;
	const segs = parseDocument(md).segments;
	const blocks = blocksFrom(segs);
	assert.equal(blocks.length, 2);
	assert.equal(segs[blocks[1].opensAt].kind, "file");
	assert.equal(blocks[1].name, "shot.png");
	// The empty trailing slot joins it rather than forming a nameless block.
	assert.deepEqual(blocks[1].members, [2, 3]);
});

test("an attachment before the first prompt belongs to a block", () => {
	// It used to belong to nothing at all: `blocks[last]?.members.push(i)` is a
	// no-op while `blocks` is still empty, so a leading file floated free.
	const md = `${serializeFile(IMG)}\n\n${YOU_MARKER}\n\nwhat is this?\n`;
	const segs = parseDocument(md).segments;
	const blocks = blocksFrom(segs);
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].opensAt, 0);
	assert.deepEqual(blocks[0].members, [0, 1]);
});

test("a fold marker in front of an attachment folds the whole unit", () => {
	const md =
		`${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer\n\n` +
		`${BLOCK_MARKER}\n\n${serializeFile(IMG)}\n\n${YOU_MARKER}\n\nsecond\n`;
	const segs = parseDocument(md).segments;
	assert.deepEqual(kinds(md), ["user", "assistant", "block", "file", "user"]);
	assert.equal(blocksFrom(segs).length, 1, "image and prompt both fold into the block above");
});

test("an attachment ends the answer span above it", () => {
	const md =
		`${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer\n\n` +
		`${serializeFile(IMG)}\n\n${YOU_MARKER}\n\nsecond\n`;
	const segs = parseDocument(md).segments;
	const span = answerRange(segs, 0);
	assert.ok(span, "the first prompt has an answer span");
	assert.ok(segs[1], "the reply segment parsed");
	assert.equal(span.to, segs[1].to); // stops at the reply, not at the attachment
});

test("the tail invariants hold with an attachment staged on the pending prompt", () => {
	const md = `${YOU_MARKER}\n\nsent\n\n<!-- pi -->\n\nreply\n\n${serializeFile(IMG)}\n\n${YOU_MARKER}\n\ndraft\n`;
	const segs = parseDocument(md).segments;
	// The document still ends in an open prompt — the reason attachments go
	// BEFORE `<!-- you -->` rather than after it.
	assert.equal(tailPrompt(segs), segs.length - 1);
	assert.equal(pendingUserText(md), "draft");
	assert.match(prefixPendingUser(md, "[cell values] {}"), /\[cell values\] \{\}\n\ndraft/);
});

// -- replay ----------------------------------------------------------------------

test("attachments map to the message they belong to; the messages stay text-only", () => {
	const md =
		`${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer\n\n` +
		`${serializeFile(IMG)}\n\n${serializeFile(PDF)}\n\n${YOU_MARKER}\n\nsecond\n`;
	const { messages, attachments } = documentMessages(md);
	assert.deepEqual(
		messages.map((m) => m.role),
		["user", "assistant", "user"],
	);
	// Text content is untouched: format.ts runs in the browser and never reads bytes.
	const second = messages[2];
	assert.ok(second && "content" in second, "the third replayed message carries content");
	assert.deepEqual(second.content, [{ type: "text", text: "second" }]);
	// Both attachments are owed to message 2, in document order.
	assert.deepEqual(attachments.get(2), [IMG, PDF]);
	assert.equal(attachments.has(0), false);
	// The older entry point is unchanged for every caller that ignores them.
	assert.equal(messagesFrom(md).length, 3);
});

test("an attachment on the unsent tail prompt is not yet anybody's message", () => {
	const md = `${YOU_MARKER}\n\nsent\n\n<!-- pi -->\n\nreply\n\n${serializeFile(IMG)}\n\n${YOU_MARKER}\n\n`;
	const { messages, attachments } = documentMessages(md);
	assert.equal(messages.length, 2);
	assert.equal(attachments.size, 0); // it rides along on the NEXT send, not this history
});

// -- moving and deleting -----------------------------------------------------------
//
// The attachment heads its block, so a move or a delete addressed to that block
// takes the image and the prompt together — they are one intent and they travel
// as one. What must NOT happen is either half going alone.

const twoBlocksWithImage = () =>
	`${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer one\n\n` +
	`${serializeFile(IMG)}\n\n${YOU_MARKER}\n\nsecond\n\n<!-- pi -->\n\nanswer two\n\n${YOU_MARKER}\n\n`;

test("deleting a block takes its attachment with it", () => {
	const md = twoBlocksWithImage();
	const segs = parseDocument(md).segments;
	const second = blocksFrom(segs)[1];
	const next = deleteBlockText(md, blockKeyOf(segs, second));
	assert.ok(next !== null);
	assert.equal(next.includes("pi:file"), false, "the attachment marker is gone");
	assert.equal(next.includes("a1b2c3-shot.png"), false, "and so is its link");
	assert.match(next, /first/);
});

test("moving a block takes its attachment with it, and keeps them adjacent", () => {
	const md = twoBlocksWithImage();
	const segs = parseDocument(md).segments;
	const blocks = blocksFrom(segs);
	// Move the second block (the one carrying the image) above the first.
	const next = moveBlockText(md, blockKeyOf(segs, blocks[1]), blockKeyOf(segs, blocks[0]));
	assert.ok(next !== null);
	const moved = parseDocument(next).segments;
	const fileAt = moved.findIndex((s) => s.kind === "file");
	assert.notEqual(fileAt, -1, "the attachment survived the move");
	// Still immediately in front of the prompt it belongs to.
	assert.equal(moved[fileAt + 1].kind, "user");
	assert.equal(moved[fileAt + 1].text, "second");
	// And it landed above the block it was moved in front of.
	assert.ok(next.indexOf("second") < next.indexOf("first"));
});

test("dragging a prompt by its grip takes its attachment with it", () => {
	// The grip moves a cell: the prompt and its answer. The span it cuts starts
	// at the attachment (`promptFrom`), so the text it carries must too, or the
	// image is cut from the origin and pasted nowhere.
	const md = twoBlocksWithImage();
	const segs = parseDocument(md).segments;
	const second = segs.findIndex((s) => s.kind === "user" && s.text === "second");
	const first = segs.findIndex((s) => s.kind === "user" && s.text === "first");
	const next = moveCellByOffset(md, segs[second].from, segs[first].from);
	assert.ok(next !== null);
	const moved = parseDocument(next).segments;
	const fileAt = moved.findIndex((s) => s.kind === "file");
	assert.notEqual(fileAt, -1, "the attachment survived the move");
	assert.equal(moved[fileAt + 1].text, "second", "still in front of its prompt");
	assert.ok(next.indexOf("second") < next.indexOf("first"));
	assert.equal(next.split("pi:file").length - 1, 1, "carried, not copied");
});

test("dragging another cell past a prompt with an attachment leaves the attachment in place", () => {
	const md = twoBlocksWithImage();
	const segs = parseDocument(md).segments;
	const first = segs.findIndex((s) => s.kind === "user" && s.text === "first");
	const next = moveCellByOffset(md, segs[first].from, null);
	assert.ok(next !== null);
	const moved = parseDocument(next).segments;
	const fileAt = moved.findIndex((s) => s.kind === "file");
	assert.notEqual(fileAt, -1);
	assert.equal(moved[fileAt + 1].text, "second");
});

// -- which block an attachment joins -------------------------------------------
//
// The bug this pins: dropping a file while looking at block 2 filed it against
// the prompt at the BOTTOM of the page, because the lookup asked which prompt
// the caret was inside and a drop never moves the caret. An attachment belongs
// to the block it was put in.

const threeBlocks = () =>
	`${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer one\n\n` +
	`${YOU_MARKER}\n\nsecond\n\n<!-- pi -->\n\nanswer two\n\n` +
	`${YOU_MARKER}\n\n`;

/** What `insertAttachment` computes: the prompt a position belongs to. */
function promptForPosition(segs: readonly DocSegment[], blocks: readonly DocBlock[], pos: number) {
	let index = segs.findIndex((s: DocSegment) => s.kind === "user" && pos >= s.from && pos <= s.to);
	if (index < 0) {
		const block = [...blocks].reverse().find((b) => segs[b.opensAt].from <= pos);
		if (block && segs[block.opensAt]?.kind === "user") index = block.opensAt;
	}
	return index;
}

test("a position inside a block's reply resolves to that block's prompt", () => {
	const md = threeBlocks();
	const segs = parseDocument(md).segments;
	const blocks = blocksFrom(segs);
	const replyToSecond = segs[3]; // "answer two"
	assert.equal(replyToSecond.text, "answer two");
	const index = promptForPosition(segs, blocks, replyToSecond.bodyFrom + 2);
	assert.equal(segs[index].text, "second", "resolved to the enclosing block's prompt, not the tail");
	assert.notEqual(index, tailPrompt(segs), "and specifically not the page's trailing slot");
});

test("an attachment inserted there heads a block containing that prompt", () => {
	const md = threeBlocks();
	const segs = parseDocument(md).segments;
	const blocks = blocksFrom(segs);
	const index = promptForPosition(segs, blocks, segs[3].bodyFrom + 2);
	const at = segs[index].from; // in front of the prompt's own marker
	const next = `${md.slice(0, at)}${serializeFile(IMG)}\n\n${md.slice(at)}`;

	const after = parseDocument(next).segments;
	const fileAt = after.findIndex((s) => s.kind === "file");
	assert.equal(after[fileAt + 1].text, "second");
	// One block, headed by the image, holding the prompt it was dropped on.
	const rebuilt = blocksFrom(after);
	const owning = rebuilt.find((b) => b.members.includes(fileAt));
	assert.ok(owning, "the inserted attachment belongs to a block");
	assert.equal(owning.opensAt, fileAt, "the attachment heads it");
	assert.equal(owning.name, "shot.png");
	assert.ok(owning.members.includes(fileAt + 1), "and the prompt is in it");
	// The transcript still credits the message, not the attachment.
	const { messages, attachments } = documentMessages(next);
	const owner = messages.findIndex((m) => m.role === "user" && firstText(m) === "second");
	assert.deepEqual(attachments.get(owner), [IMG]);
});

// -- the opener split ------------------------------------------------------------
//
// `blocksFrom` and `documentMessages` answer "does this open a block?"
// DIFFERENTLY for a prompt under an attachment, and they have to.
//
// In the document the attachment opens the block and the prompt joins it. In the
// transcript there IS no attachment — a `pi:file` never becomes a message — so
// the prompt is the first thing in that block that exists at all, and it has to
// be the opener. Get this wrong and `rebuildSession` writes no `block-new` for
// it, so the next document rebuilt from the transcript folds that prompt into
// whatever came before: structure lost, silently, one round trip later.

test("the document folds the prompt into the attachment; the transcript does not", () => {
	const md =
		`${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer\n\n` +
		`${serializeFile(IMG)}\n\n${YOU_MARKER}\n\nsecond\n`;
	const segs = parseDocument(md).segments;

	// Document side: one block, headed by the image.
	const blocks = blocksFrom(segs);
	assert.equal(blocks.length, 2);
	assert.equal(segs[blocks[1].opensAt].kind, "file");

	// Transcript side: "second" is still an opener, because the image is not a
	// message and cannot be one.
	const { messages, openers } = documentMessages(md);
	const secondIdx = messages.findIndex((m) => m.role === "user" && firstText(m) === "second");
	assert.ok(openers.has(secondIdx), "the prompt opens the block in the transcript");
	assert.equal(
		messages.some((m) => {
			const content = "content" in m ? m.content : undefined;
			return Array.isArray(content) && content.some((c) => c.type === "image");
		}),
		false,
		"the attachment itself is never a message",
	);
});

test("a folded attachment stays folded in the transcript too", () => {
	const md =
		`${YOU_MARKER}\n\nfirst\n\n<!-- pi -->\n\nanswer\n\n` +
		`${BLOCK_MARKER}\n\n${serializeFile(IMG)}\n\n${YOU_MARKER}\n\nsecond\n`;
	const { messages, openers } = documentMessages(md);
	const secondIdx = messages.findIndex((m) => m.role === "user" && firstText(m) === "second");
	assert.equal(openers.has(secondIdx), false, "the fold marker reaches past the image, as it always did");
});
