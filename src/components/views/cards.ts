// The `cards` view template: {results: [{title, url?, age?, snippet?}]} —
// search-shaped output as result cards.

const hostOf = (url: string): string => {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
};

export function renderCards(data: unknown): HTMLElement | null {
	const d = data as { results?: unknown } | null;
	if (!d || typeof d !== "object" || !Array.isArray(d.results) || d.results.length === 0) return null;
	const results = d.results as { title?: unknown; url?: unknown; age?: unknown; snippet?: unknown }[];
	if (!results.every((r) => r && typeof r === "object" && typeof r.title === "string")) return null;

	const root = document.createElement("div");
	root.className = "doc-view-cards";
	for (const r of results) {
		const card = document.createElement("div");
		card.className = "doc-card";
		const linked = typeof r.url === "string" && /^https?:\/\//.test(r.url);
		const title = document.createElement(linked ? "a" : "span");
		if (linked) {
			(title as HTMLAnchorElement).href = r.url as string;
			(title as HTMLAnchorElement).target = "_blank";
			(title as HTMLAnchorElement).rel = "noopener";
		}
		title.className = "doc-card-title";
		title.textContent = r.title as string;
		card.append(title);
		const meta = [typeof r.url === "string" ? hostOf(r.url) : "", typeof r.age === "string" ? r.age : ""]
			.filter(Boolean)
			.join(" · ");
		if (meta) {
			const line = document.createElement("div");
			line.className = "doc-card-meta";
			line.textContent = meta;
			card.append(line);
		}
		if (typeof r.snippet === "string" && r.snippet) {
			const snippet = document.createElement("div");
			snippet.className = "doc-card-snippet";
			snippet.textContent = r.snippet;
			card.append(snippet);
		}
		root.append(card);
	}
	return root;
}

/** JSON array of linked records (title + url per item) → cards payload.
 *  Title-less or link-less arrays are rows, not cards — the table extractor's. */
export function extractCards(_name: string | undefined, _args: unknown, out: string): unknown {
	let parsed: unknown;
	try {
		parsed = JSON.parse(out);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed) || parsed.length === 0) return null;
	const pick = (r: Record<string, unknown>, keys: string[]) =>
		keys.map((k) => r[k]).find((v): v is string => typeof v === "string" && v !== "");
	const results = [];
	for (const raw of parsed) {
		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
		const r = raw as Record<string, unknown>;
		const title = pick(r, ["title", "name"]);
		const url = pick(r, ["url", "link", "href"]);
		if (!title || !url) return null;
		results.push({
			title,
			url,
			age: pick(r, ["age", "date", "published"]),
			snippet: pick(r, ["snippet", "description", "text"]),
		});
	}
	return { results };
}
