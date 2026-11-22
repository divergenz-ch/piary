// Obsidian-style live markdown (hybrid rendering): formatting marks hide,
// and tables / task boxes / bullets / quotes / images / rules render,
// wherever the selection isn't — move the caret in (click included) and the
// raw syntax returns, editable in place. The text never changes, only its
// presentation.
//
// Split on purpose: liveMdPlan is pure (EditorState → ranges, headless-
// testable); the StateField turns the plan into decorations. A StateField,
// not a ViewPlugin — block widgets that affect layout must come from state.
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { Facet, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

interface Range {
	from: number;
	to: number;
}

/** A run of a table cell's inline markdown, as the cell draws it while it is
 *  not being edited: the marks are gone and what they meant is the kind. */
export type LiveMdInline =
	| { kind: "text"; text: string }
	| { kind: "code"; text: string }
	| { kind: "strong" | "em" | "strike"; children: LiveMdInline[] }
	/** `url` is null where the canvas would not open the destination. */
	| { kind: "link"; url: string | null; children: LiveMdInline[] };

/** One editable table cell; offsets relative to the table's `from` so the
 *  widget can commit through posAtDOM after unrelated upstream edits. */
export interface LiveMdCell {
	from: number;
	to: number;
	/** The cell's source, as it is edited: trimmed, `\|` unescaped. */
	text: string;
	/** The same source parsed, as it is drawn. */
	inline: LiveMdInline[];
}

export interface LiveMdTable extends Range {
	rows: { header: boolean; cells: LiveMdCell[] }[];
}

/** What live rendering wants to do, before any DOM. */
/** A code block whose fence lines are hidden. Every offset is a line start. */
export interface LiveMdFence {
	open: number;
	close: number;
	/** The lines between the two, in order; never empty. */
	code: number[];
	/** The info string's first word, `""` for a bare fence. */
	lang: string;
}

export interface LiveMdPlan {
	/** Syntax marks to hide (inline replaces). */
	hide: Range[];
	/** Tables to replace with an edit-in-place widget (block replaces). */
	tables: LiveMdTable[];
	/** Bullet-list marks ("-"/"*"/"+") to render as • (ordered numbers stay). */
	bullets: Range[];
	/** Task markers to render as real checkboxes (clicking edits the text). */
	tasks: (Range & { checked: boolean })[];
	/** Line starts inside blockquotes — the bar stays even when revealed. */
	quoteLines: number[];
	/** Images to render inline; only safeUrl-passing sources get here. */
	images: (Range & { url: string; alt: string })[];
	/** Thematic breaks (---) to render as rules. */
	rules: Range[];
	/** Prose code blocks to draw without their two fence lines. */
	fences: LiveMdFence[];
}

const EMPHASIS_PARENTS = new Set(["Emphasis", "StrongEmphasis"]);

/** http(s) and site-relative only — transcript text is semi-trusted; a
 *  javascript: URL must never reach window.open or an img src. */
export function safeUrl(url: string): string | null {
	return /^(https?:\/\/|\.{0,2}\/)/i.test(url) ? url : null;
}

/** Where an image the document names is actually loaded from. The document's
 *  url stays what the format says (`/attachments/<name>`, site-relative); a
 *  host that serves that path somewhere else maps it here. Applied after
 *  `safeUrl`, so a refused source never reaches it. The last one given wins;
 *  none is the identity. */
export const assetResolver = Facet.define<(url: string) => string, (url: string) => string>({
	combine: (resolvers) => resolvers.at(-1) ?? ((url) => url),
});

/** Whether `pos` is in text a person reads as prose. A fence there is
 *  presentation and may hide; anywhere else it is the payload of a marker (a
 *  cell's source, a view's data, a tool's arguments or output) and stays honest
 *  text. Only the host knows which is which; with none given nothing is prose,
 *  so every fence line stays. The last one given wins. */
export const proseAt = Facet.define<(state: EditorState, pos: number) => boolean, (state: EditorState, pos: number) => boolean>({
	combine: (answers) => answers.at(-1) ?? (() => false),
});

/** Navigation also permits email links; image sources keep the stricter
 *  safeUrl policy. Angle brackets are Markdown destination delimiters. */
export function safeLinkUrl(url: string): string | null {
	if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
	return safeUrl(url) ?? (/^mailto:[^\s<>]+$/i.test(url) ? url : null);
}

/** GFM also parses a URL/email in a link's LABEL as a URL child. The
 *  destination is the URL after the closing bracket, not the first child. */
function linkDestination(node: SyntaxNode) {
	if (node.name === "Autolink") return node.getChild("URL");
	const close = node.getChildren("LinkMark")[1];
	return close ? (node.getChildren("URL").find((url) => url.from >= close.to) ?? null) : null;
}

const CELL_SPANS: Record<string, "strong" | "em" | "strike"> = {
	StrongEmphasis: "strong",
	Emphasis: "em",
	Strikethrough: "strike",
};

/** What `node` holds between `from` and `to`, read off the tree the prose is
 *  drawn from, so a cell and a paragraph cannot disagree about what is bold.
 *  A node with no case here (an image, an HTML tag, an entity) is its source. */
function inlineRuns(doc: EditorState["doc"], node: SyntaxNode, from: number, to: number): LiveMdInline[] {
	const runs: LiveMdInline[] = [];
	const text = (value: string) => {
		const last = runs.at(-1);
		if (!value) return;
		if (last?.kind === "text") last.text += value;
		else runs.push({ kind: "text", text: value });
	};
	let at = from;
	for (let child = node.firstChild; child; child = child.nextSibling) {
		if (child.from < from || child.to > to) continue; // the node's own marks
		text(doc.sliceString(at, child.from));
		at = child.to;
		const first = child.firstChild;
		const last = child.lastChild;
		const span = CELL_SPANS[child.name];
		const destination =
			child.name === "URL" ? child : child.name === "Link" || child.name === "Autolink" ? linkDestination(child) : null;
		if (span && first && last && first !== last) {
			runs.push({ kind: span, children: inlineRuns(doc, child, first.to, last.from) });
		} else if (child.name === "InlineCode" && first && last && first !== last) {
			// A pipe in a cell's code span is escaped for the table, not for the code.
			const code = doc.sliceString(first.to, last.from).replace(/\\\|/g, "|");
			// One space of padding each side is the span's own, as in `` ` a ` ``.
			runs.push({ kind: "code", text: /^ .*[^ ].* $/.test(code) ? code.slice(1, -1) : code });
		} else if (child.name === "Escape") {
			text(doc.sliceString(child.from + 1, child.to));
		} else if (destination) {
			// A bracketed word with no destination (`[1]`, `[sic]`) is not a link
			// here: it falls through and keeps its brackets.
			const url = safeLinkUrl(doc.sliceString(destination.from, destination.to));
			const [open, close] = child.getChildren("LinkMark");
			const label =
				child.name === "Link" && open && close
					? inlineRuns(doc, child, open.to, close.from)
					: [{ kind: "text" as const, text: doc.sliceString(destination.from, destination.to) }];
			runs.push({ kind: "link", url, children: label });
		} else {
			text(doc.sliceString(child.from, child.to));
		}
	}
	text(doc.sliceString(at, to));
	return runs;
}

export function liveMdPlan(state: EditorState): LiveMdPlan {
	const plan: LiveMdPlan = { hide: [], tables: [], bullets: [], tasks: [], quoteLines: [], images: [], rules: [], fences: [] };
	const doc = state.doc;
	const quoteLines = new Set<number>();
	/** Boundary-inclusive: a caret right next to the span already reveals it,
	 *  so backspace never eats an invisible character. */
	const touches = (from: number, to: number) => state.selection.ranges.some((r) => r.to >= from && r.from <= to);
	const lineTouched = (pos: number) => {
		const line = doc.lineAt(pos);
		return touches(line.from, line.to);
	};
	/** The mark plus its single following space ("## " → "", "> " → ""). */
	const withSpace = (node: Range) =>
		doc.sliceString(node.to, node.to + 1) === " " ? { from: node.from, to: node.to + 1 } : { from: node.from, to: node.to };
	syntaxTree(state).iterate({
		enter(node) {
			switch (node.name) {
				case "Table": {
					// Mouse users work IN the rendered table (editable cells); only
					// keyboard entry (arrowing the caret in) reveals the raw text —
					// the escape hatch for structural edits (rows, alignment).
					if (touches(node.from, node.to)) return false;
					const rows: LiveMdTable["rows"] = [];
					for (let row = node.node.firstChild; row; row = row.nextSibling) {
						if (row.name !== "TableHeader" && row.name !== "TableRow") continue;
						// Cells sit between pipe delimiters; edges only count when inked
						// (a leading/trailing pipe leaves an empty edge, a pipeless edge
						// is a real cell). Empty inner cells stay editable slots.
						const delims = row.getChildren("TableDelimiter");
						const parsed = row.getChildren("TableCell");
						const cells: LiveMdCell[] = [];
						let prev = row.from;
						for (let i = 0; i <= delims.length; i++) {
							const next = i < delims.length ? delims[i].from : row.to;
							const edge = i === 0 || i === delims.length;
							const raw = doc.sliceString(prev, next);
							if (!edge || raw.trim()) {
								// The parser has a TableCell only where there is content.
								const content = parsed.find((c) => c.from >= prev && c.to <= next);
								cells.push({
									from: prev - node.from,
									to: next - node.from,
									text: raw.trim().replace(/\\\|/g, "|"),
									inline: content ? inlineRuns(doc, content, content.from, content.to) : [],
								});
							}
							if (i < delims.length) prev = delims[i].to;
						}
						rows.push({ header: row.name === "TableHeader", cells });
					}
					plan.tables.push({ from: node.from, to: node.to, rows });
					return false;
				}
				case "FencedCode": {
					// Hidden as two whole lines or not at all, so only a block that
					// is exactly that: closed, at the top level (in a list or a quote
					// the fence shares its line with the mark), and with code between,
					// or hiding would leave nothing on screen.
					const marks = node.node.getChildren("CodeMark");
					if (marks.length !== 2 || node.node.parent?.name !== "Document") return;
					if (touches(node.from, node.to) || !state.facet(proseAt)(state, node.from)) return;
					const open = doc.lineAt(marks[0].from);
					const close = doc.lineAt(marks[1].from);
					if (close.number - open.number < 2 || close.text.trim() !== doc.sliceString(marks[1].from, marks[1].to)) return;
					const code: number[] = [];
					for (let n = open.number + 1; n < close.number; n++) code.push(doc.line(n).from);
					const info = node.node.getChild("CodeInfo");
					const lang = info ? (doc.sliceString(info.from, info.to).trim().split(/\s+/)[0] ?? "") : "";
					plan.fences.push({ open: open.from, close: close.from, code, lang });
					return;
				}
				case "Blockquote":
					for (let pos = node.from; pos <= node.to; ) {
						const line = doc.lineAt(pos);
						quoteLines.add(line.from);
						if (line.to >= node.to) break;
						pos = line.to + 1;
					}
					return true; // descend — inner marks handle themselves
				case "QuoteMark":
					if (!lineTouched(node.from)) plan.hide.push(withSpace(node));
					return;
				case "HeaderMark": {
					// ATX only — setext underlines double as the frontmatter fence.
					const parent = node.node.parent;
					if (!parent || !parent.name.startsWith("ATXHeading")) return;
					if (!lineTouched(node.from)) plan.hide.push(withSpace(node));
					return;
				}
				case "HorizontalRule":
					// Position 0 is the frontmatter opener, never a break.
					if (node.from > 0 && !lineTouched(node.from)) plan.rules.push({ from: node.from, to: node.to });
					return;
				case "ListMark": {
					// Bullets only — ordered numbers already read rendered.
					if (node.node.parent?.parent?.name !== "BulletList" || lineTouched(node.from)) return;
					// A task item's "- " hides entirely; the checkbox is the affordance.
					if (node.node.nextSibling?.name === "Task") plan.hide.push(withSpace(node));
					else plan.bullets.push({ from: node.from, to: node.to });
					return;
				}
				case "TaskMarker":
					if (!lineTouched(node.from))
						plan.tasks.push({
							from: node.from,
							to: node.to,
							checked: /x/i.test(doc.sliceString(node.from, node.to)),
						});
					return;
				case "EmphasisMark":
				case "StrikethroughMark":
				case "CodeMark": {
					const parent = node.node.parent;
					if (!parent) return;
					if (node.name === "EmphasisMark" && !EMPHASIS_PARENTS.has(parent.name)) return;
					if (node.name === "StrikethroughMark" && parent.name !== "Strikethrough") return;
					// Inline code only — a fence hides as whole lines (FencedCode
					// above), and a payload's (cells, views, tools) never does.
					if (node.name === "CodeMark" && parent.name !== "InlineCode") return;
					if (!touches(parent.from, parent.to)) plan.hide.push({ from: node.from, to: node.to });
					return;
				}
				case "Escape":
					// `\*` is a literal star: the backslash is the mark, the character
					// after it the content.
					if (!touches(node.from, node.to)) plan.hide.push({ from: node.from, to: node.from + 1 });
					return;
				case "LinkMark":
				case "URL":
				case "LinkTitle": {
					// Hide the [ ]( url ) apparatus, keep the styled label. The parent
					// check keeps autolinks raw and leaves images to the Image case.
					const parent = node.node.parent;
					if (parent?.name !== "Link" || touches(parent.from, parent.to)) return;
					if (node.name === "URL" && node.from !== linkDestination(parent)?.from) return;
					plan.hide.push({ from: node.from, to: node.to });
					return;
				}
				case "Image": {
					if (touches(node.from, node.to)) return true; // raw — inner marks stay too
					const urlNode = linkDestination(node.node);
					const url = urlNode && safeUrl(doc.sliceString(urlNode.from, urlNode.to));
					if (!url) return false; // unsafe/absent source — honest raw text
					// LinkMark children in order: "![", "]", "(", ")" — alt sits between
					// the first two.
					const [open, close] = node.node.getChildren("LinkMark");
					const alt = open && close && close.from > open.to ? doc.sliceString(open.to, close.from) : "";
					plan.images.push({ from: node.from, to: node.to, url, alt });
					return false;
				}
			}
		},
	});
	plan.quoteLines = [...quoteLines].sort((a, b) => a - b);
	return plan;
}

/** The link, image destination, or bare GFM URL under `pos`, with only safe
 *  navigation schemes allowed. Code fences and inline code aren't URL nodes. */
export function linkAt(state: EditorState, pos: number): string | null {
	let bareUrl: string | null = null;
	for (
		let node: ReturnType<typeof syntaxTree>["topNode"] | null = syntaxTree(state).resolveInner(pos, 0);
		node;
		node = node.parent
	) {
		if (node.name === "URL") bareUrl = safeLinkUrl(state.doc.sliceString(node.from, node.to));
		if (node.name === "Link" || node.name === "Autolink" || node.name === "Image") {
			const url = linkDestination(node);
			return url ? safeLinkUrl(state.doc.sliceString(url.from, url.to)) : null;
		}
	}
	return bareUrl;
}

/** ⌘/Ctrl-click opens the link under the pointer (plain click keeps placing
 *  the caret — which is also how a rendered link reveals its raw form). */
export const mdLinkOpen = EditorView.domEventHandlers({
	mousedown(event, view) {
		if (event.button !== 0 || (!event.metaKey && !event.ctrlKey)) return false;
		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos === null) return false;
		const url = linkAt(view.state, pos);
		if (!url) return false;
		window.open(url, "_blank", "noopener");
		event.preventDefault();
		return true;
	},
});

