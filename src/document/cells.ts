// Reactive cells in the document (integration plan, phase 3) — a `pi:cell
// MODE #id` segment carries its source in the first fenced block, exactly as
// a view carries its payload. The source stays *editable text* in the
// document (the editor is the cell editor); only the output is a widget.
// The engine that runs cells lives behind a lazy import in DocumentChat —
// this module is pure parsing and stays light.
import type { DocBlock, DocSegment, DocSegmentKind } from "./format.ts";
import { ARTIFACT_MARK, fence, fenceTicks, promptFrom, serializeCell } from "./format.ts";

/** Modes a document cell may run. Mirrors notebook-kit's CellMode minus the
 *  database-backed ones (sql needs a connector — deferred with phase 5).
 *  Unknown modes stay honest plain fences: parsed, never executed. */
export const CELL_MODES = [
  "js",
  "ts",
  "ojs",
  "md",
  "html",
  "tex",
  "dot",
] as const;
export type DocCellMode = (typeof CELL_MODES)[number];

/** A text edit in the document's own coordinates — what CodeMirror calls a
 *  change, and what a host dispatches so positions map instead of resetting. */
export interface DocChange {
	from: number;
	to: number;
	insert: string;
}

export interface DocCell {
  id: string;
  mode: DocCellMode;
  source: string;
  /** Artifact group — members render together at the group's first cell. */
  group?: string;
  /** The cell's segment (marker + fence). */
  seg: DocSegment;
  /** Widget anchor: end of the closing fence line — output renders below.
   *  Also the end of the fence itself: [fenceFrom, at) is the whole block. */
  at: number;
  /** Start of the opening fence line. Replacing [fenceFrom, at) rewrites the
   *  delimiters too, which is what any write whose source may contain a
   *  backtick run has to do — see `cellWrite`. */
  fenceFrom: number;
  /** How many backticks the current delimiters use. */
  ticks: number;
  /** Fence content range — the span a write-back replaces when the delimiters
   *  are already wide enough to hold the new source. */
  srcFrom: number;
  srcTo: number;
}

/**
 * Extract a cell segment's source: the first fenced block in the segment.
 * Returns the raw source, its content range [srcFrom, srcTo), the start of the
 * opening fence line, and the offset of the closing fence line's end — so a
 * caller can replace either the content or the whole fence.
 * Null when the fence is unclosed (mid-edit) — the cell then neither runs
 * nor unruns; the last synced definition stays live. That promise is the
 * caller's to keep: `syncCells` retracts on the SEGMENT leaving the document,
 * not on this returning null, or a fence unclosed for one keystroke would take
 * the running cell and its open editor down with it.
 */
export function cellSource(
  md: string,
  seg: DocSegment,
): { source: string; ticks: number; fenceFrom: number; srcFrom: number; srcTo: number; to: number } | null {
  let open: { ticks: number; fenceFrom: number; contentFrom: number } | null = null;
  for (let at = seg.bodyFrom; at < seg.to; ) {
    const nl = md.indexOf("\n", at);
    const lineEnd = nl >= 0 && nl < seg.to ? nl : seg.to;
    const line = md.slice(at, lineEnd);
    if (!open) {
      const m = /^(`{3,})\S*\s*$/.exec(line);
      if (m) open = { ticks: m[1].length, fenceFrom: at, contentFrom: lineEnd + 1 };
    } else {
      const m = /^(`{3,})\s*$/.exec(line);
      if (m && m[1].length >= open.ticks) {
        const srcTo = at > open.contentFrom ? at - 1 : open.contentFrom;
        return {
          source: md.slice(open.contentFrom, srcTo),
          ticks: open.ticks,
          fenceFrom: open.fenceFrom,
          srcFrom: open.contentFrom,
          srcTo,
          to: lineEnd,
        };
      }
    }
    if (nl < 0 || nl >= seg.to) break;
    at = nl + 1;
  }
  return null;
}

/** Every runnable cell in the document: known mode, id, closed fence. */
/** One cell segment → a cell, or null when it is not one the engine can run
 *  (unknown mode, unclosed fence mid-edit). */
