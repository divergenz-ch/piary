// Which pi extensions one conversation loads: a row of the model menu, and a
// menu of what pi's settings install. Rust holds the choice and turns it into
// start flags, so a change takes effect when pi next starts: stopped here, and
// started again by the next send.

import type { MenuItem } from "./menu.ts";
import { openMenu } from "./menu.ts";
import { type ExtensionRow, extensionsList, extensionsSet } from "../src/bridge.ts";
import type { AppContext } from "./context.ts";
import type { ModelPicker } from "./picks.ts";

const label = (row: ExtensionRow): string => row.name ?? row.source.replace(/^npm:/, "");

/** Why a row cannot be toggled, or nothing when it can. */
function lockedBecause(row: ExtensionRow): string | undefined {
	if (row.own) return "Piary's own extension stays on: the canvas runs on it";
	if (row.pinnedOff) return "Turned off in pi's settings for every conversation";
	if (!row.files) return "This package holds no extension";
	return undefined;
}

export function mountExtensions(host: Pick<AppContext, "sid" | "turn" | "notify" | "busy">, picker: Pick<ModelPicker, "addRow" | "chip" | "forget">): void {
	const { sid, turn, notify, busy } = host;

	const toggle = async (row: ExtensionRow): Promise<void> => {
		if (busy()) {
			notify("Extensions can be changed once the reply has finished.");
			return;
		}
		// Stopped first: extensions are read when pi starts.
		if (await turn.stopPi()) picker.forget();
		try {
			await extensionsSet(sid, row.source, !row.enabled);
			notify(`${label(row)} is ${row.enabled ? "off" : "on"} for this conversation, from the next send.`);
		} catch (error) {
			notify(`Could not change ${label(row)}: ${String(error)}`);
		}
	};

	const rowsOf = (rows: readonly ExtensionRow[]): MenuItem[] =>
		rows.length
			? rows.map((row) => {
					const locked = lockedBecause(row);
					return {
						label: `${row.enabled ? "✓ " : ""}${label(row)}`,
						title: locked ?? `${row.scope} · ${row.source}`,
						disabled: locked !== undefined,
						run: () => void toggle(row),
					};
				})
			: [{ label: "pi's settings install no extensions", disabled: true, run: () => {} }];

	const open = async (): Promise<void> => {
		const rows = await extensionsList(sid).catch((error: unknown) => {
			notify(`Could not list the extensions: ${String(error)}`);
			return null;
		});
		if (!rows) return;
		const box = picker.chip.getBoundingClientRect();
		openMenu(box.left, box.top, rowsOf(rows), { above: true });
	};

	picker.addRow({ label: "Extensions…", title: "What this conversation's pi loads", run: () => void open() });
}
