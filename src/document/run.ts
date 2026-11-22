// Running a prompt: which one the caret means, what history the transcript
// must hold for it, and what its answer occupies. Pure — no DOM, no RPC.
//
// The send path used to mean one thing by "the prompt": the document's last
// segment. A page you compose top-down has prompts in the middle of it, so the
// question becomes positional and these are the answers to it.
import {
	BLOCK_MARKER,
	type DocBlock,
	blockEndIndex,
	blockKeyOf,
	blocksFrom,
	deleteBlockText,
	leadIndex,
	type DocSegment,
	type FileRef,
	fileRefOf,
	type DocSegmentKind,
	NOTE_MARKER,
	opensBlock,
	parseDocument,
	PI_PLACEHOLDER,
	promptFrom,
	serializeCell,
	stripFence,
	VALUES_MARK,
	YOU_MARKER,
} from "./format.ts";
import { artifactInScope, artifactScope, artifactsFrom, IN_ARTIFACT, newCellId } from "./cells.ts";

/** Index of the prompt the caret is inside, or -1.
 *
 *  Containment is tight: a user segment runs from its marker line to the start
 *  of the next one, so a caret in the reply *below* a prompt is not in it —
 *  re-running is destructive and must never be a near-miss. The caller falls
 *  back to the tail, which is what every send meant before. */
export function promptAt(segments: readonly DocSegment[], pos: number): number {
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (seg.kind === "user" && pos >= seg.from && pos <= seg.to) return i;
	}
	return -1;
}

/** Index of the trailing pending prompt, or -1 when the page ends elsewhere. */
export function tailPrompt(segments: readonly DocSegment[]): number {
	return segments[segments.length - 1]?.kind === "user" ? segments.length - 1 : -1;
}

/** Offset just past a prompt's own text — where its answer begins. */
export function promptEnd(md: string, seg: DocSegment): number {
	return seg.bodyFrom + md.slice(seg.bodyFrom, seg.to).replace(/\s+$/, "").length;
}

/** A staged reply slot: the splice that opens it, and where the caret lands.
 *  `changes` is empty when the block already ends in an open prompt and there
 *  is nothing to write into it. */
export interface ReplySlot {
	changes: { from: number; to: number; insert: string } | [];
	/** Caret offset in the document AFTER the change. */
	caret: number;
}

/**
 * Where a follow-up belongs in the block that owns `pos`: its open reply slot,
 * or the change that stages one. `body` is written into the slot — a quoted
 * snippet, when the follow-up starts from a selection.
 *
 * Pure, and one edit either way, so staging the slot and putting the caret in
 * it are the same transaction. They used to be two, the second addressed by an
 * offset the first had already moved.
 */
export function replySlot(md: string, segments: readonly DocSegment[], pos: number, body = ""): ReplySlot | null {
	const blocks = blocksFrom(segments);
	if (!blocks.length) return null;
	// The block that owns pos: the last one opening at or before it.
	const block = [...blocks].reverse().find((b) => segments[b.opensAt].from <= pos) ?? blocks[0];
	const lastIdx = block.members[block.members.length - 1];
	const lastSeg = segments[lastIdx];
	// An open prompt already ends this block — a staged slot (folded in, so
	// not the opener) or the tail pending prompt. Append there instead of
	// staging a second one. A sent prompt is followed by its reply, so it is
	// never a block's last member (ponytail: except after a dead turn, where
	// the append reads as an edit and the divergence banner catches it).
	if (lastSeg.kind === "user" && (lastIdx !== block.opensAt || lastSeg === segments[segments.length - 1])) {
		const text = md.slice(lastSeg.bodyFrom, lastSeg.to).replace(/\s+$/, "");
		const at = lastSeg.bodyFrom + text.length;
		if (!body) return { changes: [], caret: at };
		// Markers and prose keep a blank line around them (the format's
		// serialization rule): pad against whatever is already in the slot. An
		// EMPTY slot still needs the pad — `bodyFrom` is the character after the
		// marker's own newline, so writing there with no pad puts the body hard
		// against `<!-- you -->` and the blank line the format requires is gone.
		const insert = `${text ? "\n\n" : "\n"}${body}\n\n`;
		return { changes: { from: at, to: at, insert }, caret: at + insert.length };
	}
	const end = lastSeg.to;
	const cut = md.slice(0, end).replace(/\s+$/, "").length;
	// The answer folds into the block it addresses (step 14) — the marker
	// declares it, and the send path's fork climb honors it. A session that
	// doesn't speak block-new keeps the unmarked slot (one block per send).
	const slot = `\n\n${BLOCK_MARKER}\n\n${YOU_MARKER}\n\n`;
	// A body needs a blank line under it before the caret's line, or the first
	// character typed lands on the line after a blockquote and markdown's lazy
	// continuation swallows it INTO the quote.
	const insert = body ? `${slot}${body}\n\n\n` : slot;
	return { changes: { from: cut, to: end, insert }, caret: cut + insert.length - 1 }; // the empty slot line
}

/**
 * Where the machine's region opens for a send — derived from the text that will
 * ACTUALLY be sent, not from the document the prompt was parsed out of.
 *
 * The two differ: the send path splices a fold marker in above the tail prompt
 * for a follow-up, which shifts every offset from there on. Anchoring on the
 * pre-splice offsets opened the region ~19 characters early — mid-word — so the
 * prompt was cut in two and its tail stranded below the reply.
 *
 * `index` is only consulted for a mid-page prompt, whose own offsets a splice
 * below it cannot move; at the tail the prompt is re-found instead. Falls back
 * to the end of the page when there is no prompt left in `base` (a `/command`
 * send strips its own slot).
 */
