// A cell's source editor: one small CodeMirror inside the artifact's code pane.
//
// Why nest an editor at all, when the fence is already text in the outer
// buffer? Because an artifact gathers cells that were authored turns apart —
// their fences are scattered through the transcript, and no decoration can move
// text. The code pane shows them together; this is the editor that makes them
// editable there. The document is still the store: every keystroke here becomes
// a change over that cell's fence range in the outer document, and nothing is
// kept on this side.
//
// Two rules keep the nesting from turning into two editors fighting:
//
//  1. **Undo belongs to whoever owns the text.** Idle, this editor writes every
//     keystroke straight to the document, so the document's history is the only
//     honest one: Mod-Z delegates outward and a local stack would let you step
//     the code back to a state the document never had. In edit mode the
//     keystrokes are BUFFERED — they are not in the document — so delegating
//     outward would undo something the user did not do. Edit mode therefore
//     switches a `history()` in, and Apply/Discard switches it back out, which
//     drops that stack: by then the document owns the change, as one step.
//  2. **Writes are one-directional at a time.** `setSource` marks its own
//     dispatch, so the change it makes cannot echo back out as a user edit.
import { defaultKeymap, history, indentWithTab, redo, undo } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { DocCellMode } from "../document/cells.ts";
import { CODE_TAGS } from "./code-highlight.ts";

const codeHighlight = HighlightStyle.define(CODE_TAGS);

export interface CellEditorOptions {
	source: string;
	mode: DocCellMode;
	/** The user typed: write this straight through to the cell's fence. */
	onChange: (source: string) => void;
	/** Mod-Z on an idle pane undoes the document, not the cell — see rule 1.
	 *  In edit mode the local history answers instead and these are not called. */
	onUndo: () => void;
	onRedo: () => void;
	/** The outer view has to re-measure: this block just changed height. */
	onResize: () => void;
}

/** Language support per cell mode. Loaded on demand and applied through a
 *  compartment — the JS parser is not small, and a `md` or `tex` cell must not
 *  drag it in. Modes with no entry stay plain text, which is honest. */
const LANGUAGE: Partial<Record<DocCellMode, () => Promise<unknown>>> = {
	js: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
	ojs: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
	ts: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true, typescript: true })),
};

export class CellEditor {
	readonly dom: HTMLElement;
	/** Harness seam (ADR 0008): the suite types into the real inner EditorView. */
	readonly view: EditorView;
	readonly #language = new Compartment();
	/** Idle panes are read-only: the source is there to be read, and editing it
	 *  is a mode you enter deliberately. */
	readonly #editable = new Compartment();
	/** Empty except in edit mode — see rule 1. */
	readonly #localHistory = new Compartment();
	#editing = false;
	/** True while `setSource` is dispatching — see rule 2. */
	#writing = false;
	/** The last text this editor sent to the document. Anything else the
	 *  document holds came from somewhere else — an undo, the agent redefining
	 *  the cell, a branch switch — and this editor has to adopt it. */
	#written: string;
	#mode: DocCellMode;
	#loaded: DocCellMode | null = null;
	/** The document's text for this cell, as this editor last saw it. In edit
	 *  mode the buffer drifts from it, and the difference is what `isDirty`
	 *  reports and what Apply commits. */
	#base: string;

	readonly #options: CellEditorOptions;

