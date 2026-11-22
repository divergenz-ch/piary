// The cell element (integration plan, phase 2): status + output for one
// reactive cell. Source editing stays with the owner — the document editor in
// phase 3, a plain textarea in the demo — this element owns the *output*
// half: a stable root the engine's Inspector renders into, the status rail,
// and the syntax-error banner. Runtime errors need no banner: the engine's
// observer renders them into the root (observablehq--error). Syntax errors
// never reach the runtime — the engine throws and keeps the previous
// definition live, so the old output and the banner show together.
//
// Imports from the engine are type-only on purpose: registering <pi-cell>
// must not drag the transpiler (acorn + lezer) into bundles that never run a
// cell. The engine instance arrives as a property, deep-imported by whoever
// owns the document (piary/dist/notebook/engine.js).
import { html, LitElement, nothing } from "lit";
import { property, state } from "lit/decorators.js";
import type { CellMode, NotebookEngine } from "../notebook/engine.ts";

export class PiCell extends LitElement {
	@property({ attribute: false }) engine: NotebookEngine | null = null;
	@property({ attribute: "cell-id", reflect: true }) cellId = "";
	@property() source = "";
	@property() mode: CellMode = "js";
	/** The cell belongs to an artifact — its output is one part of a whole, and
	 *  the artifact answers "where is it?" for the group. A declaration cell
	 *  inside one therefore shows no headless banner: its names are code, they
	 *  belong in the source, and a banner per declaration turned a six-cell
	 *  artifact into a wall of italic apologies. */
	@property({ type: Boolean }) grouped = false;
	@state() private syntaxError: Error | null = null;

	/** Stable across re-renders: the Inspector appends into this element and
	 *  must never lose it to a template swap. */
	readonly #outputRoot = document.createElement("div");

	#unsubscribe: (() => void) | null = null;
	/** The id this element last defined — so an id change can retract it. */
	#definedId: string | null = null;

	protected override createRenderRoot(): HTMLElement | DocumentFragment {
		return this;
	}

	override connectedCallback(): void {
		super.connectedCallback();
		this.style.display = "block";
		this.#outputRoot.className = "cell-output";
		// Reconnection (the element moves between the document's hidden park
		// and the editor widget) must revive the subscription that
		// disconnectedCallback dropped — `updated` only resubscribes when the
		// engine property changes.
		if (this.engine && !this.#unsubscribe) this.#subscribeEngine();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.#unsubscribe?.();
		this.#unsubscribe = null;
	}

	#subscribeEngine(): void {
		this.#unsubscribe?.();
		this.#unsubscribe =
			this.engine?.subscribe((id) => {
				if (id === this.cellId) this.requestUpdate();
			}) ?? null;
	}

	// willUpdate, not updated: `#run` decides `syntaxError`, which this render
	// shows. Set after the render, it would cost a second one every time a
	// cell's compile result changed.
	override willUpdate(changed: Map<PropertyKey, unknown>): void {
		if (changed.has("engine")) this.#subscribeEngine();
		if (changed.has("engine") || changed.has("cellId") || changed.has("source") || changed.has("mode")) {
			this.#run();
		}
	}

	#run(): void {
		const { engine, cellId } = this;
		if (!engine || !cellId) return;
		if (this.#definedId && this.#definedId !== cellId) engine.removeCell(this.#definedId);
		if (!this.source.trim()) {
			// Empty source is no definition (dependents reject honestly) — and
			// not a syntax error.
			engine.removeCell(cellId);
			this.#definedId = null;
			this.syntaxError = null;
			return;
		}
		try {
			engine.upsertCell(cellId, this.source, { mode: this.mode, root: this.#outputRoot });
			this.#definedId = cellId;
			this.syntaxError = null;
		} catch (error) {
			// Name check, not instanceof — a value import of CellSyntaxError
			// would pull the engine into every bundle (see header).
			if (!(error instanceof Error) || error.name !== "CellSyntaxError") throw error;
			this.syntaxError = error;
			// A cell that does not COMPILE never reaches the runtime, so the
			// engine's observer never fires and the host's failure path never
			// hears about it — the agent got "ok", said "done", and left a red
			// box on the page. That is the error it is most likely to make
			// (wrong dialect, wrong framework), so it is the one that most
			// needs reporting. Mechanism only: WHEN this becomes a report to the
			// agent is the owner's call — it knows whether the turn has finished
			// writing this cell, and this element does not (see
			// `reportSettledSyntaxErrors`). The event is the UI's cue to redraw.
			this.dispatchEvent(new CustomEvent("cell-syntax-error", { bubbles: true, composed: true, detail: { id: cellId } }));
		}
	}

	/** Evaluation status, for whoever frames this cell — an artifact rolls its
	 *  members' up into one dot. Syntax errors never reach the runtime, so they
	 *  are reported here rather than read off the engine. */
	get status(): string {
		return this.syntaxError ? "syntax-error" : (this.engine?.state(this.cellId)?.status ?? "idle");
	}

	/** The compiler's complaint, for whoever decides to report it. */
	get syntaxMessage(): string | null {
		return this.syntaxError?.message ?? null;
	}

	/** Ran, and put nothing on screen — a declaration cell. Legitimate on its
	 *  own (data feeding a display cell); damning for a whole artifact, which is
	 *  why the frame, not the cell, is what acts on it. */
	get displaysNothing(): boolean {
		return this.status === "fulfilled" && this.#outputRoot.childNodes.length === 0;
	}

	override render() {
		const status = this.status;
		const empty = !this.source.trim();
		// A fulfilled cell with an empty output root is a headless declaration
		// cell (notebook-kit only autodisplays pure expressions). Rendering a
		// silent blank made users ask “where is it?” — name what happened.
		const headless =
			!empty &&
			!this.grouped &&
			!this.syntaxError &&
			status === "fulfilled" &&
			this.#outputRoot.childNodes.length === 0;
		const outputs = headless ? (this.engine?.outputs(this.cellId) ?? []) : [];
		// Among several members the frame hides each rail, so an error would
		// say nothing of which cell it came from. The failed one names itself,
		// in the words the run's chip uses.
		const failed = this.grouped && !empty && (status === "rejected" || status === "syntax-error");
		return html`
			<div class="cell-frame" data-status=${status}>
				<div class="cell-rail">
					<span class="cell-status-dot"></span>
					<span class="cell-mode">${this.mode}</span>
					${this.cellId ? html`<span class="cell-id">#${this.cellId}</span>` : nothing}
				</div>
				${failed ? html`<div class="cell-failed">cell #${this.cellId}</div>` : nothing}
				${empty ? html`<div class="cell-empty">Empty cell — add code and it runs.</div>` : this.#outputRoot}
				${headless
					? html`<div class="cell-headless">
							${outputs.length
								? html`defines <code>${outputs.join(", ")}</code> — nothing displayed`
								: html`ran — nothing displayed`}
							(reference it from an expression cell or call display())
						</div>`
					: nothing}
				${this.syntaxError ? html`<pre class="cell-syntax-error">${this.syntaxError.message}</pre>` : nothing}
			</div>
		`;
	}
}

if (!customElements.get("pi-cell")) {
	customElements.define("pi-cell", PiCell);
}
