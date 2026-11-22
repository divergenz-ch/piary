// The editor's CodeMirror state plane: one StateField per thing every consumer
// of the view has to agree about, and the StateEffect that moves each one.
//
// Extracted from DocumentChat.ts behaviour-preservingly (ADR 0009). It is a LEAF
// by construction — the widgets and the decoration builder read these fields and
// nothing here reads them back. Keep it that way: a field that needs a widget
// belongs on the widget's side of the seam, not here.
import { StateEffect, StateField, type Transaction } from "@codemirror/state";
import { type DocBlock, blocksFrom, type DocSegment, type ParsedDocument, parseDocument, YOU_MARKER } from "../document/format.ts";
import { artifactsFrom, cellsFrom, type DocArtifact, type DocCell } from "../document/cells.ts";
import type { PiArtifact } from "./ArtifactBlock.ts";

/** A block head's mode badge: the block declared (or will run in) this mode. */
export interface BlockBadge {
	/** `from` offset of the block's opening user segment. */
	from: number;
	badge: string;
}

/**
 * The document's structure, parsed once per transaction.
 *
 * `parseDocument` is a whole-file regex scan, and it used to run at least four
 * times per keystroke — line classes, decorations, the caret's block, and the
 * trailing-prompt repair each called it and each got a fresh, private offset
 * array that nothing reconciled. One field, one parse, one set of offsets every
 * consumer agrees on. Recomputed only when the text actually changed.
 */
export const docField = StateField.define<{
	md: string;
	parsed: ParsedDocument;
	blocks: DocBlock[];
	cells: DocCell[];
	artifacts: DocArtifact[];
}>({
	create: (state) => parseState(state.doc.toString()),
	update: (value, tr) => (tr.docChanged ? parseState(tr.newDoc.toString()) : value),
});

function parseState(md: string) {
	const parsed = parseDocument(md);
	const blocks = blocksFrom(parsed.segments);
	// Artifacts derive here, with everything else, rather than in the debounced
	// cell sync: their member fences are *hidden* in the flow, and a hide range
	// one keystroke out of date deletes the wrong text on screen. Positions come
	// from the current parse; the sync owns element identity only.
	const cells = cellsFrom(md, parsed.segments);
	return { md, parsed, blocks, cells, artifacts: artifactsFrom(md, parsed.segments) };
}

export const setBadgesEffect = StateEffect.define<BlockBadge[]>();

/** Host-supplied head badges; offsets ride doc changes between refreshes. */
export const badgesField = StateField.define<BlockBadge[]>({
	create: () => [],
	update(value, tr) {
		for (const e of tr.effects) if (e.is(setBadgesEffect)) value = e.value;
		if (tr.docChanged) value = value.map((b) => ({ ...b, from: tr.changes.mapPos(b.from, 1) }));
		return value;
	},
});

/** The machine's region for the run in flight: [msgAnchor, tailAnchor).
 *  `null` closes it — the turn is over and nothing may write through it. */
export const setStreamRegionEffect = StateEffect.define<{
	msgAnchor: number;
	tailAnchor: number;
	/** Where the whole turn opened. Optional: only a caller that KNOWS a new turn
	 *  started passes it — everyone else leaves the current one to be mapped. */
	turnAnchor?: number;
} | null>();

/**
 * What the machine owns while a turn runs: the region it is splicing, plus the
 * pending `<!-- you -->` under it. Everything else on the page is the writer's.
 *
 * One definition because two consumers ask the question — the keystroke filter
 * and `edit`, for gestures that come in annotated `ownEdit` and so never reach
 * that filter. A gesture and a keypress disagreeing about where the writer's
 * page ends is exactly the kind of seam that shows up as "sometimes it works".
 *
 * `from` backs off one character, and that is load-bearing: `ChangeSet.filter`
 * admits a zero-length change starting EXACTLY at a range's first offset, and
 * `msgAnchor` maps with assoc -1 — so a character typed at `msgAnchor` would be
 * let through, land inside the splice target, and vanish on the next chunk.
 */
export const machineSpan = (region: { msgAnchor: number; tailAnchor: number }) => ({
	from: Math.max(0, region.msgAnchor - 1),
	to: region.tailAnchor + YOU_MARKER.length + 1,
});

/** Where the machine is writing, while it is writing. `null` between turns. */
export interface StreamRegion {
	msgAnchor: number;
	tailAnchor: number;
	turnAnchor: number;
}

