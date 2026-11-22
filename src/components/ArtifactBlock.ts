// The artifact element: one frame around the cells that read as a single thing.
//
// An artifact is derived, never declared as a segment — `artifactsFrom`
// (src/document/cells.ts) groups an explicit `@group` or a run of cells in one
// block, and anchors the frame under that turn's answer. This element is the
// arrangement only: it owns no cell, no source, and no engine. The <pi-cell>
// output roots and the source editors are long-lived objects the document
// hands it, so folding the source, scrolling the frame out of the viewport, or
// re-deriving the artifact never restarts a running cell or drops a half-typed
// edit.
//
// It wears the document's chrome, not its own: the same hairline rule down the
// left that every other block has, and the same small uppercase role label that
// folds when you click it. An artifact is a block like the rest of the page —
// a card with tabs said it was a different kind of thing, and it is not.
import { html, LitElement, nothing } from "lit";
import { property } from "lit/decorators.js";
import type { PiCell } from "./CellBlock.ts";
import type { CellEditor } from "./CellEditor.ts";
import { SOURCE_TOGGLE } from "./editor-widgets.ts";

/** What a run is doing to one of this artifact's cells (`CellChip` in
 *  DocumentChat.ts, which hands it in). */
export interface ArtifactActivity {
	id: string;
	text: string;
	tone: "working" | "done" | "warning" | "error";
	/** The faint wash over the artifact, the host's to switch. */
	pulse?: boolean;
}

export interface ArtifactMember {
	id: string;
	mode: string;
	/** The live output half — the same element across re-derivations. */
	cell: PiCell;
	/** The live source half. Absent until the source is first unfolded: an
	 *  artifact nobody has read the code of should not build editors. */
	editor: CellEditor | null;
}

export class PiArtifact extends LitElement {
	/** Members in document order. */
	@property({ attribute: false }) members: ArtifactMember[] = [];
	/** The role label, in the document's own vocabulary: `cell @weather`,
	 *  `cell`, or `7 cells` for a run nobody grouped. */
	@property() label = "";
	/** Superseded definitions still in the document — history, not members. */
	@property({ type: Number }) history = 0;
	/** The document's fold key for this artifact. Folding rides the same state
	 *  every other fold does, so it persists and behaves identically. */
	@property() foldKey = "";
	/** The user toggled this artifact's source away from its default. Folds live
	 *  in the editor's state, so the document owns this bit and pushes it in. */
	@property({ type: Boolean }) sourceToggled = false;
	/** Asks the document to build the editors the source needs. */
	@property({ attribute: false }) onWantCode: (() => void) | null = null;
	/** Shows the whole artifact as the plain fences it is in the file. */
	@property({ attribute: false }) onShowSource: (() => void) | null = null;
	/** Edit mode: the panes are writable and their keystrokes are BUFFERED —
	 *  nothing reaches the document or the engine until Apply. The whole artifact
	 *  enters and leaves together, because its members are one graph: committing
	 *  them one at a time would hand the engine a half-migrated set of cells. */
	@property({ type: Boolean, reflect: true }) editing = false;
	/** Members whose buffer differs from the document. */
	@property({ attribute: false }) dirty: ReadonlySet<string> = new Set();
	@property({ attribute: false }) onEdit: (() => void) | null = null;
	@property({ attribute: false }) onApply: (() => void) | null = null;
	@property({ attribute: false }) onDiscard: (() => void) | null = null;
	/** Asks pi to fix the failing member, as a prompt under the artifact. */
	@property({ attribute: false }) onFix: (() => void) | null = null;
	/** Opens a prompt under the artifact for the writer to say what to change. */
	@property({ attribute: false }) onChange: (() => void) | null = null;
	/** A turn is running: asking pi now would be a second prompt, so the two
	 *  asks are dead until it ends. */
	@property({ type: Boolean }) busy = false;
	/** What the run is doing to a member, shown at the top of the artifact in
	 *  its tone's colour; null shows nothing. */
	@property({ attribute: false }) activity: ArtifactActivity | null = null;

	/**
	 * The run is working on a member: everything here but the chip is `inert`,
	 * so no click, key or focus reaches an output the run is about to replace,
	 * a source it is rewriting, or the controls over them (ADR 0054). It holds
	 * for as long as the chip is `working`, and never past the turn: `busy`
	 * falling opens it whatever the chip still says. The host's `pulse` is the
	 * wash alone and decides nothing here.
	 */
	get locked(): boolean {
		return this.busy && this.activity?.tone === "working";
	}

	protected override createRenderRoot(): HTMLElement | DocumentFragment {
		return this;
	}

	/** Last rendered openness, and the member ids the editors have been asked
	 *  for. `onWantCode` hands back a fresh `members` array, which is itself an
	 *  update — so something has to stop this asking forever, and the edge alone
	 *  used to do it. The edge alone was also the bug: a cell added to an artifact
	 *  whose pane was ALREADY open never triggered a build, so it rendered the
	 *  pending placeholder for good. Asking once per id terminates for the same
	 *  reason the edge did, and covers the members that arrive later. */
	#wasOpen = false;
	readonly #asked = new Set<string>();

	/**
	 * Folded by default: an artifact reads as its output, and the label says
	 * where the code went.
	 *
	 * A broken one opens itself. A red string with the source hidden behind a
	 * click is an artifact concealing the evidence for its own failure — which
	 * is exactly how a page full of unparseable React managed to look like
	 * nothing at all. Errors starting open is the rule the rest of the document
	 * already follows.
	 *
	 * Edit mode holds it open regardless. A status change closing the pane out
	 * from under an unsaved buffer would hide the text and leave no way back to
	 * it.
	 */
	get open(): boolean {
		return this.editing || this.sourceToggled || this.#status === "rejected";
	}

