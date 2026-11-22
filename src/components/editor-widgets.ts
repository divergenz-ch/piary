// The editor's widget plane: every CodeMirror WidgetType the decoration builder
// mounts, plus the DOM builders they share (menu dots, drag handles, labels).
//
// Extracted from DocumentChat.ts behaviour-preservingly (ADR 0009). Widgets READ
// the state plane (editor-state.ts) and build DOM; they never reach back into the
// element. A widget that needs to call DocumentChat wants a CustomEvent, which is
// how every one of these already talks to it.
import { EditorView, WidgetType } from "@codemirror/view";
import { GripVertical, Plus } from "lucide";
import { docField, foldKey } from "./editor-state.ts";
import type { SnippetKind, SnippetRun } from "../document/format.ts";
import { iconDOM } from "../utils/icons.ts";
import type { PiArtifact } from "./ArtifactBlock.ts";


/** What a source toggle's click shows: a view's payload fence, an artifact's
 *  cells as the fences they are in the file, or the rendered result again. */
export type SourceToggleTo = "source" | "markdown" | "result";

/** The words on each toggle. The glyph alone read as nothing, and what it took
 *  away looked deleted, so the label names what a click shows and the tooltip
 *  says how far it reaches and that the text is safe. `markdown` is the
 *  artifact's word because `source` is what its own label opens: the code pane. */
export const SOURCE_TOGGLE: Record<SourceToggleTo, { text: string; title: string }> = {
	source: { text: "⟨⟩ source", title: "Show this view's source, the text it is drawn from. Nothing is deleted." },
	markdown: {
		text: "⟨⟩ markdown",
		title: "Show this artifact's cells as plain markdown in the document. Nothing is deleted.",
	},
	result: { text: "← Show result", title: "Back to the rendered result" },
};

/** The source toggle: flips a view, or an artifact (`@name`), between what it
 *  draws and the text it is drawn from. The way back is drawn as a button, not
 *  a quiet glyph: it is the only thing on the raw text that says a result exists. */
export function viewToggle(id: string, to: SourceToggleTo): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = to === "result" ? "doc-view-toggle doc-view-back" : "doc-view-toggle";
	btn.textContent = SOURCE_TOGGLE[to].text;
	btn.title = SOURCE_TOGGLE[to].title;
	btn.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		btn.dispatchEvent(new CustomEvent("view-toggle", { detail: { id }, bubbles: true, composed: true }));
	});
	return btn;
}

/** A rendered `pi:view` — replaces marker + payload fence with the template's DOM. */
export class ViewWidget extends WidgetType {
	constructor(
		readonly name: string,
		readonly id: string,
		/** Raw replaced slice — cheap identity so unchanged views keep their DOM. */
		readonly src: string,
		readonly body: HTMLElement,
		/** The rendered view swallows its own marker line, so the head it builds
		 *  is the only place its `⋯` can go. */
		readonly segFrom?: number,
	) {
		super();
	}
	override eq(other: ViewWidget) {
		return other.name === this.name && other.id === this.id && other.src === this.src && other.segFrom === this.segFrom;
	}
	override toDOM() {
		const root = document.createElement("div");
		root.className = "doc-view";
		const header = document.createElement("div");
		header.className = "doc-view-header";
		const label = document.createElement("span");
		label.className = "doc-role";
		label.textContent = this.name;
		if (this.segFrom !== undefined) {
			label.classList.add("doc-role-menu");
			label.append(segmentMenuDots(this.segFrom));
		}
		header.append(label, viewToggle(this.id, "source"));
		root.append(header, this.body);
		return root;
	}
	override ignoreEvent() {
		return true;
	}
}