export function runAnchor(base: string, atTail: boolean, index: number): number {
	const segments = parseDocument(base).segments;
	const seg = segments[atTail ? tailPrompt(segments) : index];
	return seg?.kind === "user" ? promptEnd(base, seg) : base.length;
}

/**
 * A `/subagent` send's edit: the invocation on the trailing prompt becomes the
 * child's card (`view`, a serialized `pi:view subsession`), and `draft` — what
 * was written before the invocation — stays the parent's unsent tail below it.
 * A page whose last segment is no prompt gets the marker the card sits under.
 */
export function subsessionInsert(
	md: string,
	segments: readonly DocSegment[],
	view: string,
	draft: string,
): { from: number; to: number; insert: string; caret: number } {
	const tail = segments.at(-1);
	const from = tail?.kind === "user" ? tail.bodyFrom : md.replace(/\s+$/, "").length;
	const head = tail?.kind === "user" && tail.bodyFrom > tail.from ? "" : `\n\n${YOU_MARKER}\n\n`;
	const insert = `${head}${view}\n\n${YOU_MARKER}\n\n${draft}`;
	return { from, to: md.length, insert, caret: from + insert.length };
}

/** The attachments a prompt carries: the `pi:file` segments directly above the
 *  segment at `index`, in document order (the format's §Attachments). One that
 *  does not parse into a ref is skipped. */
export function attachmentsAbove(segments: readonly DocSegment[], index: number): FileRef[] {
	const refs: FileRef[] = [];
	for (let i = index - 1; i >= 0 && segments[i]?.kind === "file"; i--) {
		const ref = fileRefOf(segments[i]!);
		if (ref) refs.unshift(ref);
	}
	return refs;
}

/** Everything above a prompt: the history the transcript must hold when it
 *  runs. Null segment means the whole document is history (no pending slot). */
export function historyAbove(md: string, seg: DocSegment | null): string {
	return seg ? md.slice(0, seg.from) : md;
}

/** A whole document's history: everything above its pending prompt, or all of
 *  it when it ends on anything else. What a transcript rendered as a document
 *  is compared on before a send — the trailing slot is where the next prompt
 *  goes, not something already said. */
export function historyOf(md: string): string {
	const tail = parseDocument(md).segments.at(-1);
	return tail?.kind === "user" ? md.slice(0, tail.from) : md;
}

/**
 * The span a prompt's answer occupies — every segment under it up to the next
 * authored cell (prompt or prose) or fold marker, which belong to whatever
 * comes after. Null when the prompt has no answer yet, which is what makes
 * "re-run" distinguishable from "run".
 */
export function answerRange(segments: readonly DocSegment[], index: number): { from: number; to: number } | null {
	// A `file` ends a span for the same reason a `block` marker does: it is staged
	// for the prompt underneath it, so it is not part of the answer above it.
	const ends = (seg: DocSegment | undefined) => !seg || opensBlock(seg.kind) || seg.kind === "block" || seg.kind === "file";
	if (ends(segments[index + 1])) return null;
	let last = index + 1;
	while (!ends(segments[last + 1])) last++;
	return { from: segments[index + 1].from, to: segments[last].to };
}

/** The machine's region: absolute offsets into the document it opens in. */
export interface TurnRegion {
	doc: string;
	msgAnchor: number;
	tailAnchor: number;
}

/**
 * Open the machine's region just after `at` — the end of the prompt that ran.
 *
 * At the end of the page that region is followed by a fresh prompt slot;
 * mid-page it is followed by whatever was already there, which is how an answer
 * lands under its own prompt instead of at the bottom of the document.
 * PI_PLACEHOLDER already ends in a blank line, so nothing separates it from
 * what follows.
 */
export function beginTurnAt(md: string, at: number): TurnRegion {
	const head = md.slice(0, at).replace(/\s+$/, "");
	const rest = md.slice(at).replace(/^\s+/, "");
	const doc = `${head}\n\n${PI_PLACEHOLDER}${rest || `${YOU_MARKER}\n\n`}`;
	const msgAnchor = head.length + 2;
	return { doc, msgAnchor, tailAnchor: msgAnchor + PI_PLACEHOLDER.length };
}

// -- editing a cell -------------------------------------------------------------
//
// A cell's mode IS its marker, so changing one is a marker rewrite and nothing
// else: the document is the source of truth and the next send rebuilds the
// transcript from it, so `documentMessages` produces the new message kind for
// free. Duplicate and delete are the same kind of surgery over the same spans.

/** The modes a cell can be switched between from the UI. Observable's word for
 *  the control; `js` reaches the reactive engine, the other two do not. */
export type CellMode = "markdown" | "prompt" | "js";

/** The mode a segment already is, or null when it has no mode control (a reply,
 *  a tool call — turning those into page material loses the turn). */
export function cellMode(seg: DocSegment): CellMode | null {
	if (seg.kind === "user") return "prompt";
	if (seg.kind === "note") return "markdown";
	if (seg.kind === "cell") return seg.name === "js" ? "js" : null;
	return null;
}