	// willUpdate, not updated: asking for code makes the host hand the members
	// their editors, which this render shows. Asked after the render, every
	// opening would cost a second one.
	override willUpdate(): void {
		if (!this.open) {
			// Folding away is a clean slate: reopening rebuilds whatever is missing.
			this.#wasOpen = false;
			this.#asked.clear();
			return;
		}
		const missing = this.members.some((m) => !m.editor && !this.#asked.has(m.id));
		if (!this.#wasOpen || missing) {
			for (const m of this.members) this.#asked.add(m.id);
			this.#wasOpen = true;
			this.onWantCode?.();
		}
	}

	#toggle(): void {
		if (!this.foldKey) return;
		this.dispatchEvent(new CustomEvent("fold-toggle", { detail: { key: this.foldKey }, bubbles: true, composed: true }));
	}

	/** The artifact's status is the worst of its members': one rejected cell
	 *  makes the whole artifact wrong, and a pending one makes it not-yet-right.
	 *  It colours the rule — the same one dot's worth of information the cell
	 *  rail used to carry, without a dot. */
	get #status(): string {
		let seen = "idle";
		for (const m of this.members) {
			const s = m.cell.status;
			if (s === "rejected" || s === "syntax-error") return "rejected";
			if (s === "pending") seen = "pending";
			else if (seen !== "pending" && s === "fulfilled") seen = "fulfilled";
		}
		return seen;
	}

	/** Swallows the click before it reaches the role label (which folds) or the
	 *  outer editor (which would put the caret in the prose). */
	#act(run: (() => void) | null) {
		return (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			run?.();
		};
	}

	override render() {
		const open = this.open;
		const dirty = this.dirty.size;
		const locked = this.locked;
		return html`
			<div
				class="artifact"
				data-status=${this.#status}
				?data-editing=${this.editing}
				?data-locked=${locked}
				?data-pulse=${this.activity?.pulse === true}
			>
				${this.activity
					? html`<div class="artifact-activity" data-tone=${this.activity.tone}>
							<span class="artifact-activity-dot"></span>cell #${this.activity.id} · ${this.activity.text}
						</div>`
					: nothing}
				<div class="artifact-output" ?inert=${locked}>${this.members.map((m) => m.cell)}</div>
				<div class="artifact-source-head" ?inert=${locked}>
					<span
						class="doc-role doc-role-menu"
						title=${open ? "Collapse source" : "Show source"}
						@click=${() => this.#toggle()}
						>${this.label}${open ? nothing : html`<span class="doc-role-dots">⋯</span>`}</span
					>
					${this.#asks()} ${open ? this.#actions(dirty) : nothing}
					${this.onShowSource
						? html`<button
								type="button"
								class="doc-view-toggle"
								title=${SOURCE_TOGGLE.markdown.title}
								@click=${this.#act(this.onShowSource)}
							>
								${SOURCE_TOGGLE.markdown.text}
							</button>`
						: nothing}
				</div>
				${open
					? html`<div class="artifact-code" ?inert=${locked}>
							${this.members.map(
								(m) => html`<div class="artifact-code-row ${this.dirty.has(m.id) ? "is-dirty" : ""}">
									<span class="artifact-code-name"
										>${m.mode} <span class="artifact-code-id">#${m.id}</span
										>${this.dirty.has(m.id) ? html`<span class="artifact-code-dirty" title="Unsaved">●</span>` : nothing}</span
									>
									${m.editor ? m.editor.dom : html`<div class="artifact-code-pending">…</div>`}
								</div>`,
							)}
							${this.history
								? html`<div class="artifact-history">
										${this.history} earlier ${this.history === 1 ? "definition" : "definitions"} above, kept as history
									</div>`
								: nothing}
						</div>`
					: nothing}
			</div>
		`;
	}

	/** The two ways to ask pi about this artifact: fix, only while a member is
	 *  failing, and change, always. Not while editing — the buffer is the
	 *  writer's, and a prompt about it would describe text pi cannot see. */
	#asks() {
		if (this.editing) return nothing;
		const why = this.busy ? "Wait for the running turn to finish" : null;
		return html`${this.onFix && this.#status === "rejected"
			? html`<button type="button" class="artifact-ask artifact-fix" ?disabled=${this.busy} title=${why ?? "Ask pi to fix the failing cell"} @click=${this.#act(this.onFix)}>
					fix
				</button>`
			: nothing}${this.onChange
			? html`<button type="button" class="artifact-ask artifact-change" ?disabled=${this.busy} title=${why ?? "Tell pi what to change in this artifact"} @click=${this.#act(this.onChange)}>
					change…
				</button>`
			: nothing}`;
	}

	/** Idle offers the mode; editing offers the two ways out of it. Apply is dead
	 *  while nothing has changed — there is no such thing as an empty commit. */
	#actions(dirty: number) {
		if (!this.editing)
			return this.onEdit
				? html`<button type="button" class="artifact-edit" title="Edit this artifact's source" @click=${this.#act(this.onEdit)}>
						✎ edit
					</button>`
				: nothing;
		return html`<span class="artifact-edit-actions">
			<button
				type="button"
				class="artifact-apply"
				?disabled=${!dirty}
				title=${dirty ? `Write ${dirty} changed ${dirty === 1 ? "cell" : "cells"} to the document` : "Nothing changed"}
				@click=${this.#act(this.onApply)}
			>
				Apply
			</button>
			<button
				type="button"
				class="artifact-discard"
				title=${dirty ? "Throw the unsaved edits away" : "Leave edit mode"}
				@click=${this.#act(this.onDiscard)}
			>
				Discard
			</button>
		</span>`;
	}
}

if (!customElements.get("pi-artifact")) {
	customElements.define("pi-artifact", PiArtifact);
}