/** A rendered live view (`src/document/live-views.ts`) — a `pi:view` whose content
 *  keeps arriving after the first render.
 *
 *  What keeps a view's content alive is that the ELEMENT is owned outside CodeMirror
 *  (`DocumentChat.#liveViews`, published through `liveViewsField`) and this widget
 *  only re-parents it. That is the load-bearing part, and it is why `toDOM` appends
 *  `this.el` rather than building content: the widget may be rebuilt at any time —
 *  in practice it IS, on most edits, because `segFrom` moves whenever text above it
 *  changes — and a widget that rendered its own content would lose everything the
 *  view had accumulated.
 *
 *  So `eq` is an optimisation here, not the safety net: it spares the chrome a
 *  rebuild when nothing addressing the view moved. The safety net is the pool.
 *
 *  There is deliberately **no `destroy()`**. CodeMirror drops the widget of a line
 *  that scrolls out of the drawn viewport, so releasing the view there would throw
 *  away a running terminal's output; the owner that tracks which ids are still in
 *  the document disposes it instead (live-views.ts rule 5). */
export class LiveViewWidget extends WidgetType {
	constructor(
		readonly name: string,
		readonly id: string,
		readonly el: HTMLElement,
		/** The live view swallows its own marker line, so the head it builds is the
		 *  only place its `⋯` can go — same contract as ViewWidget's. */
		readonly segFrom?: number,
	) {
		super();
	}
	override eq(other: LiveViewWidget) {
		return other.id === this.id && other.el === this.el && other.name === this.name && other.segFrom === this.segFrom;
	}
	override toDOM() {
		const root = document.createElement("div");
		root.className = "doc-view doc-live-view";
		const header = document.createElement("div");
		header.className = "doc-view-header";
		const label = document.createElement("span");
		label.className = "doc-role";
		label.textContent = this.name;
		if (this.segFrom !== undefined) {
			label.classList.add("doc-role-menu");
			label.append(segmentMenuDots(this.segFrom));
		}
		// No source toggle: a live view keeps nothing in the document but what
		// identifies it (live-views.ts rule 3), so its source is an empty fence.
		header.append(label);
		root.append(header, this.el);
		return root;
	}
	/** The view owns everything inside it — a terminal manages its own selection
	 *  and focus, and CodeMirror would otherwise read a mousedown here as a click
	 *  into the document. */
	override ignoreEvent() {
		return true;
	}
}

/** Where a live view was, once nothing is behind it: a document reopened with a
 *  terminal in it has the marker and no process (ADR 0013). The two empty fence
 *  lines it would otherwise show read as output that was lost. */
export class GoneViewWidget extends WidgetType {
	constructor(
		readonly name: string,
		/** The command's output is a step of this document, under the view. */
		readonly outputBelow: boolean,
		readonly segFrom: number,
	) {
		super();
	}
	override eq(other: GoneViewWidget) {
		return other.name === this.name && other.outputBelow === this.outputBelow && other.segFrom === this.segFrom;
	}
	override toDOM() {
		const root = document.createElement("div");
		root.className = "doc-view doc-view-gone";
		const header = document.createElement("div");
		header.className = "doc-view-header";
		const label = document.createElement("span");
		label.className = "doc-role doc-role-menu";
		label.textContent = this.name;
		label.append(segmentMenuDots(this.segFrom));
		header.append(label);
		const note = document.createElement("div");
		note.className = "doc-view-gone-note";
		note.textContent = `A ${this.name} ran here. It is not available now: what it showed is not kept, for security reasons.${
			this.outputBelow ? " What the command printed is in the output step below." : ""
		}`;
		root.append(header, note);
		return root;
	}
	override ignoreEvent() {
		return true;
	}
}

/** An artifact's frame, under the answer that wrote it. Identity is the
 *  element, not the members: the <pi-artifact> (and the Inspector DOM and
 *  source editors inside it) survives every keystroke — text flows to the
 *  engine through the debounced sync, never through widget recreation. */
