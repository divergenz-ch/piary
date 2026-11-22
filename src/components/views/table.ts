// The `table` view template: {columns, rows} — column-shaped output (ps/df,
// arrays of records). Numeric columns right-align.

const cellText = (cell: unknown): string =>
	cell == null ? "" : typeof cell === "object" ? JSON.stringify(cell) : String(cell);
const numeric = (text: string) => /^-?[\d,.]*\d\s*%?$/.test(text.trim());

/** Accepts both the documented shape (columns: string[], rows: unknown[][])
 *  and the record shape models keep emitting: columns of {key,label}, rows of
 *  objects keyed by those keys. Returns null when neither fits. */
export function normalizeTable(data: unknown): { columns: string[]; rows: unknown[][] } | null {
	const d = data as { columns?: unknown; rows?: unknown } | null;
	if (!d || typeof d !== "object" || !Array.isArray(d.columns) || d.columns.length === 0 || !Array.isArray(d.rows))
		return null;
	const cols = d.columns as unknown[];
	if (cols.every((c) => typeof c === "string")) {
		if (d.rows.every((r) => Array.isArray(r))) return { columns: cols as string[], rows: d.rows as unknown[][] };
		if (d.rows.every(isPlain))
			return { columns: cols as string[], rows: d.rows.map((r) => (cols as string[]).map((c) => (r as Record<string, unknown>)[c] ?? null)) };
		return null;
	}
	if (!cols.every((c) => isPlain(c) && typeof c.key === "string")) return null;
	const keyed = cols as { key: string; label?: unknown }[];
	const labels = keyed.map((c) => (typeof c.label === "string" ? c.label : c.key));
	if (d.rows.every((r) => Array.isArray(r))) return { columns: labels, rows: d.rows as unknown[][] };
	if (!d.rows.every(isPlain)) return null;
	return { columns: labels, rows: d.rows.map((r) => keyed.map((c) => (r as Record<string, unknown>)[c.key] ?? null)) };
}

export function renderTable(data: unknown): HTMLElement | null {
	const norm = normalizeTable(data);
	if (!norm) return null;
	const { columns } = norm;
	const rows = norm.rows.map((r) => columns.map((_, i) => cellText(r[i])));
	const numCol = columns.map((_, i) => rows.some((r) => r[i]) && rows.every((r) => !r[i] || numeric(r[i])));

	const table = document.createElement("table");
	table.className = "doc-view-table";
	const head = table.createTHead().insertRow();
	columns.forEach((name, i) => {
		const th = document.createElement("th");
		th.textContent = name;
		if (numCol[i]) th.className = "num";
		head.append(th);
	});
	const body = table.createTBody();
	for (const row of rows) {
		const tr = body.insertRow();
		row.forEach((cell, i) => {
			const td = tr.insertCell();
			td.textContent = cell;
			if (numCol[i]) td.className = "num";
		});
	}
	return table;
}

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** JSON array of flat records → table payload. */
export function extractTable(_name: string | undefined, _args: unknown, out: string): unknown {
	let parsed: unknown;
	try {
		parsed = JSON.parse(out);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isPlain)) return null;
	if (parsed.some((row) => Object.values(row).some((v) => typeof v === "object" && v !== null))) return null;
	const columns: string[] = [];
	for (const row of parsed) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
	if (columns.length === 0) return null;
	return { columns, rows: parsed.map((row) => columns.map((key) => row[key] ?? null)) };
}
