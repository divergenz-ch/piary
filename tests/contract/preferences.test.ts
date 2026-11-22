// The page's defaults and Rust's are one set of defaults.
//
// A window behaves by `DEFAULT_PREFERENCES` until its first read lands, and
// for good when that read fails; Rust answers `Preferences::default()` when no
// file is kept. Were the two to differ, a preference would flip a moment after
// every boot, or stay wrong in the one window whose read failed. So this reads
// the Rust source, as `menubar.test.ts` does.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEFAULT_PREFERENCES } from "../../app/preferences.ts";

const ROOT = new URL("../..", import.meta.url).pathname;

const camel = (name: string) => name.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

type Value = boolean | string | number | { [key: string]: Value };

/** The fields of `impl Default for <name>` in wire.rs, with the page's key names: a switch,
 *  text (empty until the user chooses, or a letter), a number, or a struct's own defaults. */
function rustDefaults(name: string): Record<string, Value> {
	const source = readFileSync(`${ROOT}src-tauri/src/wire.rs`, "utf8");
	const body = new RegExp(`impl Default for ${name} \\{[\\s\\S]*?Self \\{([\\s\\S]*?)\\}`).exec(source)?.[1] ?? "";
	return Object.fromEntries(
		[...body.matchAll(/(\w+): (true|false|String::new\(\)|"(\w*)"\.into\(\)|(\d+)|(\w+)::default\(\)),/g)].map((field): [string, Value] => {
			const [, key, value, text, number, struct] = field;
			if (struct) return [camel(key!), rustDefaults(struct)];
			if (number) return [camel(key!), Number(number)];
			if (value === "String::new()" || text !== undefined) return [camel(key!), text ?? ""];
			return [camel(key!), value === "true"];
		}),
	);
}

test("the page's default preferences are Rust's", () => {
	const rust = rustDefaults("Preferences");
	assert.ok(Object.keys(rust).length > 0, "wire.rs's defaults were found");
	const fields = /pub struct Preferences \{([\s\S]*?)\n\}/.exec(readFileSync(`${ROOT}src-tauri/src/wire.rs`, "utf8"))?.[1] ?? "";
	assert.equal(Object.keys(rust).length, [...fields.matchAll(/pub \w+:/g)].length, "every field's default was read");
	assert.deepEqual({ ...DEFAULT_PREFERENCES }, rust);
});