export function cellOf(md: string, seg: DocSegment): DocCell | null {
	if (seg.kind !== "cell" || !seg.id || !seg.name) return null;
	if (!(CELL_MODES as readonly string[]).includes(seg.name)) return null;
	const src = cellSource(md, seg);
	if (!src) return null;
	return {
		id: seg.id,
		mode: seg.name as DocCellMode,
		source: src.source,
		group: seg.group,
		seg,
		at: src.to,
		fenceFrom: src.fenceFrom,
		ticks: src.ticks,
		srcFrom: src.srcFrom,
		srcTo: src.srcTo,
	};
}

export function cellsFrom(md: string, segments: readonly DocSegment[]): DocCell[] {
	const cells: DocCell[] = [];
	for (const seg of segments) {
		const cell = cellOf(md, seg);
		if (cell) cells.push(cell);
	}
	return cells;
}

/**
 * The change that writes `source` into `cell`'s fence, or null when the text
 * already agrees (an unchanged write would re-run the cell for nothing, and
 * that is what terminates a write-back's own re-run loop).
 *
 * Content-only while the delimiters can hold the new source — the cheap case,
 * and the one a dragged slider takes hundreds of times. Whole-fence as soon as
 * they cannot: splicing a ``` line into a three-tick fence closes the fence
 * early, `cellSource` reads a truncated cell or none at all, and the write
 * meant to save the cell is what loses it.
 */
export function cellWrite(cell: DocCell, source: string): DocChange | null {
	if (cell.source === source) return null;
	if (fenceTicks(source) > cell.ticks) return { from: cell.fenceFrom, to: cell.at, insert: fence(source, cell.mode) };
	// An empty fence has a zero-width content range on the closing fence line —
	// the inserted source needs its own line back.
	const insert = cell.srcFrom === cell.srcTo && source ? `${source}\n` : source;
	return { from: cell.srcFrom, to: cell.srcTo, insert };
}

/**
 * Output anchor per cell id, artifact groups applied: a grouped cell anchors
 * at its group's first member in document order; an ungrouped cell at its own
 * closing fence. Pure derivation — recomputed from the live cells on every
 * sync, so deletions and redefinitions self-heal (the anchor is wherever the
 * group's earliest *surviving* member sits now).
 */
export function cellAnchors(cells: readonly DocCell[]): Map<string, number> {
  const groupAt = new Map<string, number>();
  const anchors = new Map<string, number>();
  for (const cell of [...cells].sort((a, b) => a.at - b.at)) {
    let at = cell.at;
    if (cell.group !== undefined) {
      const known = groupAt.get(cell.group);
      if (known === undefined) groupAt.set(cell.group, cell.at);
      else at = known;
    }
    anchors.set(cell.id, at);
  }
  return anchors;
}

/** Short random id for a fresh cell (document-unique in practice). */
export function newCellId(): string {
  return crypto.randomUUID().slice(0, 6);
}

/** The `/cell` snippet: an empty cell with the caret inside the fence. */
export function newCellSnippet(mode: DocCellMode = "js"): {
  text: string;
  caret: number;
} {
  const text = serializeCell(mode, newCellId(), "");
  // serializeCell fences an empty source as ```MODE\n\n``` — the caret goes
  // onto that blank line (right before the closing fence).
  return { text, caret: text.length - 4 };
}

/** One artifact: a run of cells that reads as a single thing. Derived from the
 *  document on every parse, never stored — same rule blocks follow. */
export interface DocArtifact {
	/** Stable within a parse: `@group` for a declared group, else the first
	 *  member's id. Used to key the live element registry. */
	key: string;
	/** Members in document order. The last definition of an id is the live one;
	 *  superseded fences are history and are not members. */
	members: DocCell[];
	/** Output anchor: end of the last inked segment of the block the artifact's
	 *  last member sits in — i.e. under that turn's answer. */
	at: number;
}

/** Segment kinds that may sit between two cells without breaking a run: the
 *  fold markers `serializeAssistant` writes before a cell, the "ok" the cell
 *  tool returns (which renders as nothing), and anything a future format
 *  version adds that this one does not understand. */
/** Segments that can sit between an artifact's cells without ending it — the
 *  traffic a streaming turn interleaves. Exported so `cellExtent` spans an
 *  artifact block the same way its members are collected. */
export const IN_ARTIFACT = new Set<DocSegmentKind>(["block", "toolResult", "opaque"]);

