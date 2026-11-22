// What each of the canvas's menus offers, and what each item does.
//
// The canvas raises the gesture (`cell-menu`, …) and the page decides the rows.
// The rows are specified by the interaction (ADR 0010) — labels, order, when
// an item is disabled — and every edit goes through the pure
// functions in `src/document/`, applied as an undoable splice.

import { type DocumentChat, roleLabel } from "../src/components/DocumentChat.ts";
import {
	BLOCK_MARKER,
	blockKeyOf,
	blocksFrom,
	type DocSegment,
	deleteBlockText,
	parseDocument,
	serializeView,
	snippetQuote,
} from "../src/document/format.ts";
import {
	answerRange,
	type CellMode,
	cellMode,
	deleteCell,
	deleteSegment,
	duplicateCell,
	replySlot,
	setCellMode,
} from "../src/document/run.ts";
import { viewOverArtifact } from "../src/document/views.ts";
import { askInput } from "./ask.ts";
import type { HostFragment } from "./canvas-events.ts";
import type { AppContext } from "./context.ts";
import { type MenuItem, openMenu } from "./menu.ts";

/** What a menu needs from the page. */
export type MenuHost = Pick<AppContext, "chat" | "busy" | "sendPrompt" | "notify">;

/** The parsed document plus the index of the cell a menu offset names. */
function cellAt(chat: DocumentChat, from: number) {
	const md = chat.getDocument();
	const segments = parseDocument(md).segments;
	return { md, segments, index: segments.findIndex((seg) => seg.from === from) };
}

/** Puts a pure edit's result in the buffer: undoable, and every other live cell
 *  left standing. Null is an edit that did not apply. */
function apply(chat: DocumentChat, next: string | null): void {
	if (next !== null) chat.replaceDocument(next);
}

/** Runs the prompt at `from` — the same path ⌘⏎ takes, addressed by offset. */
function runCell(host: MenuHost, from: number): void {
	const { segments, index } = cellAt(host.chat, from);
	if (index < 0 || segments[index]!.kind !== "user") return;
	host.sendPrompt(segments[index]!.text, segments[index]!.bodyFrom);
}

/**
 * Removes exactly the segment at `from` — a prompt without its answer, a reply
 * without its prompt. Not while a turn writes into the page. Its fold goes
 * first, while the segment is still there to name.
 */
function removeSegment(host: MenuHost, from: number): void {
	if (host.busy()) return;
	const { md, segments, index } = cellAt(host.chat, from);
	if (index < 0) return;
	host.chat.purgeSegmentFolds(from);
	apply(host.chat, deleteSegment(md, segments, index));
}

const MODES: readonly { id: CellMode; label: string }[] = [
	{ id: "markdown", label: "Markdown" },
	{ id: "prompt", label: "Prompt" },
	{ id: "js", label: "JavaScript" },
];

/** A cell's own menu, from its grip: run it, change what it is, copy or delete
 *  it. Null when the cell is gone. */
export function cellMenu(host: MenuHost, from: number): MenuItem[] | null {
	const { chat } = host;
	const { segments, index } = cellAt(chat, from);
	const seg = segments[index];
	const mode = seg ? cellMode(seg) : null;
	if (!mode) return null;
	const isPrompt = mode === "prompt";
	const answered = isPrompt && answerRange(segments, index) !== null;
	// Resolved again when the item runs, against the document as it is then.
	const edit = (make: (md: string, segments: readonly DocSegment[], i: number) => string | null) => () => {
		const now = cellAt(chat, from);
		if (now.index >= 0) apply(chat, make(now.md, now.segments, now.index));
	};
	const items: MenuItem[] = [
		{
			label: answered ? "run again" : "run",
			disabled: !isPrompt || host.busy(),
			title: answered ? "Run again — the answer below is replaced" : "Run this prompt",
			run: () => runCell(host, from),
		},
		{ section: "mode" },
		...MODES.map((m) => ({
			label: `${m.label}${m.id === mode ? " ·" : ""}`,
			disabled: m.id === mode,
			run: edit((md, segs, i) => setCellMode(md, segs[i]!, m.id)),
		})),
		{ section: "cell" },
		{ label: "duplicate", run: edit((md, segs, i) => duplicateCell(md, segs[i]!)) },
		{
			label: answered ? "delete (with answer)" : "delete",
			title: answered ? "Deletes the answer under it too" : "Delete this cell",
			run: edit((md, segs, i) => deleteCell(md, segs, i)),
		},
	];
	// The prompt alone. A block-opening prompt's head carries the block's ⋯, not
	// a segment's, so the narrow delete has to live here.
	if (answered)
		items.push({
			label: "delete (keep the answer)",
			title: "Delete the prompt and leave its answer standing",
			run: () => removeSegment(host, from),
		});
	return items;
}

