// Inserting a cell from the gutter's `+`, and moving one by its grip.

import { type CellMode, insertCellAt, moveCellByOffset } from "../src/document/run.ts";
import type { HostFragment } from "./canvas-events.ts";
import type { AppContext } from "./context.ts";
import { openMenu } from "./menu.ts";

export function cellHandlers({ chat }: Pick<AppContext, "chat">): HostFragment<"cell-insert" | "cell-move"> {
	/** Inserts a cell of `mode` at `at`, the caret on the line you type on. */
	const insertCell = (at: number, mode: CellMode): void => {
		chat.edit((md) => {
			const s = insertCellAt(md, at, mode);
			return { changes: { from: s.from, to: s.to, insert: s.insert }, caret: s.caret };
		});
	};

	return {
		// The `+` in the gap between two cells: the kinds a cell can be, and the
		// one chosen inserted there with the caret on its first line.
		"cell-insert": ({ at, x, y }) =>
			openMenu(x, y, [
				{ label: "Markdown", run: () => insertCell(at, "markdown") },
				{ label: "Prompt", run: () => insertCell(at, "prompt") },
				{ label: "JavaScript", run: () => insertCell(at, "js") },
			]),
		// A cell dragged by its grip, dropped in a gap. A splice rather than a
		// reload: undoable, every other live cell left standing, the viewport held
		// where the reader is looking. The `doc-change` it raises saves it.
		"cell-move": ({ from, beforeFrom }) => {
			const next = moveCellByOffset(chat.getDocument(), from, beforeFrom);
			if (next !== null) chat.replaceDocument(next);
		},
	};
}
