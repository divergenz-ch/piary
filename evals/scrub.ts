// What keeps this machine out of a report. A report is committed, and an answer
// quotes the paths its tools saw: the case's scratch directory, the checkout the
// run started from, the home directory above both. Each is written as a
// placeholder, so two runs of one case read alike and a report names no one's
// disk. Pure: the runner says which directories are whose.

/** The directories of one run. `scratch` is a case's own, gone when it ends. */
export interface Roots {
	scratch?: string;
	repo: string;
	home: string;
}

/** macOS reaches its temp directory through a symlink, so a tool that resolves
 *  its cwd reports `/private/var/…` for the `/var/…` the runner made. */
function spellings(dir: string): string[] {
	const bare = dir.startsWith("/private/") ? dir.slice("/private".length) : dir;
	return [`/private${bare}`, bare];
}

/** `text` with every root written as `<scratch>`, `<repo>` or `~`. The longest
 *  root goes first, so a checkout under the home directory is not left as `~/…`. */
export function scrubPaths(text: string, roots: Roots): string {
	const named: [string, string][] = [
		...(roots.scratch ? spellings(roots.scratch).map((dir): [string, string] => [dir, "<scratch>"]) : []),
		[roots.repo, "<repo>"],
		[roots.home, "~"],
	];
	named.sort(([a], [b]) => b.length - a.length);
	let out = text;
	for (const [dir, name] of named) if (dir.length > 1) out = out.replaceAll(dir, name);
	return out;
}

/** A value as it would read once written as JSON, with its paths scrubbed. */
export function scrubbed<T>(value: T, roots: Roots): T {
	return JSON.parse(scrubPaths(JSON.stringify(value), roots)) as T;
}