/**
 * The artifacts a document contains: one per `pi:artifact` marker, holding the
 * cells written under it.
 *
 * This used to be a derivation — group tokens, or a maximal run of ungrouped
 * cells inside one block — anchored at the end of whichever block held the
 * artifact's *last* member. Three rules deciding what an artifact was and a
 * fourth deciding where it appeared, so a follow-up that touched one cell slid
 * the whole widget down the page, and "move it" had to mean "gather the
 * scattered fences and lay them somewhere". A block needs none of that: its
 * members are the cells inside it and its position is where it is.
 *
 * Still a pure read, recomputed every sync — a deleted member, a cell dragged
 * out, a whole artifact moved: all of it re-derives from the text.
 */
export function artifactsFrom(md: string, segments: readonly DocSegment[]): DocArtifact[] {
	const artifacts: DocArtifact[] = [];
	const claimed: DocSegment[] = [];
	/** One entry per NAME, not per marker — see below. */
	const byName = new Map<string, { at: number; members: DocCell[] }>();
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (seg.kind !== "artifact") continue;
		const members: DocCell[] = [];
		// Everything until the block ends. Thinking and tool traffic can interleave
		// with the cells of a streaming turn without meaning the artifact stopped.
		for (let j = i + 1; j < segments.length; j++) {
			const next = segments[j];
			if (next.kind === "cell") {
				const cell = cellOf(md, next);
				if (cell) members.push(cell);
				continue;
			}
			if (IN_ARTIFACT.has(next.kind)) continue;
			break;
		}
		// A name may be declared more than once, and the cells gather.
		//
		// A block is contiguous, and an agent adding to an artifact on a later turn
		// cannot write into a block a hundred lines above — its prose, its thinking
		// and the user's prompt are in between. So it writes the marker again, and
		// the second marker means "these belong to @NAME too" rather than "here is
		// a second @NAME".
		//
		// Read one-per-marker, they did not merely render oddly: `key` is `@name`
		// and the host registry is keyed by it, so N markers resolved to ONE
		// <pi-artifact> element whose members were overwritten N times. A document
		// with seven declarations of one name rendered the cells of one of them and
		// silently dropped the other six — hidden as members, belonging to a frame
		// that was not on the page.
		const key = `@${seg.name ?? ""}`;
		const open = byName.get(key);
		if (open) open.members.push(...members);
		// Anchored at the FIRST declaration: an artifact has a position of its own,
		// and that position is where it was made. Later turns add to it; they do
		// not move it.
		else byName.set(key, { at: seg.from, members });
		claimed.push(...members.map((m) => m.seg));
	}
	for (const [key, { at, members }] of byName) {
		// Last definition wins, exactly as the engine resolves them — across the
		// whole group now, not within one marker, so a redefinition on turn 7
		// supersedes the fence written on turn 1.
		const live = new Map<string, DocCell>();
		for (const cell of members) live.set(cell.id, cell);
		artifacts.push({ key, members: [...live.values()], at });
	}
	// A cell nobody grouped is its own artifact. It needs the frame for the same
	// reasons a group does — output above, source a click away, one thing to fold
	// — and it needs no marker to be movable, because its own fence already is
	// one. That is the whole difference: a marker exists to make SEVERAL cells
	// one thing.
	const inBlock = new Set(claimed);
	for (const seg of segments) {
		if (seg.kind !== "cell" || inBlock.has(seg)) continue;
		const cell = cellOf(md, seg);
		if (cell) artifacts.push({ key: `#${cell.id}`, members: [cell], at: seg.from });
	}
	return artifacts.sort((a, b) => a.at - b.at);
}

/**
 * End of a block's last inked segment — the offset an artifact hangs under.
 * The trailing empty `you`/`pi` placeholders are not a place to render, so they
 * are skipped, exactly as `askAnchor` skips them for inline questions.
 */
function blockEnd(
	md: string,
	segments: readonly DocSegment[],
	blocks: readonly DocBlock[],
	block: number | undefined,
): number | null {
	const members = block === undefined ? undefined : blocks[block]?.members;
	if (!members) return null;
	for (let i = members.length - 1; i >= 0; i--) {
		const seg = segments[members[i]];
		if (!seg?.text) continue;
		return md.slice(0, seg.to).replace(/\s+$/, "").length;
	}
	return null;
}