export class ArtifactWidget extends WidgetType {
	constructor(
		readonly key: string,
		readonly el: PiArtifact,
		readonly park: HTMLElement,
		/** Offset the move is addressed by — the artifact's own marker, which
		 *  `cellExtent` spans to the end of the block. A single ungrouped cell
		 *  addresses its own fence, which is the same thing for it. */
		readonly from: number,
		readonly label: string,
	) {
		super();
	}
	override eq(other: ArtifactWidget) {
		return other.key === this.key && other.el === this.el && other.from === this.from && other.label === this.label;
	}
	override toDOM() {
		const root = document.createElement("div");
		root.className = "doc-cell";
		// Where a right-click inside the frame resolves to. A frame is tall, and a
		// block widget's lower half hit-tests as the position AFTER it, so
		// `posAtCoords` alone answers "the next block" for a click near the bottom
		// — pointing "answer this block" at a block you were not looking at.
		root.dataset.docFrom = String(this.from);
		// The head every other block has. This widget replaces the marker line, so
		// there is no line for a `RoleWidget` to sit on: without one, an artifact is
		// the only block on the page with no way into the block menu at all. The
		// label at the FOOT of the frame answers a different question (show me the
		// source), and it stays where it is.
		root.append(blockMenuLabel(this.label, this.from), cellDragHandle(this.from, this.label), this.el);
		return root;
	}
	override destroy(dom: HTMLElement) {
		// Scrolled out of the viewport: return the element to the park so it
		// stays connected (and its cells alive) — unless a newer widget already
		// adopted it.
		if (dom.contains(this.el)) this.park.append(this.el);
	}
	override ignoreEvent() {
		// The code pane is a real editor. Every event inside this widget belongs
		// to it, and the outer view must not read a keystroke there as a document
		// edit at the widget's position.
		return true;
	}
}

/** An extension's question, in the buffer under the run that asked it.
 *  Identity is the element, so a half-typed answer survives scroll-out. */
export class AskWidget extends WidgetType {
	constructor(
		readonly el: HTMLElement,
		readonly park: HTMLElement,
	) {
		super();
	}
	override eq(other: AskWidget) {
		return other.el === this.el;
	}
	override toDOM() {
		return this.el;
	}
	override destroy(dom: HTMLElement) {
		if (dom.contains(this.el)) this.park.append(this.el);
	}
	override ignoreEvent() {
		return true;
	}
}

export class RoleWidget extends WidgetType {
	constructor(
		readonly label: string,
		readonly cls: string,
		/** Set on block-opening user labels: clicking opens the block menu (step 9). */
		readonly menuFrom?: number,
		/** Set on a label in show-source mode, a view's or an artifact cell's: the
	 *  way back to the result. */
		readonly viewToggleId?: string,
		/** Mode badge chip on a block head (the catalog's badge word, step 13). */
		readonly badge?: string,
		/** Set on a foldable segment's label: clicking re-folds the body. */
		readonly foldKey?: string,
		/** Set on every head that names one segment: the `⋯` removes it. */
		readonly segFrom?: number,
		/** Set on an unasked reply's head: a button that says it did not help. */
		readonly dismissFrom?: number,
	) {
		super();
	}
	override eq(other: RoleWidget) {
		return (
			other.label === this.label &&
			other.cls === this.cls &&
			other.menuFrom === this.menuFrom &&
			other.viewToggleId === this.viewToggleId &&
			other.badge === this.badge &&
			other.foldKey === this.foldKey &&
			other.segFrom === this.segFrom &&
			other.dismissFrom === this.dismissFrom
		);
	}
	override toDOM() {
		const span = document.createElement("span");
		span.className = `doc-role ${this.cls}`;
		span.textContent = this.label;
		if (this.badge) {
			const chip = document.createElement("span");
			chip.className = "doc-mode-badge";
			chip.textContent = this.badge;
			span.append(chip);
		}
		if (this.menuFrom !== undefined) blockMenuTarget(span, this.menuFrom);
		if (this.viewToggleId !== undefined) span.append(viewToggle(this.viewToggleId, "result"));
		if (this.foldKey !== undefined) {
			const key = this.foldKey;
			span.classList.add("doc-role-menu");
			span.title = "Collapse";
			span.addEventListener("mousedown", keepCaret);
			span.addEventListener("click", (event) => {
				event.preventDefault();
				span.dispatchEvent(new CustomEvent("fold-toggle", { detail: { key }, bubbles: true, composed: true }));
			});
		}
		// A block head already carries `blockMenuTarget`'s dots; a second pair
		// would say the same thing twice, and its menu is the wider one.
		if (this.segFrom !== undefined && this.menuFrom === undefined) {
			span.classList.add("doc-role-menu");
			span.dataset["at"] = String(this.segFrom);
			span.addEventListener("mousedown", keepCaret);
			span.append(segmentMenuDots(this.segFrom));
		}
		if (this.dismissFrom !== undefined) {
			const from = this.dismissFrom;
			const dismiss = document.createElement("button");
			dismiss.type = "button";
			dismiss.className = "doc-aside-dismiss";
			dismiss.textContent = "Not helpful";
			dismiss.title = "Remove this, and stop unasked replies in this conversation for now";
			// Before the label's own click: this is not the segment's menu.
			dismiss.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				dismiss.dispatchEvent(new CustomEvent("aside-dismiss", { detail: { from }, bubbles: true, composed: true }));
			});
			span.append(dismiss);
		}
		return span;
	}
	override ignoreEvent() {
		return true;
	}
}