const CELL_ELEMENTS = { strong: "strong", em: "em", strike: "s" } as const;

/** A cell's runs as DOM nodes. Built node by node, never from an HTML string:
 *  cell text is semi-trusted transcript content. */
function inlineNodes(runs: LiveMdInline[]): Node[] {
	return runs.map((run) => {
		if (run.kind === "text") return document.createTextNode(run.text);
		if (run.kind === "code") {
			const code = document.createElement("code");
			code.textContent = run.text;
			return code;
		}
		if (run.kind !== "link") {
			const el = document.createElement(CELL_ELEMENTS[run.kind]);
			el.append(...inlineNodes(run.children));
			return el;
		}
		// A link is a span, not an anchor: the cell is editable text first, and
		// only a modified click opens it, as in the prose.
		const link = document.createElement("span");
		link.className = "doc-md-cell-link";
		if (run.url) link.dataset["url"] = run.url;
		link.append(...inlineNodes(run.children));
		return link;
	});
}

/** Edit-in-place table. A cell is drawn from its parsed markdown until it is
 *  focused; from then it is its source, so what is typed is what is
 *  committed. Edits buffer in the DOM and commit as one document change when
 *  focus leaves the table (or on Enter), so the widget never rebuilds under a
 *  typing cursor. */
class TableWidget extends WidgetType {
	constructor(
		readonly src: string,
		readonly rows: LiveMdTable["rows"],
	) {
		super();
	}
	override eq(other: TableWidget) {
		return other.src === this.src;
	}
	override toDOM(view: EditorView) {
		const root = document.createElement("div");
		root.className = "doc-md-table";
		const table = document.createElement("table");
		root.append(table);
		/** Cells the user focused: element → source range + original text. */
		const touched = new Map<HTMLElement, LiveMdCell>();
		const draw = (el: HTMLElement, cell: LiveMdCell) => el.replaceChildren(...inlineNodes(cell.inline));
		const commitAll = () => {
			if (!root.isConnected) return; // superseded mid-edit — honest conflict drop
			const base = view.posAtDOM(root);
			const changes: { from: number; to: number; insert: string }[] = [];
			for (const [el, cell] of touched) {
				const text = (el.textContent ?? "").replace(/\n/g, " ").trim();
				if (text === cell.text) {
					draw(el, cell); // no change rebuilds the widget, so it is drawn again here
					continue;
				}
				// Pipes re-escape on the way back — typed text must not grow columns.
				changes.push({ from: base + cell.from, to: base + cell.to, insert: ` ${text.replace(/\|/g, "\\|")} ` });
			}
			touched.clear(); // idempotent — the blur after Enter is a no-op
			if (changes.length) view.dispatch({ changes, userEvent: "input" });
		};
		const cellEls: HTMLElement[] = [];
		for (const row of this.rows) {
			const tr = document.createElement("tr");
			for (const cell of row.cells) {
				const el = document.createElement(row.header ? "th" : "td");
				draw(el, cell);
				try {
					el.contentEditable = "plaintext-only";
				} catch {
					el.contentEditable = "true"; // Firefox — newlines stripped at commit
				}
				el.addEventListener("focus", () => {
					if (touched.has(el)) return;
					touched.set(el, cell);
					el.textContent = cell.text;
				});
				el.addEventListener("keydown", (event) => {
					if (event.key === "Tab") {
						event.preventDefault();
						const at = cellEls.indexOf(el) + (event.shiftKey ? -1 : 1);
						cellEls[at]?.focus();
					} else if (event.key === "Enter") {
						event.preventDefault();
						commitAll();
						view.focus();
					} else if (event.key === "Escape") {
						event.preventDefault();
						draw(el, cell); // revert this cell, keep the rest buffered
						touched.delete(el);
						view.focus();
					} else if (event.key === "a" && (event.metaKey || event.ctrlKey)) {
						// Chrome's native select-all escapes the nested editable and
						// selects the whole editor — the next keystroke then replaces
						// the entire document. Select the cell, which is what ⌘A means.
						event.preventDefault();
						const range = document.createRange();
						range.selectNodeContents(el);
						const sel = window.getSelection();
						sel?.removeAllRanges();
						sel?.addRange(range);
					}
				});
				cellEls.push(el);
				tr.append(el);
			}
			table.append(tr);
		}
		// CM's keymaps listen on cm-content above us: a chord typed into a cell
		// (⌘A, ⌘Z, Enter…) must act on the cell, never on the whole document —
		// ⌘A leaking through selected the doc and the next keystroke replaced it.
		// Cell handlers (Tab/Enter/Escape above) run first; this fires last.
		root.addEventListener("keydown", (event) => event.stopPropagation());
		// ⌘/Ctrl-click opens a cell's link, as it does in the prose; the press
		// is taken whole, so it does not start an edit.
		root.addEventListener("mousedown", (event) => {
			if (event.button !== 0 || (!event.metaKey && !event.ctrlKey) || !(event.target instanceof Element)) return;
			const url = event.target.closest<HTMLElement>(".doc-md-cell-link")?.dataset["url"];
			if (!url) return;
			window.open(url, "_blank", "noopener");
			event.preventDefault();
		});
		// Leaving the table (click-away, ⌘⏎ elsewhere, window blur) commits.
		root.addEventListener("focusout", (event) => {
			if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
			commitAll();
		});
		return root;
	}
	override ignoreEvent() {
		return true; // the widget owns its clicks — people work in the rendered view
	}
}

