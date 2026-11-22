// Where a canvas edit lands (ADR 0033). pi changes prose already in the
// document by quoting it — the `edit` idiom it already knows — and the quote
// must name exactly one place, inside one block of prose. The page applies the
// change; this decides where, or says why not in words the agent can act on.
//
// An edit that leaves its block with no text takes the block, marker included
// (ADR 0065): a marker over nothing is not what "remove this" asked for.
//
// Pure: a document and an edit in, a change or a refusal out.

import { escapeBody, opensBlock, parseDocument, type DocSegmentKind } from "./format.ts";
import { deleteSegment } from "./run.ts";
import { isNowLine, withoutAppTail } from "./turn-context.ts";

/** What the `canvas_edit` tool asks for: replace `oldText` with `newText`. */
export interface CanvasEdit {
	oldText: string;
	newText: string;
}

/** A change to make, in document offsets, or why there is none. */
export type CanvasEditPlan = { ok: true; from: number; to: number; insert: string } | { ok: false; error: string };

/** The blocks a quote may land in: what a person or pi wrote as prose. A cell
 *  is changed by redefining it, and a tool's call, result or view is a record
 *  of what happened, not text to rewrite. */
const PROSE: ReadonlySet<DocSegmentKind> = new Set(["user", "assistant", "note"]);

/** A line the app adds to a user's message on its way to pi and the document
 *  never holds: the `[now: …]` line every send carries (ADR 0028) and an
 *  `[attached: …]` line naming a file (§Attachments). pi sees them on the
 *  user's text, so it may quote them. */
const isAppLine = (line: string) => isNowLine(line) || /^\[attached: [^\n]*\]$/.test(line);

/** `text` without what the app added at its end: those lines, and the face
 *  block a send puts between them (`withoutAppTail`). */
function withoutAppLines(text: string): string {
	let rest = text;
	for (;;) {
		const lines = withoutAppTail(rest).split("\n");
		while (lines.length && isAppLine(lines.at(-1)!.trim())) lines.pop();
		const next = lines.join("\n").replace(/\n+$/, "");
		// Nothing of the app's at the end: the text as it was quoted, its own
		// trailing newlines included.
		if (next === rest.replace(/\n+$/, "")) return rest === text ? text : next;
		rest = next;
	}
}

/**
 * Where `edit` lands in `md`, or why it cannot. `outside` is a span the edit
 * may not see — the running turn's own region, which is the answer being
 * written, not the canvas it writes about: a quote found only there is not
 * found, and one found there and elsewhere counts once. The prompt above it
 * is the one being answered, which an edit may reword and may not empty.
 */
export function planCanvasEdit(md: string, quoted: CanvasEdit, outside?: { from: number; to: number }): CanvasEditPlan {
	const edit = { oldText: withoutAppLines(quoted.oldText), newText: withoutAppLines(quoted.newText) };
	if (!edit.oldText) return { ok: false, error: "oldText is empty: quote the text to change, exactly as the document has it" };
	const found: number[] = [];
	for (let at = md.indexOf(edit.oldText); at >= 0; at = md.indexOf(edit.oldText, at + 1)) {
		const end = at + edit.oldText.length;
		if (outside && at < outside.to && end > outside.from) continue;
		found.push(at);
	}
	if (found.length === 0) return { ok: false, error: "not found: quote the text exactly as the document has it, whitespace included" };
	if (found.length > 1) return { ok: false, error: `found in ${found.length} places: quote enough of the surrounding text to name one` };
	const from = found[0]!;
	const to = from + edit.oldText.length;
	const parsed = parseDocument(md);
	if (from < parsed.bodyFrom) return { ok: false, error: "that text is the document's frontmatter, which is Piary's" };
	const segment = parsed.segments.find((s) => s.from <= from && from < s.to);
	if (!segment || from < segment.bodyFrom || to > segment.to)
		return { ok: false, error: "that quote spans more than one block: change one block at a time, inside it" };
	if (segment.kind === "cell") return { ok: false, error: `that text is cell #${segment.id}: change it with the \`cell\` tool, passing id "${segment.id}"` };
	if (!PROSE.has(segment.kind)) return { ok: false, error: `that text is part of a ${segment.kind} block, a record Piary keeps; only prose can be changed` };
	const insert = escapeBody(edit.newText);
	if ((md.slice(segment.bodyFrom, from) + insert + md.slice(to, segment.to)).trim()) return { ok: true, from, to, insert };
	// The edit leaves the block empty. The page's trailing prompt is where the
	// user types next, so it keeps its marker, as `deleteSegment` would have it.
	const index = parsed.segments.indexOf(segment);
	if (segment.kind === "user" && index === parsed.segments.length - 1) return { ok: true, from, to, insert };
	if (outside && segment === parsed.segments.findLast((s) => s.kind === "user" && s.from < outside.from))
		return { ok: false, error: "that would remove the prompt you are answering, and its answer would be left with no question: leave text in it" };
	const next = deleteSegment(md, parsed.segments, index);
	if (next === null) return { ok: true, from, to, insert };
	// The change covers the block whole, with the marker that folds it into the
	// one above: the editor takes a change that removes a marker's segment and
	// drops one that clips a marker.
	const lead = opensBlock(segment.kind) && parsed.segments[index - 1]?.kind === "block" ? parsed.segments[index - 1]!.from : segment.from;
	return { ok: true, ...spliceCovering(md, next, lead, segment.to) };
}

/** The one change that turns `before` into `after` and covers `from`..`to` of
 *  `before`: what a whole-document function did, as a span the editor can
 *  apply without moving what is around it. */
function spliceCovering(before: string, after: string, from: number, to: number): { from: number; to: number; insert: string } {
	const limit = Math.min(before.length, after.length);
	let head = 0;
	while (head < Math.min(limit, from) && before.charCodeAt(head) === after.charCodeAt(head)) head++;
	let tail = 0;
	const room = Math.min(limit - head, before.length - to);
	while (tail < room && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
	return { from: head, to: before.length - tail, insert: after.slice(head, after.length - tail) };
}