/** A cell's handle: the grip you drag it by and the ⋯ that opens its menu.
 *  Absolutely positioned into the left margin every line already reserves, so
 *  it costs no layout — page material stays prose with nothing above it. */
/**
 * The `⠿` grip: drag to move, click for the cell menu.
 *
 * A function rather than only a widget, because an artifact needs the same grip
 * without having a line to hang a widget on — its member fences are hidden and
 * scattered, and the frame is the thing you actually reach for. Both callers get
 * identical behaviour by construction.
 *
 * `from` is the offset the move is addressed by: a cell's own segment, or an
 * artifact's first member.
 */
/** Where a right-click keeps the browser's own menu: a nested editor is a real
 *  editor (the artifact's code pane), and a form control in the buffer is a form
 *  control (`AskWidget` puts real ones there). */
export const NATIVE_MENU = ".artifact-code, input, textarea, select, button";

/**
 * The document offset a pointer event is over.
 *
 * A frame's own anchor answers first, and `posAtCoords` otherwise. A frame is
 * tall, and a block widget's lower half hit-tests as the position AFTER it, so
 * geometry alone answers "the next block" for a click near the bottom of an
 * artifact — pointing "answer this block" at a block you were not looking at.
 */
export function docPosAt(view: EditorView, event: MouseEvent): number | null {
	const framed = (event.target as HTMLElement | null)?.closest?.("[data-doc-from]") as HTMLElement | null;
	const pos = framed ? Number(framed.dataset.docFrom) : view.posAtCoords({ x: event.clientX, y: event.clientY });
	return pos === null || Number.isNaN(pos) ? null : pos;
}

/** The opening segment of the block that holds `pos`, or null in a page with no
 *  blocks in it yet. */
export function blockOpenerAt(view: EditorView, pos: number): number | null {
	const { parsed, blocks } = view.state.field(docField);
	const block = [...blocks].reverse().find((b) => parsed.segments[b.opensAt].from <= pos) ?? blocks[0];
	return block ? parsed.segments[block.opensAt].from : null;
}

/**
 * A press on a head that takes clicks places no caret. A press on the outer half
 * of its first or last glyph is, to the engine, a press beside it: left alone it
 * puts the caret there, the head's line is drawn again for that caret, and the
 * release finds another element, so no click comes.
 */
function keepCaret(event: MouseEvent) {
	event.preventDefault();
}

/**
 * Make a role label the block menu's hit target: the ⋯ that says a menu is
 * there, and the click that opens it. The whole head is the target — the dots
 * are the cue, not the button.
 *
 * Shared, because there are two kinds of block head now. A prose block hangs its
 * label on the marker line it already has; an artifact's marker line is replaced
 * wholesale by its frame, so the frame grows a head of its own.
 */
/**
 * The `⋯` that says a menu is here, as its own hit target.
 *
 * One glyph, one meaning: `⋯` opens a menu on anything that IS one segment.
 * The head around it keeps whatever it already did — a block head opens the
 * block menu when clicked anywhere, a folded step still expands when its label
 * is clicked — which is why the listener lives on the dots and stops there.
 * (The activity strip is the exception that proves the rule: it stands for N
 * segments, not one, so its dots still mean "expand".)
 */
