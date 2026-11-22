// The `file-tree` view template: {paths: string[]} → a collapsible tree.
// Native <details> does the collapsing; only the first level starts open —
// 100–200 flat find/ls paths are the use case.

interface TreeNode {
	children: Map<string, TreeNode>;
	isFile: boolean;
}

function leafCount(node: TreeNode): number {
	let n = node.isFile && node.children.size === 0 ? 1 : 0;
	for (const child of node.children.values()) n += leafCount(child);
	return n;
}

function renderNode(name: string, node: TreeNode, depth: number): HTMLElement {
	if (node.children.size === 0) {
		const file = document.createElement("div");
		file.className = "doc-tree-file";
		file.textContent = name;
		return file;
	}
	const dir = document.createElement("details");
	dir.className = "doc-tree-dir";
	dir.open = depth === 0;
	const summary = document.createElement("summary");
	summary.textContent = `${name}/`;
	const count = document.createElement("span");
	count.className = "doc-tree-count";
	count.textContent = String(leafCount(node));
	summary.append(count);
	dir.append(summary);
	const entries = [...node.children.entries()].sort(
		(a, b) => Number(b[1].children.size > 0) - Number(a[1].children.size > 0) || a[0].localeCompare(b[0]),
	);
	for (const [childName, child] of entries) dir.append(renderNode(childName, child, depth + 1));
	return dir;
}

/** Path-per-line output (ls, find, bare file lists) → file-tree payload.
 *  Bracketed `[…]` notice lines are dropped; any line with spaces disqualifies. */
export function extractFileTree(name: string | undefined, _args: unknown, out: string): unknown {
	const lines = out
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !/^\[.*\]$/.test(l));
	if (lines.length < 2 || !lines.every((l) => /^\S+$/.test(l))) return null;
	if (name !== "ls" && name !== "find" && !lines.some((l) => l.includes("/"))) return null;
	return { paths: lines };
}

export function renderFileTree(data: unknown): HTMLElement | null {
	const d = data as { paths?: unknown } | null;
	if (!d || typeof d !== "object" || !Array.isArray(d.paths) || !d.paths.every((p) => typeof p === "string")) {
		return null;
	}
	const root: TreeNode = { children: new Map(), isFile: false };
	for (const path of d.paths as string[]) {
		let node = root;
		for (const part of path.split("/").filter(Boolean)) {
			let child = node.children.get(part);
			if (!child) {
				child = { children: new Map(), isFile: false };
				node.children.set(part, child);
			}
			node = child;
		}
		node.isFile = true;
	}
	const el = document.createElement("div");
	el.className = "doc-view-tree";
	for (const [name, node] of root.children) el.append(renderNode(name, node, 0));
	return el;
}
