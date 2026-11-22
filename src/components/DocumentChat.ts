// The document IS the interface: one CodeMirror 6 markdown buffer, no
// composer. The user writes at the end of the file, Mod-Enter sends the
// trailing user segment, and the agent's reply streams into the document as
// markdown per docs/document-format.md. Role markers (HTML comments in the
// file) render as small labels; agent prose gets a hairline left rule.
// While a reply streams, the next `<!-- you -->` prompt already exists below
// it: the reply splices into the middle of the file and the user keeps
// writing in the tail.
import type { IconNode } from "lucide";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import {
	defaultKeymap,
	history,
	historyKeymap,
	insertNewlineAndIndent,
	redo,
	undo,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { CODE_TAGS } from "./code-highlight.ts";
import { syntaxHighlighting, HighlightStyle, LanguageDescription } from "@codemirror/language";
import {
	Annotation,
	ChangeSet,
	Compartment,
	type ChangeSpec,
	EditorState,
	type Range as CMRange,
	RangeSetBuilder,
	StateEffect,
	StateField,
	Transaction,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	drawSelection,
	dropCursor,
	EditorView,
	hoverTooltip,
	keymap,
	placeholder,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { html, LitElement } from "lit";
import { property } from "lit/decorators.js";
import {
	type DocSegment,
	type ParsedDocument,
	parseDocument,
	promptFrom,
	QUIET_TOOLS,
	roleLabel,
	serializeFile,
	BLOCK_MARKER,
	blockEndIndex,
	type FileRef,
	isPromptPrefix,
	pendingUserText,
	prefixPrompt,
	PI_PLACEHOLDER,
	serializeAssistant,
	serializeToolResult,
	snippetRuns,
	YOU_MARKER,
} from "../document/format.ts";
import { type CanvasEdit, planCanvasEdit } from "../document/canvas-edit.ts";
import { askAnchor } from "../document/ask.ts";
import { answerRange, beginTurnAt, cellMode, deleteRange, emptyBlockBackspace, promptAt, replySlot, tailPrompt } from "../document/run.ts";
import {
	artifactScope,
	artifactsFrom,
	cellsFrom,
	cellWrite,
	compactCells,
	type DocCell,
	type DocChange,
} from "../document/cells.ts";
import { type CommandDoc, renderCommandDoc } from "../document/command-doc.ts";
import { iconDOM } from "../utils/icons.ts";
import * as folds from "../canvas/folds.ts";
import { LiveViewHost } from "../canvas/live-view-host.ts";
import { originOf, type PromptEdit } from "../document/keystrokes.ts";
import { getLiveView, type LiveView } from "../document/live-views.ts";
import { type CellStatePayload, cellStatePayload, getViewTemplate, viewPayload } from "../document/views.ts";
import { assetResolver, liveDragFreeze, liveMarkdown, mdLinkOpen, proseAt } from "./markdown-live.ts";
import { MOD_ENTER, SHIFT_MOD_ENTER } from "../utils/format.ts";
import {
	artifactFoldKey,
	askField,
	badgesField,
	type BlockBadge,
	blockFoldKey,
	blockFoldsIn,
	cellsField,
	type CellRegistry,
	defaultOpen,
	docField,
	FOLDABLE,
	foldKey,
	foldSnippet,
	foldsField,
	liveViewsField,
	machineSpan,
	setAskEffect,
	setBadgesEffect,
	setCellsEffect,
	setFoldsEffect,
	setLiveViewsEffect,
	setStreamRegionEffect,
	showSourceField,
	streamRegionField,
	type StreamRegion,
	toggleFoldEffect,
	toggleSourceEffect,
} from "./editor-state.ts";
import {
	ActivityWidget,
	activitySnippet,
	ArtifactWidget,
	AskWidget,
	blockOpenerAt,
	CellGapWidget,
	CellHandleWidget,
	docPosAt,
	FoldedWidget,
	GoneViewWidget,
	NATIVE_MENU,
	RoleWidget,
	SnippetLabelWidget,
	SnippetWidget,
	LiveViewWidget,
	ViewWidget,
} from "./editor-widgets.ts";
// Registers <pi-cell> (light — the element imports the engine types only).
import "./CellBlock.ts";
import type { PiCell } from "./CellBlock.ts";
import "./ArtifactBlock.ts";
import type { ArtifactMember, PiArtifact } from "./ArtifactBlock.ts";
import { placeRunBadge, runBadgeField, setRunBadge } from "./run-badge.ts";

/** Shared empty set: an idle frame should not be handed a fresh one every sync. */
const NO_DIRTY: ReadonlySet<string> = new Set();
import { CellEditor } from "./CellEditor.ts";
// Type-only: the engine (transpiler + runtime) loads lazily in syncCells on
// the first cell ever seen — cell-free documents never pay for it.
import type { NotebookEngine } from "../notebook/engine.ts";

const mdHighlight = HighlightStyle.define([
	{ tag: tags.heading1, fontWeight: "650", fontSize: "1.5em" },
	{ tag: tags.heading2, fontWeight: "650", fontSize: "1.25em" },
	{ tag: tags.heading3, fontWeight: "650", fontSize: "1.1em" },
	{ tag: tags.heading4, fontWeight: "650" },
	{ tag: tags.strong, fontWeight: "650" },
	{ tag: tags.emphasis, fontStyle: "italic" },
	{ tag: tags.strikethrough, textDecoration: "line-through" },
	{ tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em" },
	{ tag: [tags.link, tags.url], color: "var(--accent-foreground)" },
	{ tag: tags.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
	{ tag: tags.comment, color: "var(--muted-foreground)", opacity: "0.6" },
	{ tag: [tags.processingInstruction, tags.meta, tags.punctuation], color: "var(--muted-foreground)" },
	// Code inside a fence, once `codeLanguages` has parsed it — shared with the
	// artifact's code pane so a cell keeps its colors across the two editors.
	...CODE_TAGS,
]);

/**
 * Languages a fence may be highlighted in — cell modes first, since a cell's
 * source is the code most often read in this buffer. Loaded lazily: the JS
 * parser is not small, and a document with no code fence must not pay for it.
 * Modes with no entry here (html, tex, dot) stay plain text, which is what they
 * were before — honest, just uncolored.
 */
const fenceLanguages = [
	LanguageDescription.of({
		name: "javascript",
		alias: ["js", "jsx", "ojs"],
		load: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
	}),
	LanguageDescription.of({
		name: "typescript",
		alias: ["ts", "tsx"],
		load: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true, typescript: true })),
	}),
	LanguageDescription.of({
		name: "json",
		load: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
	}),
];

export type { BlockBadge, CellRegistry } from "./editor-state.ts";

/** One programmatic edit: the splice(s), plus where the caret ends up.
 *
 *  Several changes may be given at once — CodeMirror reads them all in the
 *  coordinates of the document the resolver was handed, so nothing has to be
 *  applied bottom-up to keep the offsets of the ones below it valid. */
export interface DocEdit {
	changes: ChangeSpec;
	/** Caret offset in the document AFTER the change. Omit to leave it alone.
	 *  Absolute, because that is what the pure splice helpers already return. */
	caret?: number;
}


/** How long the dataflow graph must stop moving before its verdicts are read.
 *  Long enough for a cell's dependents to finish re-running, short enough that a
 *  report still reaches the turn that caused it. NOT a "has the turn finished
 *  writing?" gate — see `reportSettledFailures` for why no delay can be one. */
const FAILURE_SWEEP_DELAY = 400;
/** Local-draft debounce. Its handler stringifies the whole document into a
 *  SYNCHRONOUS localStorage write, which per keystroke is the single biggest
 *  source of typing lag on a long page. Well under `SAVE_DEBOUNCE_MS`, so a
 *  crash costs a few characters rather than the gap between server saves. */
const DRAFT_DEBOUNCE_MS = 150;
/** Server-save debounce — the host's `doc-change`. */
const SAVE_DEBOUNCE_MS = 500;
/** The longest a save may be deferred. A streaming turn writes a chunk faster
 *  than the debounce and re-arms it every time, and it raises no draft either —
 *  so without a deadline the whole turn reaches the file only once the stream
 *  stops (ADR 0018 §2). A small multiple of the debounce: one save per window
 *  while the machine writes, never a save per chunk. */
const SAVE_MAX_DEFER_MS = 4 * SAVE_DEBOUNCE_MS;
/** Cell-sync debounce: typing inside a fence re-runs the cell after the pause
 *  rather than per keystroke. */
const CELL_SYNC_DEBOUNCE_MS = 300;
/** Widget-state capture debounce, deduped against the last payload. */
const STATE_PERSIST_DEBOUNCE_MS = 500;
/** How long a typewriter scroll stays attributed to us. It has to outlast the
 *  scroll event CodeMirror emits for our own `scrollIntoView` — one frame past
 *  its measure pass — or that event reads as the writer navigating away. */
const PRESERVE_FOCUS_SCROLL_MS = 100;

const SEGMENT_CLASS: Record<string, string> = {
	assistant: "doc-line-pi",
	thinking: "doc-line-thinking",
	toolCall: "doc-line-tool",
	toolResult: "doc-line-tool",
	view: "doc-line-tool",
	cell: "doc-line-tool",
	note: "doc-line-note",
	aside: "doc-line-pi doc-line-aside",
	file: "doc-line-file",
	block: "doc-line-tool",
	opaque: "doc-line-tool",
};

/** Per-role label classes, where the label must not inherit the body's. A
 *  markdown cell's body is the writer's serif; its label is the same small caps
 *  sans every other label uses. */
const ROLE_CLASS: Record<string, string> = {
	note: "doc-role-note",
	file: "doc-role-file",
};

/** Per-line classes for the rendered window only.
 *
 * These were emitted for the whole document on every update, which is
 * O(lines) per keystroke plus a RangeSet diff of the same size. Measured on
 * 3200 lines of prose: 39.9ms presentation and 32 dropped frames per 43
 * keystrokes, against bare CodeMirror's 24ms and 1. Off-screen lines render
 * nothing, so a class on them buys nothing.
 */
function buildLineClasses(state: EditorState, from: number, to: number): DecorationSet {
	const { md, parsed, blocks } = state.field(docField);
	const { bodyFrom, segments } = parsed;
	const lineClass = new Map<number, string>();
	const addLineClass = (pos: number, cls: string) => {
		const at = state.doc.lineAt(Math.min(pos, state.doc.length)).from;
		const prev = lineClass.get(at);
		lineClass.set(at, prev ? `${prev} ${cls}` : cls);
	};
	// Per-line classes are emitted for the visible range only. Emitting them
	// for the whole document is O(lines) per keystroke, and CodeMirror has to
	// diff that RangeSet on every update: measured at 3200 lines it cost +16ms
	// presentation delay and 32 dropped frames per 43 keystrokes, against bare
	// CodeMirror's 1. Off-screen lines render nothing, so they need no class.
	for (const seg of segments) {
		if (seg.to < from || seg.from > to) continue;
		// User lines carry the block rule too (doc-line-you), but only as a line
		// class — the role-label fallback below must stay doc-role-you.
		const cls = SEGMENT_CLASS[seg.kind] ?? (seg.kind === "user" ? "doc-line-you" : undefined);
		if (!cls) continue;
		// The segment's first line opens it: it carries the tight inter-segment
		// gap (or the loose block gap, when it is also a block's first line).
		addLineClass(seg.from, "doc-seg-first");
		// A marker line holds nothing but a role label — it needs label leading,
		// not body leading.
		if (seg.bodyFrom > seg.from) addLineClass(seg.from, "doc-line-marker");
		// The format writes exactly one blank line after a marker and one before
		// the next one. Those two are serialization — collapse them, so a role
		// label sits ON its text and prose ends where the next label begins.
		// Every other blank line in a body is the writer's: a paragraph break, or
		// the line they just opened with Enter. Those keep their height, and the
		// line composition ends on is never collapsed whatever else is true —
		// otherwise the caret sits in a 6px sliver you cannot see until you type.
		// `indexOf` is O(segments), so the answer is computed once and only where
		// something actually asks for it.
		let keepAt: number | null = null;
		const keep = () => (keepAt ??= lastComposedLine(state, seg, segments[segments.indexOf(seg) + 1] !== undefined));
		if (seg.bodyFrom > seg.from) {
			const lead = state.doc.lineAt(Math.min(seg.bodyFrom, state.doc.length));
			if (!lead.length && lead.from !== keep()) addLineClass(lead.from, "doc-line-blank");
			const tail = state.doc.lineAt(Math.min(Math.max(seg.to - 1, seg.bodyFrom), state.doc.length));
			if (!tail.length && tail.from !== keep() && tail.from !== lead.from)
				addLineClass(tail.from, "doc-line-blank");
		}
		let pos = state.doc.lineAt(Math.max(seg.from, from)).from;
		for (; pos < seg.to && pos <= to; ) {
			const line = state.doc.lineAt(pos);
			addLineClass(pos, cls);
			// The blank line under a machine-written prompt prefix is the format's
			// serialization, exactly like the one under a role marker above — spend
			// it, so two prefixes sit adjacent and read as one folded strip rather
			// than two events a body-height apart. One line of lookback, inside the
			// visible-range walk: no second pass over the document. Same guard as
			// every other collapsed blank — never the line composition ends on.
			if (seg.kind === "user" && !line.length && line.from > seg.bodyFrom && line.from !== keep()) {
				const prev = state.doc.lineAt(line.from - 1);
				if (isPromptPrefix(prev.text)) addLineClass(line.from, "doc-line-blank");
			}
			pos = line.to + 1;
		}
	}
	// Block extents (step 13): first = the opening marker line, last = the
	// last inked line (a segment's `to` includes trailing blank lines).
	for (const block of blocks) {
		const first = segments[block.opensAt];
		addLineClass(first.from, "doc-block-first");
		const lastIdx = block.members[block.members.length - 1];
		const lastSeg = segments[lastIdx];
		// The rule reaches the last line anyone composed — not the last INKED
		// line. Those differ exactly where it matters: an empty cell (the caret
		// is already resting in it), and the blank line you just opened with
		// Enter. Measuring ink made the rule grow under your fingers in the first
		// case and stop a line short of you in the second.
		const lastFrom = Math.max(first.from, lastComposedLine(state, lastSeg, segments[lastIdx + 1] !== undefined));
		addLineClass(lastFrom, "doc-block-last");
		// Every line in the extent carries the rule: containment is a line, not
		// an absence — a block taller than the viewport still reads as one.
		for (let pos = first.from; pos <= lastFrom; ) {
			addLineClass(pos, "doc-block");
			pos = state.doc.lineAt(pos).to + 1;
		}
	}
	// Creation ghost (CSS ::after): a fresh document, or the empty pending
	// prompt after a turn — gone the moment typing starts.
	const last = segments[segments.length - 1];
	if (last ? last.kind === "user" && !last.text : !md.slice(bodyFrom).trim())
		addLineClass(state.doc.length, "doc-line-ghost");
	// The ghost goes the moment typing starts, and with it the only thing on
	// the page that said how to send — the bar's hint is off in focus mode and
	// off-screen once the draft is long. So while a draft is being written the
	// send chord sits under its last line, same geometry as the ghost.
	else if (last?.kind === "user" && last.text) addLineClass(state.doc.lineAt(state.doc.length).from, "doc-line-draft");
	// An empty reply slot (answer-this-block, or the folded tail): a ghost hint
	// on its line says what it is — otherwise the slot is nearly invisible.
	for (const seg of segments) {
		if (seg.kind !== "user" || seg.text || seg.bodyFrom === seg.from || seg === last) continue;
		addLineClass(Math.min(seg.bodyFrom, state.doc.length), "doc-line-reply-ghost");
	}
	const builder = new RangeSetBuilder<Decoration>();
	for (const at of [...lineClass.keys()].sort((a, b) => a - b))
		builder.add(at, at, Decoration.line({ class: lineClass.get(at)! }));
	return builder.finish();
}

/**
 * The last line of a segment that somebody composed, as opposed to one the
 * serializer wrote. It is where the block rule stops and the one line the
 * collapse rule may never touch — which is the same answer to three questions
 * that used to have three different answers: where an empty cell's caret rests,
 * how far a block reaches, and whether the line you just opened with Enter is
 * real.
 *
 * `seg.to` is the START of the next marker line, so the line before it is the
 * blank line the format writes between segments. With nothing following, the
 * segment runs to the end of the document and its last line is the draft.
 */
function lastComposedLine(state: EditorState, seg: DocSegment, hasNext: boolean): number {
	if (!hasNext) return state.doc.lineAt(Math.min(seg.to, state.doc.length)).from;
	const line = state.doc.lineAt(Math.min(Math.max(seg.to - 1, seg.bodyFrom), state.doc.length));
	return !line.length && line.from > seg.bodyFrom ? state.doc.lineAt(line.from - 1).from : line.from;
}

/**
 * The changes that restore "the page ends in a prompt slot", or null when it
 * already does. Pure, so the invariant is one expression rather than a method
 * that dispatches — see the transactionFilter that applies it.
 */
/**
 * The splice between two whole documents: trim the common prefix and suffix and
 * dispatch only what actually differs.
 *
 * The pure helpers that produce these strings (`deleteBlockText`,
 * `emptyBlockBackspace`, `moveBlockText`, …) hand back the document entire, and
 * replacing it wholesale would renumber every offset on the page — which is what
 * lets the cell registry match the same ids to the same live elements, and what
 * keeps ⌘Z to one step. Shared by `replaceDocument` and the Backspace gesture so
 * the two cannot recover a different splice from the same pair of strings.
 */
function spliceOf(cur: string, next: string): { from: number; to: number; insert: string } {
	let from = 0;
	const limit = Math.min(cur.length, next.length);
	while (from < limit && cur.charCodeAt(from) === next.charCodeAt(from)) from++;
	// Bounded by what the prefix left, so the two halves can never overlap on a
	// document that repeats itself.
	let end = 0;
	const rest = limit - from;
	while (end < rest && cur.charCodeAt(cur.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end++;
	return { from, to: cur.length - end, insert: next.slice(from, next.length - end) };
}

/**
 * The one contiguous replacement `deleteRange` will answer for, or null.
 *
 * Read by BOTH gates below — the change filter that waves it past the marker
 * rule, and the transaction filter that rewrites it — because the two must not
 * be able to disagree. If the filter let a change through that the rewrite then
 * declined to touch, the raw change would apply and eat a marker line; asking
 * one function twice is what makes that impossible.
 *
 * Every source of a selection replacement is here, which is the whole reason
 * this lives at the change level rather than on a key: Backspace and Delete both
 * arrive as `delete.selection`, cut as `delete.cut`, typing over a selection as
 * `input.type`, pasting over one as `input.paste`. A drag-drop (`move.drop`)
 * arrives as two changes and is left to the old refusal, as is a multi-cursor
 * selection — composing N structural deletions and re-mapping between them buys
 * nothing a rare gesture needs.
 */
const SELECTION_REPLACE = ["delete.selection", "delete.cut", "input.type", "input.paste"];

function structuralSpan(
	tr: Transaction,
	segments: readonly DocSegment[],
): { from: number; to: number; insert: string } | null {
	if (!tr.docChanged || tr.annotation(ownEdit)) return null;
	if (!SELECTION_REPLACE.some((e) => tr.isUserEvent(e))) return null;
	let from = -1;
	let to = -1;
	let insert = "";
	let count = 0;
	tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
		count++;
		from = fromA;
		to = toA;
		insert = inserted.toString();
	});
	if (count !== 1) return null;
	const span = { from, to, insert };
	// Only the changes the marker rule would drop. One that clears the rule is
	// ordinary editing and must stay ordinary.
	const doc = tr.startState.doc;
	for (const seg of segments) {
		if (seg.bodyFrom === seg.from) continue; // markerless leading segment
		if (from <= seg.from && to >= seg.to) continue; // the whole cell goes
		if (from < seg.bodyFrom && to > seg.from) return span; // clips the marker
		// A marker only reads as one at the START of a line. A drag that ends on a
		// role label stops exactly here — `atomicRanges` parks the endpoint at the
		// marker's first character — and the plain delete then closes the gap,
		// leaving `chart<!-- pi -->` on one line: the reply stops being a turn and
		// its text becomes part of the prompt above it. The rule above never saw
		// this one, because the span ends where the marker begins rather than
		// inside it.
		if (to === seg.from && !(insert ? insert.endsWith("\n") : from > 0 && doc.sliceString(from - 1, from) === "\n"))
			return span;
	}
	return null;
}

function trailingPromptRepair(
	md: string,
	head: number,
): { changes: { from: number; to: number; insert: string }; selection?: { anchor: number } } | null {
	if (!md.trim()) return null; // nothing at all in the editor: not this rule's business
	const { segments, bodyFrom } = parseDocument(md);
	if (segments.at(-1)?.kind === "user") return null;
	// Only carry the caret along when the user is already writing at the end;
	// a mid-document edit must never teleport the cursor away.
	const atEnd = head >= md.replace(/\s+$/, "").length;
	// A page whose body has been emptied gets its slot AT the body start,
	// replacing whatever blank lines the deletion left. Appending instead
	// stacked the slot below those blanks, so deleting back to nothing walked
	// the prompt down the page one keystroke at a time.
	const blank = !md.slice(bodyFrom).trim();
	const from = blank ? bodyFrom : md.length;
	const insert = `${blank ? "" : "\n\n"}${YOU_MARKER}\n\n`;
	return {
		changes: { from, to: md.length, insert },
		...(atEnd ? { selection: { anchor: from + insert.length } } : {}),
	};
}

/** What the live markdown may treat as prose (`proseAt`): the body of a `you`
 *  or a `pi` segment. Every other segment's fence is its payload. */
function inProse(state: EditorState, pos: number): boolean {
	const { bodyFrom, segments } = state.field(docField).parsed;
	if (pos < bodyFrom) return false;
	const seg = segments.find((s) => pos >= s.from && pos < s.to);
	return seg?.kind === "user" || seg?.kind === "assistant";
}

/** Recomputes on document and viewport changes only \u2014 not on caret moves. */
const lineClasses = ViewPlugin.fromClass(
	class {
		decos: DecorationSet;
		constructor(view: EditorView) {
			this.decos = buildLineClasses(view.state, view.viewport.from, view.viewport.to);
		}
		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged)
				this.decos = buildLineClasses(u.view.state, u.view.viewport.from, u.view.viewport.to);
		}
	},
	{ decorations: (v: { decos: DecorationSet }) => v.decos },
);