export function segmentMenuDots(from: number): HTMLElement {
	const dots = document.createElement("span");
	dots.className = "doc-role-dots doc-seg-dots";
	dots.textContent = "⋯";
	dots.title = "Segment options";
	dots.contentEditable = "false";
	dots.addEventListener("mousedown", keepCaret);
	dots.addEventListener("click", (event) => {
		event.preventDefault();
		// Without this the click also reaches the head, which folds or opens the
		// block menu underneath the menu that just opened.
		event.stopPropagation();
		const rect = dots.getBoundingClientRect();
		dots.dispatchEvent(
			new CustomEvent("segment-menu", { detail: { from, x: rect.left, y: rect.bottom }, bubbles: true, composed: true }),
		);
	});
	return dots;
}

export function blockMenuTarget(span: HTMLElement, from: number): HTMLElement {
	span.classList.add("doc-role-menu");
	span.title = "Block operations";
	span.dataset["at"] = String(from);
	const dots = document.createElement("span");
	dots.className = "doc-role-dots";
	dots.textContent = "⋯";
	span.append(dots);
	span.addEventListener("mousedown", keepCaret);
	span.addEventListener("click", (event) => {
		event.preventDefault();
		const rect = span.getBoundingClientRect();
		span.dispatchEvent(
			new CustomEvent("block-menu", { detail: { from, x: rect.left, y: rect.bottom }, bubbles: true, composed: true }),
		);
	});
	return span;
}

/** A block head built from nothing — for a frame with no marker line to use. */
export function blockMenuLabel(label: string, from: number): HTMLElement {
	const span = document.createElement("span");
	span.className = "doc-role doc-block-head";
	span.textContent = label;
	return blockMenuTarget(span, from);
}

export function cellDragHandle(from: number, label: string): HTMLElement {
	const span = document.createElement("span");
	span.className = "doc-cell-handle";
	span.title = `${label} — drag to move, click for cell options`;
	// A grip from the icon set the rest of the app draws with, not a glyph: the
	// `⠿` this used to be is not in the canvas's sans, which ships Latin only, so
	// it fell back to whatever font on the machine has braille and rendered as
	// six sub-pixel specks. An SVG has the same weight everywhere.
	span.append(iconDOM(GripVertical, "sm"));
	// Where this handle sits in the document — how `nearChrome` decides whether
	// it belongs to the block under the pointer.
	span.dataset.at = String(from);
	// The handle lives inside `.cm-content`, which is contenteditable. Native
	// HTML5 drag from there is a *text* drag as far as the browser is
	// concerned and does not reliably start at all — pointer capture is what
	// the rail already uses to reorder blocks, and it works here for the same
	// reason: nothing else ever sees the gesture.
	span.contentEditable = "false";
	let moved = false;
	let target: HTMLElement | null = null;
	let downX = 0;
	let downY = 0;

	/** The gap nearest the pointer, by the centre of its (invisible) band. */
	const nearestGap = (host: Element, y: number): HTMLElement | null => {
		let best: HTMLElement | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const zone of host.querySelectorAll(".doc-cell-gap-zone")) {
			const box = zone.getBoundingClientRect();
			const distance = Math.abs(box.top + box.height / 2 - y);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = zone.parentElement;
			}
		}
		return best;
	};

	span.addEventListener("pointerdown", (event) => {
		// Both are load-bearing: without them CodeMirror starts a text
		// selection under the pointer and the drag never gets a move.
		event.preventDefault();
		event.stopPropagation();
		span.setPointerCapture(event.pointerId);
		moved = false;
		downX = event.clientX;
		downY = event.clientY;
		target = null;
		span.closest("document-chat")?.classList.add("doc-cell-dragging");
	});

	span.addEventListener("pointermove", (event) => {
		if (!span.hasPointerCapture(event.pointerId)) return;
		// A few pixels of slop, so a click that trembles is still a click. Measured
		// from where the press landed, not from `movementX/Y`: those are per-event
		// and not every engine fills them (WebKit under automation reports 0), so
		// a drag made of small steps read as a click that never moved.
		if (!moved && Math.abs(event.clientY - downY) + Math.abs(event.clientX - downX) < 2) return;
		moved = true;
		const host = span.closest("document-chat");
		if (!host) return;
		target?.classList.remove("doc-cell-gap-over");
		target = nearestGap(host, event.clientY);
		target?.classList.add("doc-cell-gap-over");
	});

	const end = (event: PointerEvent) => {
		if (span.hasPointerCapture(event.pointerId)) span.releasePointerCapture(event.pointerId);
		span.closest("document-chat")?.classList.remove("doc-cell-dragging");
		target?.classList.remove("doc-cell-gap-over");
		const drop = moved ? target : null;
		target = null;
		if (drop) {
			const before = drop.dataset.beforeFrom;
			span.dispatchEvent(
				new CustomEvent("cell-move", {
					detail: { from, beforeFrom: before === "" ? null : Number(before) },
					bubbles: true,
					composed: true,
				}),
			);
			return;
		}
		// Not a drag: the handle is also the menu button.
		const rect = span.getBoundingClientRect();
		span.dispatchEvent(
			new CustomEvent("cell-menu", { detail: { from, x: rect.right, y: rect.bottom }, bubbles: true, composed: true }),
		);
	};
	span.addEventListener("pointerup", end);
	span.addEventListener("pointercancel", (event) => {
		if (span.hasPointerCapture(event.pointerId)) span.releasePointerCapture(event.pointerId);
		span.closest("document-chat")?.classList.remove("doc-cell-dragging");
		target?.classList.remove("doc-cell-gap-over");
		target = null;
	});
	return span;
}

