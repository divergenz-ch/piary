// Which blocks a document had collapsed, kept across reloads.
//
// Folds are presentation state, not the conversation: losing one costs a click,
// and nothing in it is the user's work. So they live in the webview's
// `localStorage`, per session. ADR 0018's
// objection to a `localStorage` draft is to a second copy of the *document* in
// a store no user can see, which a list of offsets is not.
//
// The editor maps its folds through every edit; a list stored only when a fold
// toggles would fall behind, and an edit above a collapsed block would reopen
// it on the next load. So the list is also stored on every save.

import type { DocumentSync } from "./document-sync.ts";
import type { HostFragment } from "./canvas-events.ts";
import type { AppContext } from "./context.ts";

const key = (sid: string) => `piary-folds:${sid}`;

/** The collapsed blocks a document had, as head offsets. Empty when nothing is
 *  stored or what is stored cannot be read. */
export function storedFolds(sid: string): number[] {
	try {
		const folds: unknown = JSON.parse(localStorage.getItem(key(sid)) ?? "[]");
		return Array.isArray(folds) ? folds.filter((at): at is number => typeof at === "number") : [];
	} catch {
		// Unreadable or unparsable: no folds, never a broken page.
		return [];
	}
}

/** Keeps `folds` for `sid`, or forgets the entry when there are none. */
export function storeFolds(sid: string, folds: readonly number[]): void {
	try {
		if (folds.length) localStorage.setItem(key(sid), JSON.stringify(folds));
		else localStorage.removeItem(key(sid));
	} catch {} // a storage that refuses (quota, a locked profile) costs folds, not the page
}

/** Answers `block-folds`, restores the stored folds once the canvas has a view,
 *  and stores the editor's current folds on every save. */
export function keepFolds(
	{ chat, sid }: Pick<AppContext, "chat" | "sid">,
	{ sync }: { sync: Pick<DocumentSync, "onChange"> },
): HostFragment<"block-folds"> {
	// `setBlockFolds` does nothing before the editor exists, and it exists only
	// after the element has rendered.
	void chat.updateComplete.then(() => chat.setBlockFolds(storedFolds(sid)));
	sync.onChange(() => storeFolds(sid, chat.blockFolds()));
	return { "block-folds": ({ folds }) => storeFolds(sid, folds) };
}
