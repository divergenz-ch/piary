// A conversation as a page that reads without Piary (ADR 0066): the document
// walked segment by segment, as the canvas walks it, into static HTML.
//
// Pure. What only a page can make comes in as `Drawn`: the outputs of the
// cells that ran, the views that were drawn, the images read from the store.
// Everything written here from the document's own text is escaped, and the
// page this returns carries a policy that runs no script and loads nothing.

import { Marked } from "marked";
import { artifactsFrom, type DocArtifact } from "./cells.ts";
import { type DocSegment, fileRefOf, parseDocument, QUIET_TOOLS, roleLabel, stripFence } from "./format.ts";

/** What the page drew of a document, as HTML that is safe to place: the
 *  export writes it as it is. */
export interface Drawn {
	/** An artifact's output, by its key (`artifactsFrom`). One with no entry
	 *  was not drawn, and is said so above its source. */
	readonly artifacts: ReadonlyMap<string, string>;
	/** A view's rendering, by its id. One with no entry is shown as its payload. */
	readonly views: ReadonlyMap<string, string>;
	/** An attachment's bytes as a `data:` url, by its stored name. */
	readonly images: ReadonlyMap<string, string>;
	/** The names of the views that keep changing while they run (a terminal).
	 *  What one showed is not in the document, so the export can only say it ran. */
	readonly liveViews: ReadonlySet<string>;
}

/** The class of the element the exported conversation is in. Its styles are
 *  all written under it, so they hold in a page of their own and inside
 *  another page alike. */
export const EXPORT_ROOT = "piary-export";

/** The class of an element holding what the canvas drew: a style the canvas
 *  writes for what is inside it is rewritten to hold inside this. */
export const EXPORT_CANVAS = "px-canvas";

/** The class of the exported page's body. */
export const EXPORT_PAGE = "px-page";

/** The policy of an exported page: no script, no request. Its images and
 *  styles are in the file. */
const POLICY = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

const ATTACHMENT = /^\/attachments\/([A-Za-z0-9_.-]+)$/;

export const escapeHtml = (text: string): string =>
	text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A link a reader may follow from a file on their disk: the web and mail.
 *  Anything else, a `javascript:` url included, keeps only its text. */
const followable = (href: string): boolean => /^(https?:\/\/|mailto:)/i.test(href);

/** Prose as HTML. Raw HTML in it is text, as it is on the canvas; an image is
 *  shown only when its bytes are in the file, so the page asks no server for
 *  anything. */
function prose(images: ReadonlyMap<string, string>): (md: string) => string {
	const marked = new Marked({
		async: false,
		gfm: true,
		// The canvas shows the text line for line.
		breaks: true,
		renderer: {
			html: ({ text }) => escapeHtml(text),
			link({ href, tokens }) {
				const text = this.parser.parseInline(tokens);
				return followable(href) ? `<a href="${escapeHtml(href)}" rel="noreferrer noopener">${text}</a>` : text;
			},
			image({ href, text }) {
				const stored = ATTACHMENT.exec(href)?.[1];
				const data = stored === undefined ? undefined : images.get(stored);
				if (data !== undefined) return `<img src="${escapeHtml(data)}" alt="${escapeHtml(text)}">`;
				const label = escapeHtml(text || href);
				return followable(href) ? `<a href="${escapeHtml(href)}" rel="noreferrer noopener">${label}</a>` : `<span class="px-missing">${label}</span>`;
			},
		},
	});
	return (md) => marked.parse(md) as string;
}

const code = (text: string): string => `<pre class="px-code"><code>${escapeHtml(text)}</code></pre>`;

const role = (label: string): string => `<div class="px-role">${escapeHtml(label)}</div>`;

/** A machine step, closed until the reader opens it: the canvas folds these too. */
const step = (label: string, body: string, error = false): string =>
	`<details class="px-step${error ? " px-error" : ""}"${error ? " open" : ""}><summary class="px-role">${escapeHtml(label)}</summary>${body}</details>`;

/** An artifact: what its cells drew, over their source. */
function frame(artifact: DocArtifact, drawn: string | undefined): string {
	const output =
		drawn === undefined
			? `<p class="px-quiet">Not drawn: this had not finished running when the conversation was exported.</p>`
			: `<div class="px-output ${EXPORT_CANVAS}">${drawn}</div>`;
	const source = artifact.members
		.map((cell) => `<div class="px-code-name">${escapeHtml(cell.mode)} #${escapeHtml(cell.id)}</div>${code(cell.source)}`)
		.join("");
	const label = artifact.key.startsWith("@") ? `cell ${artifact.key}` : artifact.members.length === 1 ? "cell" : `${artifact.members.length} cells`;
	return `<figure class="px-artifact">${output}<details class="px-source"><summary class="px-role">${escapeHtml(label)} · source</summary>${source}</details></figure>`;
}

/**
 * The conversation `md` as the inside of the export's root element.
 *
 * It shows what the canvas shows of a document nothing is running in: the
 * frontmatter, an acknowledgement, a quiet tool and a superseded cell are not
 * drawn; a step is folded; an artifact stands where it was first written.
 */
