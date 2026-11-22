// The A2UI renderer behind the `a2ui` view, loaded on the first one the page
// shows: `@a2ui/lit` defines its elements when it is imported, and it is the
// heaviest thing a view can need (the notebook engine is loaded the same way).
//
// One MessageProcessor per block, because surface ids are unique per
// processor; it lives as long as the block's element is in the page. Whether a
// payload rendered is read from the processor's refusals, never from whether a
// surface exists: the surface is created before its components are refused, so
// a refused payload leaves an empty one.
import "@a2ui/lit";
import { injectBasicCatalogStyles, MessageProcessor, setMarkdownRenderer, type SurfaceModel } from "@a2ui/web_core/v1_0";
import { Marked } from "marked";
import { a2uiMessages, refusalLine } from "../../document/a2ui.ts";
import { expressionProblems } from "../../document/a2ui-expr.ts";
import { A2UI_VALIDATION, piaryCatalog } from "./a2ui-catalog.ts";

const escapeHtml = (text: string) =>
	text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// A2UI's Text takes "simple Markdown … without HTML, images, or links" and
// inserts what the renderer returns as HTML, so this is where that promise is
// kept: raw HTML is escaped, and a link or an image keeps only its text.
const markdown = new Marked({
	async: false,
	renderer: {
		html: ({ text }) => escapeHtml(text),
		link({ tokens }) {
			return this.parser.parseInline(tokens);
		},
		image: ({ text }) => escapeHtml(text),
	},
});
setMarkdownRenderer((text) => Promise.resolve(markdown.parse(text) as string));
injectBasicCatalogStyles(document);

/** Shows why the payload did not render, in the place it would have. */
function showRefusal(host: HTMLElement, lines: readonly string[]): void {
	host.setAttribute("data-answer-ui-error", "");
	const box = document.createElement("div");
	box.className = "doc-view-a2ui-error";
	const title = document.createElement("strong");
	title.textContent = "This A2UI surface did not render";
	const list = document.createElement("ul");
	for (const line of lines) {
		const item = document.createElement("li");
		item.textContent = line;
		list.append(item);
	}
	box.append(title, list);
	host.append(box);
}

/**
 * Renders the view's payload into `host` as the surface `surfaceId`, or the
 * reasons it was refused. Returns what undoes it: the surface removed and its
 * processor disposed.
 */
export function mountA2ui(host: HTMLElement, data: unknown, surfaceId: string): () => void {
	const clear = () => {
		host.removeAttribute("data-answer-ui-error");
		host.replaceChildren();
	};
	const shaped = a2uiMessages(data, surfaceId);
	if ("problem" in shaped) {
		showRefusal(host, [shaped.problem]);
		return clear;
	}
	// A formula is a string to the processor, so one that would not evaluate is
	// refused here, where it would otherwise draw a blank figure.
	const formulas = expressionProblems(data).map(refusalLine);
	if (formulas.length) {
		showRefusal(host, formulas);
		return clear;
	}
	// Actions reach nothing yet: what a button does in a document is unsettled,
	// and inputs, bindings and the basic functions work without a listener.
	const processor = new MessageProcessor([piaryCatalog], () => {}, { validationConfig: A2UI_VALIDATION });
	let refused: string[];
	try {
		refused = processor.processMessagesWithErrors(shaped.messages as never).map((m) => refusalLine(m.error));
	} catch (error) {
		refused = [error instanceof Error ? error.message : String(error)];
	}
	if (refused.length) {
		processor.dispose();
		showRefusal(host, refused);
		return clear;
	}
	const surface = document.createElement("a2ui-surface") as HTMLElement & { surface?: SurfaceModel };
	surface.surface = processor.getSurface(surfaceId);
	host.append(surface);
	return () => {
		clear();
		processor.dispose();
	};
}