	constructor(options: CellEditorOptions) {
		this.#options = options;
		this.#mode = options.mode;
		this.#written = options.source;
		this.#base = options.source;
		this.dom = document.createElement("div");
		this.dom.className = "artifact-code-editor";
		// The outer editor's own handlers live on ITS `contentDOM`, which is an
		// ancestor of this one — so every mousedown and keystroke in here bubbles
		// straight into the document editor, which puts the caret back in the
		// prose and runs the document's keymap (⌘⏎ would send the page). A
		// widget's `ignoreEvent` only excuses plugin handlers; the view's built-in
		// ones are not plugins. Cut the events at the boundary instead.
		for (const type of ["pointerdown", "mousedown", "mouseup", "click", "keydown", "keypress", "beforeinput", "input", "compositionstart", "dragstart"])
			this.dom.addEventListener(type, (event) => event.stopPropagation());
		this.view = new EditorView({
			parent: this.dom,
			state: EditorState.create({
				doc: options.source,
				extensions: [
					this.#language.of([]),
					this.#editable.of(EditorView.editable.of(false)),
					this.#localHistory.of([]),
					syntaxHighlighting(codeHighlight),
					keymap.of([
						// Bound ahead of defaultKeymap (which carries no history
						// bindings of its own), so these decide where undo goes.
						{ key: "Mod-z", run: (v) => (this.#editing ? undo(v) : (options.onUndo(), true)), preventDefault: true },
						{ key: "Mod-Shift-z", run: (v) => (this.#editing ? redo(v) : (options.onRedo(), true)), preventDefault: true },
						{ key: "Mod-y", run: (v) => (this.#editing ? redo(v) : (options.onRedo(), true)), preventDefault: true },
						...defaultKeymap,
						indentWithTab,
					]),
					EditorView.lineWrapping,
					EditorView.updateListener.of((update) => {
						if (update.docChanged && !this.#writing) {
							this.#written = update.state.doc.toString();
							options.onChange(this.#written);
						}
						if (update.heightChanged) options.onResize();
					}),
				],
			}),
		});
		void this.#loadLanguage();
	}

	/**
	 * Document → editor. Two no-ops guard the round trip: the text already
	 * agrees, or the document is simply echoing what this editor last wrote (the
	 * sync is debounced, so mid-typing it hands back a snapshot two keystrokes
	 * old — adopting that would rewind the writer's own text under the caret).
	 *
	 * Focus is deliberately NOT a guard. Mod-Z in this editor undoes the
	 * document; the undo then has to arrive back here, focused or not, or the
	 * two texts silently diverge — and the one on screen would be the wrong one.
	 */
	setSource(source: string): void {
		// The document holds this now, whether or not the view has to change: it
		// is the text an edit would be measured against from here on.
		this.#base = source;
		const current = this.view.state.doc.toString();
		if (source === current || source === this.#written) return;
		this.#written = source;
		this.#writing = true;
		try {
			const head = Math.min(this.view.state.selection.main.head, source.length);
			this.view.dispatch({
				changes: { from: 0, to: current.length, insert: source },
				selection: { anchor: head },
			});
		} finally {
			this.#writing = false;
		}
	}

	/**
	 * Enter or leave edit mode: the pane becomes writable and grows an undo stack
	 * of its own, and loses both on the way out — see rule 1. The text is left
	 * alone either way, because by then Apply has already written it or Discard
	 * is about to call `reset`.
	 */
	setEditing(on: boolean): void {
		if (on === this.#editing) return;
		this.#editing = on;
		this.view.dispatch({
			effects: [
				this.#editable.reconfigure(EditorView.editable.of(on)),
				// Emptying the compartment removes the history state field, and the
				// buffer's undo stack goes with it. That is the point: what it
				// recorded was never in the document.
				this.#localHistory.reconfigure(on ? history() : []),
			],
		});
	}

	/** The buffer has drifted from the document text this pane is based on. */
	isDirty(): boolean {
		return this.view.state.doc.toString() !== this.#base;
	}

	/** What the pane holds: the buffer in edit mode, the document's text idle. */
	text(): string {
		return this.view.state.doc.toString();
	}

	/** The buffer has just been written to the document: it is the base from
	 *  here on, so the pane stops reading as dirty without waiting for the
	 *  debounced sync to hand the same text back. */
	commit(): void {
		this.#base = this.view.state.doc.toString();
		this.#written = this.#base;
	}

	/** Throw the buffer away and start again from `source` — Discard, and the
	 *  landing after Apply. Marked as an own write, so the reset cannot leave on
	 *  the way in as a user edit. */
	reset(source: string): void {
		this.#base = source;
		this.#written = source;
		const current = this.view.state.doc.toString();
		if (source === current) return;
		this.#writing = true;
		try {
			this.view.dispatch({
				changes: { from: 0, to: current.length, insert: source },
				selection: { anchor: Math.min(this.view.state.selection.main.head, source.length) },
			});
		} finally {
			this.#writing = false;
		}
	}

	setMode(mode: DocCellMode): void {
		if (mode === this.#mode) return;
		this.#mode = mode;
		void this.#loadLanguage();
	}

	focus(): void {
		this.view.focus();
	}

	/** Whether the writer is in THIS pane — asked by the document before it takes
	 *  focus back at the end of a turn. */
	get hasFocus(): boolean {
		return this.view.hasFocus;
	}

	destroy(): void {
		this.view.destroy();
	}

	async #loadLanguage(): Promise<void> {
		const mode = this.#mode;
		const load = LANGUAGE[mode];
		if (!load) {
			if (this.#loaded !== null) this.view.dispatch({ effects: this.#language.reconfigure([]) });
			this.#loaded = null;
			return;
		}
		const support = await load();
		// The mode changed (or the editor died) while the parser loaded.
		if (this.#mode !== mode) return;
		this.#loaded = mode;
		this.view.dispatch({ effects: this.#language.reconfigure(support as never) });
		this.#options.onResize();
	}
}