export function exportBody(md: string, drawn: Drawn): string {
	const { segments } = parseDocument(md);
	const render = prose(drawn.images);
	const artifacts = artifactsFrom(md, segments);
	const frameAt = new Map(artifacts.map((artifact) => [artifact.at, artifact]));
	const inFrame = new Set(artifacts.flatMap((artifact) => artifact.members.map((cell) => cell.id)));

	// The same three sets the canvas reads (`buildDecorations`).
	const calledIds = new Set(segments.filter((s) => s.kind === "toolCall" && s.id).map((s) => s.id));
	const quietIds = new Set(segments.filter((s) => s.kind === "toolCall" && QUIET_TOOLS.has(s.name ?? "")).map((s) => s.id));
	const refusedIds = new Set(segments.filter((s) => s.kind === "toolResult" && s.isError).map((s) => s.id));
	const unseen = (seg: DocSegment) =>
		((seg.kind === "toolCall" || seg.kind === "toolResult") && quietIds.has(seg.id)) ||
		(seg.kind === "toolResult" && !seg.isError && !calledIds.has(seg.id));

	const out: string[] = [];
	const spoken = (seg: DocSegment, cls: string, label: string | null) => {
		if (!seg.text.trim()) return;
		out.push(`<section class="px-seg ${cls}">${label === null ? "" : role(label)}<div class="px-prose">${render(seg.text)}</div></section>`);
	};

	for (const seg of segments) {
		const framed = frameAt.get(seg.from);
		if (framed) {
			out.push(frame(framed, drawn.artifacts.get(framed.key)));
			continue;
		}
		if (unseen(seg)) continue;
		switch (seg.kind) {
			case "user":
				spoken(seg, "px-you", roleLabel(seg));
				break;
			case "assistant":
				spoken(seg, "px-pi", roleLabel(seg));
				break;
			case "aside":
				spoken(seg, "px-pi px-aside", roleLabel(seg));
				break;
			case "note":
				spoken(seg, "px-note", null);
				break;
			case "thinking":
				if (seg.text.trim()) out.push(step(roleLabel(seg), `<div class="px-thinking">${escapeHtml(seg.text)}</div>`));
				break;
			case "toolCall":
			case "toolResult":
				out.push(step(roleLabel(seg), code(stripFence(seg.text)), seg.isError === true));
				break;
			case "view": {
				const name = seg.name ?? "view";
				if (drawn.liveViews.has(name)) {
					const below = segments.some((other) => other.kind === "toolResult" && other.id === seg.id && other.from > seg.from);
					out.push(
						`<section class="px-seg px-view">${role(name)}<p class="px-quiet">A ${escapeHtml(name)} ran here. What it showed is not kept.${
							below ? " What the command printed is in the output step below." : ""
						}</p></section>`,
					);
					break;
				}
				const view = seg.id === undefined ? undefined : drawn.views.get(seg.id);
				if (view !== undefined) out.push(`<section class="px-seg px-view">${role(name)}<div class="${EXPORT_CANVAS}">${view}</div></section>`);
				else if (seg.id !== undefined && refusedIds.has(seg.id)) out.push(step(name, code(stripFence(seg.text))));
				else out.push(`<section class="px-seg px-view">${role(name)}${code(stripFence(seg.text))}</section>`);
				break;
			}
			case "cell":
				// A cell an artifact holds is in its frame, and an earlier
				// definition of one is history the frame's source replaces.
				if (seg.id !== undefined && inFrame.has(seg.id)) break;
				out.push(`<section class="px-seg px-view">${role(roleLabel(seg))}${code(stripFence(seg.text))}</section>`);
				break;
			case "file": {
				const ref = fileRefOf(seg);
				const stored = ref ? ATTACHMENT.exec(ref.url)?.[1] : undefined;
				const data = stored === undefined ? undefined : drawn.images.get(stored);
				if (ref && data !== undefined) out.push(`<section class="px-seg px-file">${role(ref.mime)}<img src="${escapeHtml(data)}" alt="${escapeHtml(ref.name)}"></section>`);
				else out.push(`<section class="px-seg px-file">${role(seg.name ?? "file")}<p class="px-quiet">${escapeHtml(ref?.name ?? seg.text)}, not in this file.</p></section>`);
				break;
			}
			case "opaque":
				if (seg.text.trim()) out.push(code(seg.text));
				break;
			// A later marker of an artifact already framed, and a fold marker:
			// structure, with nothing of its own to show.
			case "artifact":
			case "block":
				break;
		}
	}
	return out.join("\n");
}

/** The whole page: `body` in its root element, under `title`, with `css` in
 *  it and the policy that keeps it a document. */
export function exportPage({ title, css, body }: { title: string; css: string; body: string }): string {
	return [
		"<!doctype html>",
		"<html>",
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		`<meta http-equiv="Content-Security-Policy" content="${POLICY}">`,
		`<title>${escapeHtml(title)}</title>`,
		// A sheet's text ends the element only by spelling its end tag.
		`<style>${css.replace(/<\/(style)/gi, "<\\/$1")}</style>`,
		"</head>",
		`<body class="${EXPORT_PAGE}">`,
		`<article class="${EXPORT_ROOT}">`,
		body,
		"</article>",
		"</body>",
		"</html>",
		"",
	].join("\n");
}
