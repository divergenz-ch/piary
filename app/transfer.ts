// Import… and Export… of the File menu (ADR 0049): each opens a window of its
// own, the way Settings… does, because neither acts on the document in front.
// An import has no conversation yet, and an export asks which ones.
//
// Here is what a window does when the menu names one of them, and what the two
// windows share. The windows themselves are `import-window.ts` and
// `export-window.ts`.

import { openTransfer } from "../src/bridge.ts";
import type { AppContext } from "./context.ts";
import type { DocumentSync } from "./document-sync.ts";
import { documentVerbs } from "./documents.ts";

/** Import… and Export…, for the window showing the document `sid`. The Export
 *  window opens with this conversation chosen, and reads it from the store, so
 *  the window's text is saved before it is asked for. */
export function transferVerbs(
	{ chat, sid, notify }: Pick<AppContext, "chat" | "sid" | "notify">,
	sync: Pick<DocumentSync, "save">,
): Record<"import" | "export", () => void> {
	const failed = (error: unknown) => notify(String(error));
	return {
		import: () => void openTransfer("import").catch(failed),
		export: () =>
			void sync
				.save(chat.getDocument())
				.then(() => openTransfer("export", sid))
				.catch(failed),
	};
}

/** What a window with no document answers of the menu: the verbs that open a
 *  window. Every other item acts on a document, which it does not have. */
export function windowVerbs(notify: (message: string) => void): Record<string, (() => void) | undefined> {
	const failed = (error: unknown) => notify(String(error));
	return {
		...documentVerbs({ sid: "", notify }),
		import: () => void openTransfer("import").catch(failed),
		export: () => void openTransfer("export").catch(failed),
	};
}

/** `2 attachments`, `1 attachment`. */
export const counted = (names: readonly string[]) => `${names.length} attachment${names.length === 1 ? "" : "s"}`;
