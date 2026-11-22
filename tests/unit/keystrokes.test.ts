// What a prompt's edits say of when its text was typed — run `pnpm build` first.
import test from "node:test";
import assert from "node:assert/strict";
import { keysOf } from "../../dist/document/keystrokes.js";
import { Typist } from "../helpers/typist.ts";

test("typed text carries the time of each key, and the replay is the text", () => {
	const typist = new Typist("", 1000).type("hi there", 700);
	const keys = keysOf(typist.log)!;
	assert.equal(keys.text, "hi there");
	assert.deepEqual(keys.typed, [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700]);
	assert.deepEqual(keys.pauses, []);
	assert.deepEqual(keys.deleted, []);
});

test("text that was there before the log, pasted, composed or undone has no time", () => {
	const typist = new Typist("old ").type("a").paste("PASTED").type("b");
	typist.edits.push({ at: typist.now, from: typist.text.length, deleted: "", inserted: "日本", origin: "compose" }, { at: typist.now, from: 0, deleted: "", inserted: "back ", origin: "undo" });
	const keys = keysOf(typist.log)!;
	assert.equal(keys.text, "back old aPASTEDb日本");
	assert.deepEqual(keys.typed.map((at) => at !== null), [..."back old aPASTEDb日本"].map((_, i) => i === 9 || i === 16));
});

test("many characters arriving at once were not a key, however the editor names the edit", () => {
	const typist = new Typist().type("a ");
	typist.edits.push({ at: typist.now + 100, from: 2, deleted: "", inserted: "dictated all at once", origin: "type" }, { at: typist.now + 200, from: 22, deleted: "", inserted: "👍🏽", origin: "type" });
	const keys = keysOf(typist.log)!;
	assert.equal(keys.text, "a dictated all at once👍🏽");
	assert.deepEqual(keys.typed.map((at) => at !== null), [..."a dictated all at once"].map((_, i) => i < 2).concat([true, true, true, true]));
});

test("a gap between keys over two seconds is a pause at the caret, and one over a minute is absence", () => {
	const typist = new Typist().type("about").wait(7000).type(" forty").wait(2000).type(" x").wait(61_000).type(" y");
	const keys = keysOf(typist.log)!;
	assert.equal(keys.pauses.length, 1);
	assert.equal(keys.pauses[0]!.offset, "about".length);
	assert.equal(keys.pauses[0]!.to - keys.pauses[0]!.from, 7000);
});

test("a pause whose place was removed afterwards is gone with it, and text typed before it moves the rest", () => {
	const gone = new Typist().type("abc").wait(3000).backspace(3).type("xyz");
	assert.deepEqual(keysOf(gone.log)!.pauses.map((p) => p.offset), []);
	const moved = new Typist().type("tail").wait(3000).type("!").moveTo(0).type("head ");
	assert.deepEqual(keysOf(moved.log)!.pauses.map((p) => p.offset), ["head tail".length]);
});

test("typed text removed key by key is remembered from two words up, with when it was typed", () => {
	const typist = new Typist("", 1000).type("Fine. ").type("this is ridiculous", 1700).wait(500).backspace("this is ridiculous".length).type("ok");
	const keys = keysOf(typist.log)!;
	assert.equal(keys.text, "Fine. ok");
	assert.equal(keys.deleted.length, 1);
	const [gone] = keys.deleted;
	assert.equal(gone!.text, "this is ridiculous");
	assert.equal(gone!.offset, "Fine. ".length);
	assert.equal(gone!.to - gone!.from, 1700);
});

test("one word removed, pasted text removed, and text removed by undo are not remembered", () => {
	assert.deepEqual(keysOf(new Typist().type("teh").backspace(3).type("the").log)!.deleted, []);
	assert.deepEqual(keysOf(new Typist().paste("two words").backspace(9).log)!.deleted, []);
	const undone = new Typist().type("two words");
	undone.edits.push({ at: undone.now + 10, from: 0, deleted: "two words", inserted: "", origin: "undo" });
	assert.deepEqual(keysOf(undone.log)!.deleted, []);
});

test("words removed that the message still holds were moved or typed again, and are not remembered as removed", () => {
	const again = new Typist().type("ship it now").backspace("ship it now".length).type("ship it now, please");
	assert.deepEqual(keysOf(again.log)!.deleted, []);
	const taken = new Typist().type("ship it now").backspace("ship it now".length).type("wait");
	assert.deepEqual(keysOf(taken.log)!.deleted.map((d) => d.text), ["ship it now"]);
});

test("a selection typed over is a deletion of its own, and forward deletes join into one", () => {
	const over = new Typist().type("drop the cache now");
	over.edits.push({ at: over.now + 100, from: 5, deleted: "the cache", inserted: "X", origin: "type" });
	assert.deepEqual(keysOf(over.log)!.deleted.map((d) => [d.text, d.offset]), [["the cache", 5]]);
	const forward = new Typist().type("one two three");
	for (const c of "two three") forward.edits.push({ at: (forward.now += 50), from: 4, deleted: c, inserted: "", origin: "delete" });
	assert.deepEqual(keysOf(forward.log)!.deleted.map((d) => d.text), ["two three"]);
});

test("a log that missed a change says nothing", () => {
	const typist = new Typist().type("hello");
	typist.edits.push({ at: typist.now, from: 1, deleted: "x", inserted: "", origin: "delete" });
	assert.equal(keysOf(typist.log), null);
	assert.equal(keysOf({ base: "", edits: [{ at: 0, from: 3, deleted: "", inserted: "a", origin: "type" }] }), null);
});
