// What the creation menu lists: the app's own commands, then pi's. A wrong
// answer here is a row that runs the wrong thing or a pi command hiding one of
// the app's, so the list is asserted as data, without a page.
import test from "node:test";
import assert from "node:assert/strict";
import { APP_COMMANDS, listCommands, matching, type PiCommand } from "../../app/command-catalog.ts";
import { MENU_IDS } from "../../app/menubar.ts";

const pi = (name: string, more: Partial<PiCommand> = {}): PiCommand => ({ name, source: "prompt", ...more });

test("the app's own commands come first, in the catalog's order, and pi's follow in pi's", () => {
	const names = listCommands([pi("zeta"), pi("alpha")]).map((entry) => entry.name);
	assert.deepEqual(names, [...APP_COMMANDS.map((command) => command.name), "zeta", "alpha"]);
});

test("a row of the app's own wins over a pi command of the same name", () => {
	const listed = listCommands([pi("terminal", { description: "pi's own row of the same name" })]);
	const rows = listed.filter((entry) => entry.name === "terminal");
	assert.equal(rows.length, 1);
	assert.equal(rows[0]!.group, "piary");
});

test("a pi command is grouped by where it came from and inserts its own name", () => {
	const [skill] = listCommands([pi("skill:brief", { source: "skill", description: "write a brief" })]).slice(-1);
	assert.deepEqual(skill, { name: "skill:brief", description: "write a brief", group: "skill", act: { insert: "/skill:brief " } });
});

test("a pi description is one line: its first, trimmed", () => {
	const [long] = listCommands([pi("long", { description: "  Review a diff.\nThen a second paragraph nobody reads in a menu.  " })]).slice(-1);
	assert.equal(long!.description, "Review a diff.");
	const [none] = listCommands([pi("none")]).slice(-1);
	assert.equal(none!.description, undefined);
});

test("every one of the app's commands says what it does, and a menu action names a real item", () => {
	for (const command of APP_COMMANDS) {
		assert.ok(command.description.length > 0, `/${command.name} has a description`);
		if ("menu" in command.act) assert.ok((MENU_IDS as readonly string[]).includes(command.act.menu), `/${command.name} names the menu item ${command.act.menu}`);
	}
	const names = APP_COMMANDS.map((command) => command.name);
	assert.equal(new Set(names).size, names.length, "no name twice");
});

test("a search lists the commands whose name or description holds every word, a name that starts with it first", () => {
	const all = listCommands([pi("remodel", { description: "restructure a module" })]);
	const names = (typed: string) => matching(all, typed).map((entry) => entry.name);
	assert.deepEqual(names(""), all.map((entry) => entry.name), "nothing typed lists everything, in order");
	assert.deepEqual(names("model"), ["model", "thinking", "remodel"], "`model` leads; `thinking` says model; `remodel` holds it");
	assert.deepEqual(names("/new"), ["new"], "a typed slash is not part of the name");
	assert.deepEqual(names("conversation open"), ["resume"], "every word must occur");
	assert.deepEqual(names("zzz"), []);
});

// The key is the system's to name: macOS moves a menu shortcut under some
// keyboard layouts, so a row shows what its menu item was read to hold.
test("a command that runs a menu item shows that item's chord, and nothing else shows one", () => {
	const chords = { settings: "⌘Ö", "new-document": "⌘N" } as const;
	const listed = listCommands([pi("settings-of-pi"), pi("new-document")], chords);
	const chord = (name: string) => listed.find((entry) => entry.name === name)?.shortcut;
	assert.equal(chord("settings"), "⌘Ö", "a chord on a key the layout moved");
	assert.equal(chord("new"), "⌘N");
	assert.equal(chord("model"), undefined, "no chord was read for its item");
	assert.equal(chord("subagent"), undefined, "it runs no menu item");
	assert.equal(chord("new-document"), undefined, "a pi command is not the item of the same name");
	assert.ok(listCommands([]).every((entry) => entry.shortcut === undefined), "nothing read, nothing shown");
});
