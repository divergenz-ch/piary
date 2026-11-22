// View templates (step 10) — a `pi:view NAME #id` segment renders as a live
// widget when NAME is registered and its payload fence parses as JSON;
// otherwise the honest fence stays visible.
import { renderA2ui } from "../components/views/a2ui.ts";
import { extractCards, renderCards } from "../components/views/cards.ts";
import { extractDiff, renderDiff } from "../components/views/diff.ts";
import { extractFileTree, renderFileTree } from "../components/views/file-tree.ts";
import { extractMatches, renderMatches } from "../components/views/matches.ts";
import { extractProperties, renderProperties } from "../components/views/properties.ts";
import { renderSubsession } from "../components/views/subsession.ts";
import { extractTable, renderTable } from "../components/views/table.ts";
import type { DocSegment } from "./format.ts";

/** What a template may know about its block beyond the payload. */
export interface ViewContext {
	/** The call that wrote it was answered with an error, so it is the agent's
	 *  attempt rather than its answer. */
	refused: boolean;
	/** Its message is still streaming, so the payload holds only what has arrived. */
	pending: boolean;
}

/** Renders a view's payload, or null when the data doesn't fit the template
 *  (the caller falls back to the plain fence — never an error state). */
export type ViewTemplate = (data: unknown, view?: ViewContext) => HTMLElement | null;

/** Host-written widget state: the persisted values of
 *  the document's view() inputs, restored into the widgets on reload. Renders
 *  as a quiet chip — the JSON stays reachable via show-source (⟨⟩). */
/** The persisted widget state, in either shape it can take.
 *
 *  v1 was a flat `{name: value}` of `view()` exports. v2 splits that from
 *  `state(key, …)` values, which are addressed by key rather than by the name a
 *  cell happened to declare — so seeding can run before any cell does. A flat
 *  object still reads as v1, which is why every document written before this
 *  keeps restoring. */
export interface CellStatePayload {
	views: Record<string, unknown>;
	store: Record<string, unknown>;
}

export function cellStatePayload(data: unknown): CellStatePayload | null {
	if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
	const record = data as Record<string, unknown>;
	if (record.v !== 2) return { views: record, store: {} };
	const views = record.views;
	const store = record.store;
	return {
		views: typeof views === "object" && views !== null ? (views as Record<string, unknown>) : {},
		store: typeof store === "object" && store !== null ? (store as Record<string, unknown>) : {},
	};
}

function renderCellState(data: unknown): HTMLElement | null {
	const payload = cellStatePayload(data);
	if (!payload) return null;
	const names = [...Object.keys(payload.views), ...Object.keys(payload.store)];
	const div = document.createElement("div");
	div.className = "doc-cell-state";
	div.textContent = names.length
		? `⟳ widget state (${names.join(", ")}) — restores on reload`
		: "⟳ widget state";
	return div;
}

export const viewTemplates = new Map<string, ViewTemplate>([
	["cell-state", renderCellState],
	["diff", renderDiff],
	["file-tree", renderFileTree],
	["table", renderTable],
	["cards", renderCards],
	["matches", renderMatches],
	["properties", renderProperties],
	// An A2UI v1.0 surface over Piary's catalog (document-format.md §views).
	["a2ui", renderA2ui],
	// The sub-agent block's link widget (step 12) — a view, not a third marker.
	["subsession", renderSubsession],
]);

export function registerViewTemplate(name: string, render: ViewTemplate): void {
	viewTemplates.set(name, render);
}

export function getViewTemplate(name: string): ViewTemplate | undefined {
	return viewTemplates.get(name);
}

/** Extracts a template payload from a toolCall/result pair, or null when the
 *  data doesn't fit. Extractors live with their templates; first match wins. */
export type ViewExtractor = (callName: string | undefined, callArgs: unknown, resultText: string) => unknown;

const viewExtractors: [string, ViewExtractor][] = [
	["diff", extractDiff],
	["matches", extractMatches],
	["file-tree", extractFileTree],
	["cards", extractCards],
	["table", extractTable],
	["properties", extractProperties],
];

const stripFence = (text: string): string => {
	const m = /^(`{3,})[^\n]*\n([\s\S]*?)\n\1$/.exec(text);
	return m ? m[2] : text;
};

/**
 * "View over artifact" (step 11): pair a toolResult segment with its call and
 * try each template's extractor against them. Error results and shapes no
 * extractor claims yield null — the caller offers nothing.
 */
export function viewOverArtifact(segments: readonly DocSegment[], at: number): { template: string; data: unknown } | null {
	const res = segments[at];
	if (res?.kind !== "toolResult" || res.isError) return null;
	let call: DocSegment | undefined;
	for (let i = at - 1; i >= 0 && !call; i--) {
		if (segments[i].kind === "toolCall" && segments[i].id === res.id) call = segments[i];
	}
	let args: unknown;
	try {
		args = JSON.parse(stripFence(call?.text ?? ""));
	} catch {} // arguments stay undefined — text-shaped extractors still run
	const out = stripFence(res.text);
	for (const [template, extract] of viewExtractors) {
		const data = extract(call?.name, args, out);
		if (data != null) return { template, data };
	}
	return null;
}

/**
 * Extract a view segment's payload: the first fenced block in the segment,
 * parsed as JSON. Returns the parsed data plus the offset of the closing
 * fence line's end (the widget replaces marker through there). Null when the
 * fence is unclosed (mid-stream) or the JSON is broken — the segment then
 * renders as a plain fence.
 */
export function viewPayload(md: string, seg: DocSegment): { data: unknown; to: number } | null {
	let open: { ticks: number; contentFrom: number } | null = null;
	for (let at = seg.bodyFrom; at < seg.to; ) {
		const nl = md.indexOf("\n", at);
		const lineEnd = nl >= 0 && nl < seg.to ? nl : seg.to;
		const line = md.slice(at, lineEnd);
		if (!open) {
			const m = /^(`{3,})\S*\s*$/.exec(line);
			if (m) open = { ticks: m[1].length, contentFrom: lineEnd + 1 };
		} else {
			const m = /^(`{3,})\s*$/.exec(line);
			if (m && m[1].length >= open.ticks) {
				try {
					return { data: JSON.parse(md.slice(open.contentFrom, at)), to: lineEnd };
				} catch {
					return null;
				}
			}
		}
		if (nl < 0 || nl >= seg.to) break;
		at = nl + 1;
	}
	return null;
}