/**
 * A step's own menu, from the `⋯` on its head: what to do with *this* line.
 * Two entries at most — everything wider has a home already, the block head
 * for the conversation and the grip for a cell. Null when the step is gone.
 */
export function segmentMenu(host: MenuHost, from: number): MenuItem[] | null {
	const { segments, index } = cellAt(host.chat, from);
	const seg = segments[index];
	if (!seg) return null;
	// A reply's "run again" is its prompt's: the send cuts the old answer and
	// writes the new one in the gap it leaves.
	let prompt: DocSegment | null = null;
	if (seg.kind === "assistant")
		for (let i = index - 1; i >= 0; i--)
			if (segments[i]!.kind === "user" && segments[i]!.text) {
				prompt = segments[i]!;
				break;
			}
	const items: MenuItem[] = [];
	if (prompt) {
		const at = prompt.from;
		items.push({
			label: "run again",
			disabled: host.busy(),
			title: "Run the prompt above again — this answer is replaced",
			run: () => runCell(host, at),
		});
	}
	items.push(
		{ section: roleLabel(seg) },
		{
			label: "delete",
			destructive: true,
			title: "Remove just this — nothing above or below it moves. ⌘Z takes it back.",
			run: () => removeSegment(host, from),
		},
	);
	return items;
}

/**
 * A right-click inside a selection: quote it for a follow-up. A selection means
 * "answer THIS part", so the quote lands in the reply slot of the block the
 * selection STARTS in, not at the foot of the page.
 */
export function quoteMenu(host: MenuHost, sel: { text: string; from: number }): MenuItem[] {
	return [
		{
			label: "quote for follow-up",
			run: () =>
				host.chat.edit((md, parsed) => replySlot(md, parsed.segments, sel.from, snippetQuote(sel.text))),
		},
	];
}

/** Answer this block: stage an empty reply slot under it, the caret in it. */
function answerBlock(chat: DocumentChat, from: number): void {
	chat.edit((md, parsed) => {
		const segments = parsed.segments;
		const tail = segments[segments.length - 1];
		// Clicking the pending prompt's own head means "this answers the block
		// above": a bare caret move would read as nothing happening, so the fold
		// marker makes it visible.
		if (
			tail?.kind === "user" &&
			tail.from === from &&
			tail.bodyFrom > tail.from &&
			segments[segments.length - 2]?.kind !== "block"
		) {
			const insert = `${BLOCK_MARKER}\n\n`;
			const body = md.slice(tail.bodyFrom, tail.to).replace(/\s+$/, "");
			return { changes: { from: tail.from, insert }, caret: tail.bodyFrom + insert.length + body.length };
		}
		return replySlot(md, segments, from);
	});
}

/** A rendered view below the last result in the block that a template fits. */
function insertViewOverArtifact(host: MenuHost, blockFrom: number): void {
	let found = false;
	host.chat.edit((md, parsed) => {
		const block = blocksFrom(parsed.segments).find((b) => parsed.segments[b.opensAt]!.from === blockFrom);
		if (!block) return null;
		for (let k = block.members.length - 1; k >= 0; k--) {
			const extracted = viewOverArtifact(parsed.segments, block.members[k]!);
			if (!extracted) continue;
			const seg = parsed.segments[block.members[k]!]!;
			const cut = md.slice(0, seg.to).replace(/\s+$/, "").length;
			const view = serializeView(extracted.template, crypto.randomUUID().slice(0, 8), extracted.data);
			const insert = `\n\n${view}\n\n`;
			found = true;
			return { changes: { from: cut, to: seg.to, insert }, caret: cut + insert.length };
		}
		return null;
	});
	// The item is disabled where nothing fits, so this is the document having
	// changed under the open menu.
	if (!found) host.notify("No result here a view template fits.");
}

/**
 * Names a block: asks inside the document, then writes, replaces or removes the
 * block's `##` heading — the file is where a block's name lives.
 */
