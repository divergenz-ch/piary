// A conversation drawn for an export that reads without Piary (ADR 0066).
//
// The pure half (`src/document/export-html.ts`) writes the page from the
// document's text. This is what needs a page: the cells are run by the real
// canvas, mounted where nobody sees it, and what they drew is copied out; the
// views are drawn by their own templates; the images are read from the store;
// and the styles are the ones this window draws with.
//
// What is copied out is made inert on the way: no script, no handler, no
// address but one a reader may follow, and every picture as bytes in the file.

import { attachmentsRead, cellStateRead } from "../src/bridge.ts";
import type { DocumentChat } from "../src/components/DocumentChat.ts";
import "../src/components/DocumentChat.ts";
// Registers the `terminal` live view, so the export knows a terminal's view
// for one whose content the document does not hold (ADR 0013).
import "../src/components/TerminalView.ts";
import { attachmentRefs } from "../src/document/bundle.ts";
import { artifactsFrom } from "../src/document/cells.ts";
import { type Drawn, EXPORT_CANVAS, exportBody, exportPage } from "../src/document/export-html.ts";
import { parseDocument } from "../src/document/format.ts";
import { getLiveView } from "../src/document/live-views.ts";
import { getViewTemplate, viewPayload } from "../src/document/views.ts";
import { serveFiles } from "./attachments.ts";
import { nameOf } from "./documents.ts";

/** How long a conversation's cells may take to run before it is exported
 *  with the ones still running said as not drawn. A cell that loads a library
 *  from the network is the slow case. */
const CELLS_BOUND_MS = 20_000;

/** How long the drawing must have stood still to be taken as done, and how
 *  long it may keep changing before it is taken as it is. A view draws itself
 *  after its renderer has loaded, and says nothing when it has. */
const QUIET_MS = 400;
const DRAW_BOUND_MS = 10_000;

/** How long one picture may take to be read before it is left out. */
const PICTURE_BOUND_MS = 5_000;

/** The pictures an `<img>` can show, by the extension the store keeps. */
const PICTURE_MIME: Readonly<Record<string, string>> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
};

/** Elements that have no place in a document nobody runs. */
const DROPPED_TAGS = "script, iframe, object, embed, link, base, meta, template, noscript, video, audio";

/** Styles the exported page has no use for: the editor's, the terminal's, the
 *  math renderer's, and this window's own form. */
const DROPPED_RULES = /\.cm-|\.ͼ|\.xterm|\.katex|\.transfer-|\.export-stage|#print-root|#outcome/;

/** The attribute a copied custom element keeps its name in. */
const WAS = "data-px-was";

/** A selector that styles the page itself, which the exported page styles for
 *  itself. `:root` is not one: the tokens live there. */
const PAGE_RULES = /(^|,)\s*(html|body|main)\b/;

/** A conversation as its export: the whole page, and the part of it that is
 *  the conversation, which this window prints for a PDF. */
export interface Rendered {
	html: string;
	body: string;
	/** The styles `body` is drawn with. */
	css: string;
	/** What the export could not carry, each as the end of a sentence. */
	without: string[];
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Resolves once nothing under `root` has changed for `QUIET_MS`, or the
 *  bound has passed. */
function quiet(root: Node): Promise<void> {
	return new Promise((resolve) => {
		let still: ReturnType<typeof setTimeout>;
		const done = () => {
			clearTimeout(still);
			clearTimeout(bound);
			observer.disconnect();
			resolve();
		};
		const observer = new MutationObserver(() => {
			clearTimeout(still);
			still = setTimeout(done, QUIET_MS);
		});
		observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
		still = setTimeout(done, QUIET_MS);
		const bound = setTimeout(done, DRAW_BOUND_MS);
	});
}

const asDataUrl = (blob: Blob): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error("unreadable"));
		reader.readAsDataURL(blob);
	});

/** The bytes behind `url` as a `data:` url, or null when they cannot be had
 *  in time. */
async function inlined(url: string): Promise<string | null> {
	if (url.startsWith("data:")) return url;
	try {
		const answer = await fetch(url, { signal: AbortSignal.timeout(PICTURE_BOUND_MS) });
		return answer.ok ? await asDataUrl(await answer.blob()) : null;
	} catch {
		return null;
	}
}

/**
 * A copy of `live` that is safe to write into a file and into this window:
 * what a form control holds is written down and the control disabled, a
 * canvas is the picture it shows, a picture is its bytes, and nothing in it
 * can run or reach anywhere but a web or mail address a reader clicks.
 *
 * A custom element is written as a plain one that says what it was (`WAS`),
 * and its name is added to `elements`: left as it is, the copy placed in this
 * window to be printed would become the live element again and draw over
 * itself. A `span`, because an element nothing defines is laid out as one.
 */
