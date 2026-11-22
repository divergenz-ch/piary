// The `matches` view template: grep-shaped output grouped by file, with
// matched spans highlighted.

interface MatchLine {
	line?: number;
	text: string;
	spans?: [number, number][];
}

interface FileMatches {
	file: string;
	lines: MatchLine[];
}

function lineTextEl(text: string, spans: unknown): HTMLElement {
	const el = document.createElement("span");
	el.className = "doc-match-text";
	const valid = (Array.isArray(spans) ? spans : [])
		.filter(
			(s): s is [number, number] =>
				Array.isArray(s) && typeof s[0] === "number" && typeof s[1] === "number" && s[0] >= 0 && s[1] > s[0] && s[1] <= text.length,
		)
		.sort((a, b) => a[0] - b[0]);
	let at = 0;
	for (const [from, to] of valid) {
		if (from < at) continue;
		el.append(text.slice(at, from));
		const mark = document.createElement("mark");
		mark.textContent = text.slice(from, to);
		el.append(mark);
		at = to;
	}
	el.append(text.slice(at));
	return el;
}

export function renderMatches(data: unknown): HTMLElement | null {
	const d = data as { matches?: unknown } | null;
	if (!d || typeof d !== "object" || !Array.isArray(d.matches) || d.matches.length === 0) return null;
	const root = document.createElement("div");
	root.className = "doc-view-matches";
	for (const m of d.matches as Partial<FileMatches>[]) {
		if (!m || typeof m !== "object" || typeof m.file !== "string" || !Array.isArray(m.lines)) return null;
		const file = document.createElement("div");
		file.className = "doc-match-file";
		file.textContent = m.file;
		root.append(file);
		for (const l of m.lines as Partial<MatchLine>[]) {
			if (!l || typeof l !== "object" || typeof l.text !== "string") return null;
			const row = document.createElement("div");
			row.className = "doc-match-line";
			const gutter = document.createElement("span");
			gutter.className = "doc-match-gutter";
			gutter.textContent = typeof l.line === "number" ? String(l.line) : "";
			row.append(gutter, lineTextEl(l.text, l.spans));
			root.append(row);
		}
	}
	return root;
}

const MATCH_LINE = /^(.+?):(\d+): ?(.*)$/;

/** `path:line: text` output (grep -n shaped) → matches payload, grouped by
 *  file in output order. Spans come from re-running the call's pattern per
 *  line when it compiles — first match only, skipped on any doubt. */
export function extractMatches(name: string | undefined, args: unknown, out: string): unknown {
	const lines = out.split("\n").filter((l) => l.trim());
	const hits = lines.map((l) => MATCH_LINE.exec(l)).filter((m): m is RegExpExecArray => m !== null);
	if (hits.length < (name === "grep" ? 1 : 2) || hits.length < lines.length / 2) return null;

	let pattern: RegExp | null = null;
	const a = args as { pattern?: unknown; ignoreCase?: unknown; literal?: unknown } | null | undefined;
	if (a && typeof a === "object" && typeof a.pattern === "string") {
		try {
			pattern = new RegExp(
				a.literal ? a.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : a.pattern,
				a.ignoreCase ? "i" : "",
			);
		} catch {} // not a JS-compatible regex — no highlights
	}

	const matches: FileMatches[] = [];
	for (const [, file, line, text] of hits) {
		let group = matches[matches.length - 1];
		if (!group || group.file !== file) {
			group = { file, lines: [] };
			matches.push(group);
		}
		const entry: MatchLine = { line: Number(line), text };
		const found = pattern?.exec(text);
		if (found?.[0]) entry.spans = [[found.index, found.index + found[0].length]];
		group.lines.push(entry);
	}
	return { matches };
}