/** Longest artifact name a scope line carries — see `artifactScope`. The line
 *  is `[artifact] NAME — edit by id`: 25 characters of furniture, so this keeps
 *  the whole thing inside pi's 40-character prompt-prefix split. */
const SCOPE_NAME_MAX = 14;

/**
 * The artifact a prompt at `pos` is about: the one whose latest definition sits
 * in the prompt's own block, or in the block immediately above it.
 *
 * Both, deliberately. Whether a follow-up folds into the previous block or
 * opens a new one is a modifier key (⌥⌘⏎ vs ⌘⏎) — a distinction about
 * conversation structure, not about what "fix the slider" refers to. Scoping to
 * the fold only would mean the mechanism worked or not depending on which key
 * the user happened to press, which is the same as not working.
 *
 * It stops at one block, though: an artifact three turns up is no longer what
 * the conversation is about, and a stale chip is worse than none.
 */
export function artifactInScope(
	segments: readonly DocSegment[],
	blocks: readonly DocBlock[],
	artifacts: readonly DocArtifact[],
	pos: number,
): DocArtifact | null {
	const span = (b: DocBlock) => {
		const members = b.members.map((i) => segments[i]).filter(Boolean);
		return { from: members[0]?.from ?? -1, to: members[members.length - 1]?.to ?? -1 };
	};
	let index = blocks.findIndex((b) => {
		const { from, to } = span(b);
		return from >= 0 && pos >= from && pos <= to;
	});
	// Past the end of the last block (a prompt anchored at the document's end,
	// which is where a send lands) still belongs to it.
	if (index < 0 && blocks.length && pos >= span(blocks[blocks.length - 1]).from) index = blocks.length - 1;
	if (index < 0) return null;
	for (const block of [blocks[index], blocks[index - 1]]) {
		if (!block) continue;
		const inBlock = new Set(block.members.map((i) => segments[i]));
		// The artifact whose LAST member is here — the one this block's answer
		// wrote or rewrote, which is also the one anchored under it.
		for (const artifact of artifacts) {
			const last = artifact.members[artifact.members.length - 1];
			if (last && inBlock.has(last.seg)) return artifact;
		}
	}
	return null;
}

/**
 * The scope line a prompt carries when it is about an existing artifact.
 *
 * The agent can already SEE every cell in the transcript; what it cannot tell
 * is that "make the card wider" means *this* artifact and that the answer is a
 * redefinition rather than three new cells. This says so, in the prompt, in
 * text the user can read — nothing is injected invisibly (the same rule the
 * `[cell report]` steer follows).
 *
 * One unquoted line, so it is ordinary user text to the parser and to every
 * other markdown tool (`document-format.md` §Snippets).
 */
export function artifactScope(artifact: DocArtifact): string {
	const name = artifact.key.startsWith("@") ? artifact.key.slice(1) : "the one above";
	// SHORT, and one line. pi's prompt handling splits a prompt prefix into
	// content parts at 40 characters and `textOf` rejoins them with a blank
	// line, so a longer scope line comes back from the transcript broken across
	// two paragraphs, mid-word, and stops being a chip. That split is upstream
	// of this repo; staying under the limit is the whole defence.
	//
	// It costs nothing: the member ids the agent needs are already in the
	// `pi:cell` markers directly above, and SKILL.md tells it to read them
	// there. This line only has to say WHICH artifact, and that editing beats
	// adding.
	const short = name.length > SCOPE_NAME_MAX ? `${name.slice(0, SCOPE_NAME_MAX - 1)}\u2026` : name;
	return `${ARTIFACT_MARK} ${short} \u2014 edit by id`;
}

