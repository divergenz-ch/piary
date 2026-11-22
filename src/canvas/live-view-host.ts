// The live views one canvas has open, and their lifecycle.
//
// A live view is the CHANGING kind of element — a terminal, and whatever
// streams next — behind `write`/`settle`/`dispose` (ADR 0013). This module owns
// the set of them: opening one, looking one up, publishing the set into the
// editor so the decoration builder can mount it, and reaping the ones whose
// marker has left the document.
//
// Extracted from `DocumentChat` behaviour-preservingly (ADR 0009): it was a
// state cluster with its own method family, and it could leave because it talks
// outward only through events and one state effect. It holds no reference back
// to the element.

import { getLiveView, type LiveView } from "../document/live-views.ts";

/** What the host needs from the canvas, and the whole of what it needs. */
export interface LiveViewDeps {
	/** Dispatches on the element, so the page hears it. */
	emit: (event: Event) => void;
	/** Pushes the element map into the editor. Called when the SET changes. */
	publish: (els: Map<string, HTMLElement>) => void;
	/** The ids whose markers are currently in the document. */
	presentIds: () => Set<string> | null;
	/** Asks the editor to re-measure, for a view that changed size. */
	measure: () => void;
	/** Returns focus to the document. */
	focusEditor: () => void;
}

export class LiveViewHost {
	readonly #views = new Map<string, LiveView>();
	readonly #deps: LiveViewDeps;

	constructor(deps: LiveViewDeps) {
		this.#deps = deps;
	}

	/** How many are open. The reap path short-circuits on zero. */
	get size(): number {
		return this.#views.size;
	}

	/**
	 * Opens the named live view for `id`, or returns the one already open.
	 *
	 * `interactive` is the KIND of panel, not a permission: an agent's `bash`
	 * output is read-only so nothing can reach a running tool's stdin, while a
	 * `/terminal` takes input (ADR 0013).
	 */
	open(name: string, id: string, interactive = false): LiveView | null {
		const existing = this.#views.get(id);
		if (existing) return existing;
		const factory = getLiveView(name);
		if (!factory) return null;
		const view = factory(id, {
			interactive,
			send: (message) =>
				this.#deps.emit(
					new CustomEvent("live-view-send", { detail: { id, message }, bubbles: true, composed: true }),
				),
			measure: () => this.#deps.measure(),
			focusEditor: () => this.#deps.focusEditor(),
		});
		this.#views.set(id, view);
		this.#publish();
		return view;
	}

	/**
	 * The live view for `id`, if one is open.
	 *
	 * The write path: a producer looks the view up and calls `write` on it,
	 * which touches no editor state (live-views.ts rule 2) and so costs nothing
	 * per chunk.
	 */
	get(id: string): LiveView | null {
		return this.#views.get(id) ?? null;
	}

	/**
	 * Disposes every live view whose MARKER has left the document, and
	 * publishes the rest.
	 *
	 * Marker presence, not payload parseability, is the test — the same rule the
	 * cell retraction learned the hard way: a fence is unclosed for as long as it
	 * takes to type its second delimiter, and reading that as "the view left"
	 * would dispose a running terminal mid-keystroke (live-views.ts rule 5).
	 */
	reap(): void {
		if (!this.#views.size) return;
		const present = this.#deps.presentIds();
		if (!present) return;
		let changed = false;
		for (const [id, live] of this.#views) {
			if (present.has(id)) continue;
			live.dispose();
			this.#views.delete(id);
			// `dispose` releases what the BROWSER holds; it cannot reach the
			// producer, which may be a process in the bridge and whose transport the
			// view does not know. So the owner that disposes announces it, and the
			// page stops whatever was feeding the view — without this a terminal's
			// shell outlived its panel and ran on with nobody reading it.
			this.#deps.emit(new CustomEvent("live-view-closed", { detail: { id }, bubbles: true, composed: true }));
			changed = true;
		}
		if (changed) this.#publish();
	}

	/** Pushes the current element map into the editor. */
	#publish(): void {
		const els = new Map<string, HTMLElement>();
		for (const [id, view] of this.#views) els.set(id, view.el);
		this.#deps.publish(els);
	}
}
