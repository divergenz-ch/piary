// The `diff` view template: {file?, oldText, newText} → a unified line diff.
// The edit tool's oldText/newText pairs are the source payload.

export interface DiffLine {
	type: "same" | "del" | "ins";
	text: string;
}

/** Plain LCS line diff, deletions before insertions within a hunk. */
// ponytail: O(n·m) table; edit-tool payloads are small. Myers if it ever isn't.
export function lineDiff(oldText: string, newText: string): DiffLine[] {
	const a = oldText.split("\n");
	const b = newText.split("\n");
	const n = a.length;
	const m = b.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--)
		for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
	const lines: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n || j < m) {
		if (i < n && j < m && a[i] === b[j]) lines.push({ type: "same", text: a[i++] }), j++;
		else if (i < n && (j === m || dp[i + 1][j] >= dp[i][j + 1])) lines.push({ type: "del", text: a[i++] });
		else lines.push({ type: "ins", text: b[j++] });
	}
	return lines;
}

/** Edit-tool call → diff payload. */
// ponytail: multi-edit calls show their first pair only; per-pair views if it matters.
export function extractDiff(name: string | undefined, args: unknown): unknown {
	if (name !== "edit") return null;
	const a = args as { path?: unknown; edits?: unknown; oldText?: unknown; newText?: unknown } | null | undefined;
	if (!a || typeof a !== "object") return null;
	const edit = Array.isArray(a.edits) ? (a.edits[0] as { oldText?: unknown; newText?: unknown } | undefined) : a;
	if (!edit || typeof edit.oldText !== "string" || typeof edit.newText !== "string") return null;
	return {
		...(typeof a.path === "string" && a.path ? { file: a.path } : {}),
		oldText: edit.oldText,
		newText: edit.newText,
	};
}

const GUTTER = { same: " ", del: "-", ins: "+" } as const;

export function renderDiff(data: unknown): HTMLElement | null {
	const d = data as { file?: unknown; oldText?: unknown; newText?: unknown } | null;
	if (!d || typeof d !== "object" || typeof d.oldText !== "string" || typeof d.newText !== "string") return null;
	const root = document.createElement("div");
	root.className = "doc-view-diff";
	if (typeof d.file === "string" && d.file) {
		const file = document.createElement("div");
		file.className = "doc-diff-file";
		file.textContent = d.file;
		root.append(file);
	}
	for (const line of lineDiff(d.oldText, d.newText)) {
		const row = document.createElement("div");
		row.className = `doc-diff-line ${line.type}`;
		const gutter = document.createElement("span");
		gutter.className = "doc-diff-gutter";
		gutter.textContent = GUTTER[line.type];
		const text = document.createElement("span");
		text.className = "doc-diff-text";
		text.textContent = line.text;
		row.append(gutter, text);
		root.append(row);
	}
	return root;
}