/**
 * The last offsets in this component that nothing mapped. They were two plain
 * numbers re-derived by hand after every splice — `tailAnchor = msgAnchor +
 * insert.length` — which is the same arithmetic CodeMirror does for free and
 * gets right when a change lands somewhere the hand-written version forgot.
 * The host still sets the region outright at turn boundaries; between those it
 * rides doc changes like every other anchor here.
 *
 * **`null` is a turn-shaped hole, and it is load-bearing** (ADR 0017). The field
 * held a `{0,0,0}` default, which on a loaded document is not "no turn" but a
 * region spanning the whole buffer: `setDocument` inserts at offset 0 and the
 * end anchor maps forward over it. Anything that then wrote through the region
 * replaced the document. There is no span that honestly means "nowhere", so the
 * absence is the type.
 */
export const streamRegionField = StateField.define<StreamRegion | null>({
	create: () => null,
	update(value, tr) {
		let set = false;
		for (const e of tr.effects)
			if (e.is(setStreamRegionEffect)) {
				value =
					e.value === null
						? null
						: {
								msgAnchor: e.value.msgAnchor,
								tailAnchor: e.value.tailAnchor,
								// `msgAnchor` walks forward past every message the turn finalizes,
								// so it cannot answer "did this turn write that?". `turnAnchor` can:
								// it is set once, where the turn opened, and rides doc changes from
								// there. A caller that omits it is moving the write head inside a
								// turn already in flight, not starting one.
								turnAnchor: e.value.turnAnchor ?? value?.turnAnchor ?? e.value.msgAnchor,
							};
				set = true;
			}
		// A region set in this very transaction is already in the new document's
		// coordinates — mapping it again would double-count the change.
		if (value && tr.docChanged && !set)
			value = {
				msgAnchor: tr.changes.mapPos(value.msgAnchor, -1),
				tailAnchor: tr.changes.mapPos(value.tailAnchor, 1),
				turnAnchor: tr.changes.mapPos(value.turnAnchor, -1),
			};
		return value;
	},
});

/** The live elements an artifact is assembled from. Identity only — no offsets:
 *  positions come from `docField`, which is exact on every transaction, while
 *  this rides the debounced sync and would otherwise be a frame behind. */
export interface CellRegistry {
	/** Artifact key (`artifactsFrom`) → the frame element rendering it. */
	artifacts: Map<string, PiArtifact>;
	/** Hidden connected host adopting elements while no widget shows them. */
	park: HTMLElement | null;
}

export const setCellsEffect = StateEffect.define<CellRegistry>();

/** The live artifact elements, as of the last sync. */
export const cellsField = StateField.define<CellRegistry>({
	create: () => ({ artifacts: new Map(), park: null }),
	update(value, tr) {
		// No `mapPos` here on purpose: there is nothing positional left to map.
		for (const e of tr.effects) if (e.is(setCellsEffect)) value = e.value;
		return value;
	},
});

/** The live-view elements (`src/document/live-views.ts`), by view id.
 *
 *  Its own field rather than a third map inside `CellRegistry`: a live view is not
 *  a cell, and the two have different lifetimes — a cell's element is retracted
 *  when its source leaves, a live view's when its MARKER leaves. Sharing the
 *  carrier would mean sharing the sync that updates it, and a terminal must not
 *  wait on the cell engine's debounce to show its first byte.
 *
 *  Identity only, like `CellRegistry`: positions come from `docField`. */
export const setLiveViewsEffect = StateEffect.define<ReadonlyMap<string, HTMLElement>>();

export const liveViewsField = StateField.define<ReadonlyMap<string, HTMLElement>>({
	create: () => new Map(),
	update(value, tr) {
		for (const e of tr.effects) if (e.is(setLiveViewsEffect)) value = e.value;
		return value;
	},
});

/** The host's pending question element, mounted under the run that asked it
 *  (transient — nothing about it enters the document text). */
export const setAskEffect = StateEffect.define<{ el: HTMLElement; park: HTMLElement } | null>();

export const askField = StateField.define<{ el: HTMLElement; park: HTMLElement } | null>({
	create: () => null,
	update(value, tr) {
		for (const e of tr.effects) if (e.is(setAskEffect)) value = e.value;
		return value;
	},
});

/** Per-view show-source: ids whose widget is flipped back to the raw fence. */
export const toggleSourceEffect = StateEffect.define<string>();