function buildDecorations(
	state: EditorState,
	showSource: ReadonlySet<string> = new Set(),
	badges: readonly BlockBadge[] = [],
	registry: CellRegistry = { artifacts: new Map(), park: null },
	toggledFolds: ReadonlySet<string> = new Set(),
	ask: { el: HTMLElement; park: HTMLElement } | null = null,
	/** Live-view elements by view id (`liveViewsField`). Empty by default, which is
	 *  what makes a `pi:view` with a live name but no element yet fall through to
	 *  the static templates and finally to the honest fence. */
	liveEls: ReadonlyMap<string, HTMLElement> = new Map(),
	/** Window for per-line classes. Defaults to the whole document (tests,
	 *  first paint before a viewport exists). */
): { widgets: DecorationSet; atoms: DecorationSet } {
	const { md, parsed, blocks, artifacts } = state.field(docField);
	const { frontmatter, bodyFrom, segments } = parsed;
	// Every code cell an artifact accounts for: members render in its code pane,
	// superseded definitions are counted as history. Both are hidden in the flow
	// — the frame is where the source lives now — unless the reader asked for the
	// honest fences back with the source toggle.
	const shownArtifacts = artifacts.filter((a) => !showSource.has(a.key));
	const hiddenCells = new Set<DocSegment>();
	const historyOf = new Map<string, number>();
	// The way back. An artifact showing its fences has no frame on screen, so the
	// toggle has to live on the cell labels — the same slot a view's does, for
	// the same reason: an escape you cannot leave is a trap, not an escape. Every
	// label the toggle laid bare carries it, the artifact's own marker and
	// superseded definitions included: the
	// run is often taller than the window, and any label may be the one in sight.
	const escapeKeyOf = new Map<DocSegment, string>();
	for (const artifact of artifacts) {
		if (!showSource.has(artifact.key)) continue;
		const ids = new Set(artifact.members.map((m) => m.id));
		for (const seg of parsed.segments) {
			const own = seg.kind === "cell" ? !!seg.id && ids.has(seg.id) : seg.kind === "artifact" && `@${seg.name ?? ""}` === artifact.key;
			if (own) escapeKeyOf.set(seg, artifact.key);
		}
	}
	for (const artifact of shownArtifacts) {
		const ids = new Set(artifact.members.map((m) => m.id));
		let history = 0;
		for (const cell of parsed.segments) {
			if (cell.kind !== "cell" || !cell.id || !ids.has(cell.id)) continue;
			hiddenCells.add(cell);
			if (!artifact.members.some((m) => m.seg === cell)) history++;
		}
		historyOf.set(artifact.key, history);
	}
	// An artifact's frame REPLACES the text it is derived from — the marker line
	// for a block, the whole fence for a lone cell. Anchoring a widget at the same
	// offset as a block replacement loses it: the replacement swallows the range.
	// Built here, keyed by offset, so the hiding branches below can render it in
	// place of what they hide.
	const frameAt = new Map<number, Decoration>();
	for (const artifact of shownArtifacts) {
		const el = registry.artifacts.get(artifact.key);
		if (!el || !registry.park || artifact.at > state.doc.length) continue;
		el.history = historyOf.get(artifact.key) ?? 0;
		// Only the persisted bit is pushed in. Whether the source is actually
		// showing is the element's to derive, because the other half of that
		// answer — is a member broken? — is a live status it already reads.
		el.sourceToggled = toggledFolds.has(artifactFoldKey(artifact.key));
		frameAt.set(
			artifact.at,
			Decoration.replace({
				widget: new ArtifactWidget(artifact.key, el, registry.park, artifact.at, el.label),
				block: true,
			}),
		);
	}
	const badgeAt = new Map(badges.map((b) => [b.from, b.badge]));
	const openers = new Set(blocks.map((b) => segments[b.opensAt]));
	const snipRuns = snippetRuns(md, segments);
	// Snippet chips and block folds now live in the same key set as every other
	// fold; each still reads its own default out of it.
	const expanded = (from: number) => toggledFolds.has(`snippet@${from}`);
	// One unordered bag. There used to be five separate builders here, only
	// because `RangeSetBuilder` demands ascending adds and inline widgets, block
	// widgets and replacements interleave — a constraint `Decoration.set(…, true)`
	// removes by sorting for us. The "ranges must be added sorted" crash class
	// goes with it.
	const widgetRanges: CMRange<Decoration>[] = [];
	const widgets = {
		add: (from: number, to: number, deco: Decoration) => void widgetRanges.push(deco.range(from, to)),
	};
	// View replacements again, alone: cursor motion treats each as one atom, and
	// this feeds `atomicRanges`, a different facet.
	const atoms = new RangeSetBuilder<Decoration>();

	// The frontmatter is Piary's, not the writer's (canvas edits refuse it): the
	// file keeps it for pi's rebuild and for any other markdown reader, and the
	// canvas draws none of it — nor the blank lines that only separate it from
	// the body. It is the first range, so the ascending builder takes it first.
	if (frontmatter) {
		let end = state.doc.lineAt(Math.min(frontmatter.length, state.doc.length)).to;
		while (end < state.doc.length) {
			const next = state.doc.lineAt(end + 1);
			if (next.text.trim() || next.to >= state.doc.length) break;
			end = next.to;
		}
		const deco = Decoration.replace({ block: true });
		widgets.add(0, end, deco);
		atoms.add(0, end, deco);
	}

	// Line classes accumulate first (segment and block-extent classes overlap
	// on the same lines), then emit in order — RangeSetBuilder demands it.
	const lineClass = new Map<number, string>();
	const addLineClass = (pos: number, cls: string) => {
		const from = state.doc.lineAt(pos).from;
		const prev = lineClass.get(from);
		lineClass.set(from, prev ? `${prev} ${cls}` : cls);
	};

	// Collapsed blocks: the whole block folds behind its name — the trailing
	// empty reply slot (the pending prompt) always stays out of the fold.

	const lastSegment = segments[segments.length - 1];
	/** The step being written right now: the last machine segment in the file.
	 *  Its label is the only one that animates while a turn runs (CSS keys off
	 *  `.doc-role-live` under `.doc-streaming`) — a step that already finished is
	 *  not working, and a column of labels pulsing together tells you nothing
	 *  about where the turn is.
	 *
	 *  The scan skips exactly one trailing user segment — the pending prompt,
	 *  which holds your draft while the machine writes above it — and the
	 *  `pi:block` markers that are structure rather than steps. If what is under
	 *  those is still yours, the send has landed but nothing has been written
	 *  back yet: no step is live, and the previous turn's tail must not stand in
	 *  for one. */
	const liveSegment = (() => {
		let i = segments.length - 1;
		if (segments[i]?.kind === "user") i--;
		while (segments[i]?.kind === "block" || segments[i]?.kind === "file") i--;
		const seg = segments[i];
		return seg && seg.kind !== "user" ? seg : undefined;
	})();
	const foldedBlocks: { head: DocSegment; name: string; from: number; to: number }[] = [];
	for (const block of blocks) {
		const head = segments[block.opensAt];
		if (!toggledFolds.has(blockFoldKey(head.from))) continue;
		const endIdx = blockEndIndex(segments, block);
		const end = md.slice(0, segments[endIdx].to).replace(/\s+$/, "").length;
		const from = state.doc.lineAt(head.from).from;
		if (end > from) foldedBlocks.push({ head, name: block.name || "block", from, to: end });
	}
	const inBlockFold = (pos: number) => foldedBlocks.some((r) => pos > r.from && pos < r.to);

	/** A fold swallows its segment's trailing blank lines too — otherwise every
	 *  folded step costs a label line PLUS an empty one, and the run-gap that
	 *  makes a strip read as one strip never applies (the lines break adjacency). */
	const foldEnd = (seg: DocSegment) =>
		state.doc.lineAt(Math.min(Math.max(seg.to - 1, seg.from), state.doc.length)).to;

	/** Tool-call ids the document actually carries a `pi:tool` marker for. The
	 *  `cell` and `view` tools serialize their CALL as the artifact (`pi:cell` /
	 *  `pi:view`), never as `pi:tool` — so a result with no id in this set is one
	 *  of their acknowledgements, and always reads "ok". Set membership, not a
	 *  text match on "ok": a bash result that happens to print ok is a real
	 *  result. It also catches the orphan a redefinition leaves behind, where the
	 *  marker carries the cell id and the result the tool-call id. */
	const calledIds = new Set(segments.filter((s) => s.kind === "toolCall" && s.id).map((s) => s.id));

	/** Acknowledgements render as nothing. The text stays in the file — it is
	 *  transcript truth and `documentMessages` rebuilds the JSONL from it — it
	 *  just is not chrome. Errors are never hidden: a failure with no call to
	 *  pair against is exactly when you need to see it. */
	const isAck = (seg: DocSegment) => seg.kind === "toolResult" && !seg.isError && !calledIds.has(seg.id);

	/** A quiet tool's call and its result render as nothing too. */
	const quietIds = new Set(segments.filter((s) => s.kind === "toolCall" && QUIET_TOOLS.has(s.name ?? "")).map((s) => s.id));
	const isQuiet = (seg: DocSegment) => (seg.kind === "toolCall" || seg.kind === "toolResult") && quietIds.has(seg.id);

	/** Ids whose call was answered with an error: a view among them is a refused attempt. */
	const refusedIds = new Set(segments.filter((s) => s.kind === "toolResult" && s.isError).map((s) => s.id));
	/** The message still streaming, whose views hold only what has arrived so far. */
	const region = state.field(streamRegionField, false) ?? null;
	const streamingAt = (at: number) => !!region && at >= region.msgAnchor && at < region.tailAnchor;

	/** Collapsible-and-collapsed: the predicate the fold branch below applies. */
	const collapsible = (seg: DocSegment) => {
		// An acknowledgement is not a machine step, so it never counts toward the
		// "three in a row read as one strip" rule — it would inflate the count
		// with segments nobody can see.
		if (isAck(seg) || isQuiet(seg)) return false;
		if (!FOLDABLE.has(seg.kind) || seg.bodyFrom <= seg.from || inBlockFold(seg.from)) return false;
		const key = foldKey(seg);
		const folded = defaultOpen(seg) ? toggledFolds.has(key) : !toggledFolds.has(key);
		return folded && md.slice(0, seg.to).replace(/\s+$/, "").length > state.doc.lineAt(seg.from).to;
	};
	// Three or more machine steps in a row read as one activity strip: N steps
	// plus what the last one is doing. Clicking it restores the per-step labels.
	// ponytail: keyed by start offset, like thinking's fold key — an edit above
	// re-collapses an expanded run; ids would need a turn id in the format.
	const runs = new Map<DocSegment, { to: number; count: number; last: DocSegment; key: string; open: boolean }>();
	for (let i = 0; i < segments.length; ) {
		let j = i;
		while (j < segments.length && collapsible(segments[j])) j++;
		if (j - i >= 3) {
			const head = segments[i];
			const key = `run@${head.from}`;
			runs.set(head, {
				to: foldEnd(segments[j - 1]),
				count: j - i,
				last: segments[j - 1],
				key,
				open: toggledFolds.has(key),
			});
		}
		i = j > i ? j : i + 1;
	}
	const runMembers = new Set<DocSegment>();
	for (const [head, run] of runs)
		if (!run.open)
			for (const seg of segments)
				if (seg !== head && seg.from > head.from && seg.to <= run.to) runMembers.add(seg);

	for (const seg of segments) {
		if (runMembers.has(seg)) continue;
		const run = runs.get(seg);
		if (run && !run.open) {
			const from = state.doc.lineAt(seg.from).from;
			const deco = Decoration.replace({
				widget: new ActivityWidget(
					run.count,
					roleLabel(run.last),
					activitySnippet(run.last.text ?? ""),
					run.key,
					false,
					run.last === liveSegment,
				),
				block: true,
			});
			widgets.add(from, run.to, deco);
			atoms.add(from, run.to, deco);
			continue;
		}
		// An expanded run keeps its handle: a header line above the steps that
		// folds them back. Without it, expanding is a one-way door.
		if (run) {
			const from = state.doc.lineAt(seg.from).from;
			widgets.add(
				from,
				from,
				Decoration.widget({
					widget: new ActivityWidget(run.count, "collapse", "", run.key, true),
					block: true,
					side: -1,
				}),
			);
		}
		const blockFold = foldedBlocks.find((r) => r.head === seg);
		if (blockFold) {
			const deco = Decoration.replace({
				widget: new FoldedWidget(blockFold.name, "doc-line-you doc-block-collapsed", `block@${blockFold.head.from}`),
				block: true,
			});
			widgets.add(blockFold.from, blockFold.to, deco);
			atoms.add(blockFold.from, blockFold.to, deco);
			continue;
		}
		if (inBlockFold(seg.from)) continue;
		// An artifact's marker IS the frame — the widget below renders in its place,
		// and the frame carries the label, the fold and the grip. Showing the marker
		// line too would label the same thing twice.
		// An artifact's marker IS its frame: the widget renders in the marker line's
		// place, carrying the label, the fold and the grip. Showing the line too
		// would name the same thing twice.
		if (seg.kind === "artifact" && !showSource.has(`@${seg.name ?? ""}`)) {
			const markerLine = state.doc.lineAt(seg.from);
			const deco = frameAt.get(seg.from) ?? Decoration.replace({ block: true });
			widgets.add(markerLine.from, markerLine.to, deco);
			atoms.add(markerLine.from, markerLine.to, deco);
			continue;
		}
		if (isAck(seg) || isQuiet(seg) || hiddenCells.has(seg)) {
			const markerLine = state.doc.lineAt(seg.from);
			// A cell nobody grouped is its own artifact, so its frame stands where
			// its fence did — the only place it could.
			const deco = frameAt.get(seg.from) ?? Decoration.replace({ block: true });
			widgets.add(markerLine.from, foldEnd(seg), deco);
			atoms.add(markerLine.from, foldEnd(seg), deco);
			continue;
		}
		// A LIVE view (src/document/live-views.ts) renders from the element the
		// registry is holding, and is tried BEFORE the static templates below
		// because it must not wait for its payload to parse: a live view's content
		// arrives through `write()` while the fence is still being written, and
		// `viewPayload` returns null for an unclosed fence. Its extent is the
		// marker line through the end of the segment, since there may be no closing
		// fence to measure against yet.
		//
		// Show-source does not apply: a live view's fence holds nothing to show.
		// With no element (a document reopened after the process is gone) a note
		// stands in its place, saying so.
		if (seg.kind === "view" && seg.name && seg.id && getLiveView(seg.name)) {
			const live = liveEls.get(seg.id);
			const id = seg.id;
			const widget = live
				? new LiveViewWidget(seg.name, seg.id, live, seg.from)
				: new GoneViewWidget(
						seg.name,
						segments.some((other) => other.kind === "toolResult" && other.id === id && other.from > seg.from),
						seg.from,
					);
			const markerLine = state.doc.lineAt(seg.from);
			const end = md.slice(0, seg.to).replace(/\s+$/, "").length;
			const deco = Decoration.replace({ widget, block: true });
			widgets.add(markerLine.from, Math.max(end, markerLine.to), deco);
			atoms.add(markerLine.from, Math.max(end, markerLine.to), deco);
			continue;
		}
		// A view whose template is registered and whose payload fence parses as
		// JSON renders as a block widget over marker + fence (show-source ids and
		// unclosed/broken fences fall through to the honest plain-fence render).
		if (seg.kind === "view" && seg.name && seg.id && !showSource.has(seg.id)) {
			const render = getViewTemplate(seg.name);
			const payload = render ? viewPayload(md, seg) : null;
			const refused = refusedIds.has(seg.id);
			const pending = streamingAt(seg.from);
			const body = render && payload ? render(payload.data, { refused, pending }) : null;
			if (body) {
				const markerLine = state.doc.lineAt(seg.from);
				// The refusal and the message's end arrive outside the replaced slice,
				// so they are part of the widget's identity too.
				const src = `${md.slice(markerLine.from, payload!.to)}${refused ? "\nrefused" : ""}${pending ? "\npending" : ""}`;
				const deco = Decoration.replace({
					widget: new ViewWidget(seg.name, seg.id, src, body, seg.from),
					block: true,
				});
				widgets.add(markerLine.from, payload!.to, deco);
				atoms.add(markerLine.from, payload!.to, deco);
				continue;
			}
		}
		// Tool calls, results, and thinking fold by default (errors start open):
		// the label alone is the cue, clicking it toggles the body.
		if (FOLDABLE.has(seg.kind) && seg.bodyFrom > seg.from) {
			const key = foldKey(seg);
			const folded = defaultOpen(seg) ? toggledFolds.has(key) : !toggledFolds.has(key);
			const end = md.slice(0, seg.to).replace(/\s+$/, "").length;
			const markerLine = state.doc.lineAt(seg.from);
			if (folded && end > markerLine.to) {
				const deco = Decoration.replace({
					widget: new FoldedWidget(
						roleLabel(seg),
						`${SEGMENT_CLASS[seg.kind] ?? ""}${seg.isError ? " doc-fold-error" : ""}`,
						key,
						seg.isError ? foldSnippet(seg.text ?? "") : "",
						seg === liveSegment,
						seg.from,
					),
					block: true,
				});
				widgets.add(markerLine.from, foldEnd(seg), deco);
				atoms.add(markerLine.from, foldEnd(seg), deco);
				continue;
			}
		}
		// Under fold-by-default the marker is structure on most sends, not an
		// event — its line renders as nothing; the ↳ label below is the cue.
		// A note's marker is NOT hidden: every cell names itself, in the same slot
		// and the same weight, or you cannot tell what you are looking at.
		if (seg.kind === "block" && seg.bodyFrom > seg.from) {
			const markerLine = state.doc.lineAt(seg.from);
			// Pure structure: it folds what follows into the block above and has no
			// content of its own. Hiding only its TEXT left the line standing, plus
			// the blank one closing the segment — ~44px of unexplained hole, and a
			// document writes one of these before every folded cell and every
			// steered report. Take the whole segment out of the flow, the way an
			// acknowledgement and a gathered cell already go.
			//
			// Unless someone typed into it: that text is theirs and it stays visible,
			// marker hidden, which is what this branch always did.
			const hide = Decoration.replace(seg.text ? {} : { block: true });
			const to = seg.text ? markerLine.to : foldEnd(seg);
			widgets.add(markerLine.from, to, hide);
			atoms.add(markerLine.from, to, hide);
			continue;
		}
		if (seg.bodyFrom > seg.from) {
			// Replace the marker line's text with a quiet role label. The pending
			// prompt laid down at send time stays unlabeled while empty — an
			// empty "you" right after sending is noise; CSS hides it mid-stream.
			const pending = seg === segments[segments.length - 1] && seg.kind === "user" && !seg.text;
			// A folded prompt is continuation, not a head (step 14).
			const folded = seg.kind === "user" && !openers.has(seg);
			const markerLine = state.doc.lineAt(seg.from);
			widgets.add(
				markerLine.from,
				markerLine.to,
				Decoration.replace({
					widget: new RoleWidget(
						folded ? "↳ you" : roleLabel(seg),
						`${ROLE_CLASS[seg.kind] ?? SEGMENT_CLASS[seg.kind] ?? "doc-role-you"}${pending ? " doc-role-pending" : ""}${folded ? " doc-role-fold" : ""}${seg === liveSegment ? " doc-role-live" : ""}`,
						openers.has(seg) ? seg.from : undefined,
						seg.kind === "view" && seg.id && showSource.has(seg.id) ? seg.id : escapeKeyOf.get(seg),
						seg.kind === "user" ? badgeAt.get(seg.from) : undefined,
						FOLDABLE.has(seg.kind) ? foldKey(seg) : undefined,
						// Every head but the pending slot: that one is the blank draft
						// you are looking at, and `deleteSegment` refuses it anyway.
						// NOT gated on `liveSegment` — that is the last machine segment
						// on any page, streaming or not, so gating on it would strip the
						// dots from the reply you most often want gone. A turn in flight
						// is handled where it matters: the host refuses to open the menu
						// (`openSegmentMenu`), and CSS hides the dots under
						// `.doc-streaming`.
						pending ? undefined : seg.from,
						seg.kind === "aside" ? seg.from : undefined,
					),
				}),
			);
		}
		// Snippets — quoted selections the user took for follow-up — and the two
		// machine-written prefixes a prompt carries. Collapsed (the default) the
		// run stands as one folded line; expanded, only the BRACKET becomes a
		// label and everything after it renders as itself. Replacing up to
		// `markTo` instead swallowed a one-line mark whole, so expanding a
		// `[cell values]` row showed a header and none of the values it promised.
		// Added inside the segment loop, after its marker, so every builder keeps
		// the ascending order RangeSetBuilder demands.
		if (seg.kind === "user") {
			for (const run of snipRuns) {
				if (run.from < seg.bodyFrom || run.from >= seg.to) continue;
				const key = `snippet@${run.from}`;
				if (expanded(run.from)) {
					widgets.add(run.from, run.labelFrom, Decoration.replace({ widget: new SnippetLabelWidget(key, run.kind) }));
					continue;
				}
				const deco = Decoration.replace({ widget: new SnippetWidget(run, key), block: true });
				widgets.add(run.from, run.to, deco);
				atoms.add(run.from, run.to, deco);
			}
		}
	}
	// Cell chrome. Every anchor here is a LINE START — a block widget anchored
	// inside a line splits it, and the old "end of the last inked line" anchor
	// did exactly that the moment you typed a trailing space, cutting the line
	// in two so the caret appeared to jump down a row.
	//
	// A gap above every cell, plus one past the end: the same N+1 insertion
	// points as before, none of them computed from where the text happens to
	// stop.
	// Empty cells get chrome too: a brand-new page has nothing but an empty
	// prompt slot, and hiding the `+` until you type left no way to start a page
	// with prose except the `/markdown` row.
	// A hidden fence has no line to hang a handle on — the artifact frame is the
	// thing you grab now. Prompts and prose cells keep theirs.
	const cellSegs = segments.filter((seg) => cellMode(seg) !== null && !inBlockFold(seg.from) && !hiddenCells.has(seg));
	// Which cells OPEN a block. The gap above one of those is `doc-block-first`'s
	// 2.5rem; above a follow-up prompt or a continuing note it is `doc-seg-first`'s
	// 0.5rem — five times smaller. Assuming the loose one everywhere centred the
	// `+` in 40px that a continuation does not have, and it landed on top of that
	// cell's own handle. Same source of truth the `doc-block-first` line class uses.
	const blockOpeners = new Set(blocks.map((block) => segments[block.opensAt].from));
	// The page's empty trailing prompt is where you type next and never moves
	// (`moveCell`), so it carries no grip; its gaps stay.
	const tail = segments[segments.length - 1];
	const slot = tail?.kind === "user" && !tail.text ? tail : null;
	for (const seg of cellSegs) {
		const at = state.doc.lineAt(seg.from).from;
		if (seg !== slot)
			widgets.add(at, at, Decoration.widget({ widget: new CellHandleWidget(seg.from, roleLabel(seg)), side: -1 }));
		const kind = blockOpeners.has(seg.from) ? "block" : "seg";
		widgets.add(at, at, Decoration.widget({ widget: new CellGapWidget(at, seg.from, kind), block: true, side: -1 }));
	}
	// Past the last cell nothing follows, so the document's end cannot be
	// "inside" a line — the one anchor that is safe without being a line start.
	if (cellSegs.length) {
		const end = state.doc.length;
		widgets.add(end, end, Decoration.widget({ widget: new CellGapWidget(end, null), block: true, side: 1 }));
	}

	// The insertion point the hidden fences took with them: a `+` above every
	// frame, so a page whose only cells live in artifacts can still grow one.
	// Flagged as a frame gap: an artifact is a block WIDGET, not a line, so it
	// never gets the `doc-block-first` padding the `+` centres itself in.
	//
	// …and it is a DROP target as well as an insertion point, which is why it
	// carries `at`. It used to pass `null` — correct when this widget only had
	// to host the `+`, and wrong the moment gaps started catching dragged cells:
	// `null` means "the end of the page", so a drop above ANY frame sent the
	// thing to the bottom. Between two adjacent artifacts the two frame gaps are
	// the only gaps there are, so dragging the lower one above the upper one
	// asked for where it already was and the page did not visibly change.
	// `at` is the artifact marker's own offset — what `moveCellTo` resolves a
	// `beforeFrom` against.
	for (const at of frameAt.keys()) {
		if (at > state.doc.length) continue;
		const line = state.doc.lineAt(at);
		widgets.add(
			line.from,
			line.from,
			Decoration.widget({ widget: new CellGapWidget(line.from, at, "frame"), block: true, side: -1 }),
		);
	}
	if (ask) {
		const at = Math.min(askAnchor(md, segments), state.doc.length);
		widgets.add(at, at, Decoration.widget({ widget: new AskWidget(ask.el, ask.park), block: true, side: 1 }));
	}
	// `true` sorts — including by `startSide`, which is what made inline and
	// block widgets landing on one offset need separate sets before.
	return { widgets: Decoration.set(widgetRanges, true), atoms: atoms.finish() };
}

