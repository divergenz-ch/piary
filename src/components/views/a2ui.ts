// The `a2ui` view template: an A2UI v1.0 surface the agent composed from
// Piary's catalog (document-format.md §views). The template returns a cheap
// element at once and renders into it only while it is in the page: a view's
// template runs on every decoration rebuild, and most of what it returns is
// thrown away unmounted, so nothing that must be disposed is made before the
// element is connected. The renderer itself (`a2ui-surface.ts`) is loaded on
// the first connect, which keeps `lit` and `@a2ui/*` out of this module — it is
// imported wherever the view registry is, plain node included.
import type { ViewContext } from "../../document/views.ts";

const TAG = "piary-a2ui";
/** Each block has a processor of its own, so one surface id serves every block. */
const SURFACE_ID = "view";

interface A2uiHost extends HTMLElement {
	payload: unknown;
}

/** Defines `<piary-a2ui>` on first use: `HTMLElement` exists only in a page. */
function defineHost(): void {
	if (customElements.get(TAG)) return;
	customElements.define(
		TAG,
		class extends HTMLElement implements A2uiHost {
			payload: unknown;
			#dispose: (() => void) | null = null;
			/** Bumped on every connect and disconnect, so a renderer that finishes
			 *  loading after the element left (or left and came back) mounts once. */
			#generation = 0;
			connectedCallback() {
				const generation = ++this.#generation;
				import("./a2ui-surface.js").then(
					({ mountA2ui }) => {
						if (generation !== this.#generation || this.#dispose) return;
						this.#dispose = mountA2ui(this, this.payload, SURFACE_ID);
					},
					(error: unknown) => {
						if (generation !== this.#generation) return;
						this.setAttribute("data-answer-ui-error", "");
						this.textContent = `The A2UI renderer did not load: ${error instanceof Error ? error.message : String(error)}`;
					},
				);
			}
			disconnectedCallback() {
				this.#generation++;
				this.#dispose?.();
				this.#dispose = null;
			}
		},
	);
}

/**
 * The view's element. A call the `view` tool refused is the agent's attempt,
 * not its answer — the reason is in its error result below, and what it sent
 * next is the answer — so it renders as one quiet line rather than as an error
 * standing in the answer.
 */
export function renderA2ui(data: unknown, view?: ViewContext): HTMLElement {
	if (view?.refused) {
		const note = document.createElement("div");
		note.className = "doc-view-a2ui-quiet doc-view-a2ui-refused";
		note.textContent = "Refused before it was shown — the reason is in the result below.";
		return note;
	}
	if (view?.pending) {
		// A part of a surface is not one the catalog can judge: a root naming
		// children still on their way is refused as dangling.
		const note = document.createElement("div");
		note.className = "doc-view-a2ui-quiet";
		note.textContent = "Composing…";
		return note;
	}
	defineHost();
	const host = document.createElement(TAG) as A2uiHost;
	host.className = "doc-view-a2ui piary-a2ui";
	host.setAttribute("data-answer-ui", "");
	host.payload = data;
	return host;
}