export class CellHandleWidget extends WidgetType {
	constructor(
		readonly from: number,
		readonly label: string,
	) {
		super();
	}
	override eq(other: CellHandleWidget) {
		return other.from === this.from && other.label === this.label;
	}
	override toDOM() {
		return cellDragHandle(this.from, this.label);
	}
	override ignoreEvent() {
		return true;
	}
}

/** The gap between two cells: a `+` that inserts one there, and the drop target
 *  a dragged cell lands on. Zero height — the `+` is absolutely positioned into
 *  the block gap that already exists, so nothing reflows when it appears. */
/** How much room the gap below this row actually has. The `+` centres itself in
 *  it, so a widget that guesses wrong puts the button on top of the next cell's
 *  handle — all three of these are real heights the layout produces, and the
 *  widget cannot read them off the DOM. */
type GapKind =
	/** Opens a block: `doc-block-first`'s 2.5rem of padding. */
	| "block"
	/** Opens only a segment inside a block: `doc-seg-first`'s 0.5rem. */
	| "seg"
	/** An artifact frame — a block WIDGET, so no line padding at all. */
	| "frame";

export class CellGapWidget extends WidgetType {
	constructor(
		readonly at: number,
		readonly beforeFrom: number | null,
		readonly kind: GapKind = "block",
	) {
		super();
	}
	override eq(other: CellGapWidget) {
		return other.at === this.at && other.beforeFrom === this.beforeFrom && other.kind === this.kind;
	}
	override toDOM() {
		const row = document.createElement("div");
		row.className = `doc-cell-gap doc-cell-gap-${this.kind}`;
		row.contentEditable = "false";
		const plus = document.createElement("span");
		plus.className = "doc-cell-gap-plus";
		// Drawn like the grip beside it, so the two are one weight.
		plus.append(iconDOM(Plus, "sm"));
		plus.title = "Insert a cell here";
		// The row itself is zero-height so it costs no layout. The zone is the
		// drop target: a band across the gap that only becomes hittable while a
		// cell is in flight, so it never eats an ordinary click on the prose.
		const zone = document.createElement("div");
		zone.className = "doc-cell-gap-zone";
		const { at, beforeFrom } = this;
		// Where a cell dropped here lands. Read back off the DOM by the handle
		// doing the dragging — it hit-tests these bands itself.
		row.dataset.beforeFrom = beforeFrom === null ? "" : String(beforeFrom);
		// Same anchor `nearChrome` matches handles on. `beforeFrom` cannot serve:
		// it is where a drop LANDS, and the end gap's is null.
		row.dataset.at = String(at);
		plus.addEventListener("mousedown", (event) => event.stopPropagation());
		plus.addEventListener("click", (event) => {
			event.preventDefault();
			const rect = plus.getBoundingClientRect();
			row.dispatchEvent(
				new CustomEvent("cell-insert", { detail: { at, x: rect.left, y: rect.bottom }, bubbles: true, composed: true }),
			);
		});
		row.append(zone, plus);
		return row;
	}
	override ignoreEvent() {
		return true;
	}
}