/** Tags transactions dispatched by the component itself (splices, loads). */
const ownEdit = Annotation.define<boolean>();

/** A host-driven edit that is nonetheless the writer's: the block menu, the `+`
 *  gutter, a quoted snippet. It carries `ownEdit` too (it is not typing, so the
 *  typewriter and the save debounce treat it as programmatic), but the document
 *  invariants apply to it exactly as they apply to a keystroke — one annotation
 *  could not tell "the writer did this through a menu" from "a run is streaming
 *  into the page", and cells inserted past the tail lost their prompt slot. */
const hostEdit = Annotation.define<boolean>();

/** Fraction of the viewport at top and bottom outside which the caret gets
 *  re-centered. Inside the band, typing scrolls nothing — CodeMirror's own
 *  cursor-visibility handling covers it. */
const TYPEWRITER_BAND = 0.25;

/** True when the caret sits in the outer band and a re-center is warranted.
 *  Two layout reads, versus a transaction plus a full re-measure. */
function outsideTypewriterBand(view: EditorView): boolean {
	const caret = view.coordsAtPos(view.state.selection.main.head);
	if (!caret) return true; // caret not rendered — scrolling to it is the point
	const box = view.scrollDOM.getBoundingClientRect();
	const band = box.height * TYPEWRITER_BAND;
	return caret.top < box.top + band || caret.bottom > box.bottom - band;
}

/** One parse per doc change feeds all four decoration consumers. */
const decoField = StateField.define<{ widgets: DecorationSet; atoms: DecorationSet }>({
	create: (state) => buildDecorations(state),
	update(value, tr) {
		const dirty =
			tr.docChanged ||
			tr.effects.some(
				(e) =>
					e.is(setBadgesEffect) ||
					e.is(toggleSourceEffect) ||
					e.is(setCellsEffect) ||
					e.is(toggleFoldEffect) ||
					e.is(setFoldsEffect) ||
					e.is(setAskEffect) ||
					e.is(setLiveViewsEffect) ||
					// A view in the streaming message is drawn as pending until the region moves past it.
					e.is(setStreamRegionEffect),
			);
		if (!dirty) return value;
		return buildDecorations(
			tr.state,
			tr.state.field(showSourceField),
			tr.state.field(badgesField),
			tr.state.field(cellsField),
			tr.state.field(foldsField),
			tr.state.field(askField),
			tr.state.field(liveViewsField),
		);
	},
	provide: (f) => [
		EditorView.decorations.from(f, (v) => v.widgets),
		// Rendered views are atomic: the cursor skips them; edits go via show-source.
		EditorView.atomicRanges.of((view) => view.state.field(f).atoms),
	],
});

/**
 * Which cell chrome is "near": only the block under the pointer shows its
 * handle and the two `+` gaps that bound it.
 *
 * This used to be one CSS rule — `.cm-content:hover` lit every handle on the
 * page at once — which put a dozen identical marks in the margin and left none
 * of them meaning "this one". Scoping it needs JS, because a block is a RUN of
 * `.cm-line` siblings and block widgets, not an element: no selector can say
 * "the pointer is somewhere in this run".
 *
 * Driven by `mouseover`, not `mousemove`: it fires on element boundaries rather
 * than per pixel, and the work is then skipped entirely unless the resolved
 * block actually changed.
 */
