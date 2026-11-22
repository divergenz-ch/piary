// The console forwarder's line and its send (src/console-line.ts). A console
// call is the last place a page should crash, and the line is what a
// Finder-launched app's log holds of a page error — so both must survive any
// argument and any failure of the log behind them.
import test from "node:test";
import assert from "node:assert/strict";
import { describe, sender } from "../../dist/console-line.js";

test("a string is itself, and a value is its JSON", () => {
	assert.equal(describe("plain"), "plain");
	assert.equal(describe({ a: 1 }), '{"a":1}');
	assert.equal(describe(undefined), "undefined");
});

test("an Error keeps its stack, which is the part a log reader needs", () => {
	const error = new Error("boom");
	const line = describe(error);
	assert.ok(line.startsWith("boom\n"), "the message first");
	assert.ok(line.includes("console-line.test"), "then where it was thrown");
});

test("a cyclic value is described, not thrown on", () => {
	const cyclic: Record<string, unknown> = {};
	cyclic["self"] = cyclic;
	assert.equal(describe(cyclic), "[object Object]");
});

test("the send joins its parts into one line, at its level", async () => {
	const lines: [string, string][] = [];
	sender(async (level, message) => lines.push([level, message]))("warn", ["a", 1, { b: 2 }]);
	assert.deepEqual(lines, [["warn", 'a 1 {"b":2}']]);
});

test("a log that rejects or throws never fails the console call", async () => {
	const rejects = sender(() => Promise.reject(new Error("no ipc")));
	const throws = sender(() => {
		throw new Error("no __TAURI_INTERNALS__");
	});
	assert.doesNotThrow(() => rejects("error", ["x"]));
	assert.doesNotThrow(() => throws("error", ["x"]));
	// A rejection swallowed late would surface as an unhandled one: give it the turn.
	await new Promise((resolve) => setImmediate(resolve));
});
