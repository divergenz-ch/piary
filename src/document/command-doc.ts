// Docs for `/` commands: the hover card over a `/name` already written in the
// tail. The menu has no card; its rows say what a command does.
//
// A card is a glance: the name, what to type after it, one line of what it
// does and where it comes from. It never carries the file's body: a command is
// learned by running it, not by reading it in a tooltip.
//
// The description and the argument hint come from the frontmatter of the
// command's own source file (pi's get_commands hands out sourceInfo.path); the
// host reads it and parseCommandDoc lifts the two. Pure — no fs, no fetch — so
// it unit-tests as plain data.

export interface CommandDoc {
	name: string;
	description?: string;
	argumentHint?: string;
	/** "document" = a row the host owns (block/cell/view), no file behind it. */
	source: "prompt" | "skill" | "extension" | "document";
	path?: string;
}

/** Frontmatter, tolerantly: a missing closing `---` means "no frontmatter",
 *  never "swallow the file". */
export function parseCommandDoc(
	name: string,
	source: CommandDoc["source"],
	path: string | undefined,
	text: string,
): CommandDoc {
	const doc: CommandDoc = { name, source, path };
	const fm = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"));
	for (const line of fm ? fm[1].split("\n") : []) {
		const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
		if (!kv) continue;
		const value = kv[2].trim().replace(/^["'](.*)["']$/, "$1");
		if (!value) continue;
		if (kv[1] === "description") doc.description = value;
		else if (kv[1] === "argument-hint" || kv[1] === "argumentHint") doc.argumentHint = value;
	}
	return doc;
}

/** The card: header, description, dimmed source footer. */
export function renderCommandDoc(doc: CommandDoc): HTMLElement {
	const el = document.createElement("div");
	el.className = "doc-command-doc";

	const head = document.createElement("div");
	head.className = "doc-command-doc-head";
	const name = document.createElement("code");
	name.textContent = `/${doc.name}`;
	head.append(name);
	if (doc.argumentHint) {
		const hint = document.createElement("span");
		hint.className = "doc-command-doc-args";
		hint.textContent = doc.argumentHint;
		head.append(hint);
	}
	el.append(head);

	if (doc.description) {
		const desc = document.createElement("p");
		desc.className = "doc-command-doc-desc";
		desc.textContent = doc.description;
		el.append(desc);
	}

	const foot = document.createElement("div");
	foot.className = "doc-command-doc-foot";
	const badge = document.createElement("span");
	badge.className = "doc-command-doc-badge";
	// A row of the host's own is the app's: "document" is how the code tells
	// it apart, and reads as a stray word under a command's card.
	badge.textContent = doc.source === "document" ? "Piary" : doc.source;
	foot.append(badge);
	if (doc.path) foot.append(shortPath(doc.path));
	el.append(foot);
	return el;
}

/** Last two segments — enough to recognize the file, short enough to fit. */
function shortPath(path: string): string {
	const parts = path.split("/").filter(Boolean);
	return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : parts.join("/");
}
