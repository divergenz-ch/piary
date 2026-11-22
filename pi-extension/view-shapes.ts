// Payload shape check at the tool boundary: a template that can't render its
// data degrades to a plain JSON fence in the document, which reads as "the
// widget randomly failed". Rejecting here tells the agent the expected shape
// while it can still retry. Deliberately loose — the renderers are the
// authority, this only catches the shapes that never render.
import type { DrawMode } from "./draw-mode.ts";

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => typeof v === "string";
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

const shapes: Record<string, { ok: (d: Record<string, unknown>) => boolean; want: string }> = {
	diff: {
		ok: (d) => str(d.oldText) && str(d.newText),
		want: '{ "file"?: string, "oldText": string, "newText": string }',
	},
	"file-tree": {
		ok: (d) => arr(d.paths).length > 0 && arr(d.paths).every(str),
		want: '{ "paths": string[] }',
	},
	table: {
		// Columns as strings or {key,label}; rows as arrays or records.
		ok: (d) =>
			arr(d.columns).length > 0 &&
			arr(d.columns).every((c) => str(c) || str(obj(c).key)) &&
			Array.isArray(d.rows) &&
			arr(d.rows).every((r) => Array.isArray(r) || (r != null && typeof r === "object")),
		want: '{ "columns": string[], "rows": unknown[][] } (or {key,label} columns with object rows)',
	},
	cards: {
		ok: (d) => arr(d.results).length > 0 && arr(d.results).every((r) => str(obj(r).title)),
		want: '{ "results": [{ "title": string, "url"?: string, "age"?: string, "snippet"?: string }] }',
	},
	matches: {
		ok: (d) =>
			arr(d.matches).length > 0 &&
			arr(d.matches).every((m) => str(obj(m).file) && arr(obj(m).lines).every((l) => str(obj(l).text))),
		want: '{ "matches": [{ "file": string, "lines": [{ "line"?: number, "text": string, "spans"?: [number,number][] }] }] }',
	},
	properties: {
		ok: (d) => Object.keys(d).length > 0,
		want: "a non-empty flat JSON object of key → value",
	},
	// The envelope only: whether the components fit the catalog is `checkA2ui`'s
	// (a2ui.ts), which runs the renderer's own validation.
	a2ui: {
		ok: (d) => Array.isArray(d.components) || Array.isArray(d.messages) || "createSurface" in d,
		want: '{ "components": [{ "id": "root", "component": string, ...props }, ...], "dataModel"?: object }',
	},
};

/** Null when the payload will render; an agent-facing message when it won't.
 *
 *  In free drawing the a2ui template is not offered (ADR 0044), and a call to it
 *  is refused before its payload is looked at: a model that saw a2ui views in a
 *  conversation's history tries one, and has to be told what to draw with. */
export function checkView(template: string, data: unknown, mode: DrawMode): string | null {
	if (mode === "free" && template === "a2ui") return "The a2ui template is not enabled in this session; draw it with the `cell` tool.";
	const shape = shapes[template];
	if (!shape) {
		const offered = Object.keys(shapes).filter((name) => mode !== "free" || name !== "a2ui");
		return `Unknown template "${template}". Use one of: ${offered.join(", ")}.`;
	}
	if (shape.ok(obj(data))) return null;
	return `The data does not fit the "${template}" template, so it would render as a plain JSON fence instead of a widget. Expected ${shape.want}. Fix the payload or pick another template (see the view-templates skill).`;
}