export const showSourceField = StateField.define<ReadonlySet<string>>({
	create: () => new Set(),
	update(value, tr) {
		for (const e of tr.effects) {
			if (e.is(toggleSourceEffect)) {
				const next = new Set(value);
				next.has(e.value) ? next.delete(e.value) : next.add(e.value);
				value = next;
			}
		}
		return value;
	},
});

/**
 * Every fold in the buffer, as one set of keys.
 *
 * This was three fields — `toggledFolds` (a string set), `expandedSnippets` and
 * `blockFolds` (two number arrays) — with three effects, three shapes, and an
 * event router that split string keys back into numbers to feed the right one.
 * The widgets have always emitted strings (`block@412`, `snippet@980`); only the
 * storage disagreed.
 *
 * Splitting them cost a real bug, because only two of the three mapped their
 * offsets through document changes. `toggledFolds` did not, so an expanded
 * thinking block or activity run silently re-collapsed the moment anything
 * above it was edited — which, while a reply streams in above you, is
 * constantly. One field maps once and they all ride.
 *
 * What a key means still belongs to whoever reads it: `block@N` present means
 * that block is collapsed, `snippet@N` present means that chip is expanded, and
 * a segment key means "toggled away from `defaultOpen`". Same container, own
 * defaults.
 */
export const toggleFoldEffect = StateEffect.define<string>();
export const setFoldsEffect = StateEffect.define<readonly string[]>();

/**
 * `Kind@offset` keys name something the document gives no id — a thinking
 * block, an activity run, a block head, a snippet chip — so the offset IS the
 * identity and has to ride edits like every other anchor here.
 *
 * Matched strictly rather than by looking for the last `@`: an artifact's key
 * is `artifact#@name`, and a group named `@123` would otherwise parse as an
 * offset and get remapped into a key belonging to nothing.
 */
const OFFSET_KEY = /^([A-Za-z]+)@(\d+)$/;

function remapFoldKey(key: string, tr: Transaction): string {
	const m = OFFSET_KEY.exec(key);
	return m ? `${m[1]}@${tr.changes.mapPos(Number(m[2]), -1)}` : key;
}

export const foldsField = StateField.define<ReadonlySet<string>>({
	create: () => new Set(),
	update(value, tr) {
		for (const e of tr.effects) {
			if (e.is(toggleFoldEffect)) {
				const next = new Set(value);
				next.has(e.value) ? next.delete(e.value) : next.add(e.value);
				value = next;
			}
			if (e.is(setFoldsEffect)) value = new Set(e.value);
		}
		if (tr.docChanged) value = new Set([...value].map((k) => remapFoldKey(k, tr)));
		return value;
	},
});

/** A whole block, collapsed behind its name — keyed by its head offset. The
 *  host persists these as numbers, so the number is the boundary and the key
 *  is internal. */
export const blockFoldKey = (from: number) => `block@${from}`;
export const blockFoldsIn = (folds: ReadonlySet<string>): number[] =>
	[...folds].flatMap((k) => (k.startsWith("block@") ? [Number(k.slice(6))] : []));

export const FOLDABLE = new Set<string>(["toolCall", "toolResult", "thinking", "cell"]);

/** Only cells (user-authored, output stays visible) start open. Errors fold
 *  like everything else — their label carries the message (see `foldSnippet`),
 *  so a 60-line trace costs one line until asked for. */
export const defaultOpen = (seg: DocSegment) => seg.kind === "cell";

/** The first words of a folded body: an error's message must stay readable
 *  without its trace. Fence delimiters and blank lines are skipped. */
export function foldSnippet(text: string): string {
	const line = (text.split("\n").find((l) => l.trim() && !l.trim().startsWith("```")) ?? "").trim();
	return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}

// ponytail: thinking has no stable id, so its key is the marker offset — an
// edit above can re-collapse an expanded one. Tool ids are stable.
export const foldKey = (seg: DocSegment) => (seg.id ? `${seg.kind}#${seg.id}` : `${seg.kind}@${seg.from}`);

/** An artifact's source folds like any other body, through the same state. The
 *  key has no `block@`/`snippet@` prefix, so `fold-toggle` routing sends it
 *  straight to `toggleFoldEffect` with no special case (see the listener). */
export const artifactFoldKey = (key: string) => `artifact#${key}`;
