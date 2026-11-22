// The eval's answer to the `cell` tool's question, how did the cell I wrote
// run? (`docs/notebook-cells.md` §Policy). The app's page runs the cell; the
// eval has no page, so it checks only that the source compiles. A cell that
// does not is reported failed, as the page would, and the agent gets the fix
// loop the app gives it. A cell that compiles gets no verdict: it was not run,
// and the tool says "not verified".
import { CellVerdicts, requestedCell, type WireVerdict } from "../app/cell-verdicts.ts";
import { CELL_MODES } from "../src/document/cells.ts";
import { compileCell } from "../src/notebook/compile.ts";
import type { WrittenCell } from "./calls.ts";

/** What to tell the agent about cell `id`, or null for no verdict. `verdicts`
 *  counts the failed writes, with the app's own limit. */
export function compileVerdict(verdicts: CellVerdicts, id: string, cell: WrittenCell | undefined): WireVerdict | null {
	// A mode that is not one never reaches here: the tool refuses it.
	const mode = CELL_MODES.find((known) => known === cell?.mode);
	if (!cell || !mode) return null;
	try {
		compileCell(1, cell.source, mode);
		return null;
	} catch (e) {
		return verdicts.answer(id, { verdict: "failed", error: e instanceof Error ? e.message : String(e) });
	}
}

/** The methods of an extension UI request that wait for an answer. */
const DIALOGS = new Set(["select", "confirm", "input", "editor"]);

/**
 * The line to write back for `event`, or null when it asks nothing. Every
 * dialog is answered at once: a verdict request with the cell's verdict, and
 * anything else (and a cell with no verdict) as cancelled, which is what a
 * tool reads when no page answered. Left alone, each would wait out its
 * timeout inside the turn's measured time.
 */
export function dialogReply(event: Record<string, unknown>, cellOf: (id: string) => WrittenCell | undefined, verdicts: CellVerdicts): Record<string, unknown> | null {
	const { type, id, method } = event;
	if (type !== "extension_ui_request" || typeof id !== "string" || typeof method !== "string" || !DIALOGS.has(method)) return null;
	const asked = requestedCell(event);
	const verdict = asked ? compileVerdict(verdicts, asked.cellId, cellOf(asked.cellId)) : null;
	return verdict ? { type: "extension_ui_response", id, value: JSON.stringify(verdict) } : { type: "extension_ui_response", id, cancelled: true };
}