/**
 * Fold every redefinition back into the fence it redefines.
 *
 * A cell tool call carries a whole `source`, so asking for one label to change
 * costs a full copy of the cell. One "can you use German instead?" rewrote ten
 * of eleven cells and took a document from 14 KB to 62 KB — twenty-two fences
 * for eleven cells, twenty of them dead source nobody can see (they are hidden:
 * an artifact renders its current self). The page grew by everything it was
 * asked to change.
 *
 * The fix is the git one: the working tree holds the current state, history
 * lives in the log. The newest source is written into the OLDEST fence for that
 * id, with the newest mode when it differs, and the rest are cut, so the
 * document keeps exactly one fence per cell, where the cell has always been. The transcript still records every call, and
 * `pi-docs/` under git still records every version — those are the log.
 *
 * It also makes an artifact hold still. Its anchor is the block of its last
 * member; while redefinitions appended, that moved to whichever turn last
 * touched it, so a widget you were reading slid down the page on every edit.
 * With one fence per cell there is nothing left to move it, and where it sits
 * becomes the user's to decide.
 *
 * Returns the changes to apply, ascending and non-overlapping, or null when
 * there is nothing to fold. CHANGES, not a new document: the editor maps them,
 * so every live cell element — and the slider you had just dragged — survives a
 * compaction, where replacing the text wholesale would rebuild the world.
 *
 * Runs between turns, never during one: mid-stream the fences are still being
 * written, and half a fence has no newest source to keep.
 */
export function compactCells(md: string, segments: readonly DocSegment[]): DocChange[] | null {
	const byId = new Map<string, DocCell[]>();
	for (const cell of cellsFrom(md, segments)) {
		const seen = byId.get(cell.id);
		if (seen) seen.push(cell);
		else byId.set(cell.id, [cell]);
	}
	/** Every fence to cut, and the one rewrite that keeps its content alive. */
	const cuts: { from: number; to: number }[] = [];
	const writes: { from: number; to: number; text: string }[] = [];
	/** The fences being cut, so an artifact marker can ask whether it is about
	 *  to be left holding nothing. */
	const cutCells = new Set<DocSegment>();
	for (const copies of byId.values()) {
		if (copies.length < 2) continue;
		const ordered = [...copies].sort((a, b) => a.at - b.at);
		const first = ordered[0];
		const last = ordered[ordered.length - 1];
		// The survivor keeps its position and takes the newest source. An empty
		// fence has a zero-width content range on the closing fence line, so the
		// text needs its own line back — the rule `setCellSource` follows.
		// A redefinition in another mode is the cell's mode from then on, so the
		// survivor's marker and fence language are written again with the source:
		// the newest source under the older mode would run as the wrong language.
		if (last.mode !== first.mode)
			writes.push({ from: first.seg.from, to: first.at, text: serializeCell(last.mode, first.id, last.source, first.group) });
		else
			writes.push({
				from: first.srcFrom,
				to: first.srcTo,
				text: first.srcFrom === first.srcTo && last.source ? `${last.source}\n` : last.source,
			});
		for (const dead of ordered.slice(1)) {
			// A `pi:block` marker directly above a cut fence folded THAT fence into
			// the answer above it. Left behind it would fold whatever lands there
			// next, so it goes with the fence it belonged to.
			const at = segments.indexOf(dead.seg);
			cuts.push({ from: promptFrom(segments, at), to: dead.seg.to });
			cutCells.add(dead.seg);
		}
	}
	if (!writes.length) return null;
	// An artifact marker whose every cell was just cut away is left declaring
	// nothing: an empty block in the rail and a comment in the file that says a
	// group is here when it is not. It opened for those fences, so it closes with
	// them. Only when NOTHING is left under it — a marker still holding a cell is
	// the artifact's own position and must not move.
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (seg.kind !== "artifact") continue;
		let held = 0;
		let survives = 0;
		for (let j = i + 1; j < segments.length; j++) {
			const next = segments[j];
			if (next.kind === "cell") {
				held++;
				if (!cutCells.has(next)) survives++;
				continue;
			}
			if (IN_ARTIFACT.has(next.kind)) continue;
			break;
		}
		if (held && !survives) cuts.push({ from: seg.from, to: seg.to });
	}
	return [...writes.map((w) => ({ from: w.from, to: w.to, insert: w.text })), ...cuts.map((c) => ({ from: c.from, to: c.to, insert: "" }))].sort(
		(a, b) => a.from - b.from,
	);
}

/** Apply `compactCells`' changes to plain text — for a document that is not the
 *  one on screen (a background session's cache, or a test). Right to left, so
 *  offsets measured against the original never have to be re-based. */
export function applyChanges(md: string, changes: readonly DocChange[]): string {
	let out = md;
	for (const c of [...changes].sort((a, b) => b.from - a.from)) out = out.slice(0, c.from) + c.insert + out.slice(c.to);
	return out;
}