class BulletWidget extends WidgetType {
	override eq() {
		return true;
	}
	override toDOM() {
		const span = document.createElement("span");
		span.className = "doc-md-bullet";
		span.textContent = "•";
		return span;
	}
	override ignoreEvent() {
		return false; // default is true — the bullet would eat clicks meant for the line
	}
}
const bullet = new BulletWidget();

class TaskWidget extends WidgetType {
	constructor(
		readonly checked: boolean,
		/** TaskMarker start — the toggled char sits at from + 1. */
		readonly from: number,
	) {
		super();
	}
	override eq(other: TaskWidget) {
		return other.checked === this.checked && other.from === this.from;
	}
	override toDOM(view: EditorView) {
		const box = document.createElement("input");
		box.type = "checkbox";
		box.className = "doc-md-task";
		box.checked = this.checked;
		box.addEventListener("mousedown", (event) => {
			event.preventDefault();
			// A text edit like any other: undoable, autosaved — and inside
			// assistant history it diverges from the transcript, so the
			// existing revision banner governs it (task lists are content;
			// agents use view() cells for live state).
			view.dispatch({
				changes: { from: this.from + 1, to: this.from + 2, insert: this.checked ? " " : "x" },
				userEvent: "input",
			});
		});
		return box;
	}
	override ignoreEvent() {
		return true; // the widget owns its clicks
	}
}

