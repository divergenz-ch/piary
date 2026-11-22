// The page's menu table and the native menu cannot drift apart.
//
// `src-tauri/src/menu.rs` names every item's id, and a click emits that id to
// the page. The compiler holds `app/menubar.ts`'s table to `MENU_IDS`, so the
// list is only worth something while it equals what Rust emits: an id missing
// from it is an item whose click nothing hears, and a running page cannot see
// a click that was never answered. So this file reads the Rust source, as
// `tests/contract/canvas-events.test.ts` reads the canvas's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { MENU_IDS } from "../../app/menubar.ts";

const ROOT = new URL("../..", import.meta.url).pathname;

/** Every id in `menu.rs`'s `ids` module. */
function rustIds(): string[] {
	const source = readFileSync(`${ROOT}src-tauri/src/menu.rs`, "utf8");
	const module = /pub mod ids \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
	return [...module.matchAll(/pub const \w+: &str = "([^"]+)";/g)].map((match) => match[1]!);
}

test("the page answers every id the menu emits, and only those", () => {
	const emitted = rustIds();
	assert.ok(emitted.length > 0, "menu.rs's ids were found");
	// Quit is the app's verb: Rust requests the exit itself and emits nothing.
	assert.deepEqual([...MENU_IDS, "quit"].sort(), [...emitted].sort());
});
