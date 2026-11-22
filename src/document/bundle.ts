// What a document needs said about it when it leaves the store or enters it
// (ADR 0049): which attachments it references, how its links follow a file that
// had to be stored under another name, what an imported document is written
// as, and the id a second copy takes.
//
// A bundle is the document beside an `attachments/` holding the files it
// references. The store keeps one `attachments/` for a whole workspace, so the
// document's own links are the only record of which files are its.

import { rebindDocument, rewriteRefusal } from "./format.ts";

/** A markdown link's target under `/attachments/` (§Attachments). The name is
 *  the store's alphabet: it cleans every other character out on the way in, so
 *  a target holding anything else names no stored file. */
const ATTACHMENT_LINK = /\]\(\/attachments\/([A-Za-z0-9_.-]+)\)/g;

/** The stored name of every attachment the document links to, each once, in
 *  document order. A link in prose counts as one in a `pi:file` segment does:
 *  either way the document shows a file it does not hold. */
export function attachmentRefs(md: string): string[] {
	const names = new Set<string>();
	for (const m of md.matchAll(ATTACHMENT_LINK)) names.add(m[1]);
	return [...names];
}

/** The document with each link to a renamed attachment following it. Nothing
 *  but those link targets moves. */
export function renameAttachments(md: string, renames: Readonly<Record<string, string>>): string {
	return md.replace(ATTACHMENT_LINK, (link, name: string) =>
		Object.hasOwn(renames, name) ? `](/attachments/${renames[name]})` : link,
	);
}

/** An imported document as the store should hold it under `id`. */
export interface ImportVerdict {
	content: string;
	/** Why the document opens read-only, or null when it does not. */
	readOnly: string | null;
}

/**
 * What to write for a document imported as `id`.
 *
 * It is bound to `id`, so it never shares a pi session with the conversation
 * it was exported from. A document of a version this build does not know is
 * left byte for byte instead: binding it would be the rewrite §Frontmatter's
 * version rule forbids, and it opens read-only.
 */
export function importVerdict(md: string, id: string): ImportVerdict {
	const readOnly = rewriteRefusal(md);
	return readOnly === null ? { content: rebindDocument(md, id), readOnly } : { content: md, readOnly };
}

/** The first of `name-2`, `name-3`, … that no document has: the id a document
 *  takes when it is kept beside the one already called `name`. */
export function freeId(name: string, taken: readonly string[]): string {
	const used = new Set(taken);
	let n = 2;
	while (used.has(`${name}-${n}`)) n++;
	return `${name}-${n}`;
}