/** A segment's body with the blank lines a marker is padded with removed. */
const bodyOf = (md: string, seg: DocSegment): string => md.slice(seg.bodyFrom, seg.to).trim();

/** Splice `block` in place of `seg`, keeping the blank line the next marker
 *  needs. Returns the new document and the offset the block starts at. */
function replaceSegment(md: string, seg: DocSegment, block: string): { md: string; from: number } {
	const rest = md.slice(seg.to);
	return { md: `${md.slice(0, seg.from)}${block}${rest ? "\n\n" : "\n"}${rest}`, from: seg.from };
}

/**
 * Change a cell's mode. Null when the segment has no mode control, or already
 * is that mode.
 *
 * Converting an answered prompt to page material keeps the answer: a `custom`
 * message converts to user content, so `note, assistant` is a well-formed pair.
 * Deleting is a separate, explicit act.
 */
export function setCellMode(md: string, seg: DocSegment, mode: CellMode, id = newCellId()): string | null {
	const current = cellMode(seg);
	if (!current || current === mode) return null;
	const body = seg.kind === "cell" ? stripFence(bodyOf(md, seg)) : bodyOf(md, seg);
	const block =
		mode === "prompt"
			? `${YOU_MARKER}\n\n${body}`
			: mode === "markdown"
				? `${NOTE_MARKER}\n\n${body}`
				: serializeCell("js", seg.id ?? id, body);
	return replaceSegment(md, seg, block).md;
}

/**
 * Insert an empty cell of `mode` at a boundary, and say where the caret goes.
 *
 * One constructor for every entrance. The `+` gutter and the `/` menu each had
 * their own arithmetic and disagreed: the gutter laid an extra blank line down
 * and left the caret below the cell's own first line, so a new markdown cell
 * opened with the caret floating in whitespace.
 *
 * The shape produced is the trailing prompt slot's shape, wherever the cell
 * lands — marker, a separator blank, then the line the caret rests on. At the
 * end of the page that is the whole document; mid-page the caret's own blank
 * line doubles as the separator before whatever follows.
 */
export function insertCellAt(md: string, at: number, mode: CellMode, id = newCellId()): CellInsert {
	// A splice, not a rewritten document: everything outside [from, to) is left
	// byte-identical, so live cell widgets elsewhere on the page are not torn
	// down and rebuilt by an insertion that has nothing to do with them.
	const from = md.slice(0, at).replace(/\s+$/, "").length;
	const to = md.length - md.slice(at).replace(/^\s+/, "").length;
	const rest = md.slice(to);
	if (mode === "js") {
		const cell = serializeCell("js", id, "");
		// serializeCell fences an empty source as ```js\n\n``` — the caret goes on
		// that blank line, inside the fence, the way `/cell` has always placed it.
		return { from, to, insert: `\n\n${cell}${rest ? "\n\n" : "\n"}`, caret: from + 2 + cell.length - 4 };
	}
	const marker = mode === "markdown" ? NOTE_MARKER : YOU_MARKER;
	// Three body lines mid-page, two at the end, caret on the second either way.
	// The middle line is the one you type on; the ones around it are the blank
	// lines the format puts either side of content. Borrowing the caret's own
	// line as the separator before the next marker looked tidier and was wrong —
	// the first character you typed ate the separator.
	return {
		from,
		to,
		insert: `\n\n${marker}\n\n${rest ? "\n\n" : ""}`,
		caret: from + 2 + marker.length + 2,
	};
}

/** A cell insertion as a splice into the document, plus where the caret lands. */
export interface CellInsert {
	from: number;
	to: number;
	insert: string;
	caret: number;
}

/** The span a cell occupies on its own — marker line through body. A bare
 *  leading user segment has no marker line, which is why this is not `from`. */
export function cellSpan(md: string, seg: DocSegment): { from: number; to: number } {
	return { from: seg.from, to: seg.from + md.slice(seg.from, seg.to).replace(/\s+$/, "").length };
}

/** Copy a cell in below itself. A duplicated prompt gets no answer — it is a
 *  fresh cell to run — and a duplicated code cell gets a fresh id, or the copy
 *  would redefine the original instead of standing beside it. */
