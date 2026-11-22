// The `properties` view template: one small structured JSON object as a
// key → value table. The payload IS the object; nested values render inline.

export function renderProperties(data: unknown): HTMLElement | null {
	if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
	const entries = Object.entries(data as Record<string, unknown>);
	if (entries.length === 0) return null;
	const table = document.createElement("table");
	table.className = "doc-view-props";
	const body = table.createTBody();
	for (const [key, value] of entries) {
		const row = body.insertRow();
		const k = row.insertCell();
		k.className = "doc-prop-key";
		k.textContent = key;
		const v = row.insertCell();
		v.className = "doc-prop-value";
		v.textContent = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
	}
	return table;
}

/** Any parseable JSON object → its own properties payload (the catch-all). */
export function extractProperties(_name: string | undefined, _args: unknown, out: string): unknown {
	let parsed: unknown;
	try {
		parsed = JSON.parse(out);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.keys(parsed).length === 0)
		return null;
	return parsed;
}
