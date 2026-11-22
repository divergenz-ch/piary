// The creation menu's rows: the catalog's commands (`app/command-catalog.ts`),
// each drawn with what it does and wired to what choosing it does.
//
// pi's list is asked for only when the model chip hears pi answer (`onState`),
// so a window that has no pi yet starts none to fill a menu. The card over a
// pi command already written comes from the file pi names for it, or from pi's
// description when it names none.

import type { Completion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { BookOpen, Bot, Brain, Cpu, FileInput, FileOutput, FilePlus, FileText, FolderOpen, type IconNode, LogIn, LogOut, Puzzle, ScanFace, Settings, SquareTerminal } from "lucide";
import type { SlashRow } from "../src/components/DocumentChat.ts";
import { commandDocRead, menuChords, piSend } from "../src/bridge.ts";
import { type CommandDoc, parseCommandDoc } from "../src/document/command-doc.ts";
import { APP_COMMANDS, type Chords, type CommandEntry, listCommands, type PiCommand } from "./command-catalog.ts";
import type { AppContext } from "./context.ts";
import type { Login } from "./login.ts";
import { type MenuId, menuRunner, setupMenubar } from "./menubar.ts";
import { mountPalette } from "./palette.ts";
import type { ModelPicker } from "./picks.ts";

/** What a row reaches outside the editor. `menu` is the menu bar's own route,
 *  so a row and its item cannot do different things, and the tour holds both. */
export interface CommandActs {
	menu(id: MenuId): void;
	login(): void;
	logout(): void;
}

/** The menu's sections, in the order they are listed. */
const SECTIONS: Record<CommandEntry["group"], { name: string; rank: number }> = {
	piary: { name: "Piary", rank: 0 },
	skill: { name: "Skills", rank: 1 },
	prompt: { name: "Prompts", rank: 2 },
	extension: { name: "Extensions", rank: 3 },
};

/** A pi command's icon says what kind of thing is behind it. */
const GROUP_ICONS: Record<PiCommand["source"], IconNode> = { skill: BookOpen, prompt: FileText, extension: Puzzle };

/** One of the app's own commands has an icon of its own. */
const OWN_ICONS: Record<string, IconNode> = {
	terminal: SquareTerminal,
	subagent: Bot,
	model: Cpu,
	thinking: Brain,
	new: FilePlus,
	resume: FolderOpen,
	import: FileInput,
	export: FileOutput,
	settings: Settings,
	face: ScanFace,
	login: LogIn,
	logout: LogOut,
};

/** The icon a surface draws before an entry's name. */
const iconOf = (entry: CommandEntry): IconNode | undefined => (entry.group === "piary" ? OWN_ICONS[entry.name] : GROUP_ICONS[entry.group]);

/** The command's card: what its file's frontmatter says, when pi names a file
 *  the store can read, else what pi says of it. */
async function docOf(command: PiCommand): Promise<CommandDoc> {
	const path = command.sourceInfo?.path;
	const text = path ? await commandDocRead(path).catch(() => null) : null;
	const doc = parseCommandDoc(command.name, command.source, text === null ? undefined : path, text ?? "");
	doc.description ??= command.description;
	return doc;
}

/** What choosing an entry does outside a document: a menu item's action or
 *  the sign-in panel. Null for one that only writes its name. */
function actionOf(entry: CommandEntry, acts: CommandActs): (() => void) | null {
	const { act } = entry;
	if ("insert" in act) return null;
	return "menu" in act ? () => acts.menu(act.menu) : act.panel === "login" ? acts.login : acts.logout;
}

/** A catalog entry as the editor's menu takes it. A row that acts removes
 *  what was typed to reach it: the document keeps no trace of a gesture. */
function rowOf(entry: CommandEntry, acts: CommandActs): SlashRow {
	const { act, group } = entry;
	const icon = iconOf(entry);
	const row: SlashRow = {
		label: `/${entry.name}`,
		section: SECTIONS[group],
		...(entry.description ? { detail: entry.description } : {}),
		...(icon ? { icon } : {}),
		...(entry.shortcut ? { shortcut: entry.shortcut } : {}),
	};
	if ("insert" in act) return { ...row, apply: act.insert };
	const run = actionOf(entry, acts)!;
	return {
		...row,
		apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
			view.dispatch({ changes: { from, to, insert: "" } });
			run();
		},
	};
}