/** A folded segment body: the role label + ⋯ standing in for marker + body. */
export class FoldedWidget extends WidgetType {
	constructor(
		readonly label: string,
		readonly cls: string,
		readonly key: string,
		/** Shown beside the label when the body must stay legible (errors). */
		readonly snippet = "",
		/** This folded step is the one being written right now — it pulses. */
		readonly live = false,
		/** Set on a fold that stands for one segment: the `⋯` removes it. */
		readonly segFrom?: number,
	) {
		super();
	}
	override eq(other: FoldedWidget) {
		return (
			other.label === this.label &&
			other.cls === this.cls &&
			other.key === this.key &&
			other.snippet === this.snippet &&
			other.live === this.live &&
			other.segFrom === this.segFrom
		);
	}
	override toDOM() {
		const root = document.createElement("div");
		root.className = `doc-fold ${this.cls}`;
		const span = document.createElement("span");
		span.className = `doc-role doc-role-menu${this.live ? " doc-role-live" : ""}`;
		span.title = "Expand";
		span.textContent = this.label;
		span.addEventListener("click", (event) => {
			event.preventDefault();
			span.dispatchEvent(new CustomEvent("fold-toggle", { detail: { key: this.key }, bubbles: true, composed: true }));
		});
		// The dots used to be this line's expand cue. The whole line was always
		// the expand target and still is (the label, and `title` says so) — the
		// glyph now says what it says everywhere else on the page: a menu is here.
		if (this.segFrom !== undefined) span.append(segmentMenuDots(this.segFrom));
		root.append(span);
		if (this.snippet) {
			const now = document.createElement("span");
			now.className = "doc-fold-now";
			now.textContent = this.snippet;
			root.append(now);
		}
		return root;
	}
	override ignoreEvent() {
		return true;
	}
}

/** Fires the fold-toggle event the component's own listener routes. */
export function foldToggleOn(el: HTMLElement, key: string) {
	el.addEventListener("click", (event) => {
		event.preventDefault();
		el.dispatchEvent(new CustomEvent("fold-toggle", { detail: { key }, bubbles: true, composed: true }));
	});
}

/** A run of machine steps behind one line: how many, and what the last one is
 *  doing — the snippet updates as the run grows, so a turn is followable
 *  without N label lines. Code is never shown here; fences are stripped. */
export class ActivityWidget extends WidgetType {
	constructor(
		readonly count: number,
		readonly label: string,
		readonly snippet: string,
		readonly key: string,
		/** Open = the steps render individually below; this is the way back. */
		readonly open = false,
		/** The run's last step is the live one — the strip stands in for it, so
		 *  the strip is what pulses. */
		readonly live = false,
	) {
		super();
	}
	override eq(other: ActivityWidget) {
		return (
			other.count === this.count &&
			other.label === this.label &&
			other.snippet === this.snippet &&
			other.key === this.key &&
			other.open === this.open &&
			other.live === this.live
		);
	}
	override toDOM() {
		const root = document.createElement("div");
		root.className = `doc-fold doc-activity doc-line-tool${this.open ? " doc-activity-open" : ""}`;
		const span = document.createElement("span");
		span.className = `doc-role doc-role-menu${this.live ? " doc-role-live" : ""}`;
		span.title = this.open ? "Collapse these steps" : "Expand these steps";
		span.textContent = `${this.count} steps`;
		const dots = document.createElement("span");
		dots.className = "doc-role-dots";
		dots.textContent = "⋯";
		span.append(dots);
		span.addEventListener("click", (event) => {
			event.preventDefault();
			span.dispatchEvent(new CustomEvent("fold-toggle", { detail: { key: this.key }, bubbles: true, composed: true }));
		});
		const now = document.createElement("span");
		now.className = "doc-fold-now";
		now.textContent = this.snippet ? `${this.label} — ${this.snippet}` : this.label;
		// When open, the visible word is "collapse" — it must do what it says.
		if (this.open) foldToggleOn(now, this.key);
		root.append(span, now);
		return root;
	}
	override ignoreEvent() {
		return true;
	}
}