export function duplicateCell(md: string, seg: DocSegment, id = newCellId()): string | null {
	if (!cellMode(seg)) return null;
	const span = cellSpan(md, seg);
	let copy = md.slice(span.from, span.to);
	// A bare leading user segment carries no marker; the copy needs one or its
	// text would merge into the original.
	if (seg.bodyFrom === seg.from) copy = `${YOU_MARKER}\n\n${copy}`;
	if (seg.kind === "cell") copy = copy.replace(/^(<!-- pi:cell [^\s#]+ )#[^\s>]+/, `$1#${id}`);
	return `${md.slice(0, span.to)}\n\n${copy}${md.slice(span.to)}`;
}

/**
 * Everything a cell occupies in the page: the fold marker that binds it to the
 * block above, the cell itself, and — for a prompt — the answer under it. This
 * is the unit that moves and the unit that is deleted; an answer separated from
 * its prompt would read as pi replying to whatever ended up above it.
 */
export function cellExtent(md: string, segments: readonly DocSegment[], index: number): { from: number; to: number } | null {
	const seg = segments[index];
	// An artifact is a block: its extent is its marker and every cell under it,
	// so moving or deleting one takes the whole widget rather than a fence out of
	// the middle of it. This is why the artifact needed a marker at all — with the
	// members derived from a group token they were scattered, and there was no
	// span to name.
	if (seg?.kind === "artifact") {
		let last = index;
		for (let j = index + 1; j < segments.length; j++) {
			if (segments[j].kind === "cell") last = j;
			else if (!IN_ARTIFACT.has(segments[j].kind)) break;
		}
		const head = promptFrom(segments, index);
		return { from: head, to: cellSpan(md, segments[last]).to };
	}
	if (!seg || !cellMode(seg)) return null;
	const answer = seg.kind === "user" ? answerRange(segments, index) : null;
	const from = promptFrom(segments, index);
	return { from, to: answer ? answer.to : cellSpan(md, seg).to };
}

/**
 * Every span an artifact occupies — one per declaration of its name, in
 * document order. Null for anything that is not an artifact marker.
 *
 * A name is declared once per turn that added to it: an agent writing a cell on
 * turn 7 cannot reach into a block a hundred lines above, so it writes the
 * marker again and `artifactsFrom` gathers the members. One frame on the page,
 * several spans in the text.
 *
 * Which only matters when the artifact moves or goes. Taking the addressed
 * marker alone left every other declaration where it was — the cells of turns 4
 * and 7 stayed behind in turns 4 and 7, still members of the frame you thought
 * you had carried off — and worse, the marker you dropped had its name declared
 * above it by the ones left behind, so `blocksFrom`'s repeat rule opened no
 * block for it. It landed INSIDE whatever block it was dropped after, with
 * nothing on the page saying so, and the next delete of that block took the
 * artifact down with it. Gathering ends the ambiguity at the source: one name,
 * one marker, one block, and a rail entry to say so.
 */
export function artifactRuns(
	md: string,
	segments: readonly DocSegment[],
	index: number,
): { from: number; to: number; marker: number }[] | null {
	if (segments[index]?.kind !== "artifact") return null;
	const name = segments[index].name;
	const runs: { from: number; to: number; marker: number }[] = [];
	for (let i = 0; i < segments.length; i++) {
		if (segments[i].kind !== "artifact" || segments[i].name !== name) continue;
		const span = cellExtent(md, segments, i);
		if (span) runs.push({ ...span, marker: i });
	}
	return runs;
}

/** Cut disjoint spans out of the page, closing each gap to one blank line.
 *  Right to left, so the offsets of the spans still to come stay valid.
 *
 *  Nothing before the cut means no gap to close: taking the FIRST thing on the
 *  page used to leave the blank line that had separated it from the second,
 *  and a document opening on two blank lines is a document that lost its first
 *  segment, written down. */
function cutSpans(md: string, spans: readonly { from: number; to: number }[]): string {
	let out = md;
	for (let i = spans.length - 1; i >= 0; i--) {
		const head = out.slice(0, spans[i].from).replace(/\s+$/, "");
		const tail = out.slice(spans[i].to).replace(/^\s+/, "");
		out = head ? `${head}\n\n${tail}` : tail;
	}
	return out;
}

/** Delete a cell, answer included — or, for an artifact, every declaration of
 *  its name, or the leftovers would re-derive as an artifact of the same name
 *  and the deleted frame would come back holding half its cells. Null when
 *  there is nothing to delete. */
export function deleteCell(md: string, segments: readonly DocSegment[], index: number): string | null {
	const runs = artifactRuns(md, segments, index);
	if (runs?.length) return cutSpans(md, runs);
	const span = cellExtent(md, segments, index);
	if (!span) return null;
	return cutSpans(md, [span]);
}

/**
 * Remove one segment — its marker line and body, and nothing else.
 *
 * The scalpel beside the two knives. `deleteCell` takes a prompt WITH its
 * answer; `deleteBlockText` takes a whole conversation; this takes what you
 * pointed at. Machine-written segments included, which is the point: a bad
 * reply used to cost you the prompt that asked for it.
 *
 * Deleting half a turn is a shape the transcript reader was already written to
 * survive (`documentMessages`, and `docs/document-format.md`): a call whose
 * result went keeps its call and is told so, a result naming no call is
 * dropped. The document IS the history, so this is an edit like any other —
 * undoable in the buffer, and the next send rebuilds from what is left.
 *
 * Two things travel with the segment, both because leaving them changes a
 * block nobody touched:
 *
 *  - **The fold marker in front of an opener.** Its whole job is to fold THIS
 *    segment into the block above. Orphaned, it would fold whatever comes next
 *    instead.
 *  - **Every other declaration of an artifact's name.** The leftovers re-derive
 *    as an artifact of the same name, and the frame you deleted comes back
 *    holding half its cells (`artifactRuns`).
 *
 * Null when there is nothing to take: an index out of range, or the page's
 * trailing empty prompt slot — that is where you type next, and
 * `trailingPromptRepair` would put it straight back.
 */
export function deleteSegment(md: string, segments: readonly DocSegment[], index: number): string | null {
	const seg = segments[index];
	if (!seg) return null;
	if (seg === segments[segments.length - 1] && seg.kind === "user" && !seg.text) return null;
	const runs = artifactRuns(md, segments, index);
	const spans = runs?.length
		? runs
		: [
				{
					// One segment's own span: itself, plus the fold marker in front of it when
					// it opens a block. Deliberately NOT `promptFrom`, which reaches back over a
					// whole run of attachments because a BLOCK span has to include them — here
					// that would make deleting the second of three images take the first two,
					// and deleting an empty prompt silently take the picture above it.
					from: opensBlock(seg.kind) && segments[index - 1]?.kind === "block" ? segments[index - 1].from : seg.from,
					to: cellSpan(md, seg).to,
				},
			];
	const next = cutSpans(md, spans);
	if (next === md) return null;
	// A page emptied of segments is a new page. `trailingPromptRepair` declines a
	// wholly blank document on purpose ("not this rule's business"), so the last
	// delete has to hand back what a new page opens with, frontmatter included —
	// the same ending `deleteBlockText` gives it.
	const body = parseDocument(next);
	if (!next.slice(body.bodyFrom).trim())
		return `${body.frontmatter ? `${body.frontmatter}\n\n` : ""}${YOU_MARKER}\n\n`;
	return next;
}

/** What Backspace at the head of an empty block does. */
export interface HeadBackspace {
	/** The document with the block removed — null when there is nothing to take
	 *  (the page's own trailing slot) and only the caret moves. */
	md: string | null;
	/** Where the caret goes: the end of the authored text above. */
	caret: number;
}

/**
 * Backspace at the head of an EMPTY block: take the block out.
 *
 * The buffer's change filter vets marker lines as structure, which is right for
 * every source there is — paste, cut, drag-drop — and a dead end for exactly one
 * gesture. Backspacing an empty block walks the caret up to the character after
 * the marker line and stops: the next keystroke would clip the marker, so it is
 * dropped, and there is no way to take an empty block back out from the keyboard.
 * This is that gesture, on top of the filter rather than a hole in it.
 *
 * Three rules, all deliberate:
 *
 *  - **Empty only.** A block holding a heading, prose or an answer is left
 *    standing and the keystroke does nothing. One press must never be able to
 *    swallow text — the block menu's delete is where that lives, with a label
 *    saying what it takes.
 *  - **One press, from anywhere in the blank body.** The caret rests one line
 *    below the head, on a blank line the format collapses to a sliver, so a rule
 *    that only fired at `bodyFrom` spent the first press on something invisible.
 *  - **Never the page's trailing slot.** That is where you type next, and
 *    `trailingPromptRepair` would put it straight back. There is still an answer
 *    for it: nothing is deleted and the caret moves to the end of the block
 *    above, so the keystroke is never a no-op.
 *
 * Null means "not this gesture" — the caller lets ordinary Backspace run.
 */
export function emptyBlockBackspace(
	md: string,
	segments: readonly DocSegment[],
	blocks: readonly DocBlock[],
	pos: number,
): HeadBackspace | null {
	let index = -1;
	for (let i = 0; i < segments.length; i++) if (segments[i].bodyFrom <= pos && pos <= segments[i].to) index = i;
	if (index < 0) return null;
	const seg = segments[index];
	// Prose the writer authored, and only that. An artifact marker carries NO
	// body, so "the body is empty" is true of every frame on the page — testing
	// `opensBlock` here would make a Backspace beside a frame delete the artifact.
	// A cell's body is its fence and is never blank.
	if (seg.kind !== "user" && seg.kind !== "note") return null;
	// The markerless leading segment has no head to back into.
	if (seg.bodyFrom === seg.from) return null;
	if (seg.text) return null;
	const block = blocks.find((b) => b.members.includes(index));
	if (!block) return null;
	// Where the caret ends up, read off the document as it stands: the end of the
	// last authored body above this one. Deliberately not "the last inked
	// character above", which is a marker line whenever the block above ends in
	// one — and a marker line is an atomic range the caret is kept out of.
	const above = restingPlace(md, segments, index);
	if (above === null) return null; // nothing above: deleting the only block is not what Backspace means
	// The block's own segment is the gesture's subject only when the rest of the
	// block is blank too; anything else in it is content, and content is the
	// block menu's business, with a label saying what it takes.
	if (block.opensAt === index && !blockIsBlank(segments, block, index)) return null;
	// An attachment is content the same way a reply is. Backspace must not take
	// the image, and it must not take the prompt out from under it either — the
	// block menu owns removals that carry something you can see.
	if (block.members.some((m) => segments[m].kind === "file")) return null;
	const next =
		block.opensAt === index ? deleteBlockText(md, blockKeyOf(segments, block)) : deleteSegment(md, segments, index);
	// `deleteBlockText` and `deleteSegment` both refuse the page's own trailing
	// slot. That refusal is the whole answer for it: keep the slot, move the caret.
	if (next === null || next === md) return { md: null, caret: above };
	return { md: next, caret: caretAfterCut(md, next) };
}

/** Whether a block holds nothing but the empty segment at `index`. Attachments
 *  count as content — an image staged for a prompt is something to lose. The
 *  trailing slot and the fold marker binding it are the PAGE's, not the block's
 *  (`blockEndIndex`), so they never make a block look occupied. */
function blockIsBlank(segments: readonly DocSegment[], block: DocBlock, index: number): boolean {
	const end = blockEndIndex(segments, block);
	return !block.members.some((i) => i <= end && i !== index && (segments[i].kind === "file" || !!segments[i].text));
}

/** The end of the last authored body above segment `index`, or null when there
 *  is none. Fold markers and attachments are skipped: neither is a place to
 *  leave a caret. */
function restingPlace(md: string, segments: readonly DocSegment[], index: number): number | null {
	for (let i = index - 1; i >= 0; i--) {
		const seg = segments[i];
		if (seg.kind === "block" || seg.kind === "file") continue;
		return seg.bodyFrom + md.slice(seg.bodyFrom, seg.to).replace(/\s+$/, "").length;
	}
	return null;
}

/** Where the caret lands after a cut, given only the two whole documents.
 *  `deleteBlockText` and `deleteSegment` are pure string functions, so the
 *  splice is recovered here the way `replaceDocument` recovers it: the common
 *  prefix ends where the cut began. */
function caretAfterCut(md: string, next: string): number {
	let cut = 0;
	const limit = Math.min(md.length, next.length);
	while (cut < limit && md.charCodeAt(cut) === next.charCodeAt(cut)) cut++;
	const { segments, bodyFrom } = parseDocument(next);
	let at = bodyFrom;
	// Segments ENTIRELY above the cut. The common prefix runs a few characters
	// into the marker that replaced the deleted one (`<!-- ` is shared), so a
	// `from < cut` test claims the segment the cut landed in and parks the caret
	// at the bottom of the page instead of above the hole.
	for (const seg of segments) {
		if (seg.to > cut || seg.kind === "block" || seg.kind === "file") continue;
		at = seg.bodyFrom + next.slice(seg.bodyFrom, seg.to).replace(/\s+$/, "").length;
	}
	return Math.min(at, next.length);
}

/**
 * Delete the span `[from, to)` — a selection the writer dragged — and put
 * `insert` in its place.
 *
 * The gesture the change filter left no answer for. Marker lines are structure,
 * so the filter drops any change that clips one, and a drag from the middle of
 * one body to the middle of another clips the marker of the segment it ends in
 * — every time. Backspace, Delete, cut and select-and-type all did nothing at
 * all, and nothing said why. This is the delete that gesture meant.
 *
 * **Exactly what was highlighted, and not one character more.** Segments the
 * span covers whole go marker and all; the segment it starts in and the segment
 * it ends in keep their markers and lose only the selected part of their bodies.
 * The two survivors are NOT merged. A marker is a role — `messagesFrom` replays
 * the transcript from it — so folding a reply's leftover text under a `<!-- you
 * -->` head would silently make the writer the author of what pi said. Rounding
 * the span outward to whole blocks was the other way to answer this and is the
 * same bug from the other side: a drag that overshoots by a character would eat
 * a turn nobody selected.
 *
 * Null means "not this gesture" — the caller lets the buffer's own delete run.
 */
export function deleteRange(
	md: string,
	segments: readonly DocSegment[],
	from: number,
	to: number,
	insert = "",
): { md: string; caret: number } | null {
	const { frontmatter, bodyFrom: pageFrom } = parseDocument(md);
	let a = Math.max(from, pageFrom); // frontmatter is not content
	let z = Math.min(to, md.length);
	if (a >= z) return null;

	// The segment each end lands in. A drag endpoint parked at a marker line's
	// start belongs to NO segment by this test (`bodyFrom > pos`), which is
	// exactly right: at the head end that marker is inside the span and goes, at
	// the tail end it is outside and stays.
	const inBodyAt = (pos: number) => {
		let found = -1;
		for (let i = 0; i < segments.length; i++) if (segments[i].bodyFrom <= pos) found = i;
		return found;
	};
	// An end that fell INSIDE a marker line — reachable only from code, since the
	// buffer covers marker lines with atomic ranges a pointer cannot land in.
	// An end ON a marker's first character is not inside it — that is exactly
	// where `skipAtomic` parks a drag, and there the marker is squarely within
	// the span and goes. Only an end STRICTLY inside one is snapped, and then by
	// one rule for both: an end in a marker line never takes that marker.
	// The head end steps past it, the tail end stops in front of it, and the line
	// survives whole either way — half a marker is not a marker. Left unsnapped
	// this produced an INVERTED span, which `cutSpans` answered by DUPLICATING
	// the text between the two ends.
	const markerAt = (pos: number) => {
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			if (seg.from < pos && pos < seg.bodyFrom) return i;
		}
		return -1;
	};
	const ma = markerAt(a);
	if (ma >= 0) a = segments[ma].bodyFrom;
	const mz = markerAt(z);
	if (mz >= 0) z = segments[mz].from;
	if (a >= z) return null;

	let head = inBodyAt(a);
	let tail = inBodyAt(z);
	if (tail < 0) return null;

	// A payload body is a fence, and half a fence is not a document — the
	// unterminated-fence failure that makes the compiler report errors in cells
	// nobody wrote. Snap INWARD so the segment survives whole rather than
	// outward, which would delete text the writer never highlighted. Folded
	// payloads are atomic ranges a drag cannot land inside; this is the net for
	// the ones shown as source.
	// Both tests ask the same thing — would the span leave the fence in halves? —
	// so a span that covers a payload END TO END still takes it whole, marker
	// included: an empty `pi:tool` head is wreckage, not something to type into.
	if (head >= 0 && FENCED_BODY.has(segments[head].kind) && a > segments[head].bodyFrom)
		a = md.slice(segments[head].bodyFrom, a).trim() ? segments[head].to : segments[head].from;
	if (FENCED_BODY.has(segments[tail].kind) && z > segments[tail].bodyFrom && md.slice(z, segments[tail].to).trim())
		z = segments[tail].bodyFrom;
	// The page's own trailing slot is where you type next. `deleteSegment`
	// refuses it and `trailingPromptRepair` would put it straight back.
	const last = segments[segments.length - 1];
	const slot = last.kind === "user" && !last.text;
	if (slot && z > last.bodyFrom) z = last.bodyFrom;
	head = inBodyAt(a);
	tail = inBodyAt(z);
	if (a >= z || tail < 0) return null;

	const end = segments[tail];
	// Does the segment the span ends in keep anything? A `to` that lands on the
	// NEXT marker line covered this one whole — leaving its head standing over an
	// empty body would be a segment the writer selected all of and did not get
	// rid of. The trailing slot is the exception: it is kept whatever happens.
	const keepsTail = (end === last && slot) || !!md.slice(z, end.to).trim();
	// One body, with text left under the span: no marker is touched, so this is
	// the buffer's own delete and taking it would only mean re-implementing it
	// worse. A span that runs to the END of one body is a different thing — it
	// eats the blank line holding the next marker at the start of its own line,
	// and a marker mid-line is not a marker at all. `cutSpans` puts that line
	// back, so the gesture goes through here rather than dissolving a turn.
	if (head === tail && keepsTail) return null;
	const spans: { from: number; to: number }[] = [];
	if (keepsTail) {
		if (a < end.from) spans.push({ from: a, to: end.from });
		if (end.bodyFrom < z) spans.push({ from: end.bodyFrom, to: z });
	} else {
		spans.push({ from: a, to: end.to });
	}
	// An artifact taken whole takes every OTHER declaration of its name with it.
	// The leftovers re-derive as an artifact of the same name, so the frame you
	// just deleted comes back holding half its cells (`artifactRuns`). Only
	// segments the span covers ENTIRELY qualify — the two boundary segments
	// survive, so their declaration is not gone.
	for (let i = head + 1; i < (keepsTail ? tail : tail + 1); i++) {
		if (segments[i].kind !== "artifact") continue;
		for (const run of artifactRuns(md, segments, i) ?? [])
			if (run.to <= a || run.from >= z) spans.push({ from: run.from, to: run.to });
	}
	spans.sort((x, y) => x.from - y.from);
	let next = cutSpans(md, spans);

	// Where the caret lands, and where `insert` goes. `cutSpans` trims the head's
	// trailing whitespace, so the junction is the trimmed length of everything
	// above the cut. The clamp is load-bearing: a head whose whole body was
	// selected trims back INTO its marker line, which is an atomic range the
	// caret is kept out of. Nothing above `a` moved, so the head's `bodyFrom`
	// still means what it meant.
	const junction = md.slice(0, a).replace(/\s+$/, "").length;
	let caret = head < 0 ? junction : Math.max(segments[head].bodyFrom, junction);
	caret = Math.min(caret, next.length);
	if (insert) next = next.slice(0, caret) + insert + next.slice(caret);
	caret += insert.length;

	if (next === md) return null;
	// A page emptied of segments is a new page — the same ending `deleteSegment`
	// and `deleteBlockText` both give it, frontmatter included. "Emptied" is
	// about content, not characters: dragging from the top of the page to the
	// bottom leaves the head's marker standing over nothing, above the trailing
	// slot, and two blank prompts in a row is not a page anybody typed.
	const body = parseDocument(next);
	const bare = (s: DocSegment) => !s.text && (s.kind === "user" || s.kind === "note" || s.kind === "block");
	if (!next.slice(body.bodyFrom).trim() || body.segments.every(bare)) {
		next = `${frontmatter ? `${frontmatter}\n\n` : ""}${YOU_MARKER}\n\n`;
		caret = next.length;
	}
	return { md: next, caret };
}

/** Segment kinds whose body is a payload — a fence, or nothing — rather than
 *  prose. Clipping one leaves an unterminated fence; `opaque` is here because a
 *  marker nobody understands may hold anything. */
const FENCED_BODY = new Set<DocSegmentKind>(["toolCall", "toolResult", "cell", "view", "file", "artifact", "opaque"]);

/**
 * Move a cell so it sits immediately before `beforeIndex` (null = the end of
 * the page, but above the trailing prompt slot — an empty slot is where you
 * type next, never a thing to bury). Null when the move is impossible or a
 * no-op.
 */
export function moveCell(
	md: string,
	segments: readonly DocSegment[],
	index: number,
	beforeIndex: number | null,
): string | null {
	const span = cellExtent(md, segments, index);
	if (!span) return null;
	// An artifact travels whole — every declaration of its name, gathered under
	// the single marker that lands. See `artifactRuns`.
	const runs = artifactRuns(md, segments, index) ?? [{ ...span, marker: index }];
	const tail = segments[segments.length - 1];
	const pending = tail?.kind === "user" && !tail.text ? segments.length - 1 : -1;
	// The slot is the page's, not a cell: moved, it would leave a bare prompt
	// marker under whatever it landed after.
	if (index === pending) return null;
	if (beforeIndex === null && pending >= 0) beforeIndex = pending;
	const dest = beforeIndex === null ? null : cellExtent(md, segments, beforeIndex);
	let at = dest ? dest.from : md.replace(/\s+$/, "").length;
	if (beforeIndex === index || (dest && runs.some((r) => at >= r.from && at <= r.to))) return null;
	// The fold marker binds a cell to whatever sits above it, so it cannot
	// travel: a moved cell opens a block where it lands. The marker is still cut
	// from the origin — left behind it would fold the wrong pair.
	let chunk = gatherChunk(md, segments, index, runs);
	if (!chunk) return null;
	// A bare leading cell has no marker of its own; moving it below anything
	// needs one, or its text merges into what it lands after.
	if (segments[index].bodyFrom === segments[index].from) chunk = `${YOU_MARKER}\n\n${chunk}`;
	let cut = md;
	for (let i = runs.length - 1; i >= 0; i--) {
		cut = cut.slice(0, runs[i].from) + cut.slice(runs[i].to);
		// `at` is never inside a run (refused above) except at the very end of the
		// page, where clamping lands it exactly where the run was.
		if (at > runs[i].from) at -= Math.min(at, runs[i].to) - runs[i].from;
	}
	// …and a bare leading cell at the destination needs one too, or the moved
	// chunk's tail merges into it.
	const destSeg = beforeIndex === null ? null : segments[beforeIndex];
	const suffix = destSeg && destSeg.bodyFrom === destSeg.from ? `\n\n${YOU_MARKER}` : "";
	const head = cut.slice(0, at).replace(/\s+$/, "");
	const rest = cut.slice(at).replace(/^\s+/, "");
	const next = `${head ? `${head}\n\n` : ""}${chunk}${suffix}${rest ? `\n\n${rest}` : "\n"}`;
	return next === md ? null : dropLeadingFold(next);
}

/**
 * Move the cell whose marker sits at `from` into the gap before the cell at
 * `beforeFrom` (null = the end). Offsets are what the canvas's drag reports
 * (`cell-move`), resolved against the document as it stands at the drop. Null
 * when no cell starts at `from`, or the move is a no-op.
 *
 * A `beforeFrom` no cell starts at moves to the end rather than refusing: the
 * gap's offset can go stale under a drag, and that reads as the end of the
 * page.
 */
export function moveCellByOffset(md: string, from: number, beforeFrom: number | null): string | null {
	const segments = parseDocument(md).segments;
	const index = segments.findIndex((seg) => seg.from === from);
	if (index < 0) return null;
	const before = beforeFrom === null ? -1 : segments.findIndex((seg) => seg.from === beforeFrom);
	return moveCell(md, segments, index, before < 0 ? null : before);
}

/**
 * The text a move carries: the addressed cell as it stands, with the
 * attachments in front of it, or — for an artifact — one marker line followed
 * by the cells of every declaration of its name, in document order. Superseded
 * definitions travel too: which one is live is `artifactsFrom`'s reading of the
 * order, not a fence this may throw away.
 *
 * The attachments travel because the cut takes them (`promptFrom`); the fold
 * marker in front of them is cut and not carried, as `moveCell` explains.
 */
function gatherChunk(
	md: string,
	segments: readonly DocSegment[],
	index: number,
	runs: readonly { from: number; to: number; marker: number }[],
): string {
	const seg = segments[index];
	if (seg.kind !== "artifact") return md.slice(segments[leadIndex(segments, index) + 1]!.from, runs[0].to).replace(/\s+$/, "");
	const marker = cellSpan(md, seg);
	const bodies = runs.map((r) => md.slice(cellSpan(md, segments[r.marker]).to, r.to).trim()).filter(Boolean);
	return [md.slice(marker.from, marker.to), ...bodies].join("\n\n");
}

/** A fold marker ahead of every authored cell has nothing to fold into. The
 *  parser already treats it as opening normally, so this is tidying, not
 *  repair — but a marker that means nothing is a marker that will confuse the
 *  next reader of the file. */
function dropLeadingFold(md: string): string {
	const { segments, bodyFrom } = parseDocument(md);
	const first = segments[0];
	if (first?.kind !== "block") return md;
	return md.slice(0, bodyFrom) + md.slice(first.to).replace(/^\s+/, "");
}

/**
 * The lines the prompt at `index` carries in front of its text when it runs
 * (`document-format.md` §Snippets): what the user has set on the page's cells,
 * when that differs from the last snapshot sent above it, and which artifact
 * the prompt is about, when its block or the one above holds one. `values` is
 * the page's named exports, JSON-safe.
 */
export function promptPrefixes(md: string, index: number, values: Readonly<Record<string, unknown>>): string[] {
	const { segments } = parseDocument(md);
	const prompt = segments[index];
	if (prompt?.kind !== "user") return [];
	const lines: string[] = [];
	const json = JSON.stringify(values);
	if (json !== "{}" && json !== lastValues(md.slice(0, prompt.from))) lines.push(`${VALUES_MARK} ${json}`);
	const scope = artifactInScope(segments, blocksFrom(segments), artifactsFrom(md, segments), prompt.to);
	if (scope) lines.push(artifactScope(scope));
	return lines;
}

/** The payload of the last `[cell values]` line in `md`, or null. */
function lastValues(md: string): string | null {
	let found: string | null = null;
	for (const line of md.split("\n")) if (line.startsWith(`${VALUES_MARK} `)) found = line.slice(VALUES_MARK.length + 1).trim();
	return found;
}