class ImageWidget extends WidgetType {
	constructor(
		readonly url: string,
		readonly alt: string,
	) {
		super();
	}
	override eq(other: ImageWidget) {
		return other.url === this.url && other.alt === this.alt;
	}
	override toDOM() {
		const img = document.createElement("img");
		img.className = "doc-md-img";
		img.src = this.url;
		img.alt = this.alt;
		// NOT lazy. A replaced widget starts at 0x0 because an unloaded image has
		// no intrinsic size, and a zero-area element never satisfies the lazy
		// loader's intersection test — so it never loads, so it never gets a size.
		// The deadlock was invisible while document images were rare; attachments
		// put one at the top of the page every time you drop a file.
		return img;
	}
	override ignoreEvent() {
		return false; // a click reveals the raw ![alt](url)
	}
}

class RuleWidget extends WidgetType {
	override eq() {
		return true;
	}
	override toDOM() {
		const span = document.createElement("span");
		span.className = "doc-md-hr";
		return span;
	}
	override ignoreEvent() {
		return false;
	}
}
const rule = new RuleWidget();

/** Syntax marks (`**`, `#`, `](url)`) collapse to nothing via CSS, NOT via
 *  `Decoration.replace({})`. A replace makes CodeMirror wrap the range in two
 *  `<img class="cm-widgetBuffer">` elements it must lay out and measure on
 *  every update: a real document showed 92 of 98 buffers coming from hidden
 *  syntax alone, worth ~8ms of presentation delay and 39 dropped frames per
 *  43 keystrokes. A mark decoration is one `<span>` and measures nothing.
 *
 *  Reveal-on-touch still governs visibility, so the caret never traverses an
 *  invisible run — approaching the mark reveals it (`touches` is
 *  boundary-inclusive). */
