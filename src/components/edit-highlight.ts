// What a canvas edit shows of itself (ADR 0067). pi changes prose anywhere in
// the document (ADR 0033), often far from where the reader is, so the changed
// text is lit for a moment once it is in view, and until then a link pinned to
// the edge of the scroller says there is a change above or below and goes to it.
//
// Its own field of marks, mapped through every edit like the run badge's
// anchor. Nothing here is document text: a mark is a decoration and a link is
// an element of the editor's frame.
import { type EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { placeRunBadge } from "./run-badge.ts";

/** How long changed text stays lit: long enough to find on a page the eye was
 *  not resting on, short enough to be gone before the next sentence is read. */
export const EDIT_LIT_MS = 2400;

interface EditMark {
	id: number;
	from: number;
	to: number;
	/** The edit left no text of its own: the line it was taken from is lit. */
	removal: boolean;
	/** Which lighting this is, so lighting it again restarts the fade; 0 while
	 *  it waits to be seen. */
	lit: number;
}

/** pi changed `from`..`to`, as the document now stands; `removal` when what it
 *  put there is no text to read. */
export const noteEdit = StateEffect.define<{ from: number; to: number; removal: boolean }>();
/** Another document is being opened: its marks are not this one's. */
export const clearEdits = StateEffect.define<null>();
const lightEdits = StateEffect.define<readonly number[]>();
const dimEdits = StateEffect.define<readonly number[]>();

let lastId = 0;
let lastLighting = 0;

const editMarksField = StateField.define<readonly EditMark[]>({
	create: () => [],
	update(marks, tr) {
		if (tr.docChanged && marks.length) {
			// An edit the user took back is no change to point at.
			const undone = tr.isUserEvent("undo") || tr.isUserEvent("redo");
			marks = marks
				.filter((mark) => !(undone && tr.changes.touchesRange(mark.from, mark.to)))
				// Inward on both sides, so text typed against the edit is not the edit.
				.map((mark) => {
					const from = tr.changes.mapPos(mark.from, 1);
					return { ...mark, from, to: Math.max(from, tr.changes.mapPos(mark.to, -1)) };
				})
				.filter((mark) => mark.removal || mark.to > mark.from);
		}
		for (const e of tr.effects) {
			// A link is about the run that made the edit: the next run starts with none.
			if (e.is(placeRunBadge) || e.is(clearEdits)) marks = [];
			else if (e.is(noteEdit)) marks = [...marks, { id: ++lastId, ...e.value, lit: 0 }];
			else if (e.is(lightEdits)) {
				const lighting = ++lastLighting;
				marks = marks.map((mark) => (e.value.includes(mark.id) ? { ...mark, lit: lighting } : mark));
			} else if (e.is(dimEdits)) marks = marks.filter((mark) => !e.value.includes(mark.id));
		}
		return marks;
	},
	provide: (f) => EditorView.decorations.compute([f], (state) => decorations(state, state.field(f))),
});

function decorations(state: EditorState, marks: readonly EditMark[]): DecorationSet {
	const ranges = marks
		.filter((mark) => mark.lit)
		.map((mark) => {
			// The lighting's number is an attribute, so a mark lit a second time is
			// a new element and its fade starts over.
			const attributes = { "data-lit": String(mark.lit), style: `--doc-edit-lit-ms: ${EDIT_LIT_MS}ms` };
			if (!mark.removal) return Decoration.mark({ class: "doc-edit-lit", attributes }).range(mark.from, mark.to);
			return Decoration.line({ class: "doc-edit-lit-line", attributes }).range(seamLine(state, mark.from));
		});
	return Decoration.set(ranges, true);
}

/** The line a removal is shown on: the one it was taken from, or, where that
 *  is left blank (a block went whole, ADR 0065), the first line with text
 *  under it, else the last above. */
function seamLine(state: EditorState, pos: number): number {
	const doc = state.doc;
	const at = doc.lineAt(Math.min(pos, doc.length));
	for (let n = at.number; n <= doc.lines; n++) if (doc.line(n).text.trim()) return doc.line(n).from;
	for (let n = at.number - 1; n >= 1; n--) if (doc.line(n).text.trim()) return doc.line(n).from;
	return at.from;
}

/** Where something drawn from `top` to `bottom` is, against what a scroller
 *  shows between `viewTop` and `viewBottom`. Judged by its middle: half a line
 *  is enough to read a highlight by. A scroller with no height is not laid out
 *  and hides nothing. */
export type Sight = "above" | "in" | "below";
export function sightOf(top: number, bottom: number, viewTop: number, viewBottom: number): Sight {
	if (viewBottom <= viewTop) return "in";
	const middle = (top + bottom) / 2;
	return middle < viewTop ? "above" : middle > viewBottom ? "below" : "in";
}

const SIDES = ["above", "below"] as const;
type Side = (typeof SIDES)[number];
const ARROW: Record<Side, string> = { above: "↑", below: "↓" };

/** The marks waiting to be seen and where each is now. */
type Waiting = ReadonlyArray<{ mark: EditMark; sight: Sight }>;

/**
 * Lights a mark once it is in view, takes it away when its time is up, and
 * keeps the two links: what waits above and what waits below.
 *
 * The scroller's `scroll` is listened to directly because a scroll that brings
 * no new lines into CodeMirror's viewport is no update of the view.
 */
const editSight = ViewPlugin.fromClass(
	class {
		readonly #view: EditorView;
		readonly #links: Record<Side, HTMLButtonElement>;
		readonly #timers = new Set<ReturnType<typeof setTimeout>>();
		#gone = false;

		constructor(view: EditorView) {
			this.#view = view;
			this.#links = { above: this.#link("above"), below: this.#link("below") };
			view.scrollDOM.addEventListener("scroll", this.#look, { passive: true });
			this.#look();
		}

		update(update: ViewUpdate): void {
			const changed = update.startState.field(editMarksField) !== update.state.field(editMarksField);
			if (changed || update.geometryChanged || update.viewportChanged) this.#look();
		}

		destroy(): void {
			this.#gone = true;
			this.#view.scrollDOM.removeEventListener("scroll", this.#look);
			for (const timer of this.#timers) clearTimeout(timer);
			for (const side of SIDES) this.#links[side].remove();
		}

		#link(side: Side): HTMLButtonElement {
			const link = document.createElement("button");
			link.type = "button";
			link.className = `doc-edit-jump doc-edit-jump-${side}`;
			link.hidden = true;
			// A press that took the focus would take the caret out of the prompt.
			link.addEventListener("mousedown", (event) => event.preventDefault());
			link.addEventListener("click", () => this.#go(side));
			this.#view.dom.append(link);
			return link;
		}

		#waiting(): Waiting {
			const view = this.#view;
			const frame = view.scrollDOM.getBoundingClientRect();
			return view.state
				.field(editMarksField)
				.filter((mark) => !mark.lit)
				.map((mark) => {
					const block = view.lineBlockAt(Math.min(mark.from, view.state.doc.length));
					const top = view.documentTop + block.top;
					return { mark, sight: sightOf(top, top + block.height, frame.top, frame.bottom) };
				});
		}

		readonly #look = (): void => {
			if (this.#gone) return;
			// Nothing to look for and nothing shown: most scrolls of most documents.
			if (!this.#view.state.field(editMarksField).length && SIDES.every((side) => this.#links[side].hidden)) return;
			this.#view.requestMeasure({
				key: this,
				read: () => this.#waiting(),
				write: (waiting) => {
					for (const side of SIDES) {
						const count = waiting.filter((w) => w.sight === side).length;
						const link = this.#links[side];
						link.hidden = count === 0;
						link.textContent = count > 1 ? `${count} changes ${side} ${ARROW[side]}` : `changed ${side} ${ARROW[side]}`;
					}
					const seen = waiting.filter((w) => w.sight === "in").map((w) => w.mark.id);
					// A measure is no place to dispatch from: once it is over.
					if (seen.length) queueMicrotask(() => this.#light(seen));
				},
			});
		};

		/** Goes to the change nearest the reader on `side`. Scrolls and moves no
		 *  caret: the caret says which prompt is meant. */
		#go(side: Side): void {
			const there = this.#waiting()
				.filter((w) => w.sight === side)
				.map((w) => w.mark);
			const mark = side === "above" ? there.at(-1) : there[0];
			if (mark) this.#light([mark.id], [EditorView.scrollIntoView(mark.from, { y: "center" })]);
		}

		#light(ids: readonly number[], also: readonly StateEffect<unknown>[] = []): void {
			if (this.#gone) return;
			this.#view.dispatch({ effects: [lightEdits.of(ids), ...also] });
			const timer = setTimeout(() => {
				this.#timers.delete(timer);
				this.#view.dispatch({ effects: dimEdits.of(ids) });
			}, EDIT_LIT_MS);
			this.#timers.add(timer);
		}
	},
);

/** The marks of pi's edits, and what lights them and links to them. */
export const editHighlight: Extension = [editMarksField, editSight];
