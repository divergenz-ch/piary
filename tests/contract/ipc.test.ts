// The page↔Rust seam, held to itself by reading both sides.
//
// Every half of the IPC surface is tested somewhere else: what a command DOES
// beside its module under `cargo test`, how the page USES one in the app
// Playwright project. What neither sees is the seam: a command the page invokes
// that Rust no longer registers, an argument key Rust does not take, a fake
// that still answers a name that is gone. Each of those is a rejected promise
// at runtime and nothing at all in the suites below the real app — so this
// reads the sources and compares them, the same shape as menubar.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APP_COMMANDS, PLUGIN_COMMANDS } from "../../e2e/helpers/ipc-surface.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

/** Parameters Tauri supplies itself rather than reading from the page's args. */
const INJECTED = /^(?:AppHandle|State|tauri::Window|Window|WebviewWindow|tauri::WebviewWindow|tauri::ipc::Request|Request)\b/;

interface Command {
	params: string[];
	/** Parameters the page may leave out: `Option<…>` deserialises from absence. */
	optional: string[];
	/** `rename_all = "snake_case"` opts the command out of the camelCase mapping. */
	snakeKeys: boolean;
}

/** Splits `text` at top-level commas, ignoring those inside `<…>`, `(…)`, `[…]`. */
function splitTopLevel(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === "<" || c === "(" || c === "[") depth++;
		else if (c === ">" || c === ")" || c === "]") depth--;
		else if (c === "," && depth === 0) {
			parts.push(text.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(text.slice(start));
	return parts.map((part) => part.trim()).filter(Boolean);
}

/** Every `#[tauri::command]` in commands.rs, with the parameters the page supplies. */
function parseCommands(source: string): Map<string, Command> {
	const commands = new Map<string, Command>();
	const head = /#\[tauri::command([^\]]*)\]\s*pub\s+(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g;
	for (const match of source.matchAll(head)) {
		let depth = 1;
		let i = match.index! + match[0].length;
		const open = i;
		for (; depth > 0; i++) {
			if (source[i] === "(") depth++;
			else if (source[i] === ")") depth--;
		}
		const params: string[] = [];
		const optional: string[] = [];
		for (const param of splitTopLevel(source.slice(open, i - 1))) {
			const [name, type] = [param.slice(0, param.indexOf(":")).trim(), param.slice(param.indexOf(":") + 1).trim()];
			if (INJECTED.test(type)) continue;
			params.push(name);
			if (/^Option</.test(type)) optional.push(name);
		}
		commands.set(match[2]!, { params, optional, snakeKeys: /rename_all\s*=\s*"snake_case"/.test(match[1]!) });
	}
	return commands;
}

/** The names in main.rs's `generate_handler![…]`. */
function parseRegistered(source: string): string[] {
	const list = /generate_handler!\[([\s\S]*?)\]/.exec(source);
	assert.ok(list, "main.rs has no generate_handler![…]");
	return [...list[1]!.matchAll(/commands::(\w+)/g)].map((match) => match[1]!);
}

/** Every `invoke("<cmd>", { … })` in src/bridge.ts, and the keys of its argument object. */
function parseInvokes(source: string): { command: string; keys: string[] | null }[] {
	const calls: { command: string; keys: string[] | null }[] = [];
	for (const match of source.matchAll(/\binvoke(?:<[^>]*>)?\(\s*"([^"]+)"\s*(?:,\s*(\{[^}]*\}|[\w.]+))?/g)) {
		const args = match[2];
		// A bare identifier is a raw body (attachments_store's bytes), not an
		// argument object: it carries no keys to check.
		const keys = args?.startsWith("{")
			? splitTopLevel(args.slice(1, -1)).map((entry) => entry.split(":")[0]!.trim())
			: args
				? null
				: [];
		calls.push({ command: match[1]!, keys });
	}
	return calls;
}

/** Every literal `command === "<cmd>"` the scripted-pi fake branches on. */
function parseFakeBranches(source: string): string[] {
	return [...source.matchAll(/command === "([^"]+)"/g)].map((match) => match[1]!);
}

/** How Tauri reads a page's argument key, by default: `docId` is `doc_id`. */
const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// Commands Rust registers that the page does not invoke, and why. A command
// nothing calls is dead code; one listed here is called by something else on
// purpose. Never add to this to make the test pass — delete the command.
const NOT_FROM_THE_PAGE: Record<string, string> = {};

const commands = parseCommands(read("src-tauri/src/commands.rs"));
const registered = parseRegistered(read("src-tauri/src/main.rs"));
const invokes = parseInvokes(read("src/bridge.ts"));

test("the parsers read what they are pointed at", () => {
	const parsed = parseCommands(`
#[tauri::command]
pub async fn go<R: Runtime>(app: AppHandle<R>, store: State<'_, Store>, doc_id: String, at: Option<u32>, xs: Vec<(u8, u8)>) -> Result<(), String> {}
#[tauri::command(rename_all = "snake_case")]
pub fn stay(request: tauri::ipc::Request<'_>) {}`);
	assert.deepEqual(parsed.get("go"), { params: ["doc_id", "at", "xs"], optional: ["at"], snakeKeys: false });
	assert.deepEqual(parsed.get("stay"), { params: [], optional: [], snakeKeys: true });
	assert.deepEqual(parseRegistered("generate_handler![commands::a, commands::b,]"), ["a", "b"]);
	assert.deepEqual(parseInvokes('invoke("a", { id, docId: x }); invoke<void>("b"); invoke("c", bytes, { headers })'), [
		{ command: "a", keys: ["id", "docId"] },
		{ command: "b", keys: [] },
		{ command: "c", keys: null },
	]);
});

test("every command commands.rs declares is registered, and nothing else is", () => {
	assert.ok(commands.size > 0, "no #[tauri::command] parsed from commands.rs");
	assert.deepEqual([...registered].sort(), [...commands.keys()].sort());
});

test("every registered command is allowed to the page without a grant of its own", () => {
	// Tauri allows every command the app registers to every window unless
	// build.rs lists them in `AppManifest::commands`; from then on each needs a
	// grant in a capability, and a missing one is a rejected promise and
	// nothing else (tauri-docs, security/capabilities). So the grants this test
	// would check exist only once the manifest does.
	const build = read("src-tauri/build.rs");
	assert.doesNotMatch(
		build,
		/AppManifest|app_manifest/,
		"build.rs now restricts the app's commands: extend this test to hold every registered command to a grant in src-tauri/capabilities/",
	);
	// What the page DOES need granted is the core surface its event listener
	// and window handle reach through.
	const granted = (JSON.parse(read("src-tauri/capabilities/default.json")) as { permissions: string[] }).permissions;
	for (const permission of ["core:event:default", "core:window:default"]) {
		assert.ok(granted.includes(permission), `capabilities/default.json does not grant ${permission}`);
	}
});

test("every command the page invokes exists, and is sent exactly the arguments it takes", () => {
	assert.ok(invokes.length > 0, "no invoke(…) parsed from src/bridge.ts");
	for (const { command, keys } of invokes) {
		const declared = commands.get(command);
		assert.ok(declared, `src/bridge.ts invokes "${command}", which commands.rs does not declare`);
		if (keys === null) continue;
		const sent = keys.map((key) => (declared.snakeKeys ? key : snake(key)));
		for (const key of sent) {
			assert.ok(declared.params.includes(key), `"${command}" is sent "${key}", which its Rust signature does not take (${declared.params.join(", ") || "no arguments"})`);
		}
		for (const param of declared.params) {
			assert.ok(sent.includes(param) || declared.optional.includes(param), `"${command}" is not sent "${param}", which its Rust signature requires`);
		}
	}
});

test("every registered command is invoked by the page, or says why not", () => {
	const invoked = new Set(invokes.map((call) => call.command));
	for (const command of registered) {
		assert.ok(invoked.has(command) || command in NOT_FROM_THE_PAGE, `"${command}" is registered and nothing invokes it — dead code, or a caller this test does not know`);
	}
	for (const command of Object.keys(NOT_FROM_THE_PAGE)) {
		assert.ok(registered.includes(command), `NOT_FROM_THE_PAGE names "${command}", which is not registered`);
	}
});

test("the browser fakes answer exactly the commands that exist", () => {
	assert.deepEqual([...APP_COMMANDS].sort(), [...registered].sort(), "e2e/helpers/ipc-surface.ts APP_COMMANDS has drifted from generate_handler!");
	const known = new Set<string>([...APP_COMMANDS, ...PLUGIN_COMMANDS]);
	for (const command of parseFakeBranches(read("e2e/helpers/scripted-pi.ts"))) {
		assert.ok(known.has(command), `scripted-pi.ts answers "${command}", which no longer exists`);
	}
});
