// The keymap table and the editor cannot drift apart.
//
// `tests/unit/keymap.test.ts` asserts what each chord MEANS, as data. That is only
// worth something while the editor binds the same chords — a table nobody
// consumes is a producer with no consumer, and the drift it would hide is
// exactly the kind the driver layer cannot catch, because WebDriver's macOS
// keyboard cannot deliver these chords at all (ADR 0014).
//
// So this file reads the component's source and asserts the two agree. Reading
// source is unusual and deliberate: the bindings are inline closures today, and
// the alternative — asserting through a mounted editor — cannot see a chord
// that was never bound.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { KeyContext, bindingsFor } from "../../src/document/keymap.ts";

const ROOT = new URL("../..", import.meta.url).pathname;

/** Every `key: "…"` a module binds, in the order they appear. */
function boundKeys(file: string): string[] {
	const source = readFileSync(`${ROOT}${file}`, "utf8");
	return [...source.matchAll(/\bkey:\s*"([^"]+)"/g)].map((match) => match[1]!);
}

test("every chord the prose table claims is bound by the canvas", () => {
	const bound = new Set(boundKeys("src/components/DocumentChat.ts"));
	for (const binding of bindingsFor(KeyContext.Prose)) {
		assert.ok(
			bound.has(binding.key),
			`src/document/keymap.ts claims ${binding.key} (${binding.command}) but DocumentChat.ts does not bind it`,
		);
	}
});

test("every chord the cell table claims is bound by the cell editor", () => {
	const bound = new Set(boundKeys("src/components/CellEditor.ts"));
	for (const binding of bindingsFor(KeyContext.Cell)) {
		// Mod-Enter reaches a cell through the document's own keymap rather than
		// the cell editor's, so it is the one chord this file cannot see here.
		if (binding.key === "Mod-Enter") continue;
		assert.ok(
			bound.has(binding.key),
			`src/document/keymap.ts claims ${binding.key} (${binding.command}) but CellEditor.ts does not bind it`,
		);
	}
});

test("the canvas binds its send chords in the table's order", () => {
	// Precedence is behaviour: CodeMirror takes the first match, so a canvas
	// that bound Mod-Enter first would swallow Alt-Mod-Enter no matter what the
	// table says.
	const bound = boundKeys("src/components/DocumentChat.ts");
	const sends = bound.filter((key) => key.endsWith("Mod-Enter"));
	const expected = bindingsFor(KeyContext.Prose)
		.map((binding) => binding.key)
		.filter((key) => key.endsWith("Mod-Enter"));
	assert.deepEqual(sends, expected);
});

test("the canvas binds no send chord the table does not describe", () => {
	// The other direction, and the one that rots silently: a chord added to the
	// component without a table row is a gesture with no stated meaning and no
	// test. Scoped to the send family, because defaultKeymap's bindings are
	// CodeMirror's and are deliberately not mirrored here.
	const described = new Set(bindingsFor(KeyContext.Prose).map((binding) => binding.key));
	for (const key of boundKeys("src/components/DocumentChat.ts")) {
		if (!key.endsWith("Enter")) continue;
		assert.ok(described.has(key), `DocumentChat.ts binds ${key} with no row in src/document/keymap.ts`);
	}
});