const nearChrome = ViewPlugin.fromClass(
	class {
		/** What currently carries `doc-near`, so clearing costs no query. */
		#marked: Element[] = [];
		/** The block those marks belong to — the skip check for a mouse still
		 *  inside the block it was already in. */
		#from: number | null = null;

		constructor(readonly view: EditorView) {
			view.contentDOM.addEventListener("mouseover", this.#onOver);
			view.contentDOM.addEventListener("mouseleave", this.#onLeave);
		}

		destroy() {
			this.view.contentDOM.removeEventListener("mouseover", this.#onOver);
			this.view.contentDOM.removeEventListener("mouseleave", this.#onLeave);
			this.#clear();
		}

		/** A re-render replaces widget DOM, so marks on it are gone and the
		 *  memo of which block they belonged to is a lie. Drop it; the next
		 *  mouseover re-resolves. */
		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged) {
				this.#marked = [];
				this.#from = null;
			}
		}

		readonly #onOver = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			if (!target) return;
			// Reaching for a `+` means leaving the block that revealed it — and
			// a control that vanishes as you arrive is not a control. The gap
			// rows hold whatever is already shown.
			if (target.closest(".doc-cell-gap")) return;
			const row = target.closest(".cm-line, .doc-cell");
			if (!row) return;
			const block = blockAt(this.view.state, this.view.posAtDOM(row));
			if (!block) return this.#clear();
			if (block.from === this.#from) return;
			this.#apply(block.from, block.end);
		};

		readonly #onLeave = () => this.#clear();

		#clear() {
			for (const el of this.#marked) el.classList.remove("doc-near", "doc-near-block");
			this.#marked = [];
			this.#from = null;
		}

		#apply(from: number, end: number) {
			this.#clear();
			this.#from = from;
			const content = this.view.contentDOM;
			// A gap is anchored at the START of the line its block opens on, which
			// can sit a character or two before the marker itself.
			const top = this.view.state.doc.lineAt(from).from;
			const mark = (el: Element, cls: string) => {
				el.classList.add(cls);
				this.#marked.push(el);
			};
			for (const el of content.querySelectorAll<HTMLElement>(".doc-cell-handle[data-at]")) {
				if (Number(el.dataset.at) < top || Number(el.dataset.at) > end) continue;
				mark(el, "doc-near");
				// The handle is INSIDE the row focus mode dims, and `opacity`
				// clamps descendants — so the row is what has to come back, not
				// the handle. Nothing else lifts this.
				const row = el.closest(".cm-line, .doc-cell");
				if (row) mark(row, "doc-near-block");
			}
			// The gap above the block, and the first one past its end — "insert
			// before this" and "insert after this", which is the pair the block
			// under the pointer can actually use.
			let below: HTMLElement | null = null;
			for (const el of content.querySelectorAll<HTMLElement>(".doc-cell-gap[data-at]")) {
				const at = Number(el.dataset.at);
				if (at >= top && at <= end) mark(el, "doc-near");
				else if (at > end && (!below || at < Number(below.dataset.at))) below = el;
			}
			if (below) mark(below, "doc-near");
		}
	},
);

const brightLine = Decoration.line({ class: "doc-bright" });

/**
 * iA-Writer-style focus: the paragraph (blank-line block) holding the caret
 * keeps full ink, everything else recedes. CSS only dims while focused.
 *
 * Marks the BRIGHT paragraph, not the dim remainder — CSS dims by default and
 * this lifts the exception. The obvious direction (a .doc-dim line decoration
 * on every other line) is O(document) per keystroke: at 3200 lines it rebuilt
 * ~3200 decorations per character, measured at +16ms presentation delay and
 * 32 dropped frames per 43 keystrokes against bare CodeMirror's 1. This is
 * O(paragraph) — a handful of lines, whatever the document's size.
 */
const focusDim = EditorView.decorations.compute(["doc", "selection"], (state) => {
	const doc = state.doc;
	const cur = doc.lineAt(state.selection.main.head).number;
	let start = cur;
	let end = cur;
	while (start > 1 && doc.line(start - 1).text.trim() !== "") start--;
	while (end < doc.lines && doc.line(end + 1).text.trim() !== "") end++;
	const b = new RangeSetBuilder<Decoration>();
	for (let n = start; n <= end; n++) b.add(doc.line(n).from, doc.line(n).from, brightLine);
	return b.finish();
});

/** The block a position falls in, with its extent and key. Blocks are a run of
 *  segments, not an element, so "which block is this" is offset arithmetic —
 *  the last opener at or before `pos` wins. */
function blockAt(state: EditorState, pos: number): { key: string; from: number; end: number } | null {
	const { md, parsed, blocks } = state.field(docField);
	const { segments } = parsed;
	let found: { key: string; from: number; end: number } | null = null;
	for (const block of blocks) {
		const opener = segments[block.opensAt];
		if (opener.from > pos) break;
		const end = md.slice(0, segments[block.members[block.members.length - 1]].to).replace(/\s+$/, "").length;
		found = { key: `user:${opener.from}`, from: opener.from, end };
	}
	return found;
}

/** The caret's block (step 13's "you are here").
 *  Feeds the caret-block event only — the rail mirrors it; the document
 *  itself carries no current-block ink. */
const caretBlock = (state: EditorState) => blockAt(state, state.selection.main.head);

/** The `caret-block` event's detail: which block the caret is in, or null when
 *  it is in none. The rail's current-block highlight mirrors it. */
export interface CaretBlock {
	key: string | null;
}

/** The `cell-failure` event's detail. Mechanism, not policy: the host decides
 *  whether to tell the agent, and dedupes on `key`. */
export interface CellFailure {
	id: string;
	error: string;
	/** What the host dedupes on — stable across a re-report of the same cell. */
	key: string;
	/** The artifact a cell-level failure belongs to, when it has one. */
	scope?: string;
}

/** How a cell ran, judged once it has settled (`notebook-cells.md` §Policy):
 *  what the `cell` tool tells the agent. `waiting` is a reference to a name no
 *  cell declares yet — the cell that will is often the next one written — and
 *  `running` is a cell still pending when the bound ran out. `empty` is a cell
 *  that ran while a chart it feeds shows no data: `cell` is the one showing
 *  that chart, `names` the empty values it was drawn from. */
export type CellVerdict =
	| { verdict: "ok" }
	| { verdict: "empty"; cell: string; names: string[] }
	| { verdict: "failed"; error: string }
	| { verdict: "waiting"; name: string }
	| { verdict: "running" };

/** What a run is doing to one cell, for the chip at the top of its artifact.
 *  The host decides the words; the tone picks the colour, and `working` locks
 *  the artifact while the turn runs (ADR 0054). */
export interface CellChip {
	id: string;
	text: string;
	tone: "working" | "done" | "warning" | "error";
	/** Wash the artifact faintly while this lasts — the host's toggle, and
	 *  nothing to do with the lock. */
	pulse?: boolean;
}

/** How often `cellVerdict` looks again while a cell is still syncing or
 *  running. Short against the sweep's quiet period, which is the real wait. */
const VERDICT_POLL_MS = 50;

/** The runtime's word for a reference to a name nothing defines. */
const UNDEFINED_NAME = /(?:^|\s)([A-Za-z_$][\w$]*) is not defined$/;

/** A row of the creation menu: a completion, with what the menu draws beside
 *  its name. The host says which icon and which chord; the canvas draws them. */
export interface SlashRow extends Completion {
	icon?: IconNode;
	/** The chord that does the same as choosing the row. */
	shortcut?: string;
}

/** The icon at a row's left edge. A row without one keeps the column, so
 *  names line up down the list. */
function slashIcon(row: SlashRow): HTMLElement {
	const cell = document.createElement("span");
	cell.className = "doc-slash-icon";
	if (row.icon) cell.append(iconDOM(row.icon, "sm"));
	return cell;
}

/** The chord at a row's right edge, or nothing. */
function slashKeys(row: SlashRow): HTMLElement | null {
	if (!row.shortcut) return null;
	const keys = document.createElement("kbd");
	keys.className = "doc-slash-keys";
	keys.textContent = row.shortcut;
	return keys;
}

export class DocumentChat extends LitElement {
	@property({ type: Boolean }) streaming = false;
	/** Creation-menu rows for `/` on an empty tail line (host-supplied catalog). */
	@property({ attribute: false }) slashCommands: SlashRow[] = [];
	/** Host-supplied docs for a `/name` already written (the component never
	 *  fetches). Unset = no hover card. The menu itself has no card: a row
	 *  says what its command does. */
	@property({ attribute: false }) commandDocs?: (name: string) => Promise<CommandDoc | null>;

	/** Maps an image's document url to the one the page loads (`assetResolver`).
	 *  Unset, an image loads the url the document holds. */
	@property({ attribute: false }) resolveAsset?: (url: string) => string;
	/** Where a cell's `FileAttachment` resolves a workspace path — the host's URL
	 *  for the workspace root (`notebook-cells.md` §Files). Read when the first
	 *  cell loads the engine; unset, a name resolves against the page's own URL. */
	@property({ attribute: false }) fileBase?: string;
	#assets = new Compartment();

	/** Harness seam (ADR 0008): the suite drives the real EditorView. */
	view?: EditorView;
	/** setDocument() before the view exists parks the text here. */
	#initialDoc?: string;
	#saveTimer?: ReturnType<typeof setTimeout>;
	/** When the save now pending was first deferred — the clock
	 *  `SAVE_MAX_DEFER_MS` runs against. Unset while no save is pending. */
	#saveDeferredSince?: number;
	#draftTimer?: ReturnType<typeof setTimeout>;
	/** The cell engine — lazily constructed on the first cell ever seen. */
	#engine?: NotebookEngine;
	/** Live <pi-cell> elements by cell id — they outlive widget recreation. */
	/** Harness seam (ADR 0008): the suite asserts a cell element is still standing. */
	readonly cellEls = new Map<string, PiCell>();
	/** Live <pi-artifact> frames by artifact key — same reason: re-deriving the
	 *  artifact on every parse must not restart a running cell or close a pane. */
	readonly #artifactEls = new Map<string, PiArtifact>();

	/** Open live views by view id (`src/document/live-views.ts`). The elements
	 *  reach the decoration builder through `liveViewsField`; the host owns their
	 *  LIFETIME, which is why it is keyed the same way and reaped in one place. */
	readonly #liveViewHost = new LiveViewHost({
		emit: (event) => this.dispatchEvent(event),
		publish: (els) => this.view?.dispatch({ effects: setLiveViewsEffect.of(els) }),
		presentIds: () => {
			const view = this.view;
			if (!view) return null;
			const present = new Set<string>();
			for (const seg of view.state.field(docField).parsed.segments)
				if (seg.kind === "view" && seg.id) present.add(seg.id);
			return present;
		},
		measure: () => this.view?.requestMeasure(),
		focusEditor: () => this.view?.focus(),
	});
	/** Live source editors by cell id, built the first time a code pane opens. */
	/** Harness seam (ADR 0008): the suite asserts a pane built its editor. */
	readonly cellEditors = new Map<string, CellEditor>();
	/** Artifacts whose panes are in edit mode: their keystrokes are buffered in
	 *  the editors and reach neither the document nor the engine until Apply.
	 *
	 *  A plain registry rather than a StateField — unlike `foldsField` and
	 *  `showSourceField` nothing in `buildDecorations` reads it, and it holds no
	 *  positions to map across edits. It is also deliberately NOT persisted: an
	 *  unapplied buffer is not part of the document, and a reload has no business
	 *  restoring one. */
	readonly #editingArtifacts = new Set<string>();
	/** Which artifact each cell belongs to. A <pi-cell> re-renders itself when
	 *  its state changes, but the frame around it reads that state too — for the
	 *  rule's colour and for opening a broken artifact's source — and nothing
	 *  else would tell it to look again. */
	readonly #cellArtifact = new Map<string, string>();
	/** Hidden host keeping unmounted cell elements connected — a detached Lit
	 *  element defers its first update (and thus its engine upsert) until
	 *  connection, so cells outside the editor viewport would never run. */
	#cellPark?: HTMLElement;

	#park(): HTMLElement {
		let park = this.#cellPark;
		if (!park || !park.isConnected) {
			park?.remove();
			park = document.createElement("div");
			park.className = "doc-cell-park";
			park.hidden = true;
			this.append(park);
			this.#cellPark = park;
		}
		return park;
	}
	#cellSyncTimer?: ReturnType<typeof setTimeout>;
	#failureSweepTimer?: ReturnType<typeof setTimeout>;
	/** Guards the async engine load against document switches. */
	#cellEpoch = 0;
	/** Saved view() values parsed on the first sync, applied once the cells that
	 *  own those widgets have been defined. */
	#pendingViewState: CellStatePayload | null = null;
	/**
	 * What the document's widgets are set to. The host reads it from the
	 * transcript and writes it back there (`cell-state-save`) — the component
	 * neither parses it out of the text nor stores it, because the text is a
	 * rendering and a rendering cannot be the only copy of anything.
	 */
	@property({ attribute: false }) cellState: unknown = undefined;
	/** Last state emitted, so an unchanged snapshot is not written twice. */
	#lastStateJson = "";
	/** Widget state restored for this engine — once per boot; also gates
	 *  capture so a boot storm can't overwrite the saved block with defaults. */
	#stateRestored = false;
	#statePersistTimer?: ReturnType<typeof setTimeout>;
	/** Cells this turn's machine region authored — the attribution set behind
	 *  cell-failure events. Bounded by `turnAnchor` and `tailAnchor`, not by
	 *  position alone: the writer can edit their own cells above the run now, and
	 *  telling the agent one of THOSE failed is the bogus report `reportSettledFailures`
	 *  exists to prevent. Cleared at turn start. */
	/** Harness seam (ADR 0008): the suite asserts whose cell a turn claimed. */
	readonly turnCells = new Set<string>();
	/** The region owned by the turn in flight, or `null` between turns (ADR 0017).
	 *  Every writer asks this and refuses on `null`: there is no span that means
	 *  "nowhere", and the collapsed one it used to return spans the whole buffer
	 *  on a loaded document. */
	get liveRegion(): StreamRegion | null {
		return this.view?.state.field(streamRegionField) ?? null;
	}
	/** Start of the region owned by the current in-flight assistant render. */
	/** Harness seam (ADR 0008): the suite reads the stream region's anchors.
	 *  Collapsed to the document's end between turns, so a READER needs no
	 *  null check; a WRITER must use `liveRegion` instead. */
	get region(): StreamRegion {
		const live = this.liveRegion;
		if (live) return live;
		const at = this.view?.state.doc.length ?? 0;
		return { msgAnchor: at, tailAnchor: at, turnAnchor: at };
	}
	#setRegion(msgAnchor: number, tailAnchor: number, turnAnchor?: number) {
		this.view?.dispatch({ effects: setStreamRegionEffect.of({ msgAnchor, tailAnchor, turnAnchor }) });
	}
	/** The turn is over: nothing may write through the region until the next one. */
	#closeRegion() {
		this.view?.dispatch({ effects: setStreamRegionEffect.of(null) });
	}
	/** The element has been disconnected and its editor destroyed. Terminal: the
	 *  `EditorView` is built in `firstUpdated`, which Lit runs once, so there is
	 *  nothing that would rebuild one after a reconnect. Distinct from
	 *  `!this.view`, which is the PRE-mount window — conflating the two is what
	 *  made a dozen guards read as teardown checks while catching nothing, since
	 *  `view` stays set after removal. */
	#disposed = false;
	/** The user wrote SOMEWHERE this turn — endTurn leaves their caret alone. */
	#userTypedDuringTurn = false;
	/** A user edit landed above the machine's region this turn. The transcript has
	 *  never seen that text, so the host must not record it as already sent —
	 *  `endRun` drops its `historyBase` entry and the next send rebuilds. */
	#headEdited = false;
	/** This turn opened at a prompt in the MIDDLE of the page — endTurn leaves
	 *  their caret alone too. The trailing slot is not where they were and not
	 *  where the answer is; sending them there is a jump to the bottom of a page
	 *  they were reading the middle of. Set by `beginTurn`, which is the only
	 *  thing that knows where a turn opened. */
	#midPageTurn = false;
	/** Last emitted caret-block key (dedupe — undefined = never emitted). */
	#lastCaretBlock: string | null | undefined;
	/** Prevent the typewriter's own scroll from being treated as manual navigation. */
	#preserveFocusScroll = false;
	#preserveFocusScrollTimer?: ReturnType<typeof setTimeout>;

	/** The docs card for a command name, or null (unknown / no resolver / offline). */
	async #docFor(name: string): Promise<HTMLElement | null> {
		try {
			const doc = await this.commandDocs?.(name);
			return doc ? renderCommandDoc(doc) : null;
		} catch {
			return null;
		}
	}

	/** Which block holds the caret ("you are here") — the rail mirrors it. */
	#emitCaretBlock(state: EditorState) {
		const key = caretBlock(state)?.key ?? null;
		if (key === this.#lastCaretBlock) return;
		this.#lastCaretBlock = key;
		this.dispatchEvent(new CustomEvent<CaretBlock>("caret-block", { detail: { key }, bubbles: true, composed: true }));
	}

	/**
	 * Reports a change that lies inside one prompt's body, as it was made: what
	 * went, what came, where and when. A host that wants to know when a prompt's
	 * words were typed has no other way: `doc-draft` is debounced and carries the
	 * whole document. The machine's own splices are not reported, nor a change
	 * that reaches outside a prompt or leaves it something else than a prompt.
	 * The cost per keystroke is a walk over segments already parsed.
	 */
	#emitPromptEdit(update: ViewUpdate) {
		if (update.transactions.some((tr) => tr.docChanged && tr.annotation(ownEdit))) return;
		const before = update.startState.field(docField).parsed.segments;
		const origin = originOf(update.transactions.find((tr) => tr.docChanged)?.annotation(Transaction.userEvent));
		const at = performance.now();
		const edits: PromptEdit[] = [];
		let index = -1;
		let inside = true;
		update.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
			const found = before.findIndex((seg) => seg.kind === "user" && fromA >= seg.bodyFrom && toA <= seg.to);
			if (found < 0 || (index >= 0 && found !== index)) inside = false;
			if (!inside) return;
			index = found;
			// `fromB` is where the change sits once those before it are applied,
			// and the body's start is above them all.
			edits.push({ at, from: fromB - before[found].bodyFrom, deleted: update.startState.doc.sliceString(fromA, toA), inserted: inserted.toString(), origin });
		});
		if (!inside || index < 0) return;
		const now = update.state.field(docField).parsed.segments[index];
		if (now?.kind !== "user" || now.bodyFrom !== before[index].bodyFrom) return;
		const prompt = before.slice(0, index).filter((seg) => seg.kind === "user").length;
		this.dispatchEvent(new CustomEvent("prompt-edit", { detail: { prompt, edits }, bubbles: true }));
	}

	/** Coalesces to one measurement per frame: rAF does not dedupe callbacks, so
	 *  without this every keystroke queued its own forced layout + posAtCoords
	 *  hit-test. */
	#scrollProgressPending = false;

	#scheduleScrollProgress() {
		if (this.#scrollProgressPending) return;
		this.#scrollProgressPending = true;
		requestAnimationFrame(() => {
			this.#scrollProgressPending = false;
			this.#emitScrollProgress();
		});
	}

	#emitScrollProgress() {
		const view = this.view;
		if (!view) return;
		const scroller = view.scrollDOM;
		const max = scroller.scrollHeight - scroller.clientHeight;
		const progress = max > 0 ? scroller.scrollTop / max : 0;
		const scrollerRect = scroller.getBoundingClientRect();
		const contentRect = view.contentDOM.getBoundingClientRect();
		const position =
			view.posAtCoords({ x: contentRect.left + 1, y: Math.min(scrollerRect.bottom - 1, scrollerRect.top + 48) }) ?? 0;
		this.dispatchEvent(
			new CustomEvent("scroll-progress", { detail: { progress, position }, bubbles: true, composed: true }),
		);
	}

	protected override createRenderRoot() {
		return this;
	}

	override render() {
		return html`<div class="doc-editor"></div>`;
	}

	protected override firstUpdated() {
		// The ghost and draft hints are CSS `content`; the chord labels come from
		// here so a Windows or Linux user reads Ctrl+Enter, not ⌘⏎.
		this.style.setProperty("--doc-key-send", JSON.stringify(MOD_ENTER));
		this.style.setProperty("--doc-key-follow", JSON.stringify(SHIFT_MOD_ENTER));
		const self = this;
		// Creation menu: `/` at the start of an otherwise empty line inside the
		// trailing user segment lists the host's catalog (templates, block kinds).
		const slashSource = (context: CompletionContext) => {
			if (!self.slashCommands.length) return null;
			const line = context.state.doc.lineAt(context.pos);
			if (context.pos !== line.to || !/^\/[\w:-]*$/.test(context.state.sliceDoc(line.from, context.pos))) return null;
			const last = context.state.field(docField).parsed.segments.at(-1);
			if (last?.kind !== "user" || line.from < last.bodyFrom) return null;
			return { from: line.from, options: self.slashCommands, validFor: /^\/[\w:-]*$/ };
		};
		const slashOrder = (option: Completion) => self.slashCommands.findIndex((row) => row.label === option.label);
		// A card over a `/name` already written in the tail, where no row is there
		// to say what it is. The machine region above it documents nothing — same
		// boundary the `/` source enforces.
		const commandHover = hoverTooltip(async (view, pos) => {
			if (!self.commandDocs) return null;
			const line = view.state.doc.lineAt(pos);
			const last = view.state.field(docField).parsed.segments.at(-1);
			if (last?.kind !== "user" || line.from < last.bodyFrom) return null;
			const offset = pos - line.from;
			const token = [...line.text.matchAll(/\/[\w:-]+/g)].find(
				(m) => m.index! <= offset && offset <= m.index! + m[0].length,
			);
			if (!token) return null;
			const dom = await self.#docFor(token[0].slice(1));
			if (!dom) return null;
			return {
				pos: line.from + token.index!,
				end: line.from + token.index! + token[0].length,
				create: () => ({ dom }),
			};
		});
		window.addEventListener("pi-cell-writeback", this.#onCellWriteback);
		// A cell that failed to compile, from <pi-cell>'s own catch. It never
		// reached the runtime, so the engine's observer could not report it —
		// this is the same failure, arriving by the only door it has. The
		// attribution rule (was this cell authored by the turn in flight?) is
		// applied in one place, below, for both doors.
		// Right-click is the way into a block. On a selection it offers to quote it
		// — a selection means "answer THIS part", and the host puts the quote in
		// that block's own reply slot. With nothing selected it opens the block menu
		// for whatever is under the pointer, which is the only door an artifact has:
		// its head is a frame, not a marker line.
		//
		// On the HOST, not in `EditorView.domEventHandlers`, and that is the whole
		// reason this works. CodeMirror gates its DOM handlers behind
		// `eventBelongsToEditor`, which walks up from the target and drops the event
		// if any widget on the way answers `ignoreEvent()` with true — and
		// `ArtifactWidget` must answer true, because the code pane inside it is a
		// real editor whose keystrokes are not edits at the frame's position. So a
		// right-click anywhere on an artifact never reached the editor's handler at
		// all: the one block that needed this most was the one block it could not
		// see. A listener on the element sees everything that bubbles, widgets
		// included.
		//
		// Shift falls through to the browser's own menu, everywhere. Spellcheck,
		// copy and inspect stay reachable, and a modifier costs one condition — the
		// alternative was a rule that changed depending on which part of the
		// document you happened to be pointing at.
		this.addEventListener("contextmenu", (event) => {
			const view = this.view;
			if (event.shiftKey || !view) return;
			// Chrome outside the buffer — the bar, the rail — keeps its own menu.
			if (!(event.target as HTMLElement | null)?.closest?.(".doc-editor")) return;
			// A nested editor is a real editor (the artifact's code pane), and a form
			// control in the buffer is a form control: both keep the browser's menu.
			if ((event.target as HTMLElement | null)?.closest?.(NATIVE_MENU)) return;
			const pos = docPosAt(view, event);
			if (pos === null) return;
			const sel = view.state.selection.main;
			// The keyboard menu key reports 0/-1 coordinates — anchor on the caret.
			const coords = view.coordsAtPos(sel.head);
			const x = event.clientX > 0 ? event.clientX : (coords?.left ?? 0);
			const y = event.clientY > 0 ? event.clientY : (coords?.bottom ?? 0);
			// A selection only claims the click when the click is INSIDE it. A
			// selection left behind three blocks up is not what you are pointing at,
			// and letting it answer meant right-clicking an artifact offered to quote
			// a sentence somewhere off screen — every menu in this document addresses
			// what is under the pointer, and this one has to as well.
			if (!sel.empty && pos >= sel.from && pos <= sel.to) {
				const text = view.state.sliceDoc(sel.from, sel.to).trim();
				if (!text) return;
				event.preventDefault();
				this.dispatchEvent(
					new CustomEvent("selection-menu", {
						detail: { text, from: sel.from, to: sel.to, x, y },
						bubbles: true,
						composed: true,
					}),
				);
				return;
			}
			const from = blockOpenerAt(view, pos);
			if (from === null) return;
			event.preventDefault();
			this.dispatchEvent(new CustomEvent("block-menu", { detail: { from, x, y }, bubbles: true, composed: true }));
		});
		this.addEventListener("cell-syntax-error", (event) => {
			// UI only: the frame's rule turns red and it opens its source, in step
			// with the banner. Telling the AGENT is decided in `syncCells`, where
			// it is knowable whether the turn has finished writing this cell.
			event.stopPropagation();
			this.#refreshArtifactOf((event as CustomEvent<{ id: string }>).detail.id);
		});
		this.addEventListener("view-toggle", (event) => {
			this.view?.dispatch({ effects: toggleSourceEffect.of((event as CustomEvent<{ id: string }>).detail.id) });
		});
		// Every fold is one key in one set, so this is no longer a router: it used
		// to pick `block@`/`snippet@` back apart into numbers for two other
		// fields, which is the shape those widgets never had in the first place.
		// A block fold is still announced to the host, which persists it.
		this.addEventListener("fold-toggle", (event) => {
			const key = (event as CustomEvent<{ key: string }>).detail.key;
			this.view?.dispatch({ effects: toggleFoldEffect.of(key) });
			if (key.startsWith("block@")) this.#emitBlockFolds();
		});
		const leaveFocusOnScroll = EditorView.domEventHandlers({
			// Some browser/keyboard-layout combinations fail CodeMirror's
			// Alt-Mod-Enter chord normalization. Catch the physical modifiers
			// directly: this chord continues the current block.
			keydown: (event, view) => {
				if (event.key !== "Enter" || !event.altKey || event.shiftKey || (!event.metaKey && !event.ctrlKey)) return false;
				event.preventDefault();
				const text = self.#sendText(view.state.selection.main.head);
				self.dispatchEvent(
					new CustomEvent("doc-send", {
						detail: { text, followUp: false, newBlock: false, at: view.state.selection.main.head },
						bubbles: true,
					}),
				);
				return true;
			},
			scroll: () => {
				// Streaming splices and the typewriter's caret centering are synthetic
				// scrolls. Neither means that the writer left focus mode.
				if (self.#preserveFocusScroll) {
					self.#preserveFocusScroll = false;
					clearTimeout(self.#preserveFocusScrollTimer);
				} else if (!self.streaming) {
					self.classList.remove("doc-focus");
				}
				self.#emitScrollProgress();
			},
		});

		this.view = new EditorView({
			parent: this.querySelector(".doc-editor")!,
			// A redraw can put an artifact's frame somewhere else on the page (it
			// sits under the block of its last member), and an element that is
			// moved loses the focus it held, to nothing: no key reaches anyone,
			// Escape included. The focus goes back to where it was.
			dispatchTransactions: (trs, view) => {
				const held = self.#focusInArtifact();
				view.update(trs);
				if (held) self.#returnFocus(held);
			},
			state: EditorState.create({
				extensions: [
					keymap.of([
						// The most-specific chord comes first: ⌥⌘⏎ continues the
						// current block; plain ⌘⏎ opens a new one.
						{
							key: "Alt-Mod-Enter",
							run: (view) => {
								const text = self.#sendText(view.state.selection.main.head);
								self.dispatchEvent(
									new CustomEvent("doc-send", {
										detail: { text, followUp: false, newBlock: false, at: view.state.selection.main.head },
										bubbles: true,
									}),
								);
								return true;
							},
						},
						// Mid-stream, the two bindings are the two real intents:
						// Mod-Enter steers (interject now), Shift-Mod-Enter queues a
						// follow-up (runs after). Idle, Mod-Enter opens a new block.
						// Dispatched even with an empty tail: an edited earlier prompt is
						// a send too (fork) — the parent decides what an empty text means.
						{
							key: "Shift-Mod-Enter",
							run: (view) => {
								const text = self.#sendText(view.state.selection.main.head);
								self.dispatchEvent(
									new CustomEvent("doc-send", {
										detail: { text, followUp: true, at: view.state.selection.main.head },
										bubbles: true,
									}),
								);
								return true;
							},
						},
						{
							key: "Mod-Enter",
							run: () => {
								self.send();
								return true;
							},
						},
						// Plain Shift-Enter is a soft break, like every chat/writing app —
						// unbound in defaultKeymap, so without this it silently did nothing.
						{ key: "Shift-Enter", run: insertNewlineAndIndent },
						// The one gesture that takes a block out from the keyboard. Ahead of
						// `defaultKeymap`'s `deleteCharBackward`, and it declines everything
						// that is not an empty block — so ordinary Backspace is untouched.
						{ key: "Backspace", run: () => self.backspaceAtBlockHead() },
						{
							key: "Escape",
							run: () => {
								if (self.streaming) self.dispatchEvent(new CustomEvent("doc-stop", { bubbles: true }));
								return self.streaming;
							},
						},
						...defaultKeymap,
						...historyKeymap,
					]),
					history(),
					// Before every consumer: the shared parse they all read from.
					docField,
					streamRegionField,
					showSourceField,
					foldsField,
					badgesField,
					cellsField,
					askField,
					runBadgeField,
					liveViewsField,
					decoField,
					lineClasses,
					autocompletion({
						override: [slashSource],
						icons: false,
						// Rows that match equally keep the host's order, which says
						// what comes first; the default would sort them by name.
						compareCompletions: (a, b) => slashOrder(a) - slashOrder(b),
						optionClass: () => "doc-slash-row",
						// CodeMirror puts the label at 50 and the detail at 80.
						addToOptions: [
							{ render: slashIcon, position: 20 },
							{ render: slashKeys, position: 90 },
						],
					}),
					commandHover,
					// GFM base: Table/Strikethrough nodes for live rendering (the
					// commonmark default parses tables as plain paragraphs).
					markdown({ base: markdownLanguage, codeLanguages: fenceLanguages }),
					this.#assets.of(this.resolveAsset ? assetResolver.of(this.resolveAsset) : []),
					proseAt.of(inProse),
					liveMarkdown,
					liveDragFreeze,
					mdLinkOpen,
					syntaxHighlighting(mdHighlight),
					// CodeMirror draws the caret and the selection itself. Without
					// these two the browser does, natively — and a native selection
					// dragged across this document runs over replaced block widgets
					// (artifacts, folds, views, tables) that are not text, painting a
					// band across chrome nobody can select, and a native click
					// hit-tests into lines the format collapses to a 6px sliver
					// (`doc-line-blank`) and lands the caret a line off. Both are
					// TODO items; both are what `drawSelection` exists to prevent. It
					// also restores the two rules `document.css` already wrote for the
					// iA-Writer caret and the accent selection band — `.cm-cursor` and
					// `.cm-selectionBackground` are elements only this extension
					// creates, so until now that CSS matched nothing.
					drawSelection(),
					// The drop caret for a drag: without it a drag into the document
					// shows no insertion point, which is the other half of "cursor
					// placement with the mouse is broken".
					dropCursor(),
					EditorView.lineWrapping,
					placeholder(`Write, then ${MOD_ENTER} for a new block`),
					focusDim,
					nearChrome,
					leaveFocusOnScroll,
					// While streaming, only `machineSpan` is out of bounds. This used to
					// start at 0, so a turn froze the whole document for its length and
					// "write while streaming" meant the tail draft and nothing else — no
					// fixing a word in a markdown cell, no editing the prompt just sent.
					// Nothing had to be built to open it: `streamRegionField` already maps
					// both anchors through every change, so an edit above the run moves the
					// run with it, which is all the next splice needs to stay on target.
					//
					// A range filter drops only the offending changes — the whole
					// transaction used to go, so a caret move mid-stream died with it.
					EditorState.changeFilter.of((tr) => {
						if (!self.streaming || tr.annotation(ownEdit)) return true;
						const { from, to } = machineSpan(self.region);
						return [from, to];
					}),
					// Marker lines are structure, not text. Vetting the CHANGE rather
					// than one keystroke covers every source there is — paste, cut,
					// drag-drop, select-and-type — where a Backspace binding covered
					// exactly one. A change that swallows a cell whole still deletes
					// it: that is a gesture, not an accident.
					EditorState.changeFilter.of((tr) => {
						if (tr.annotation(ownEdit) || !tr.docChanged) return true;
						// Undo and redo only ever restore a state that was already valid
						// — vetting them would strand the user in a document they cannot
						// step back out of.
						if (tr.isUserEvent("undo") || tr.isUserEvent("redo")) return true;
						const { segments } = tr.startState.field(docField).parsed;
						let ok = true;
						tr.changes.iterChanges((fromA, toA) => {
							if (!ok) return;
							for (const seg of segments) {
								if (seg.bodyFrom === seg.from) continue; // markerless leading segment
								if (fromA <= seg.from && toA >= seg.to) continue; // the whole cell goes
								if (fromA < seg.bodyFrom && toA > seg.from) ok = false; // clips the marker
							}
						});
						// The gesture the rule above has no answer for: a selection dragged
						// from the middle of one body to the middle of another clips the
						// marker of the segment it ends in, every time, so Backspace, Delete,
						// cut and select-and-type all did nothing at all and nothing said
						// why. Let it past — the transaction filter below replaces it with
						// the structural delete it meant, reading the SAME predicate, so the
						// raw change can never be the thing that applies.
						if (!ok && !self.streaming && structuralSpan(tr, segments)) return true;
						return ok;
					}),
					// The page always ends in a prompt slot. Amending the transaction
					// that broke the invariant beats dispatching a second one after it:
					// no intermediate state to render, one undo step, and the caret is
					// placed by the same transaction that moved it — which is the
					// "cursor jumps a line" family at its source.
					EditorState.transactionFilter.of((tr) => {
						if (!tr.docChanged || self.streaming) return tr;
						const authored =
							tr.annotation(hostEdit) || tr.isUserEvent("input") || tr.isUserEvent("delete");
						if (!authored) return tr;
						const repair = trailingPromptRepair(tr.newDoc.toString(), tr.newSelection.main.head);
						return repair ? [tr, { ...repair, sequential: true }] : tr;
					}),
					// Deleting a selection that spans blocks. Declared AFTER the repair
					// above on purpose: `filterTransaction` walks its filters backwards
					// (`for (i = filters.length - 1; i >= 0; i--)`), so the last one
					// declared runs first — and the page-ends-in-a-prompt-slot invariant
					// has to get its look at the document this produces, not the one it
					// replaced.
					//
					// Change filters all run BEFORE transaction filters, which is why this
					// cannot simply be a filter of its own: by the time a transaction
					// filter sees a change the marker rule rejected, the change is already
					// gone and there is no span left to read. Hence the pair — the rule
					// waves it through, this puts the right thing in its place.
					EditorState.transactionFilter.of((tr) => {
						if (self.streaming) return tr;
						const { md, parsed } = tr.startState.field(docField);
						const span = structuralSpan(tr, parsed.segments);
						if (!span) return tr;
						const step = deleteRange(md, parsed.segments, span.from, span.to, span.insert);
						// Refused. The change filter has already waved the raw change past
						// the marker rule, so handing the transaction back would apply it and
						// clip a marker — an empty spec is the nothing the rule used to give.
						if (!step) return {};
						return {
							changes: spliceOf(md, step.md),
							selection: { anchor: step.caret },
							scrollIntoView: true,
							// Kept, not replaced with one of our own: the repair above reads
							// it to know the edit was authored, the update listener reads it
							// for the typewriter scroll, and `history` groups by it. No
							// `ownEdit` either — this IS the writer's edit, and annotating it
							// as ours would tell `scheduleSave` to skip the draft timer.
							userEvent: tr.annotation(Transaction.userEvent) ?? "delete.selection",
						};
					}),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							self.#emitPromptEdit(update);
							self.#scheduleSave(update.transactions.every((tr) => tr.annotation(ownEdit)));
							self.#scheduleCellSync();
							self.#scheduleScrollProgress();
							// Not debounced, unlike the cell sync: a live view holds a producer
							// (a PTY, a subscription), and leaving one running after its marker
							// is gone leaks it. The check is a set walk over segments already
							// parsed by `docField`, so it costs nothing per keystroke.
							self.#liveViewHost.reap();
						}
						// The rail follows the caret's block (deduped, so this only
						// fires when the caret actually crosses a block boundary).
						if (update.selectionSet || update.docChanged) self.#emitCaretBlock(update.state);
						// Anything that changed the document and was not ours — typing, but also
						// paste and drag-drop, which carry no `input` user event. Above `msgAnchor`
						// that text exists only in the buffer: the transcript was built before it
						// was written, and `endRun` is where the host learns it has to rebuild.
						// Read from `startState` — `update.changes` is composed in ITS coordinates.
						// A machine splice never starts below `msgAnchor`, so a transaction of ours
						// batched into the same update cannot raise this by itself.
						if (self.streaming && update.docChanged && !update.transactions.every((tr) => tr.annotation(ownEdit))) {
							// No region means no turn, and then there is no "above the run" to be
							// above — the flag belongs to a turn (ADR 0017).
							const region = update.startState.field(streamRegionField);
							if (region)
								update.changes.iterChanges((fromA) => {
									if (fromA < region.msgAnchor) self.#headEdited = true;
								});
						}
						const userTyped = update.transactions.some((tr) => tr.isUserEvent("input") || tr.isUserEvent("delete"));
						if (!userTyped) return;
						if (self.streaming) self.#userTypedDuringTurn = true;
						self.classList.add("doc-focus");
						// Typewriter scroll: the writer's line stays centered while the
						// reply streams in above it — the caret is the static spot.
						// Only when the caret actually leaves the middle band: re-centering
						// per keystroke costs a second transaction (every StateField
						// recomputes over the whole document) plus a forced re-measure, and
						// CodeMirror already keeps the caret visible on its own.
						if (update.view.hasFocus && outsideTypewriterBand(update.view)) {
							requestAnimationFrame(() => {
								const view = self.view;
								if (!view) return;
								self.#preserveFocusScroll = true;
								clearTimeout(self.#preserveFocusScrollTimer);
								self.#preserveFocusScrollTimer = setTimeout(() => {
									self.#preserveFocusScroll = false;
								}, PRESERVE_FOCUS_SCROLL_MS);
								view.dispatch({
									effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }),
								});
							});
						}
					}),
				],
			}),
		});
		// A firm trackpad press is a macOS force click: WebKit answers it with Look
		// Up / data detectors and swallows the caret placement. Opting out of the
		// gesture makes a hard press a plain click again.
		this.view.dom.addEventListener("webkitmouseforcewillbegin", (event) => event.preventDefault());
		this.#installAttachmentInput();
		requestAnimationFrame(() => this.#emitScrollProgress());
		if (this.#initialDoc !== undefined) {
			const md = this.#initialDoc;
			this.#initialDoc = undefined;
			this.setDocument(md);
		}
	}

	/**
	 * Files from outside the browser: dropped on the document, or pasted.
	 *
	 * These do not collide with the cell drag handles above, which use pointer
	 * capture precisely BECAUSE native drag is unreliable out of a contenteditable
	 * — the two gestures never produce each other's events. What does need care is
	 * CodeMirror: `dropCursor` and the editor's own paste handler would both act on
	 * these, so each handler stops the event once it knows it has files.
	 *
	 * The host owns the upload (it knows the session); this only reports the files.
	 */
	#installAttachmentInput(): void {
		const hasFiles = (dt: DataTransfer | null | undefined) => Boolean(dt && Array.from(dt.types).includes("Files"));
		const offer = (files: FileList | null | undefined, pos?: number) => {
			const list = Array.from(files ?? []);
			if (!list.length) return false;
			this.dispatchEvent(new CustomEvent("doc-files", { detail: { files: list, pos }, bubbles: true, composed: true }));
			return true;
		};
		this.addEventListener("dragover", (event: DragEvent) => {
			if (!hasFiles(event.dataTransfer)) return; // a text drag is CodeMirror's
			event.preventDefault();
			event.dataTransfer!.dropEffect = "copy";
			this.classList.add("doc-drop");
		});
		const clear = () => this.classList.remove("doc-drop");
		this.addEventListener("dragleave", (event: DragEvent) => {
			// Bubbled from a child the pointer merely crossed — not a real leave.
			if (event.relatedTarget instanceof Node && this.contains(event.relatedTarget)) return;
			clear();
		});
		this.addEventListener("drop", (event: DragEvent) => {
			if (!hasFiles(event.dataTransfer)) return;
			event.preventDefault();
			event.stopPropagation(); // or `dropCursor` handles it as well
			clear();
			// Where the pointer actually was. A drop never moves the caret, so without
			// this the attachment is filed against wherever the caret last happened to
			// be — usually a different block than the one under the file.
			//
			// `false` asks for the NEAREST position rather than an exact hit: dropping in
			// the empty space below the last line is the ordinary way to say "at the
			// end", and the precise form answers null there, which fell back to the
			// caret and filed the image against whatever block that was in.
			offer(event.dataTransfer?.files, this.view?.posAtCoords({ x: event.clientX, y: event.clientY }, false));
		});
		this.addEventListener("paste", (event: ClipboardEvent) => {
			// Only when the clipboard actually carries a file. Pasting text — including
			// text copied out of an image editor — stays CodeMirror's business.
			if (!event.clipboardData?.files.length) return;
			event.preventDefault();
			offer(event.clipboardData.files);
		});
	}

	/**
	 * Stage an uploaded file on the prompt it belongs to.
	 *
	 * The segment goes in FRONT of the `<!-- you -->`, which is what keeps the
	 * document ending in an open prompt — every tail invariant in `run.ts` depends
	 * on that, and putting attachments after the text would break all of them at
	 * once. `promptFrom` is where the run of attachments already staged starts, so
	 * a second image lands beside the first rather than between the first and its
	 * prompt.
	 */
	insertAttachment(ref: FileRef, pos?: number): void {
		const view = this.view;
		const body = serializeFile(ref);
		if (!view || !body) return;
		const { parsed, blocks } = view.state.field(docField);
		const { segments } = parsed;
		// Where the file was actually put: the drop point when there was one,
		// otherwise the caret. A drop does not move the caret, so reading the caret
		// for a dropped file asks about somewhere the user was not looking.
		const target = pos ?? view.state.selection.main.head;
		// The prompt that position belongs to. Being INSIDE a prompt is the easy
		// case; the common one is being somewhere else in the block — reading the
		// reply, or over a cell — and an attachment dropped there belongs to that
		// block's prompt, not to whatever the page happens to end with. Falling
		// through to the tail is what made an image land in a different block from
		// the one it was dropped on.
		let index = promptAt(segments, target);
		if (index < 0) {
			const block = [...blocks].reverse().find((b) => segments[b.opensAt].from <= target);
			// The block's prompt, wherever it sits in it. Not `opensAt`: a block that
			// already holds an attachment is headed by THAT, and requiring a user
			// opener here sent every second image to the bottom of the page.
			const prompt = block?.members.find((m) => segments[m].kind === "user");
			if (prompt !== undefined) index = prompt;
			else if (block && segments[block.opensAt]?.kind === "file") {
				// Attachments with no prompt under them yet — add beside the last one.
				const last = [...block.members].reverse().find((m) => segments[m].kind === "file");
				if (last !== undefined) {
					const end = segments[last].to;
					view.dispatch({
						changes: { from: end, to: end, insert: `${body}\n\n` },
						annotations: [ownEdit.of(true), hostEdit.of(true)],
					});
					return;
				}
			}
		}
		if (index < 0) index = tailPrompt(segments);
		// Immediately in front of the prompt's own marker, so a second attachment
		// lands after the first rather than in front of it — and so a fold marker
		// stays where it is, folding the whole unit rather than being pushed below
		// the image it belongs to.
		const at = index < 0 ? view.state.doc.length : segments[index].from;
		view.dispatch({
			changes: { from: at, to: at, insert: `${body}\n\n` },
			annotations: [ownEdit.of(true), hostEdit.of(true)],
		});
	}

	/** Every debounce this component arms, in one place: a timer added to the
	 *  fields above and not to this list is one that outlives the element. */
	#clearTimers() {
		clearTimeout(this.#saveTimer);
		clearTimeout(this.#draftTimer);
		clearTimeout(this.#cellSyncTimer);
		clearTimeout(this.#failureSweepTimer);
		clearTimeout(this.#statePersistTimer);
		clearTimeout(this.#preserveFocusScrollTimer);
	}

	/** The text a send at `pos` means: the caret's own prompt, or the trailing one
	 *  when the caret is not in a prompt at all.
	 *
	 *  `pendingUserText` alone answers only for the tail, so a send from a prompt
	 *  in the middle of the page carried the EMPTY tail's text and the host
	 *  dropped it as a blank prompt — ADR 0005's positional prompt, unreachable.
	 *  Views do not resolve document positions; `run.ts` does
	 *  (docs/CODING_GUIDELINES.md). */
	#sendText(pos: number): string {
		const { md, parsed } = this.view!.state.field(docField);
		const caret = promptAt(parsed.segments, pos);
		if (caret >= 0 && caret !== tailPrompt(parsed.segments)) return parsed.segments[caret].text;
		return pendingUserText(md) ?? "";
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		window.removeEventListener("pi-cell-writeback", this.#onCellWriteback);
		// Order matters: mark disposed BEFORE tearing anything down, so work that
		// is already in flight — an awaited cell sync, a persist — sees the flag
		// rather than a half-dismantled component.
		this.#disposed = true;
		this.#clearTimers();
		this.#resetCells();
		// CodeMirror holds window listeners and a measure loop of its own, and
		// `remove()` does not reach them. `view` is deliberately left set: the
		// widgets and the park hand elements back during teardown.
		this.view?.destroy();
	}

	/** Cells request write-back by dispatching
	 *  `new CustomEvent("pi-cell-writeback", { detail: { id, source } })` on
	 *  window — they run in page context and hold no reference to the editor. */
	readonly #onCellWriteback = (event: Event) => {
		const detail = (event as CustomEvent<{ id?: unknown; source?: unknown }>).detail;
		if (typeof detail?.id === "string" && typeof detail.source === "string") {
			this.setCellSource(detail.id, detail.source);
		}
	};

	/** Write-back (cell → document): replaces cell #id's fence source in the
	 *  document text. This is how widget state (a checked box, a slider value)
	 *  persists — outputs are never stored, only source is. Targets the *last*
	 *  fence with that id (redefinition wins, matching the engine). No-op for
	 *  unknown ids and unchanged source — the latter breaks the re-run loop. */
	setCellSource(id: string, source: string): boolean {
		const view = this.view;
		if (!view) return false;
		const { md, parsed } = view.state.field(docField);
		const cell = cellsFrom(md, parsed.segments)
			.filter((c) => c.id === id)
			.at(-1);
		if (!cell) return false;
		// `cellWrite` decides content-only or whole-fence, and returns null when
		// the text already agrees — which is what terminates a write-back's re-run.
		const change = cellWrite(cell, source);
		if (!change) return false;
		view.dispatch({ changes: change, annotations: [ownEdit.of(true)] });
		return true;
	}

	protected override updated(changed: Map<string, unknown>) {
		if (changed.has("resolveAsset") && this.view) {
			const resolve = this.resolveAsset;
			this.view.dispatch({ effects: this.#assets.reconfigure(resolve ? assetResolver.of(resolve) : []) });
		}
		// The saved widget values arrived after the first sync: run another, so the
		// store is seeded before the cells that read it settle.
		if (changed.has("cellState") && this.cellState !== undefined && !this.#stateRestored) this.#scheduleCellSync();
		if (changed.has("streaming") && this.view) {
			this.classList.toggle("doc-streaming", this.streaming);
			for (const frame of this.#artifactEls.values()) frame.busy = this.streaming;
			if (!this.streaming) {
				// Taking focus is for the writer who was waiting on the turn. A cell's
				// source pane is its own CodeMirror, and now that the page stays
				// writable through a run they may well be typing in one when the reply
				// lands — `focus()` would re-plant the DOM selection out of it.
				if (![...this.cellEditors.values()].some((editor) => editor.hasFocus)) this.view.focus();
				this.#scheduleStatePersist(); // capture interactions deferred by the turn
			}
		}
	}

	#scheduleSave(ownEditOnly = false) {
		// A removed element's buffer is not a document anyone is editing, and on a
		// session switch it is the OUTGOING one — persisting it writes it over the
		// incoming session's slot.
		if (this.#disposed) return;
		// Local-draft event: parents persist to localStorage ahead of the debounced
		// server save, so a reload or a failed save does not lose text. Machine
		// splices skip it entirely — the debounced save covers that content.
		if (!ownEditOnly) {
			clearTimeout(this.#draftTimer);
			this.#draftTimer = setTimeout(() => {
				this.dispatchEvent(new CustomEvent("doc-draft", { detail: { value: this.getDocument() }, bubbles: true }));
			}, DRAFT_DEBOUNCE_MS);
		}
		// Every change re-arms the debounce, the machine's included — a save
		// fired on a stale timer mid-answer would be the only one until the turn
		// ends. What bounds it is the deadline: the delay never runs past the
		// moment the first deferred change has waited `SAVE_MAX_DEFER_MS`.
		const now = Date.now();
		this.#saveDeferredSince ??= now;
		const delay = Math.min(SAVE_DEBOUNCE_MS, this.#saveDeferredSince + SAVE_MAX_DEFER_MS - now);
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => {
			this.#saveDeferredSince = undefined;
			this.dispatchEvent(new CustomEvent("doc-change", { detail: { value: this.getDocument() }, bubbles: true }));
		}, Math.max(0, delay));
	}

	getDocument(): string {
		return this.view?.state.doc.toString() ?? "";
	}

	/**
	 * The writer changed text ABOVE the machine's region during this turn.
	 *
	 * The host records what the transcript has seen by slicing the document at
	 * `msgAnchor` (`detachStream`), which is sound only while nobody but the
	 * machine can write up there. It can now, and that text has never been sent —
	 * so the slice would claim it as history and the next send would skip the
	 * rebuild that carries it. Reset with the rest of a turn's flags.
	 */
	get isHeadEdited(): boolean {
		return this.#headEdited;
	}

	/**
	 * The parse the buffer is already holding — `docField`, computed once per
	 * transaction and shared by every decoration in here.
	 *
	 * Offered so a host does not parse the same text a second time. The rail did,
	 * on every streamed chunk: `getDocument()` materialised the whole document as
	 * a string and `indexFromDocument` scanned it again, next to the scan the
	 * editor had just finished for the same transaction.
	 *
	 * Null before the view exists. The returned value is the field's own object —
	 * read it, do not keep it: it is replaced on the next document change.
	 */
	parsed(): { md: string; parsed: ParsedDocument } | null {
		const view = this.view;
		if (!view) return null;
		const { md, parsed } = view.state.field(docField);
		return { md, parsed };
	}

	/** JSON-safe values of every named cell export — for hosts that include
	 *  interactive cell state (view() inputs, derived data) in the agent's
	 *  context at prompt time. */
	cellValues(): Promise<Record<string, unknown>> {
		return this.#engine?.values() ?? Promise.resolve({});
	}

	/**
	 * Applies a canvas edit the agent asked for (ADR 0033), or says why not.
	 *
	 * The running turn's own region is not the canvas it edits, so a quote only
	 * that holds is not found. Not marked as the machine's own edit, and kept in
	 * the undo history: the user's ⌘Z takes it back like any change to their
	 * text, and a rebuild reads it like any edit above the prompt (ADR 0002).
	 * An edit that empties a block removes it, marker included (ADR 0065).
	 */
	applyCanvasEdit(edit: CanvasEdit): { ok: true } | { ok: false; error: string } {
		const view = this.view;
		if (!view) return { ok: false, error: "the document is not open" };
		const region = this.liveRegion;
		const outside = region ? { from: region.turnAnchor, to: region.tailAnchor } : undefined;
		const plan = planCanvasEdit(view.state.doc.toString(), edit, outside);
		if (!plan.ok) return plan;
		const before = view.state.doc;
		view.dispatch({ changes: { from: plan.from, to: plan.to, insert: plan.insert }, userEvent: "piary.canvas-edit" });
		// The editor's own rules may drop a change, and `ok` is the agent's only
		// check that the edit happened.
		const landed = view.state.doc !== before || before.sliceString(plan.from, plan.to) === plan.insert;
		return landed ? { ok: true } : { ok: false, error: "the document did not take that change: nothing was changed" };
	}

	/**
	 * How cell `id` ran, once it has: compiled and settled, then quiet for one
	 * `FAILURE_SWEEP_DELAY` so a cascade of dependents cannot change the answer
	 * under it. `running` when that has not happened within `boundMs`.
	 *
	 * Judged on the cell's CURRENT definition: an element still holding older
	 * source, or an update still pending, is a verdict about code the agent has
	 * already replaced.
	 */
	async cellVerdict(id: string, boundMs: number): Promise<CellVerdict> {
		const deadline = Date.now() + boundMs;
		const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
		while (Date.now() < deadline) {
			const first = this.#judgeCell(id);
			if (!first) {
				await wait(VERDICT_POLL_MS);
				continue;
			}
			await wait(FAILURE_SWEEP_DELAY);
			const again = this.#judgeCell(id);
			if (!again || JSON.stringify(again) !== JSON.stringify(first)) continue;
			if (again.verdict !== "ok") return again;
			const empty = await this.#engine?.emptyChart(id);
			return empty ? { verdict: "empty", ...empty } : again;
		}
		return { verdict: "running" };
	}

	/** The cells that read what cell `id` declares, transitively: the ones
	 *  whose charts a verdict on `id` covers. */
	cellReaders(id: string): string[] {
		return this.#engine?.readers(id) ?? [];
	}

	/** The verdict on `id` as things stand, or null while it is not settled. */
	#judgeCell(id: string): CellVerdict | null {
		const view = this.view;
		const engine = this.#engine;
		if (!view || !engine) return null;
		const cells = view.state.field(docField).cells;
		const cell = cells.findLast((c) => c.id === id);
		const el = this.cellEls.get(id);
		if (!cell || !el || el.source !== cell.source || el.isUpdatePending) return null;
		const syntax = el.syntaxMessage;
		if (syntax) return { verdict: "failed", error: syntax };
		const state = engine.state(id);
		if (!state || state.status === "pending") return null;
		// A cell reading this one is still re-running: what it will show is
		// part of how this cell ran.
		if (state.status === "fulfilled") return engine.readers(id).some((reader) => engine.state(reader)?.status === "pending") ? null : { verdict: "ok" };
		// Spelled as `#rejection` spells it, so a failure the verdict told the
		// agent about has the key the sweep's report would have.
		const error = String(state.error);
		const name = UNDEFINED_NAME.exec(error)?.[1];
		// Waiting only while nothing declares the name: a declared name that is
		// still undefined is a cell upstream that failed, and that is this
		// cell's failure to report.
		if (name && ![...this.cellEls.keys()].some((other) => engine.outputs(other).includes(name))) return { verdict: "waiting", name };
		return { verdict: "failed", error };
	}

	/**
	 * A cell the machine authored this turn has failed — by rejecting at
	 * runtime, by never compiling at all, or by running clean and showing
	 * nothing. Mechanism, not policy: the host decides whether (and how loudly)
	 * to tell the agent.
	 *
	 * The `turnCells` gate lives here rather than at any call site so every
	 * failure door answers "is this the agent's cell or the writer's?" the same
	 * way. A cell the writer broke by hand is theirs to fix; nobody gets steered.
	 *
	 * `key` is what the host dedupes on. It exists because the message alone is
	 * not stable: an artifact-level report used to list the names its cells
	 * declared, so re-reporting the same artifact one identifier later read as a
	 * brand-new failure and spent another slot of a three-report budget.
	 */
	#reportCellFailure(id: string, error: string, opts: { key?: string; scope?: string } = {}): void {
		if (!this.turnCells.has(id)) return;
		const detail: CellFailure = { id, error, key: opts.key ?? `${id}|${error}`, scope: opts.scope };
		this.dispatchEvent(new CustomEvent<CellFailure>("cell-failure", { detail, bubbles: true, composed: true }));
	}

	/** Re-render the frame around a cell whose state just moved. */
	#refreshArtifactOf(id: string): void {
		const key = this.#cellArtifact.get(id);
		if (key) this.#artifactEls.get(key)?.requestUpdate();
	}

	/**
	 * Everything worth telling the agent about, judged once, when it can be
	 * judged: compile failures, runtime rejections, and an artifact that ran
	 * clean and shows nothing.
	 *
	 * All three used to be judged separately and two of them got it wrong, in the
	 * same way. A streaming turn splices a cell's source a chunk at a time and
	 * `serializeAssistant` fences each partial argument as if it were whole, so
	 * mid-stream the document holds a CLOSED fence around half a string literal
	 * and every sync compiles garbage. Half-written source that fails to PARSE
	 * was already gated here. Half-written source that happens to parse is worse:
	 * it compiles, runs, and throws on the identifier the stream cut in half —
	 * `normC is not defined`, when the cell says `normCdf`. The agent believes
	 * it, because its skill says to, and spends a turn fixing an error that never
	 * existed.
	 *
	 * A DEBOUNCE cannot separate those cases: a model pausing mid-cell looks
	 * exactly like a model that has finished. The region can. `msgAnchor` sits at
	 * the end of the last FINALIZED message, so a cell ending before it is
	 * written and done; anything past it is still being typed.
	 */
	#reportSettledFailures(cells: readonly DocCell[]): void {
		const settled = this.streaming ? this.region.msgAnchor : Number.POSITIVE_INFINITY;
		// Last definition wins, exactly as the engine resolves them. Walking every
		// SEGMENT instead let a redefinition vouch for itself: the superseded
		// fence sits far behind the write head and so looks settled, while
		// `cellEls` holds the one live element — the one being streamed right
		// now. The old position then waved through the new partial's error, and
		// the whole bogus-report storm came back through that door.
		const live = new Map<string, DocCell>();
		for (const cell of cells) live.set(cell.id, cell);
		const done = (id: string) => {
			const cell = live.get(id);
			return cell !== undefined && cell.at <= settled;
		};
		for (const cell of live.values()) {
			if (!done(cell.id)) continue;
			// Compile first: a cell that never compiled has no runtime state to
			// read, and the engine is still holding its previous definition.
			const message = this.cellEls.get(cell.id)?.syntaxMessage ?? this.#rejection(cell.id);
			if (message) this.#reportCellFailure(cell.id, message);
		}
		this.#reportBlankArtifacts(done);
	}

	/** A cell the runtime refused, or null. Read at sweep time rather than
	 *  reported from `onState`, so it answers the same "has the turn finished
	 *  writing this?" question every other failure does. */
	#rejection(id: string): string | null {
		const state = this.#engine?.state(id);
		return state?.status === "rejected" ? String(state.error) : null;
	}

	/**
	 * An artifact that ran clean and shows nothing.
	 *
	 * The commonest way a turn ends with an empty page: every cell is a
	 * declaration, so notebook-kit autodisplays none of them, and the agent —
	 * which cannot see the page — reports "renders a beautiful gradient card".
	 * The `cell` tool warns at write time, but it is guessing: a declaration is
	 * perfectly correct when a later cell displays it, and the tool cannot know
	 * whether one is coming. The document can, once everything has settled.
	 *
	 * Reported through the same door as a failure, because from the user's side
	 * that is what it is — but reported AS THE ARTIFACT. Naming one member for a
	 * whole artifact's condition is a lie the agent acts on: told
	 * `#TsLT2q failed`, it rewrote #TsLT2q, which was correct, instead of adding
	 * the display cell the artifact was missing.
	 */
	#reportBlankArtifacts(done: (id: string) => boolean): void {
		for (const [key, frame] of this.#artifactEls) {
			if (!frame.members.length) continue;
			// Every member settled: an artifact half-written is legitimately all
			// declarations until the cell that displays it arrives.
			if (!frame.members.every((m) => done(m.id))) continue;
			if (!frame.members.every((m) => m.cell.displaysNothing)) continue;
			this.#reportCellFailure(
				// A member id still gates the report — `turnCells` answers "whose cell
				// is this?" per cell, and an artifact has no answer of its own.
				frame.members[frame.members.length - 1].id,
				"ran, but displays nothing — every cell in it is a declaration. " +
					"Add a bare-expression cell that RETURNS the node to show, or call display().",
				{
					// Stable across re-sweeps and across which cells it holds. The
					// message used to list the names its members declared, so the same
					// artifact one identifier later read as a brand-new failure.
					key: `${key}|blank`,
					// …but ADDRESSED as the artifact, because that is what failed. Named
					// the way `artifactScope` names it in a prompt, so the agent reads
					// one vocabulary: the group when there is one, otherwise a pointer.
					// The raw key is a run offset for an ungrouped artifact — true, and
					// useless to say out loud.
					scope: key.startsWith("@") ? key : "the artifact above",
				},
			);
		}
	}

	/**
	 * Re-take the verdict once the graph stops moving.
	 *
	 * One cell settling moves every dependent, so a single edit produces a burst
	 * of state changes; sweeping per change would report the same failure a dozen
	 * times. This debounce is about the CASCADE, not about whether the turn has
	 * finished writing — that question has one answer, and it is `msgAnchor`.
	 */
	#scheduleFailureSweep(): void {
		clearTimeout(this.#failureSweepTimer);
		this.#failureSweepTimer = setTimeout(() => {
			if (!this.view) return;
			this.#reportSettledFailures(this.view.state.field(docField).cells);
		}, FAILURE_SWEEP_DELAY);
	}

	/** Debounced (like autosave): typing in a fence re-runs the cell after the
	 *  pause, not per keystroke — and mid-edit unclosed fences never sync. */
	#scheduleCellSync() {
		clearTimeout(this.#cellSyncTimer);
		this.#cellSyncTimer = setTimeout(() => void this.#syncCells(), CELL_SYNC_DEBOUNCE_MS);
	}

	/** Reconcile document ↔ engine: upsert every parsed cell (the element's
	 *  run() dedupes unchanged source), retract cells whose markers left the
	 *  document (branch switches included — dependents reject honestly). */
	async #syncCells() {
		const view = this.view;
		if (!view) return;
		const { cells, artifacts, parsed } = view.state.field(docField);
		if (!cells.length && !this.#engine) return; // cell-free document, engine never loaded
		const epoch = this.#cellEpoch;
		if (!this.#engine) {
			// `.js`, not `.ts`: `rewriteRelativeImportExtensions` rewrites static
			// import specifiers but leaves dynamic ones alone, so a `.ts` here ships
			// into dist verbatim and every consumer that is not esbuild (the test
			// harness under Node, and anyone importing the package) fails to
			// resolve it. Node-style resolution maps `.js` onto the source file.
			const { NotebookEngine } = await import("../notebook/engine.js");
			if (epoch !== this.#cellEpoch || !this.view) return; // document switched under the load
			this.#engine = new NotebookEngine({
				fileBase: this.fileBase,
				// Every state change a cell goes through, and what this does about it.
				onState: (id, state) => {
					this.#refreshArtifactOf(id);
					// A settled value may be new widget state (a click re-runs the
					// cell) — capture it into the document (debounced, deduped).
					if (state.status === "fulfilled") this.#scheduleStatePersist();
					// Neither door reports from here. A rejection arriving mid-stream
					// says nothing about whether the turn has finished writing the cell
					// that threw — and half-written source that happens to parse throws
					// on the identifier the stream cut in half. The sweep knows; this
					// only tells it to look again, once the cascade of dependents has
					// finished moving.
					if (state.status !== "pending") this.#scheduleFailureSweep();
				},
			});
		}
		const engine = this.#engine;
		// Saved state reaches the store before any cell defines, so `state(key,
		// initial)` starts from what the session holds and a reload never paints
		// the default first. `view()` inputs cannot work this way — their widgets
		// do not exist until the cell has run — so those are restored after the
		// sync, below. It comes in as a property: the host reads it from the
		// transcript, which is the only store that survives a rebuild.
		// `undefined` is "not fetched yet", distinct from `null` ("none saved").
		// Restoring from a value that has not arrived would seed nothing and then
		// latch `stateRestored`, losing the state for good — so wait, and let the
		// property arriving schedule another sync.
		if (!this.#stateRestored && this.cellState !== undefined) {
			this.#stateRestored = true;
			// Nothing in the session yet, but the document may still carry the block
			// from when it was the store. Reading it once is the migration: the next
			// save writes the session entry and cuts the block.
			const saved = this.cellState ?? this.#legacyStateBlock();
			this.#pendingViewState = saved == null ? null : cellStatePayload(saved);
			if (this.#pendingViewState) engine.seedStore(this.#pendingViewState.store);
		}
		const park = this.#park();
		const seen = new Set<string>();
		const registry: CellRegistry = { artifacts: new Map(), park };
		// `artifactsFrom` has already applied last-definition-wins: a member is a
		// cell's CURRENT definition, and the superseded fences above it are
		// history the frame counts but does not run.
		for (const artifact of artifacts) {
			const members: ArtifactMember[] = [];
			for (const cell of artifact.members) {
				seen.add(cell.id);
				let el = this.cellEls.get(cell.id);
				const changed = !el || el.source !== cell.source;
				// The machine's, only if it sits in the span THIS turn opened. The upper
				// bound alone answered it back when nothing but the machine could change
				// text up there. Now the writer can, and a cell they are half-way through
				// typing must not be reported to the agent as its own failure.
				if (changed && this.streaming && cell.at >= this.region.turnAnchor && cell.at <= this.region.tailAnchor)
					this.turnCells.add(cell.id);
				if (!el) {
					el = document.createElement("pi-cell") as PiCell;
					el.engine = engine;
					this.cellEls.set(cell.id, el);
				}
				el.cellId = cell.id;
				el.mode = cell.mode;
				el.source = cell.source;
				// A lone cell still owes the reader "where did it go?" when it
				// declares and renders nothing. Inside a multi-cell frame the
				// question answers itself, and a banner per declaration turned an
				// artifact into a wall of italic apologies.
				el.grouped = artifact.members.length > 1;
				// A source editor already open on this cell follows the document.
				// `setSource` decides what to adopt: it ignores the document merely
				// echoing what the editor itself last wrote, and takes everything
				// else — an undo, the agent redefining the cell, a branch switch.
				//
				// Except in edit mode, where the buffer wins. The agent may redefine
				// a cell while the user has unsaved text in the pane, and only one of
				// those two can be recovered afterwards: the document's version is
				// still in the document (Discard reloads it), the buffer exists
				// nowhere else. So the pane keeps what the user typed.
				const editor = this.cellEditors.get(cell.id);
				if (editor && !this.#editingArtifacts.has(artifact.key)) {
					editor.setSource(cell.source);
					editor.setMode(cell.mode);
				}
				this.#cellArtifact.set(cell.id, artifact.key);
				members.push({ id: cell.id, mode: cell.mode, cell: el, editor: editor ?? null });
			}
			let frame = this.#artifactEls.get(artifact.key);
			if (!frame) {
				frame = document.createElement("pi-artifact") as PiArtifact;
				frame.onWantCode = () => this.#openCode(artifact.key);
				frame.onShowSource = () => this.#toggleSource(artifact.key);
				frame.onEdit = () => this.#beginEdit(artifact.key);
				frame.onFix = () => this.#askAbout(artifact.key, true);
				frame.onChange = () => this.#askAbout(artifact.key, false);
				frame.onApply = () => this.#applyEdits(artifact.key);
				frame.onDiscard = () => this.#discardEdits(artifact.key);
				this.#artifactEls.set(artifact.key, frame);
			}
			frame.members = members;
			frame.editing = this.#editingArtifacts.has(artifact.key);
			frame.busy = this.streaming;
			frame.activity = this.#chipFor(members);
			frame.dirty = this.#dirtyOf(artifact.key, members);
			// The document's own vocabulary for a cell — `roleLabel` says
			// `cell @group` / `cell`, and a derived run says how many it gathered.
			frame.label = artifact.key.startsWith("@")
				? `cell @${artifact.key.slice(1)}`
				: members.length === 1
					? "cell"
					: `${members.length} cells`;
			frame.foldKey = artifactFoldKey(artifact.key);
			// Execution must not depend on the viewport: park unmounted frames so
			// their cells connect and run; ArtifactWidget adopts them when the
			// block becomes visible and returns them on destroy.
			if (!frame.isConnected) park.append(frame);
			registry.artifacts.set(artifact.key, frame);
		}
		// Elements whose cells left the document (an edit, a branch switch).
		//
		// Keyed off the SEGMENTS, not off `seen` — which holds only the cells that
		// parsed. A fence is unclosed for as long as it takes to type the second
		// delimiter, and `cellSource` returns null throughout; reading that as
		// "the cell left the document" retracted a running cell, dropped its
		// element and DESTROYED THE EDITOR IT WAS BEING TYPED IN, mid-keystroke.
		// What came back had no editor and rendered the pending placeholder for
		// good. A cell is gone when its marker is gone, and not before — which is
		// what `cellSource`'s own contract already promises.
		const present = new Set<string>();
		for (const seg of parsed.segments) if (seg.kind === "cell" && seg.id) present.add(seg.id);
		for (const [id, el] of this.cellEls) {
			if (!present.has(id)) {
				engine.removeCell(id);
				el.remove();
				this.cellEls.delete(id);
				this.#cellArtifact.delete(id);
				this.cellEditors.get(id)?.destroy();
				this.cellEditors.delete(id);
			}
		}
		for (const [key, frame] of this.#artifactEls) {
			if (!registry.artifacts.has(key)) {
				frame.remove();
				this.#artifactEls.delete(key);
			}
		}
		view.dispatch({ effects: setCellsEffect.of(registry) });
		// Runs after every splice, so a cell that failed to compile while it was
		// still being written gets its verdict re-taken once the turn moves on.
		//
		// The await is load-bearing. `el.source = …` is a Lit property write: it
		// SCHEDULES the update that re-compiles the cell. Sweeping synchronously
		// read each element's error from the *previous* partial — the truncated
		// one — while the position said "settled", which is how the storm of
		// bogus "Unterminated string constant" reports survived every earlier
		// attempt to gate it.
		await Promise.all([...this.cellEls.values()].map((el) => el.updateComplete));
		if (epoch !== this.#cellEpoch || !this.view) return; // document switched under the wait
		this.#reportSettledFailures(cells);
		// The other half of the round trip (the document is the store, ground
		// rule 1): push the saved values back into the view() inputs, as if the
		// user had clicked them. Runs once, after the cells that own those
		// widgets have been defined.
		const pending = this.#pendingViewState;
		if (pending) {
			this.#pendingViewState = null;
			if (Object.keys(pending.views).length) void engine.restore(pending.views);
		}
	}

	/** The code pane was opened for the first time: build the editors it needs.
	 *  Deferred because an artifact nobody reads the source of should not carry
	 *  one CodeMirror per cell — and because the JS parser loads with them. */
	#openCode(key: string): void {
		const view = this.view;
		const frame = this.#artifactEls.get(key);
		if (!view || !frame) return;
		const artifact = view.state.field(docField).artifacts.find((a) => a.key === key);
		if (!artifact) return;
		let built = false;
		frame.members = artifact.members.map((cell) => {
			const existing = this.cellEditors.get(cell.id);
			if (existing) return { id: cell.id, mode: cell.mode, cell: this.cellEls.get(cell.id)!, editor: existing };
			built = true;
			const editor = new CellEditor({
				source: cell.source,
				mode: cell.mode,
				// Inner → outer: the fence is the store. `setCellSource` re-parses
				// and splices over this cell's current source range, so the write
				// lands correctly even if the document moved under the editor.
				onChange: (source: string) => this.#onCellEdited(key, cell.id, source),
				// One history, and it is the document's — see CellEditor's header.
				onUndo: () => void undo(view),
				onRedo: () => void redo(view),
				onResize: () => view.requestMeasure(),
			});
			// Built into an artifact already being edited — a cell the agent added
			// while the user had the pane open. It joins the mode it landed in.
			if (this.#editingArtifacts.has(key)) editor.setEditing(true);
			this.cellEditors.set(cell.id, editor);
			return { id: cell.id, mode: cell.mode, cell: this.cellEls.get(cell.id)!, editor };
		});
		if (built) view.requestMeasure();
	}

	/**
	 * A pane's keystroke.
	 *
	 * Idle, it writes straight through: the fence is the store, and a widget
	 * persisting its own state (`pi-cell-writeback`) takes the same door.
	 *
	 * In edit mode it goes nowhere — the text is already in the editor, which IS
	 * the buffer, so there is no second copy to keep in step. All this does is
	 * re-read which members have drifted from the document, so the frame can mark
	 * them and Apply knows what to write.
	 */
	#onCellEdited(key: string, id: string, source: string): void {
		if (!this.#editingArtifacts.has(key)) {
			void this.setCellSource(id, source);
			return;
		}
		const frame = this.#artifactEls.get(key);
		if (frame) frame.dirty = this.#dirtyOf(key, frame.members);
	}

	/** Members whose buffer has drifted from the document. Empty unless the
	 *  artifact is being edited — idle, the two are the same text by definition. */
	#dirtyOf(key: string, members: readonly ArtifactMember[]): ReadonlySet<string> {
		if (!this.#editingArtifacts.has(key)) return NO_DIRTY;
		const dirty = new Set<string>();
		for (const m of members) if (m.editor?.isDirty()) dirty.add(m.id);
		return dirty;
	}

	/** Enter edit mode: the panes become writable and their keystrokes stop
	 *  reaching the document. Nothing else changes — the artifact keeps running
	 *  the source it was already running, which is the whole point. */
	/** The host's word on what the run is doing to one cell, shown at the top
	 *  of the artifact holding it; null takes the chip away. */
	showCellActivity(chip: CellChip | null): void {
		const was = this.#cellChip;
		const same = chip && was && chip.id === was.id && chip.text === was.text && chip.tone === was.tone && chip.pulse === was.pulse;
		if (same || (!chip && !this.#cellChip)) return;
		this.#cellChip = chip;
		for (const frame of this.#artifactEls.values()) {
			const activity = this.#chipFor(frame.members);
			// A lock taking an artifact drops the focus it held to nothing, and
			// Escape, which stops the run, is the document's key: hand it over,
			// from a source pane being typed in too.
			const held = this.streaming && activity?.tone === "working" && frame.contains(document.activeElement);
			frame.activity = activity;
			if (held) this.view?.focus();
		}
	}

	#cellChip: CellChip | null = null;

	/** The element that has the focus, when it is inside an artifact's frame. */
	#focusInArtifact(): HTMLElement | null {
		const active = document.activeElement;
		return active instanceof HTMLElement && active.closest("pi-artifact") && this.contains(active) ? active : null;
	}

	/** Gives `held` back the focus a redraw took from it and left with nobody.
	 *  The document takes it when `held` no longer can: its frame is off the
	 *  page, or locked. */
	#returnFocus(held: HTMLElement): void {
		const lost = () => document.activeElement === null || document.activeElement === document.body;
		if (!lost()) return;
		if (this.view?.dom.contains(held) && !held.closest("[inert]")) held.focus({ preventScroll: true });
		if (lost()) this.view?.focus();
	}

	#chipFor(members: readonly ArtifactMember[]): CellChip | null {
		const chip = this.#cellChip;
		return chip && members.some((m) => m.id === chip.id) ? chip : null;
	}

	/**
	 * Asks pi about artifact `key` from its own header, through the document:
	 * a reply slot opens under it, as every follow-up does, so what is asked is
	 * a prompt on the page and nothing is said to pi unseen (ADR 0005).
	 *
	 * `fix` writes the failing cell and its error into the slot and sends it —
	 * the cell verdicts take the run from there (`notebook-cells.md` §Policy).
	 * Otherwise the slot holds the artifact's scope line, and the caret waits in
	 * it for the writer to say what to change.
	 */
	#askAbout(key: string, fix: boolean): void {
		if (this.streaming) return;
		let asked = false;
		this.edit((md, parsed) => {
			const artifact = this.view?.state.field(docField).artifacts.find((a) => a.key === key);
			const last = artifact?.members[artifact.members.length - 1];
			if (!artifact || !last) return null;
			let body = artifactScope(artifact);
			if (fix) {
				const failing = artifact.members
					.map((cell) => ({ id: cell.id, error: this.cellEls.get(cell.id)?.syntaxMessage ?? this.#rejection(cell.id) }))
					.find((cell) => cell.error);
				if (!failing) return null;
				body = `Fix cell #${failing.id} — ${failing.error}`;
			}
			asked = true;
			return replySlot(md, parsed.segments, last.seg.to, body);
		});
		if (!asked) return;
		this.view?.focus();
		if (fix) this.send();
	}

	#beginEdit(key: string): void {
		if (this.#editingArtifacts.has(key)) return;
		const frame = this.#artifactEls.get(key);
		if (!frame) return;
		this.#editingArtifacts.add(key);
		for (const m of frame.members) this.cellEditors.get(m.id)?.setEditing(true);
		frame.editing = true;
		frame.dirty = this.#dirtyOf(key, frame.members);
		frame.members[0]?.editor?.focus();
	}

	/**
	 * Apply: every changed member's fence, in ONE transaction.
	 *
	 * One, not one per cell, for three reasons that are really the same reason —
	 * an artifact is one graph. One undo step, so taking the edit back takes all
	 * of it back. One `docChanged`, so one debounced sync and one recompile. And
	 * no intermediate document in which half the members have moved to the new
	 * source and half have not, which is a state the user never wrote and the
	 * engine has no business evaluating.
	 *
	 * Every change is measured against the same document text: CodeMirror rebases
	 * them into a single ChangeSet itself, so nothing here has to walk the list
	 * backwards to keep later offsets valid.
	 */
	#applyEdits(key: string): void {
		const view = this.view;
		const frame = this.#artifactEls.get(key);
		if (!view || !frame) return;
		const { md, parsed } = view.state.field(docField);
		const cells = cellsFrom(md, parsed.segments);
		const changes: DocChange[] = [];
		for (const m of frame.members) {
			const editor = this.cellEditors.get(m.id);
			if (!editor) continue;
			// Last definition wins, the same rule `setCellSource` and the engine
			// both follow — a redefinition landing in a later turn is the live one.
			const cell = cells.filter((c) => c.id === m.id).at(-1);
			if (!cell) continue; // the cell left the document while the pane was open
			const change = cellWrite(cell, editor.text());
			if (change) changes.push(change);
			editor.commit();
		}
		if (changes.length) view.dispatch({ changes, annotations: [ownEdit.of(true)] });
		this.#endEdit(key);
	}

	/** Discard: the buffer goes, the document was never touched, and each pane
	 *  goes back to the text the document holds. */
	#discardEdits(key: string): void {
		const view = this.view;
		const frame = this.#artifactEls.get(key);
		if (view && frame) {
			const { md, parsed } = view.state.field(docField);
			const cells = cellsFrom(md, parsed.segments);
			for (const m of frame.members) {
				const cell = cells.filter((c) => c.id === m.id).at(-1);
				if (cell) this.cellEditors.get(m.id)?.reset(cell.source);
			}
		}
		this.#endEdit(key);
	}

	/** Leave the mode, whichever door was taken. Dropping the editors' local
	 *  history is part of it: what it recorded is either in the document now, as
	 *  one step, or deliberately gone. */
	#endEdit(key: string): void {
		this.#editingArtifacts.delete(key);
		const frame = this.#artifactEls.get(key);
		if (!frame) return;
		for (const m of frame.members) this.cellEditors.get(m.id)?.setEditing(false);
		frame.editing = false;
		frame.dirty = NO_DIRTY;
	}

	/** The source toggle: show this artifact's cells as the plain fences they are in the file,
	 *  and back. The same escape a view has, keyed by artifact instead. */
	#toggleSource(key: string): void {
		this.view?.dispatch({ effects: toggleSourceEffect.of(key) });
	}

	/** What ⌘⏎ does in prose: the caret's prompt is sent, its answer opening a
	 *  new block. The menu's Send reaches the same send without the chord. */
	send(): void {
		if (!this.view) return;
		const at = this.view.state.selection.main.head;
		const text = this.#sendText(at);
		this.dispatchEvent(new CustomEvent("doc-send", { detail: { text, followUp: false, newBlock: true, at }, bubbles: true }));
	}

	/** The `⋯` on the head whose marker is at `from` — a block's, or a step's
	 *  such as a reply — while its line is drawn; `null` when it is not. */
	blockMenuAnchor(from: number): HTMLElement | null {
		return this.view?.contentDOM.querySelector<HTMLElement>(`.doc-role-menu[data-at="${from}"]`) ?? null;
	}

	/**
	 * Writes `text` at the end of the trailing prompt, on a line of its own,
	 * and leaves the caret after it: how a command chosen outside the document
	 * arrives where the writer would have typed it. False when there is no
	 * trailing prompt.
	 */
	writeAtPrompt(text: string): boolean {
		const view = this.view;
		if (!view) return false;
		const last = view.state.field(docField).parsed.segments.at(-1);
		if (last?.kind !== "user") return false;
		const end = view.state.doc.length;
		const line = view.state.doc.lineAt(end);
		const insert = line.from >= last.bodyFrom && line.text.trim() === "" ? text : `\n${text}`;
		view.dispatch({
			changes: { from: end, insert },
			selection: { anchor: end + insert.length },
			scrollIntoView: true,
			userEvent: "input.type",
		});
		view.focus();
		return true;
	}

	/** Whether any of the document's `from`–`to` is drawn inside the window right now: scrolled
	 *  into view, not merely rendered. `false` before there is an editor. */
	shows(from: number, to: number): boolean {
		const view = this.view;
		if (!view) return false;
		const box = view.scrollDOM.getBoundingClientRect();
		const length = view.state.doc.length;
		const top = view.documentTop + view.lineBlockAt(Math.min(from, length)).top;
		const bottom = view.documentTop + view.lineBlockAt(Math.min(to, length)).bottom;
		return bottom > box.top && top < box.bottom;
	}

	/** The source toggle for whatever holds the caret: a view, or an artifact's cells. Answers
	 *  whether there was one to toggle. */
	toggleSourceAtCaret(): boolean {
		if (!this.view) return false;
		const head = this.view.state.selection.main.head;
		const { parsed, artifacts } = this.view.state.field(docField);
		const holds = (seg: DocSegment) => seg.from <= head && head <= seg.to;
		// Not a live view: its fence is empty, so it has no source to flip to.
		const view = parsed.segments.find((seg) => seg.kind === "view" && seg.id && !getLiveView(seg.name ?? "") && holds(seg));
		const key = view?.id ?? artifacts.find((artifact) => artifact.members.some((member) => holds(member.seg)))?.key;
		if (!key) return false;
		this.view.dispatch({ effects: toggleSourceEffect.of(key) });
		return true;
	}

	#scheduleStatePersist() {
		clearTimeout(this.#statePersistTimer);
		this.#statePersistTimer = setTimeout(() => void this.#persistViewState(), STATE_PERSIST_DEBOUNCE_MS);
	}

	/**
	 * Widget state out — as an event, not as a block in the document.
	 *
	 * It used to be a `pi:view cell-state` block, which made the `.md` the only
	 * home for the one thing a rebuild could not restore. Rebuild a session and
	 * the code came back at its declared defaults: a Mandelbrot you had navigated
	 * 1270× into reset to the whole set. The host puts this in the transcript,
	 * where the extension set already lives, and the document goes back to being
	 * what the format says it is — a rendering, authoritative for nothing.
	 *
	 * A legacy block, if one is still in the text, is removed as we go: it is now
	 * stale the moment anything moves, and using it is the migration.
	 *
	 * Never runs mid-stream — state rides the `[cell values]` prefix during a
	 * turn, and the document must not change under a splice.
	 */
	async #persistViewState() {
		const view = this.view;
		const engine = this.#engine;
		if (!view || !engine || !this.#stateRestored || this.streaming) return;
		const names = new Set(engine.viewStateNames());
		const store = engine.storeValues();
		if (!names.size && !Object.keys(store).length) return;
		const all = await engine.values();
		// A turn started during the snapshot, or the element left under it.
		if (this.streaming || this.#disposed || !this.view) return;
		const views = Object.fromEntries(Object.entries(all).filter(([name]) => names.has(name)));
		// v2 splits state()-by-key from view()-by-export-name; the reader still
		// accepts a flat object as v1, so state written before the split restores.
		const payload = { v: 2, views, store };
		const json = JSON.stringify(payload);
		if (json === this.#lastStateJson) return; // unchanged — no write, no loop
		this.#lastStateJson = json;
		this.dispatchEvent(new CustomEvent("cell-state-save", { detail: { state: payload }, bubbles: true, composed: true }));
		this.#dropLegacyStateBlock();
	}

	/** The payload of a `pi:view cell-state` block left over from when the
	 *  document was the store, or null. Read once, on the way to replacing it. */
	#legacyStateBlock(): unknown {
		const view = this.view;
		if (!view) return null;
		const { md, parsed } = view.state.field(docField);
		const seg = parsed.segments.find((s) => s.kind === "view" && s.name === "cell-state");
		return (seg && viewPayload(md, seg)?.data) ?? null;
	}

	/** Cut a `pi:view cell-state` block left over from when the document was the
	 *  store. Silent, once, and only when one is actually there. */
	#dropLegacyStateBlock(): void {
		const view = this.view;
		if (!view) return;
		const { md, parsed } = view.state.field(docField);
		const seg = parsed.segments.find((s) => s.kind === "view" && s.name === "cell-state");
		if (!seg) return;
		const payload = viewPayload(md, seg);
		if (!payload) return; // broken fence — leave the honest text alone
		const to = Math.min(md.length, payload.to + (md.startsWith("\n\n", payload.to) ? 2 : 0));
		view.dispatch({
			changes: { from: seg.from, to, insert: "" },
			annotations: [ownEdit.of(true), Transaction.addToHistory.of(false)],
		});
	}

	/** New document, new dataflow graph — the old module is torn down whole. */
	#resetCells() {
		this.#cellEpoch++;
		this.#clearTimers();
		// The memo that suppresses a redundant save belongs to the document that
		// produced it. Two sessions carrying the same cell state serialize to the
		// same JSON, so keeping it across a load suppressed the incoming
		// document's first save and the host never learned it had state.
		this.#lastStateJson = "";
		this.#stateRestored = false;
		this.#pendingViewState = null;
		this.#engine?.dispose();
		this.#engine = undefined;
		this.cellEls.clear();
		this.#cellArtifact.clear();
		for (const editor of this.cellEditors.values()) editor.destroy();
		this.cellEditors.clear();
		this.#artifactEls.clear();
		// A buffer belongs to the document it was typed against. Nothing carries
		// it across a load or a session switch, and nothing should.
		this.#editingArtifacts.clear();
		// The park is REMOVED, not emptied. A widget still standing in the viewport
		// hands its element back to the park when the incoming text destroys it —
		// after the clear — so emptying it left one element of the old document
		// alive in the new one. Detaching the whole park means those hand-backs
		// land in a node nothing can reach, and `park()` builds a fresh one.
		this.#cellPark?.remove();
		this.#cellPark = undefined;
		this.view?.dispatch({ effects: setCellsEffect.of({ artifacts: new Map(), park: null }) });
	}

	/**
	 * Programmatic user-level edit (block-menu ops): undoable, caret at
	 * `from + caret`.
	 *
	 * The host describes the edit as a function of the document; the offsets are
	 * computed INSIDE the dispatch, against the text the change actually applies
	 * to. The offset-taking version this replaced let a caller work out where to
	 * write, have something splice above it, and then write at the old number —
	 * which is how a send once cut a prompt in half mid-word. Every CodeMirror
	 * command is written this way.
	 *
	 * `parsed` is the same shared parse the view's own decorations read, so the
	 * host and the renderer can never disagree about where a segment is.
	 */
	/**
	 * Fold this turn's redefinitions back into the fences they redefine — the
	 * document keeps one fence per cell (see `compactCells`).
	 *
	 * Dispatched as changes, so positions map and every live cell element keeps
	 * running: a compaction must not reset a slider the reader just moved. No
	 * focus and no scroll either — it happens *to* the page, not because anyone
	 * asked for it. Refuses while streaming, when the fences are half-written.
	 */
	compactRedefinitions(): boolean {
		const view = this.view;
		if (!view || this.streaming) return false;
		const { md, parsed } = view.state.field(docField);
		const changes = compactCells(md, parsed.segments);
		if (!changes) return false;
		view.dispatch({ changes, annotations: [ownEdit.of(true), Transaction.addToHistory.of(false)] });
		return true;
	}

	edit(resolve: (md: string, parsed: ParsedDocument) => DocEdit | null) {
		const view = this.view;
		if (!view) return;
		const { md, parsed } = view.state.field(docField);
		const spec = resolve(md, parsed);
		if (!spec) return;
		// `caret` is what separates the two kinds of edit here. A caller that sets
		// one moved the writer on purpose — it has to come into view. A caller that
		// does not (every structural splice: a cell dragged, deleted, duplicated,
		// retyped in another mode) changed the page AROUND the reader, and the
		// reader's place is not the caret's.
		//
		// It matters because in a chat document the caret lives at the END of the
		// file — every run parks it there — so `scrollIntoView` on a structural
		// edit means "jump to the bottom", and dropping a cell threw the page off
		// the thing you had just moved.
		//
		// Asking for nothing is what holds the page still: CodeMirror anchors the
		// viewport on a document position of its own across a change (`scrollAnchorPos`,
		// mapped through the transaction), so the text under the reader stays under
		// the reader as long as nobody overrides it. A saved `scrollTop` would be
		// wrong anyway — the splice moves text across the viewport, so the height
		// above it changes and the old number points somewhere else. A
		// `scrollSnapshot()` effect is wrong too: it is measured against the
		// document BEFORE the change, so it outlives the dispatch holding a stale
		// position and throws when the next transaction maps it (⌘Z, in the tests
		// that caught it).
		const caret = spec.caret;
		// `ownEdit` waves this past the streaming filter — right for a splice the
		// writer asked for, wrong for one that would land on top of the reply being
		// written. Mid-run the block menu could already delete the segment under the
		// write head; nothing checked. Resolving the spec to a change set and asking
		// `machineSpan` here covers every caller through this door at once — the
		// menu, a drag, a mode switch, `backspaceAtBlockHead` — and gives the same
		// answer the keystroke filter gives, including at the boundaries: a change
		// that merely touches an end of the span is outside it.
		const changes = ChangeSet.of(spec.changes, md.length);
		if (this.streaming) {
			const span = machineSpan(this.region);
			let hits = false;
			changes.iterChanges((fromA, toA) => {
				if (toA > span.from && fromA < span.to) hits = true;
			});
			if (hits) return;
		}
		view.dispatch({
			changes,
			...(caret === undefined ? {} : { selection: { anchor: caret }, scrollIntoView: true }),
			annotations: [ownEdit.of(true), hostEdit.of(true)],
		});
		// Focus is still taken — ⌘Z has to be able to take back a mis-drop, and
		// undo goes through the editor's keymap. But only when it is not already
		// there: `focus()` re-plants the DOM selection, and a DOM selection at the
		// end of the document is a second, independent way for the browser to
		// scroll to the bottom.
		if (caret !== undefined || !view.hasFocus) view.focus();
	}

	/**
	 * A whole-document edit somebody made on purpose: a block dragged, a cell
	 * deleted, duplicated, or retyped in another mode.
	 *
	 * `setDocument` is the LOAD path and was being used for these, which cost
	 * two things every time. It calls `resetCells`, so moving one block disposed
	 * the engine and restarted every artifact on the page — a slider the reader
	 * had just set went back to its default because a block above it moved. And
	 * it annotates itself out of history, so ⌘Z could not take back a mis-drop
	 * or an accidental delete; the gesture was one-way.
	 *
	 * The text arrives whole because the helpers that produce it (`moveBlockText`,
	 * `deleteCell`, `duplicateCell`, …) are pure string functions, so the splice
	 * is recovered here rather than asked of them: trim the common prefix and
	 * suffix, dispatch what actually differs. Everything outside that range keeps
	 * its offsets, which is what lets the cell registry match the same ids to the
	 * same live elements. The caret is left to CodeMirror's own mapping — it knows
	 * where the text under it went — and setting no `caret` is also what tells
	 * `edit` to hold the viewport still: the reader is looking at the block they
	 * just moved, not at the tail the caret is parked on.
	 */
	replaceDocument(md: string): void {
		this.edit((cur) => (cur === md ? null : { changes: spliceOf(cur, md) }));
	}

	/**
	 * Backspace at the head of an empty block: take the block out.
	 *
	 * The gesture the change filter above left no room for. It vets marker lines
	 * as structure — correctly, for every source there is — so backspacing an
	 * empty block walked the caret up under its head label and stopped dead: the
	 * keystroke that would clip the marker is dropped, and nothing on the
	 * keyboard could take the block back out. `emptyBlockBackspace` decides what
	 * the gesture means; this is the wiring, and it declines loudly (`false`,
	 * letting `deleteCharBackward` run) for everything else.
	 *
	 * It goes through `edit`, so the transaction carries `ownEdit`/`hostEdit`:
	 * the filter passes it, `trailingPromptRepair` still guarantees the page ends
	 * in a prompt slot, and ⌘Z takes the block back in one step.
	 */
	/** Harness seam (ADR 0008): the suite presses Backspace at a block head directly. */
	backspaceAtBlockHead(): boolean {
		const view = this.view;
		// Not idle-only any more. It used to decline the whole gesture mid-run
		// because `ownEdit` waves our transaction past the streaming filter and
		// nothing else stood between it and the machine's region. `edit` now checks
		// the change against that region itself, so a block far above the reply
		// takes the gesture and one under the write head still refuses — which is
		// the distinction the blanket refusal could not draw.
		if (!view) return false;
		const sel = view.state.selection.main;
		if (!sel.empty) return false; // a selection is `defaultKeymap`'s business
		const { md, parsed, blocks } = view.state.field(docField);
		const step = emptyBlockBackspace(md, parsed.segments, blocks, sel.head);
		if (!step) return false;
		// The page's trailing slot: nothing to delete — it is where you type next
		// — but the caret leaves the dead end rather than the press doing nothing.
		if (step.md === null) {
			if (step.caret === sel.head) return false;
			view.dispatch({ selection: { anchor: step.caret }, scrollIntoView: true });
			return true;
		}
		const next = step.md;
		this.edit((cur) => (cur === next ? null : { changes: spliceOf(cur, next), caret: step.caret }));
		return true;
	}

	/** Tell the host which blocks are collapsed, so it can persist them. Offsets
	 *  are the boundary: the host stores numbers, the field stores keys. */
	#emitBlockFolds() {
		const view = this.view;
		if (!view) return;
		this.dispatchEvent(
			new CustomEvent("block-folds", {
				detail: { folds: folds.blockFolds(view) },
				bubbles: true,
				composed: true,
			}),
		);
	}

	/** Collapse/expand a whole block by its head-marker offset. Emits
	 *  `block-folds` so the host can persist the presentation state. */
	toggleBlockFold(from: number) {
		const view = this.view;
		if (!view) return;
		folds.toggleBlockFold(view, from);
		this.#emitBlockFolds();
	}

	/** The collapsed blocks' head offsets as the editor holds them now: mapped
	 *  through every edit since they were folded, which a list stored at the
	 *  last toggle is not. Empty before the editor exists. */
	blockFolds(): number[] {
		const view = this.view;
		return view ? folds.blockFolds(view) : [];
	}

	/** Restore collapsed blocks (host-persisted). */
	setBlockFolds(collapsed: number[]) {
		const view = this.view;
		if (!view) return;
		folds.setBlockFolds(view, collapsed);
	}

	/** Drop the fold state of the segment at `from`, which is about to leave the
	 *  document. Called BEFORE the delete, while the segment is still there to
	 *  name. */
	purgeSegmentFolds(from: number) {
		const view = this.view;
		if (!view) return;
		folds.purgeSegmentFolds(view, from);
	}

	setAsk(el: HTMLElement | null) {
		const view = this.view;
		if (!view) return;
		const current = view.state.field(askField);
		if ((current?.el ?? null) === el) return;
		const effects: StateEffect<unknown>[] = [setAskEffect.of(el ? { el, park: this.#park() } : null)];
		// The panel no longer pins itself to the viewport, so it must come to the
		// reader.
		if (el) {
			const { md, parsed } = view.state.field(docField);
			const at = Math.min(askAnchor(md, parsed.segments), view.state.doc.length);
			effects.push(EditorView.scrollIntoView(at, { y: "center" }));
		}
		view.dispatch({ effects });
	}

	/** Scroll so the given document offset sits near the top (index navigation). */
	scrollToOffset(pos: number) {
		this.view?.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 48 }) });
	}

	/** Wheel-scroll the document — fixed overlays (chat-index) forward here. */
	scrollDocBy(dy: number) {
		this.view?.scrollDOM.scrollBy({ top: dy });
	}

	setBlockBadges(badges: BlockBadge[]) {
		const view = this.view;
		if (!view) return; // pre-view — the host re-sends on its next refresh
		if (JSON.stringify(view.state.field(badgesField)) === JSON.stringify(badges)) return;
		view.dispatch({ effects: setBadgesEffect.of(badges) });
	}

	/**
	 * Hand the machine's region to a host that is about to stop showing this
	 * document — you switched sessions while a turn was running.
	 *
	 * Three strings, no offsets. That is the whole point: a host that remembers
	 * *positions* is remembering something only the editor can keep true, and the
	 * moment anything else edits above them it is writing into the wrong place.
	 * A host that remembers *text* cannot be wrong, because nobody else is
	 * editing a document that is no longer on screen.
	 */
	detachStream(): { head: string; current: string; tail: string } {
		const view = this.view;
		if (!view) return { head: "", current: "", tail: "" };
		const { msgAnchor, tailAnchor } = this.region;
		const md = view.state.doc.toString();
		return { head: md.slice(0, msgAnchor), current: md.slice(msgAnchor, tailAnchor), tail: md.slice(tailAnchor) };
	}

	/**
	 * …and take it back when you return to it.
	 *
	 * The cells go first. This is a DIFFERENT document arriving — a session you
	 * switched to, or a run adopted after a reload — and the elements standing in
	 * the registry belong to the one that was here before. `setDocument` resets
	 * them for exactly this reason; splicing without the reset left the previous
	 * session's artifacts parked and alive, so the page grew a second widget that
	 * answered to nothing.
	 */
	attachStream(parts: { head: string; current: string; tail: string }) {
		this.#resetCells();
		this.#spliceWhole(parts.head + parts.current + parts.tail);
		// The turn opened in a document this one is only a copy of, so its start is
		// not recoverable — claim the live region and nothing above it. A background
		// session's cells were never attributed to a turn on this side anyway.
		this.#setRegion(parts.head.length, parts.head.length + parts.current.length, parts.head.length);
	}

	/**
	 * Replace the document, keeping everything the two texts already agree on.
	 *
	 * `setDocument` would be simpler and is wrong here: it tears down every live
	 * cell and resets its interactive state — a checked box, a slider, a
	 * Mandelbrot you had navigated into. Splicing from the first difference
	 * leaves the cells above it untouched, and CodeMirror maps the rest.
	 *
	 * `keepCaret` leaves the selection to CodeMirror's own mapping instead of
	 * throwing it at the end of the page — what a turn opening in the MIDDLE of
	 * the document needs, where the end of the page is nowhere the writer was.
	 */
	#spliceWhole(md: string, keepCaret = false) {
		const view = this.view;
		if (!view) return this.setDocument(md); // pre-view — nothing to preserve
		this.classList.remove("doc-focus");
		this.#userTypedDuringTurn = false;
		this.#headEdited = false;
		this.#midPageTurn = false;
		const cur = view.state.doc.toString();
		let i = 0;
		const n = Math.min(cur.length, md.length);
		while (i < n && cur.charCodeAt(i) === md.charCodeAt(i)) i++;
		// …and in from the ends, so the change is the region that actually moved
		// and not the whole tail of the document. The text produced is identical
		// either way; what a minimal change buys is exact mapping — a position
		// outside it comes through untouched, which is what lets the caret stay
		// where the writer left it while a mid-page turn opens above it.
		let a = cur.length;
		let b = md.length;
		while (a > i && b > i && cur.charCodeAt(a - 1) === md.charCodeAt(b - 1)) {
			a--;
			b--;
		}
		view.dispatch({
			changes: { from: i, to: a, insert: md.slice(i, b) },
			// No selection of our own: the transaction maps the one that is there.
			...(keepCaret ? {} : { selection: { anchor: md.length }, scrollIntoView: true }),
			annotations: [ownEdit.of(true), Transaction.addToHistory.of(false)],
		});
	}

	/**
	 * The document already on screen, re-read from the server.
	 *
	 * The host paints a session from what it holds locally so the switch lands
	 * in the click's own frame, then calls this when the file arrives. It is
	 * `setDocument`'s opposite number: the text is the SAME document, so the
	 * cells standing in the registry are this document's own and must live, and
	 * the caret belongs wherever the writer left it rather than at the end of
	 * the page. `spliceWhole` gives both — a minimal change CodeMirror maps.
	 */
	reconcileDocument(md: string) {
		this.#spliceWhole(md, true);
	}

	/**
	 * Full replace (initial load / session switch). Caret to end, reader at the top.
	 *
	 * The caret goes to the tail so the first keystroke lands in the prompt slot
	 * — but the reader is not the caret. `scrollIntoView` on that selection
	 * carried the page to the end of the file, and it did not even settle there:
	 * the artifact widgets above mount ~300 ms later with no `estimatedHeight`,
	 * so everything above the caret grew AFTER the scroll and a reader landed
	 * mid-page. Asking for position 0 is immune to that (nothing above the top
	 * can grow), and asking through an effect rather than `scrollDOM.scrollTop`
	 * is what survives the measure pass: CodeMirror applies the target once the
	 * new document is laid out.
	 */
	setDocument(md: string) {
		const view = this.view;
		if (!view) {
			this.#initialDoc = md;
			return;
		}
		this.#resetCells();
		view.dispatch({ effects: setRunBadge.of(null) });
		this.classList.remove("doc-focus");
		this.#userTypedDuringTurn = false;
		this.#headEdited = false;
		this.#midPageTurn = false;
		// The margin is the content's own top padding: without it CodeMirror puts
		// the first LINE at the top edge and the page opens a padding's worth in.
		const yMargin = parseFloat(getComputedStyle(view.contentDOM).paddingTop) || 0;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: md },
			selection: { anchor: md.length },
			effects: EditorView.scrollIntoView(0, { y: "start", yMargin }),
			// Loading is not an edit: ⌘Z must never peel a session back to the
			// empty buffer (or to the previously open session's text).
			annotations: [ownEdit.of(true), Transaction.addToHistory.of(false)],
		});
		view.focus();
	}

	/**
	 * Splice `text` into the machine's region [msgAnchor, tailAnchor] without
	 * moving the viewport: the response can grow below the fold while the user
	 * reads from the top — or writes in the tail, which the splice never touches.
	 * Kept out of undo history so ⌘Z mid-stream undoes the user's own typing,
	 * never the machine's.
	 */
	#replaceStream(text: string) {
		const view = this.view;
		// No turn, nothing to replace. The region is the only thing that says where
		// the machine's text ends and the writer's begins, so without one every
		// offset here is a guess — and the guess this used to make was the whole
		// buffer (ADR 0017). A chunk, a result or an error outliving its turn is
		// dropped rather than written somewhere.
		const region = this.liveRegion;
		if (!view || !region) return;
		const insert = text ? `${text}\n\n` : "";
		// No bookkeeping after the dispatch: replacing [msgAnchor, tailAnchor]
		// maps tailAnchor to the end of what was inserted, which is exactly the
		// arithmetic this used to do by hand.
		const { msgAnchor, tailAnchor } = region;
		view.dispatch({
			changes: { from: msgAnchor, to: tailAnchor, insert },
			annotations: [ownEdit.of(true), Transaction.addToHistory.of(false)],
		});
	}

	/**
	 * The send was accepted: the prompt is now history. Open the machine's region
	 * after it and lay down the next `<!-- you -->` below — you can keep writing
	 * there while the reply streams in above.
	 *
	 * `at` is the end of the prompt that ran, so a prompt in the MIDDLE of the
	 * page gets its answer under itself rather than at the bottom. Default: the
	 * end of the page.
	 *
	 * `prefixes` are the machine-written lines a prompt carries — the artifact
	 * scope, the cell-values snapshot. They go into the pending prompt. At the
	 * tail that IS the prompt being run, so each line sits above the anchor and
	 * MOVES it. The host used to do that arithmetic itself and got it wrong:
	 * measured before the prefixes and applied after, the region opened ~19
	 * characters early — inside the user's own sentence — and the reply spliced
	 * into the middle of it. Here the anchor and the text are computed together
	 * and land in one transaction, so there is no moment at which one is stale
	 * with respect to the other.
	 */
	beginTurn(at?: number, prefixes: readonly string[] = []) {
		const view = this.view;
		if (!view) return;
		this.turnCells.clear();
		const { md: doc, parsed } = view.state.field(docField);
		let md = doc;
		let anchor = at ?? md.replace(/\s+$/, "").length;
		const { segments } = parsed;
		// A prompt in the MIDDLE of the page: a trailing prompt slot sits strictly
		// below the anchor. Everything else — the tail, a `/command` that strips
		// its own slot (anchor == the slot's own start), a page that ends in a
		// reply — is already where the caret belongs, and the turn moves it to the
		// fresh slot it lays down.
		const tail = segments[segments.length - 1];
		const midPage = tail?.kind === "user" && anchor < tail.from;
		// Re-running replaces: the answer already under this prompt goes before
		// the region opens in the gap it leaves, or the new reply would be written
		// ABOVE the old one and the page would carry two. The host cuts the same
		// span out of the history it sends (`send`); this is the document's side
		// of it, and both reach it through `answerRange`, so they cannot disagree.
		// The cut is strictly below the anchor — `answerRange` starts at the
		// segment AFTER the prompt — so it moves neither the anchor nor what the
		// prefixes are measured against.
		const promptIdx = promptAt(segments, anchor);
		const answer = promptIdx >= 0 ? answerRange(segments, promptIdx) : null;
		if (answer) md = md.slice(0, answer.from) + md.slice(answer.to);
		// The prefixes go into the prompt being run, wherever it is on the page —
		// not the tail's draft — because that is the text the transcript holds.
		// The anchor stands past the prompt's text, so it moves by what they add.
		const prompt = promptIdx >= 0 ? segments[promptIdx] : undefined;
		if (prompt && prefixes.length) {
			const next = prefixPrompt(md, prompt, prefixes);
			if (prompt.bodyFrom < anchor) anchor += next.length - md.length;
			md = next;
		}
		const turn = beginTurnAt(md, anchor);
		this.#spliceWhole(turn.doc, midPage);
		this.#midPageTurn = midPage; // after: spliceWhole clears the turn's flags too
		// The third anchor is set HERE and nowhere else in a turn: `msgAnchor` walks
		// forward past every finalized message, so only this one still answers
		// "where did this turn begin?" once a few steps have landed.
		this.#setRegion(turn.msgAnchor, turn.tailAnchor, turn.msgAnchor);
		view.dispatch({ effects: placeRunBadge.of(turn.msgAnchor) });
	}

	/** What the running turn is doing and its max time, shown at the top of the
	 *  answer block it writes (ADR 0031); empty `label` hides it. The words are
	 *  the host's. */
	showRunStatus(label: string, budget: string): void {
		const view = this.view;
		const current = view?.state.field(runBadgeField);
		if (!view || !current || (current.label === label && current.budget === budget)) return;
		view.dispatch({ effects: setRunBadge.of({ label, budget }) });
	}

	/**
	 * A message that arrived mid-run — a steer you typed, a queued follow-up —
	 * enters the document at its true transcript position: commit whatever the
	 * machine has written so far, write the user's text after it, and re-seed the
	 * placeholder below so the reply to it lands in the right place.
	 *
	 * `fold` puts a block marker in front, so the delivery continues the block it
	 * interrupted instead of opening a new one.
	 */
	appendUserMessage(text: string, fold: boolean) {
		const view = this.view;
		if (!view || !text) return;
		const { msgAnchor, tailAnchor } = this.region;
		// A placeholder is not content — it is re-seeded below, not committed.
		const written = view.state.sliceDoc(msgAnchor, tailAnchor);
		const settled = written === PI_PLACEHOLDER ? "" : written;
		const body = fold ? `${BLOCK_MARKER}\n\n${text}` : text;
		const before = `${settled}${body}\n\n`;
		view.dispatch({
			changes: { from: msgAnchor, to: tailAnchor, insert: `${before}${PI_PLACEHOLDER}` },
			annotations: [ownEdit.of(true), Transaction.addToHistory.of(false)],
		});
		this.#setRegion(msgAnchor + before.length, msgAnchor + before.length + PI_PLACEHOLDER.length);
	}

	/** A queued message left the tail: cut the draft below the trailing prompt —
	 *  it re-enters the document at its delivery position instead. */
	clearTail() {
		const view = this.view;
		if (!view) return;
		// Where the tail prompt's body begins, from the parse. Deriving it as
		// `tailAnchor + YOU_MARKER.length + 2` assumed the marker was followed by
		// exactly one blank line and checked nothing, so any other spacing put the
		// cut mid-draft — and the delete runs to the end of the document.
		const { segments } = view.state.field(docField).parsed;
		const tail = tailPrompt(segments);
		if (tail < 0) return;
		const from = segments[tail].bodyFrom;
		if (view.state.doc.length <= from) return;
		view.dispatch({
			changes: { from, to: view.state.doc.length, insert: "" },
			annotations: [ownEdit.of(true), Transaction.addToHistory.of(false)],
		});
	}

	/** The mode of the cell `id` as written above the message being streamed:
	 *  what a redefinition that names no mode keeps (`serializeAssistant`). */
	#settledMode = (id: string): string | undefined => {
		const { msgAnchor } = this.region;
		return this.view?.state
			.field(docField)
			.parsed.segments.findLast((seg) => seg.kind === "cell" && seg.id === id && seg.from < msgAnchor)?.name;
	};

	/** Re-render the in-flight assistant message (streaming partial). */
	applyAssistantPartial(msg: AssistantMessage) {
		const text = serializeAssistant(msg, this.#settledMode);
		// An all-empty partial would wipe the placeholder label; keep it until
		// there is real content to show.
		if (text) this.#replaceStream(text);
	}

	/** That message is history: collapse the region onto its end, so the next one
	 *  lands after it. A no-op with no turn in flight — there is nothing to
	 *  advance, and re-opening a closed region is how a stray write found a
	 *  target (ADR 0017). */
	#advancePastWritten() {
		const region = this.liveRegion;
		if (region) this.#setRegion(region.tailAnchor, region.tailAnchor);
	}

	/** The in-flight assistant message is complete; advance the anchor past it. */
	finalizeAssistant(msg: AssistantMessage) {
		this.#replaceStream(serializeAssistant(msg, this.#settledMode));
		this.#advancePastWritten();
	}

	appendToolResult(msg: ToolResultMessage) {
		this.#replaceStream(serializeToolResult(msg));
		this.#advancePastWritten();
	}

	/**
	 * Write a `pi:view NAME #id` segment into the stream region and open its live
	 * view, so a producer has somewhere to stream into. Returns the view, or null
	 * when NAME has no live factory registered.
	 *
	 * Committed rather than left in the replaceable region: the next
	 * `applyAssistantPartial` would otherwise overwrite the marker the view is
	 * attached to, and the view would be reaped mid-run. Committing it means the
	 * segment is history the moment it exists — which is also what makes the
	 * eventual `pi:result` land after it rather than on top of it.
	 */
	openStreamingView(name: string, id: string, interactive = false): LiveView | null {
		const view = this.view;
		if (!view || !getLiveView(name)) return null;
		const marker = `<!-- pi:view ${name} #${id} -->`;
		// An empty fence: what a live view persists is whatever IDENTIFIES it, never
		// its output (live-views.ts rule 3).
		const segment = `${marker}\n\n\`\`\`\n\`\`\``;
		const written = view.state.doc.toString().includes(marker);
		if (!written && !interactive && this.liveRegion) {
			// A view of the turn's own work — pi's `bash` — belongs to the answer:
			// into the region, above the prompt laid down below it. At the end of
			// the document it would sit under that prompt, and the draft typed there
			// would no longer be the tail's.
			this.#replaceStream(segment);
			this.#advancePastWritten();
		} else if (!written) {
			// Written as an ORDINARY insertion at the end of the document, not through
			// `#replaceStream`.
			//
			// The streaming path replaces `[msgAnchor, tailAnchor]`, which is only a
			// region while a turn is live; called outside one — and a user-opened
			// terminal always is — those anchors span the whole buffer and the insert
			// REPLACED THE ENTIRE DOCUMENT. The user's conversation, gone, for opening a
			// terminal. Caught by e2e/terminal.spec.ts, where 7619 characters became 40.
			const md = view.state.doc.toString();
			const at = md.replace(/\s+$/, "").length;
			const pad = at === 0 ? "" : "\n\n";
			// A panel the user opened is brought into view: at the end of a
			// conversation longer than the window it would otherwise open unseen,
			// and opening it would look like nothing happened.
			const scroll = interactive ? [EditorView.scrollIntoView(at + pad.length, { y: "start", yMargin: 48 })] : [];
			// A panel the user opened is the writer's edit, so the page still ends
			// in a prompt slot under it (`trailingPromptRepair`). Without one the
			// next character typed was left alone under the panel, and the slot
			// made only then took the ones after it.
			const writers = interactive ? [hostEdit.of(true)] : [];
			view.dispatch({
				changes: { from: at, to: md.length, insert: `${pad}${segment}\n` },
				effects: scroll,
				annotations: [ownEdit.of(true), Transaction.addToHistory.of(false), ...writers],
			});
		}
		return this.openLiveView(name, id, interactive);
	}

	/**
	 * Open (or adopt) the live view for `id` and return it, or null when `name` has
	 * no registered factory — the caller then has nothing to drive and the segment
	 * renders as an ordinary view or fence.
	 *
	 * Idempotent on purpose: the producer calls this when its first output arrives
	 * and does not have to know whether a previous call already made the view.
	 *
	 * `interactive` says whether anything at the other end reads input — false for a
	 * view OF a process, such as an agent's `bash` output. The view reads it and does
	 * not offer a cursor it cannot honour (live-views.ts).
	 */
	/** Opens the named live view for `id`, or returns the one already open. */
	openLiveView(name: string, id: string, interactive = false): LiveView | null {
		return this.#liveViewHost.open(name, id, interactive);
	}

	/** The live view for `id`, if one is open. The write path: a producer looks
	 *  the view up and calls `write` on it, which touches no editor state
	 *  (live-views.ts rule 2) and so costs nothing per chunk. */
	liveView(id: string): LiveView | null {
		return this.#liveViewHost.get(id);
	}

	/** Bridge or CLI failure — record it in the document like any other reply. */
	appendError(message: string) {
		this.#replaceStream(`<!-- pi -->\n\n**Error:** ${message}`);
		this.#advancePastWritten();
	}

	/**
	 * Turn over (done, stopped, or errored). The next prompt already exists;
	 * move the caret there only if the user hasn't started writing in it — and
	 * only if the turn was theirs to move: a turn that opened mid-page never took
	 * the caret in the first place and must not hand it to the bottom of the page
	 * on the way out.
	 */
	endTurn() {
		const view = this.view!;
		// Dead turn: nothing ever streamed — remove the placeholder pi label.
		const region = this.liveRegion;
		if (region && view.state.sliceDoc(region.msgAnchor, region.tailAnchor) === PI_PLACEHOLDER) this.#replaceStream("");
		if (!this.#midPageTurn && !this.#userTypedDuringTurn) view.dispatch({ selection: { anchor: view.state.doc.length } });
		// Last, and after every read above: the turn's own state goes with the
		// turn. It used to survive until the NEXT one began — `spliceWhole` cleared
		// the flags — so between two turns the element answered for the one that
		// had already ended (ADR 0017).
		this.#closeRegion();
		this.#userTypedDuringTurn = false;
		this.#headEdited = false;
		this.#midPageTurn = false;
		this.turnCells.clear();
		this.#scheduleSave();
	}
}

if (!customElements.get("document-chat")) {
	customElements.define("document-chat", DocumentChat);
}