const hideMark = Decoration.mark({ class: "doc-md-hide" });

const quoteLine = Decoration.line({ class: "doc-md-quote" });
/** A fence line collapsed to no height. It can hold no caret: a selection
 *  that touches its block brings both lines back first. */
const fenceLine = Decoration.line({ class: "doc-md-fence" });

function build(state: EditorState): { marks: DecorationSet; lines: DecorationSet } {
	const plan = liveMdPlan(state);
	const resolve = state.facet(assetResolver);
	const all: (Range & { deco: Decoration })[] = [
		...plan.hide.map((r) => ({ ...r, deco: hideMark })),
		...plan.bullets.map((r) => ({ ...r, deco: Decoration.replace({ widget: bullet }) })),
		...plan.tasks.map((r) => ({ ...r, deco: Decoration.replace({ widget: new TaskWidget(r.checked, r.from) }) })),
		...plan.images.map((r) => ({ ...r, deco: Decoration.replace({ widget: new ImageWidget(resolve(r.url), r.alt) }) })),
		...plan.rules.map((r) => ({ ...r, deco: Decoration.replace({ widget: rule }) })),
		...plan.tables.map((r) => ({
			...r,
			deco: Decoration.replace({ widget: new TableWidget(state.doc.sliceString(r.from, r.to), r.rows), block: true }),
		})),
	].sort((a, b) => a.from - b.from || a.to - b.to);
	const marks = new RangeSetBuilder<Decoration>();
	let last = 0;
	for (const r of all) {
		if (r.from < last && r.to > 0) continue; // overlap insurance — first wins
		marks.add(r.from, r.to, r.deco);
		last = r.to;
	}
	const lineDecos: { from: number; deco: Decoration }[] = plan.quoteLines.map((from) => ({ from, deco: quoteLine }));
	for (const fence of plan.fences) {
		lineDecos.push({ from: fence.open, deco: fenceLine }, { from: fence.close, deco: fenceLine });
		fence.code.forEach((from, i) => {
			const edge = `${i === 0 ? " doc-md-code-first" : ""}${i === fence.code.length - 1 ? " doc-md-code-last" : ""}`;
			// The language the hidden fence named rides on the first code line.
			const attributes = i === 0 && fence.lang ? { "data-lang": fence.lang } : undefined;
			lineDecos.push({ from, deco: Decoration.line({ class: `doc-md-code${edge}`, attributes }) });
		});
	}
	const lines = new RangeSetBuilder<Decoration>();
	for (const line of lineDecos.sort((a, b) => a.from - b.from)) lines.add(line.from, line.from, line.deco);
	return { marks: marks.finish(), lines: lines.finish() };
}