function renameBlock(chat: DocumentChat, from: number): void {
	const md = chat.getDocument();
	const seg = parseDocument(md).segments.find((s) => s.kind === "user" && s.from === from);
	if (!seg) return;
	const heading = /^(#{1,6}) (.*)$/m.exec(md.slice(seg.bodyFrom, seg.to));
	void askInput(chat, { title: "Block name", placeholder: "empty removes the heading", prefill: heading?.[2] ?? "" }).then(
		(value) => {
			if (value === null) return;
			const name = value.trim();
			// Found again by its text, against the live document: it may have
			// changed while the question was open, and every offset with it.
			chat.edit((now, fresh) => {
				const cur = fresh.segments.find((s) => s.kind === "user" && s.text === seg.text);
				if (!cur) return null;
				const head = /^(#{1,6}) (.*)$/m.exec(now.slice(cur.bodyFrom, cur.to));
				if (head) {
					const at = cur.bodyFrom + head.index;
					const insert = name ? `${head[1]} ${name}` : "";
					const to = name ? at + head[0].length : Math.min(at + head[0].length + 1, cur.to);
					return { changes: { from: at, to, insert }, caret: at + insert.length };
				}
				if (!name) return null;
				const insert = cur.bodyFrom === cur.from ? `## ${name}\n\n` : `\n## ${name}\n`;
				return { changes: { from: cur.bodyFrom, insert }, caret: cur.bodyFrom + insert.length };
			});
		},
	);
}

/**
 * Removes a whole block. No confirmation: it is an undoable splice, so ⌘Z
 * brings it back whole. Not while a turn writes into the page.
 */
function deleteBlock(host: MenuHost, from: number): void {
	if (host.busy()) return;
	const before = host.chat.getDocument();
	const segs = parseDocument(before).segments;
	const block = blocksFrom(segs).find((b) => segs[b.opensAt]!.from === from);
	if (!block) return;
	// Expanded first, while the block is still there to name. The editor maps a
	// fold through a deletion onto where the text was cut, which is the head of
	// the block below — so a collapsed block deleted as it stood would hand its
	// fold to its neighbour. Expanding also tells the host, which forgets it.
	if (host.chat.blockFolds().includes(from)) host.chat.toggleBlockFold(from);
	apply(host.chat, deleteBlockText(before, blockKeyOf(segs, block)));
}

/** A block's menu, from its head or a right-click on it. Null when the block
 *  is gone. */
export function blockMenu(host: MenuHost, from: number): MenuItem[] | null {
	const parsed = parseDocument(host.chat.getDocument());
	const block = blocksFrom(parsed.segments).find((b) => parsed.segments[b.opensAt]!.from === from);
	if (!block) return null;
	const hasArtifact = block.members.some((i) => viewOverArtifact(parsed.segments, i));
	// What "delete" takes here. A block of conversation keeps its cells
	// (`deleteBlockText`); a block that IS an artifact goes whole, and the label
	// says which one you are looking at.
	const opener = parsed.segments[block.opensAt]!.kind;
	const isArtifact = opener === "artifact" || opener === "cell";
	const keepsCells = !isArtifact && block.members.some((i) => parsed.segments[i]!.kind === "cell");
	return [
		{ label: "answer this block", run: () => answerBlock(host.chat, from) },
		{
			label: "insert view over artifact",
			disabled: !hasArtifact,
			title: hasArtifact ? "Insert a rendered view below the result" : "No result here a view template fits",
			run: () => insertViewOverArtifact(host, from),
		},
		{ label: "rename block", run: () => renameBlock(host.chat, from) },
		{ label: "collapse / expand block", run: () => host.chat.toggleBlockFold(from) },
		{ section: "block" },
		{
			label: isArtifact ? "delete artifact" : keepsCells ? "delete block (keeps the artifact)" : "delete block",
			destructive: true,
			title: isArtifact
				? "Remove this artifact and every cell in it. ⌘Z takes it back."
				: keepsCells
					? "Remove the prompt and its reply. The artifact stays — delete it from its own frame. ⌘Z takes it back."
					: "Remove this block — its prompt, its reply, and everything under it. ⌘Z takes it back.",
			run: () => deleteBlock(host, from),
		},
	];
}

/** The canvas's four menu gestures, each opening its menu. `more` is rows
 *  another module adds under a block's own, for the block that opens at
 *  `from` and a menu anchored at (x, y). */
export function menuHandlers(host: MenuHost, more: (from: number, x: number, y: number) => MenuItem[] = () => []): HostFragment<"cell-menu" | "segment-menu" | "block-menu" | "selection-menu"> {
	return {
		"cell-menu": ({ from, x, y }) => openMenu(x, y, cellMenu(host, from)),
		// A step's ⋯ and the block head's menu are idle-only: a page being written
		// to is not a page to do surgery on.
		"segment-menu": ({ from, x, y }) => {
			if (!host.busy()) openMenu(x, y, segmentMenu(host, from));
		},
		"block-menu": ({ from, x, y }) => {
			if (host.busy()) return;
			const rows = blockMenu(host, from);
			openMenu(x, y, rows && [...rows, ...more(from, x, y)]);
		},
		"selection-menu": (sel) => openMenu(sel.x, sel.y, quoteMenu(host, sel)),
	};
}

