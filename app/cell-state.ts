// What a document's cells hold in `state()` and their views: kept across
// reloads in the app's own store (`src-tauri/src/cell_state.rs`).
//
// The canvas does neither half until it is told what was kept: `cellState`
// `undefined` means "not fetched", and the canvas waits for it before it
// restores or saves. So the page always answers — the kept state, or `null`
// for none — and saves what the canvas reports.

import { cellStateRead, cellStateWrite, piSend, piStart } from "../src/bridge.ts";
import { parseDocument } from "../src/document/format.ts";
import { latestCellState } from "../src/document/transcript.ts";
import type { HostFragment } from "./canvas-events.ts";
import type { AppContext } from "./context.ts";

export interface CellState {
	/** Reads what was kept and hands it to the canvas. Call after every
	 *  `setDocument`, which resets the canvas's wait. */
	restore(): Promise<void>;
	/** The canvas's request to keep its cells' state. */
	handlers(): HostFragment<"cell-state-save">;
	/** The state last kept, or what was restored; null when there is none. */
	latest(): unknown;
}

/** The read failed, which is not the same as "nothing was ever kept". */
const UNREADABLE = Symbol("unreadable");

/**
 * The widget state an earlier Piary appended to pi's transcript for this
 * session, or `undefined` when pi could not be asked. Starts the session's pi
 * to ask: the cost of reading a document's old state on its first open.
 */
async function fromTranscript(sid: string): Promise<unknown> {
	try {
		await piStart(sid);
		const reply = await piSend(sid, { type: "get_entries" });
		if (reply?.success !== true || !reply.data) return undefined;
		return latestCellState((reply.data["entries"] ?? []) as Parameters<typeof latestCellState>[0]) ?? null;
	} catch {
		return undefined;
	}
}

export function createCellState({ chat, sid }: Pick<AppContext, "chat" | "sid">): CellState {
	let latest: unknown = null;
	return {
		async restore() {
			const kept = await cellStateRead(sid).catch(() => UNREADABLE);
			let state = kept === UNREADABLE ? null : kept;
			// Never checked, and there are cells whose state an earlier Piary may
			// have kept in pi's transcript: ask once, and record the answer —
			// `null` included, "checked, nothing there" — so no later open asks
			// again. A pi that cannot be asked records nothing: the next open tries.
			if (kept === undefined && parseDocument(chat.getDocument()).segments.some((seg) => seg.kind === "cell")) {
				const found = await fromTranscript(sid);
				if (found !== undefined) {
					state = found;
					void cellStateWrite(sid, found).catch(() => {});
				}
			}
			// Nothing kept, nothing readable: the defaults are honest.
			latest = state ?? null;
			chat.cellState = latest;
		},
		handlers: () => ({
			"cell-state-save": ({ state }) => {
				latest = state;
				// Silent on failure: a lost slider position is not something the
				// user acts on, and the status line is for the document.
				void cellStateWrite(sid, state).catch(() => {});
			},
		}),
		latest: () => latest,
	};
}