/** Revealing marks reflows the line, so doing it mid-drag slides the words
 *  out from under the pointer and the selection lands where the user didn't
 *  aim. Freeze the rendering while the button is down, catch up on mouseup. */
let dragging = false;
const rerender = StateEffect.define<null>();

export const liveDragFreeze = EditorView.domEventHandlers({
	mousedown: (_event, view) => {
		dragging = true;
		const release = () => {
			if (!dragging) return;
			dragging = false;
			view.dispatch({ effects: rerender.of(null) });
		};
		// dragend as well as mouseup: starting a text drag swallows the mouseup,
		// and a stuck flag would freeze live rendering for the rest of the session.
		for (const type of ["mouseup", "dragend"]) window.addEventListener(type, release, { once: true });
		return false;
	},
});

/** The live-preview extension: recomputes on edits, caret moves, and parse
 *  progress (the tree identity check catches async parsing catching up).
 *  ponytail: full-doc walk per caret move — same budget as focusDim; make it
 *  viewport-scoped if chat documents ever outgrow it. */
export const liveMarkdown = StateField.define<{ marks: DecorationSet; lines: DecorationSet }>({
	create: build,
	update(value, tr) {
		if (tr.effects.some((e) => e.is(rerender))) return build(tr.state);
		if (tr.state.facet(assetResolver) !== tr.startState.facet(assetResolver)) return build(tr.state);
		if (tr.state.facet(proseAt) !== tr.startState.facet(proseAt)) return build(tr.state);
		if (dragging && !tr.docChanged) return value;
		if (!tr.docChanged && !tr.selection && syntaxTree(tr.state) === syntaxTree(tr.startState)) return value;
		return build(tr.state);
	},
	provide: (f) => [
		EditorView.decorations.from(f, (v) => v.marks),
		EditorView.decorations.from(f, (v) => v.lines),
	],
});