/** What both surfaces list now, and a way to read the menu's chords again. */
interface Followed {
	listed(): readonly CommandEntry[];
	/** Asks the system's menu for its chords and lists again with them. The
	 *  system changes them with the keyboard layout and tells nobody, so this
	 *  is asked more than once; until it answers, and if it does not, the rows
	 *  keep what they had (ADR 0051). */
	rechord(): void;
}

/** Once per window: the menu lists the app's commands at once, and pi's after
 *  them from the first time this window's pi answers. */
function followCommands(host: Pick<AppContext, "chat" | "sid">, picker: Pick<ModelPicker, "onState">, acts: CommandActs): Followed {
	const { chat, sid } = host;
	let known = new Map<string, PiCommand>();
	let listed: CommandEntry[] = [];
	let theirs: readonly PiCommand[] = [];
	let chords: Chords = {};
	const list = (pi: readonly PiCommand[]) => {
		theirs = pi;
		listed = listCommands(pi, chords);
		chat.slashCommands = listed.map((entry) => rowOf(entry, acts));
	};
	list([]);
	const rechord = () => {
		void menuChords().then(
			(read) => {
				chords = read ?? {};
				list(theirs);
			},
			() => {},
		);
	};
	// The app's own first, as in the list: it has no file behind it.
	chat.commandDocs = async (name) => {
		const own = APP_COMMANDS.find((command) => command.name === name);
		if (own) return { name, description: own.description, source: "document" };
		const command = known.get(name);
		return command ? docOf(command) : null;
	};
	picker.onState(() => {
		void piSend(sid, { type: "get_commands" }).then(
			(reply) => {
				if (!reply?.success) return;
				const commands = (reply.data as { commands?: PiCommand[] } | undefined)?.commands ?? [];
				known = new Map(commands.map((command) => [command.name, command]));
				list(commands);
			},
			() => {},
		);
	});
	return { listed: () => listed, rechord };
}

/** Said when a command that writes its name has no trailing prompt to write it in. */
const NO_PROMPT = "This command is written on the prompt at the end of the document, and this one has none.";

/** Once per window: the menu bar's items, the `/` menu's rows and the
 *  palette's, on one route. */
export function setupCommands(
	ctx: Parameters<typeof menuRunner>[0],
	sync: Parameters<typeof menuRunner>[1],
	model: Parameters<typeof menuRunner>[2] & Pick<ModelPicker, "onState">,
	focus: Parameters<typeof menuRunner>[3],
	held: Parameters<typeof menuRunner>[4],
	login: Pick<Login, "open" | "signOut">,
	face: Parameters<typeof menuRunner>[6],
): void {
	// The palette runs rows through the menu's route and the menu opens the
	// palette, so each is handed the other through a closure.
	const acts: CommandActs = { menu: (id) => menu(id), login: () => login.open(), logout: () => login.signOut() };
	const { listed, rechord } = followCommands(ctx, model, acts);
	const palette = mountPalette(listed, iconOf, (entry) => {
		const run = actionOf(entry, acts);
		if (run) run();
		else if ("insert" in entry.act && !ctx.chat.writeAtPrompt(entry.act.insert)) ctx.notify(NO_PROMPT);
	});
	const menu = menuRunner(
		ctx,
		sync,
		model,
		focus,
		held,
		() => {
			rechord();
			palette.open();
		},
		face,
	);
	void setupMenubar(menu);
	// A layout is switched while another app or this one is in front, so the
	// chords are read again each time the window is come back to, and each
	// time the palette opens.
	rechord();
	window.addEventListener("focus", rechord);
}
