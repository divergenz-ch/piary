// The window verbs of the File and Help menus: a new document, opening one
// that exists, and a fresh copy of the first-run tour.
//
// Each document is a window of its own (ADR 0027), so all three end in
// `openDocument`, which focuses the window already showing a document or
// builds one. A new id has no file yet, and its window opens on the empty
// document (`app/boot.ts`).

import { docsList, docsRead, docsWrite, openDocument } from "../src/bridge.ts";
import { rebindDocument } from "../src/document/format.ts";
import type { AppContext } from "./context.ts";
import { newSid } from "./ids.ts";
import { type MenuItem, openMenu } from "./menu.ts";
import type { ModelPicker } from "./picks.ts";
import { TOUR } from "./tour.ts";

/** How many documents Open… reads for a heading. Each is one local file read
 *  over IPC; past this many the list names the rest by id, so a workspace of
 *  hundreds opens its menu at once rather than after hundreds of reads. */
const HEADINGS_READ = 50;

/** A document's name in a list: its first `# ` heading, else its id. */
export function nameOf(id: string, md: string | null): string {
	return /^# +(.+)$/m.exec(md ?? "")?.[1]?.trim() || id;
}

/** The rows Open… offers: every document, this window's own marked and not
 *  choosable, the way the cell menu marks the current mode. In the store's
 *  order, which is by id — it keeps no times to sort by. */
async function openRows(current: string, failed: (error: unknown) => void): Promise<MenuItem[]> {
	const ids = await docsList();
	if (!ids.length) return [{ label: "No documents yet", run: () => {}, disabled: true }];
	const texts = await Promise.all(ids.map((id, i) => (i < HEADINGS_READ ? docsRead(id).catch(() => null) : null)));
	return ids.map((id, i) => ({
		label: `${nameOf(id, texts[i] ?? null)}${id === current ? " ·" : ""}`,
		disabled: id === current,
		title: id,
		run: () => void openDocument(id).catch(failed),
	}));
}

/** New Document and Open…, for the window showing `sid`. A store that cannot
 *  list or open is said on the status line, never shown as an empty workspace
 *  (ADR 0011). */
export function documentVerbs(
	{ sid, notify }: Pick<AppContext, "sid" | "notify">,
	model?: Pick<ModelPicker, "stageFor">,
): Record<"new-document" | "open-document" | "welcome", () => void> {
	const failed = (error: unknown) => notify(String(error));
	return {
		// On this window's model and effort (`app/model.ts`).
		"new-document": () => {
			const id = newSid();
			model?.stageFor(id);
			void openDocument(id).catch(failed);
		},
		// Anchored at the top of the window, centred: a menu from the menu bar
		// has no point in the page to open at.
		"open-document": () =>
			void openRows(sid, failed).then((rows) => openMenu(Math.max(16, innerWidth / 2 - 120), 8, rows), failed),
		// A fresh copy of the tour under a new id, written before its window is
		// asked for, so the window opens on it and, while untouched, walks it
		// (ADR 0038).
		welcome: () => {
			const id = newSid();
			model?.stageFor(id);
			void docsWrite(id, rebindDocument(TOUR, id)).then(() => openDocument(id)).catch(failed);
		},
	};
}