/** What a step is doing, in words: fenced code is dropped outright, and the
 *  TAIL is kept — the most recent sentence of a growing thought. */
export function activitySnippet(text: string): string {
	const prose = text
		.replace(/```[\s\S]*?(?:```|$)/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return prose.length > 120 ? `…${prose.slice(-120)}` : prose;
}

/** A collapsed snippet, artifact scope, or cell-values snapshot: one folded
 *  line, in the chrome every other folded step already uses — the hairline, a
 *  role label, the quiet tail. These rows ARE machine work standing in for
 *  something you can expand and read, so they read like it; a bordered pill was
 *  the only shape of its kind in the document. */
export class SnippetWidget extends WidgetType {
	constructor(
		readonly run: SnippetRun,
		readonly key: string,
	) {
		super();
	}
	override eq(other: SnippetWidget) {
		return (
			other.key === this.key &&
			other.run.preview === this.run.preview &&
			other.run.lines === this.run.lines &&
			other.run.kind === this.run.kind &&
			other.run.label === this.run.label
		);
	}
	override toDOM() {
		const kind = this.run.kind;
		const root = document.createElement("div");
		root.className = `doc-fold doc-fold-prefix doc-fold-${kind}`;
		root.title =
			kind === "artifact"
				? "What this prompt is about — expand to read"
				: kind === "values"
					? "What the widgets were set to when you sent — expand to read"
					: "Expand snippet";
		const span = document.createElement("span");
		span.className = "doc-role doc-role-menu";
		// A tool call's label is the tool's NAME, so an artifact scope's is the
		// artifact's. The other two have no name and say their kind, the way
		// `thinking` and `output` do.
		span.textContent =
			kind === "artifact" ? this.run.label.split(" — ")[0] || "artifact" : kind === "values" ? "cell values" : "snippet";
		const dots = document.createElement("span");
		dots.className = "doc-role-dots";
		dots.textContent = "⋯";
		span.append(dots);
		const now = document.createElement("span");
		now.className = "doc-fold-now";
		now.textContent =
			kind === "artifact"
				? "editing this"
				: kind === "values"
					? SnippetWidget.#namesOf(this.run.label)
					: this.run.lines > 1
						? `${this.run.preview} — ${this.run.lines} lines`
						: this.run.preview;
		root.append(span, now);
		foldToggleOn(root, this.key);
		return root;
	}
	/** The names beat a kilobyte of JSON, and beat a count: what a reader wants
	 *  off this row is WHICH widgets the page was reporting. A long list needs no
	 *  cap — `.doc-fold-now` is one nowrap line and ellipsizes it. */
	static #namesOf(json: string): string {
		try {
			return Object.keys(JSON.parse(json) as Record<string, unknown>).join(", ");
		} catch {
			return "";
		}
	}

	override ignoreEvent() {
		return true;
	}
}

/** An expanded run's head: the bracket (or the `> [!snippet]` line) reads as a
 *  quiet label and the payload after it stays on the line — the way back, in the
 *  same chrome as an open activity strip. It names the run's OWN kind: every
 *  expanded row used to say "snippet", including the two that are not one. */
export class SnippetLabelWidget extends WidgetType {
	constructor(
		readonly key: string,
		readonly kind: SnippetKind,
	) {
		super();
	}
	override eq(other: SnippetLabelWidget) {
		return other.key === this.key && other.kind === this.kind;
	}
	override toDOM() {
		const span = document.createElement("span");
		span.className = "doc-role doc-role-menu";
		span.textContent = this.kind === "artifact" ? "artifact" : this.kind === "values" ? "cell values" : "snippet";
		const dots = document.createElement("span");
		dots.className = "doc-role-dots";
		dots.textContent = "⌃";
		span.append(dots);
		span.title = "Collapse";
		foldToggleOn(span, this.key);
		return span;
	}
	override ignoreEvent() {
		return true;
	}
}
