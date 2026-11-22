// The native menu's verbs, answered in the page (`src-tauri/src/menu.rs`).
//
// The menu does not act: each item emits its id, and the page runs the same
// code the keyboard reaches, so the two routes cannot drift. Rust sends a click
// to the focused window only, so the window that answers is the one the user
// is looking at. `tests/contract/menubar.test.ts` holds `MENU_IDS` to `menu.rs`, and the
// compiler holds the table to `MENU_IDS`, so an item cannot arrive unanswered.

import { onMenu, openPreferences } from "../src/bridge.ts";
import type { AppContext } from "./context.ts";
import { documentVerbs } from "./documents.ts";
import type { DocumentSync } from "./document-sync.ts";
import type { ModelPicker } from "./picks.ts";
import { openTerminal } from "./terminals.ts";
import { transferVerbs } from "./transfer.ts";

/** Every id `menu.rs` emits to the page. Quit is Rust's own and never comes. */
export const MENU_IDS = ["new-document", "open-document", "import", "export", "save", "send", "stop", "new-terminal", "toggle-source", "toggle-focus", "choose-model", "choose-effort", "toggle-face", "commands", "welcome", "check-updates", "settings"] as const;
export type MenuId = (typeof MENU_IDS)[number];

/** Said when Show Source has nothing under the caret to show. */
const NOTHING_TO_SHOW = "Show Source works on a view or an artifact — put the caret in one.";

const isMenuId = (id: string): id is MenuId => (MENU_IDS as readonly string[]).includes(id);

/** What each item does in this window. */
export function menuTable(
	ctx: Pick<AppContext, "chat" | "sid" | "turn" | "notify">,
	sync: Pick<DocumentSync, "save">,
	model: Pick<ModelPicker, "stageFor" | "chooseModel" | "chooseEffort" | "checkUpdates">,
	// Structural, not `FocusMode`: `app/focus.ts` imports its stylesheet, which the
	// contract test that reads this module cannot resolve.
	focus: { toggle(): void },
	openCommands: () => void,
	face: { toggle(): void },
): Record<MenuId, () => void> {
	const { chat, turn, notify } = ctx;
	return {
		...documentVerbs(ctx, model),
		...transferVerbs(ctx, sync),
		// The store already takes every edit (ADR 0018); Save is that write, now.
		save: () => void sync.save(chat.getDocument()),
		send: () => chat.send(),
		stop: () => void turn.stop(),
		"new-terminal": () => void openTerminal(ctx),
		"toggle-source": () => {
			if (!chat.toggleSourceAtCaret()) notify(NOTHING_TO_SHOW);
		},
		"toggle-focus": () => focus.toggle(),
		"choose-model": () => void model.chooseModel(),
		"choose-effort": () => void model.chooseEffort(),
		"toggle-face": () => face.toggle(),
		commands: openCommands,
		"check-updates": () => model.checkUpdates(),
		// The app's one Preferences window, whichever window asked (ADR 0048).
		settings: () => void openPreferences().catch((error: unknown) => notify(String(error))),
	};
}

/** Runs an item as a click on it would: answered from the table, unless `held`
 *  keeps it, as the tour does with what its step does not ask for (ADR 0038).
 *  A `/` row that names an item runs it through here, so it is held alike. */
export function menuRunner(
	ctx: Parameters<typeof menuTable>[0],
	sync: Parameters<typeof menuTable>[1],
	model: Parameters<typeof menuTable>[2],
	focus: Parameters<typeof menuTable>[3],
	held: (id: MenuId) => boolean,
	openCommands: Parameters<typeof menuTable>[4],
	face: Parameters<typeof menuTable>[5],
): (id: MenuId) => void {
	const table = menuTable(ctx, sync, model, focus, openCommands, face);
	return (id) => {
		if (!held(id)) table[id]();
	};
}

/** Once per window: every menu click this window is sent goes to `run`. */
export async function setupMenubar(run: (id: MenuId) => void): Promise<void> {
	await onMenu((id) => {
		if (isMenuId(id)) run(id);
	});
}
