// What a `/` command is, as data: the app's own, then whatever this window's
// pi offers. Every surface that lists commands lists `listCommands`, so two
// surfaces cannot name different things.
//
// Pure: no DOM and no bridge, so the list is asserted without a page. What a
// row does when chosen is `app/commands.ts`'s.

import type { MenuId } from "./menubar.ts";

/** What choosing a command does: a menu item's own action, text written into
 *  the prompt, or the sign-in panel. */
export type CommandAct = { menu: MenuId } | { insert: string } | { panel: "login" | "logout" };

/** A command of the app's own. Named as pi names it where pi has one. */
export interface AppCommand {
	name: string;
	/** One line, beside the name in the menu and at the top of its card. */
	description: string;
	act: CommandAct;
}

/** The chord of each menu item that has one, as the system's menu bar draws
 *  it. Read from the system, never written here: macOS moves a shortcut to
 *  another key under some keyboard layouts (`⌘,` is `⌘Ö` on a Turkish one),
 *  and only the menu item knows which (ADR 0051). */
export type Chords = Partial<Record<MenuId, string>>;

/** A command as pi's `get_commands` lists it. */
export interface PiCommand {
	name: string;
	description?: string;
	source: "prompt" | "skill" | "extension";
	sourceInfo?: { path?: string };
}

/** One row of a surface that lists commands. */
export interface CommandEntry {
	name: string;
	description?: string;
	/** Who offers it: the app, or the kind of pi resource behind it. */
	group: "piary" | PiCommand["source"];
	/** The chord of the menu item the command runs, when it runs one that has
	 *  a chord. */
	shortcut?: string;
	act: CommandAct;
}

export const APP_COMMANDS: readonly AppCommand[] = [
	{
		name: "terminal",
		description: "run commands in a live terminal",
		act: { menu: "new-terminal" },
	},
	{
		name: "subagent",
		description: "run a prompt in its own child session",
		act: { insert: "/subagent " },
	},
	{
		name: "model",
		description: "choose the model that answers",
		act: { menu: "choose-model" },
	},
	{
		name: "thinking",
		description: "choose how hard the model thinks",
		act: { menu: "choose-effort" },
	},
	{
		name: "new",
		description: "start a new conversation in its own window",
		act: { menu: "new-document" },
	},
	{
		name: "resume",
		description: "open another conversation in its own window",
		act: { menu: "open-document" },
	},
	{
		name: "import",
		description: "bring in a conversation from a file",
		act: { menu: "import" },
	},
	{
		name: "export",
		description: "write conversations out to a folder",
		act: { menu: "export" },
	},
	{
		name: "settings",
		description: "open Piary's settings",
		act: { menu: "settings" },
	},
	{
		name: "face",
		description: "turn reading your face while you type on or off",
		act: { menu: "toggle-face" },
	},
	{
		name: "login",
		description: "sign in to a provider",
		act: { panel: "login" },
	},
	{
		name: "logout",
		description: "sign out of a provider",
		act: { panel: "logout" },
	},
];

/** A menu row has one line for a description: pi's first. */
const firstLine = (text: string | undefined): string | undefined => text?.trim().split("\n")[0]?.trim() || undefined;

/** The app's commands in the catalog's order, then pi's in pi's. A command of
 *  the app's own wins over a pi command of the same name, and one that runs a
 *  menu item shows that item's chord. */
export function listCommands(pi: readonly PiCommand[], chords: Chords = {}): CommandEntry[] {
	const own = APP_COMMANDS.map(({ name, description, act }): CommandEntry => {
		const shortcut = "menu" in act ? chords[act.menu] : undefined;
		return { name, description, group: "piary", ...(shortcut ? { shortcut } : {}), act };
	});
	const taken = new Set(own.map((entry) => entry.name));
	const theirs = pi
		.filter((command) => !taken.has(command.name))
		.map((command): CommandEntry => {
			const description = firstLine(command.description);
			return { name: command.name, ...(description ? { description } : {}), group: command.source, act: { insert: `/${command.name} ` } };
		});
	return [...own, ...theirs];
}

/** What a search field over the commands lists for `typed`: an entry matches
 *  when every word occurs in its name or its description, and those whose
 *  name starts with what was typed come first. */
export function matching(entries: readonly CommandEntry[], typed: string): CommandEntry[] {
	const words = typed.toLowerCase().replace(/^\//, "").split(/\s+/).filter(Boolean);
	if (words.length === 0) return [...entries];
	const hit = entries.filter((entry) => {
		const text = `${entry.name} ${entry.description ?? ""}`.toLowerCase();
		return words.every((word) => text.includes(word));
	});
	const leads = (entry: CommandEntry) => (entry.name.toLowerCase().startsWith(words[0]!) ? 0 : 1);
	return hit.sort((a, b) => leads(a) - leads(b));
}