async function still(live: Element, elements: Set<string>): Promise<Element> {
	const copy = live.cloneNode(true) as Element;
	const lives = [live, ...live.querySelectorAll("*")];
	const copies = [copy, ...copy.querySelectorAll("*")];
	const pictures: Promise<void>[] = [];
	for (const [i, from] of lives.entries()) {
		const to = copies[i]!;
		if (from instanceof HTMLCanvasElement) {
			const img = document.createElement("img");
			try {
				img.src = from.toDataURL();
				img.width = from.width;
				img.height = from.height;
				img.className = from.className;
				img.style.cssText = from.style.cssText;
				to.replaceWith(img);
			} catch {
				// Drawn from another origin's pixels: the browser will not read it back.
				to.remove();
			}
			continue;
		}
		if (from instanceof HTMLInputElement) {
			if (from.type === "checkbox" || from.type === "radio") to.toggleAttribute("checked", from.checked);
			else if (from.type !== "file" && from.type !== "password") to.setAttribute("value", from.value);
		} else if (from instanceof HTMLTextAreaElement) to.textContent = from.value;
		else if (from instanceof HTMLOptionElement) to.toggleAttribute("selected", from.selected);
		if (from instanceof HTMLInputElement || from instanceof HTMLTextAreaElement || from instanceof HTMLSelectElement || from instanceof HTMLButtonElement)
			to.setAttribute("disabled", "");

		for (const { name, value } of [...to.attributes]) {
			const key = name.toLowerCase();
			if (key.startsWith("on") || key === "inert" || key === "contenteditable" || key === "srcdoc" || key === "srcset" || key === "action" || key === "formaction" || key === "ping") {
				to.removeAttribute(name);
			} else if (key === "href" || key === "xlink:href" || key === "src") {
				const picture = to.localName === "img" || to.localName === "image";
				if (picture) {
					pictures.push(
						inlined(new URL(value, location.href).href).then((data) => {
							if (data === null) to.removeAttribute(name);
							else to.setAttribute(name, data);
						}),
					);
				} else if (!value.startsWith("#") && !/^(https?:\/\/|mailto:)/i.test(value)) to.removeAttribute(name);
			}
		}
	}
	await Promise.all(pictures);
	for (const dropped of copy.querySelectorAll(DROPPED_TAGS)) dropped.remove();
	// Innermost first, so an element is moved with its children already done.
	for (const el of [...copy.querySelectorAll("*")].reverse()) {
		if (!el.localName.includes("-") || el.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
		const plain = document.createElement("span");
		for (const { name, value } of el.attributes) plain.setAttribute(name, value);
		plain.setAttribute(WAS, el.localName);
		plain.append(...el.childNodes);
		el.replaceWith(plain);
		elements.add(el.localName);
	}
	return copy;
}

/** A selector with each custom element in `elements` named as the plain
 *  element `still` wrote it as. */
function plainly(selector: string, elements: ReadonlySet<string>): string {
	let out = selector;
	for (const name of elements) out = out.replace(new RegExp(`(?<![\\w.#\\-"'=\\[:])${name}(?![\\w-])`, "g"), `[${WAS}="${name}"]`);
	return out;
}

/** The text of every style rule this window draws with that an exported page
 *  can use. Nothing in it names a file: a font is left to the reader's own,
 *  and any other address is dropped. */
function exportCss(elements: ReadonlySet<string>): string {
	const out: string[] = [];
	const take = (rules: CSSRuleList): string[] => {
		const kept: string[] = [];
		for (const rule of rules) {
			if (rule instanceof CSSFontFaceRule || rule instanceof CSSImportRule) continue;
			if (rule instanceof CSSStyleRule) {
				if (DROPPED_RULES.test(rule.selectorText) || PAGE_RULES.test(rule.selectorText)) continue;
				// What the canvas styles inside itself, the export shows inside
				// `EXPORT_CANVAS`; what it styles of itself has nothing to hold.
				const selector = rule.selectorText.replace(/document-chat(?=\s)/g, `.${EXPORT_CANVAS}`);
				if (selector.includes("document-chat")) continue;
				kept.push(plainly(selector, elements) + rule.cssText.slice(rule.cssText.indexOf("{")));
			} else if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
				const inner = take(rule.cssRules);
				if (inner.length) kept.push(`${rule instanceof CSSMediaRule ? "@media" : "@supports"} ${rule.conditionText}{${inner.join("")}}`);
			} else kept.push(rule.cssText);
		}
		return kept;
	};
	for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
		try {
			out.push(...take(sheet.cssRules));
		} catch {
			// A sheet from another origin keeps its rules to itself.
		}
	}
	return out.join("\n").replace(/url\((?!\s*["']?data:)[^)]*\)/g, "none");
}

/** The stored pictures `md` shows, as `data:` urls by stored name, and the
 *  names that could not be read. */
async function pictures(md: string): Promise<{ images: Map<string, string>; missing: string[] }> {
	const images = new Map<string, string>();
	const missing: string[] = [];
	await Promise.all(
		attachmentRefs(md).map(async (name) => {
			const mime = PICTURE_MIME[name.slice(name.lastIndexOf(".") + 1).toLowerCase()];
			if (mime === undefined) return;
			try {
				images.set(name, await asDataUrl(new Blob([await attachmentsRead(name)], { type: mime })));
			} catch {
				missing.push(name);
			}
		}),
	);
	return { images, missing };
}

/**
 * Draws the conversation `id`, whose document is `md`, and answers with its
 * export.
 *
 * The canvas is mounted off screen, at a column's width so a chart is as wide
 * as it is in a window, and inert so it takes no focus and no key. Its cells
 * run as they do when the conversation is opened, from the widget state the
 * conversation kept.
 */
export async function renderConversation(id: string, md: string): Promise<Rendered> {
	const { segments } = parseDocument(md);
	const artifacts = artifactsFrom(md, segments);
	const without: string[] = [];

	const stage = document.createElement("div");
	stage.className = "export-stage";
	stage.inert = true;
	stage.setAttribute("aria-hidden", "true");
	const views = document.createElement("div");
	const chat = document.createElement("document-chat") as DocumentChat;
	serveFiles(chat);
	chat.setDocument(md);
	stage.append(chat, views);
	document.body.append(stage);
	try {
		chat.cellState = (await cellStateRead(id).catch(() => null)) ?? null;

		// Every view the canvas would draw with a template, drawn by it.
		const refused = new Set(segments.filter((seg) => seg.kind === "toolResult" && seg.isError).map((seg) => seg.id));
		const viewEls = new Map<string, HTMLElement>();
		const liveViews = new Set<string>();
		for (const seg of segments) {
			if (seg.kind !== "view" || !seg.name || !seg.id) continue;
			if (getLiveView(seg.name)) {
				liveViews.add(seg.name);
				continue;
			}
			const payload = getViewTemplate(seg.name) ? viewPayload(md, seg) : null;
			const body = payload ? getViewTemplate(seg.name)!(payload.data, { refused: refused.has(seg.id), pending: false }) : null;
			if (!body) continue;
			const frame = document.createElement("div");
			frame.className = "doc-view";
			frame.append(body);
			views.append(frame);
			viewEls.set(seg.id, frame);
		}

		const ids = artifacts.flatMap((artifact) => artifact.members.map((cell) => cell.id));
		const [shown] = await Promise.all([pictures(md), Promise.all(ids.map((cell) => chat.cellVerdict(cell, CELLS_BOUND_MS)))]);
		// A widget's kept value is put back after its cell first ran, which runs
		// the cells reading it again; a view draws after its renderer loads.
		await quiet(stage);
		await wait(0);
		const running = new Set((await Promise.all(ids.map(async (cell) => ((await chat.cellVerdict(cell, QUIET_MS * 2)).verdict === "running" ? cell : null)))).filter((cell) => cell !== null));

		const elements = new Set<string>();
		const drawnArtifacts = new Map<string, string>();
		for (const artifact of artifacts) {
			const late = artifact.members.filter((cell) => running.has(cell.id));
			if (late.length) {
				without.push(`the output of ${late.map((cell) => `cell #${cell.id}`).join(", ")}, still running`);
				continue;
			}
			const frame = chat.cellEls.get(artifact.members[0]?.id ?? "")?.closest("pi-artifact")?.querySelector(".artifact");
			if (!frame) continue;
			const copy = await still(frame, elements);
			for (const chrome of copy.querySelectorAll(".artifact-activity, .artifact-source-head, .artifact-code, .cell-rail")) chrome.remove();
			drawnArtifacts.set(artifact.key, copy.outerHTML);
		}
		const drawnViews = new Map<string, string>();
		for (const [view, el] of viewEls) drawnViews.set(view, (await still(el, elements)).outerHTML);
		if (shown.missing.length) without.push(`${shown.missing.length === 1 ? "a picture" : `${shown.missing.length} pictures`} this workspace does not hold (${shown.missing.join(", ")})`);

		const drawn: Drawn = { artifacts: drawnArtifacts, views: drawnViews, images: shown.images, liveViews };
		const body = exportBody(md, drawn);
		const css = exportCss(elements);
		return { html: exportPage({ title: nameOf(id, md), css, body }), body, css, without };
	} finally {
		stage.remove();
	}
}
