// A face on a clock and a key log, joined into the timeline the format holds — run
// `pnpm build` first. The first three rebuild timelines of the face-format experiment
// (evals/spikes/face-format/cases) from a person typing its message.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assemble, type TimedStep } from "../../dist/document/face-assemble.js";
import { renderFace, type Timeline } from "../../dist/document/face.js";
import { keysOf } from "../../dist/document/keystrokes.js";
import { Typist } from "../helpers/typist.ts";

const CASES = join(import.meta.dirname, "../../evals/spikes/face-format/cases");
const experiment = (slug: string) => JSON.parse(readFileSync(join(CASES, slug, "timeline.json"), "utf8")) as Timeline;

/** Types `text` and answers the clock at its first and last key. */
function during(typist: Typist, text: string, over: number): { from: number; to: number } {
	typist.wait(100);
	const from = typist.now;
	typist.type(text, over);
	return { from, to: typist.now };
}

test("a face over text that was typed and removed, then over two stretches that stayed (same-timeout)", () => {
	const message = "The export still fails. I cleared the cache like you said, restarted the worker, and it throws the same timeout after 30 seconds on the big accounts.";
	const typist = new Typist().type("The export still fails. ");
	const gone = during(typist, "this is the second time I have done this", 8000);
	typist.wait(300).backspace("this is the second time I have done this".length).wait(100).type("I cleared the cache ");
	const said = during(typist, "like you said", 2600);
	typist.wait(100).type(", restarted the worker, and it throws ");
	const same = during(typist, "the same timeout", 800);
	typist.wait(100).type(" after 30 seconds on the big accounts.");
	assert.equal(typist.text, message);
	const steps: TimedStep[] = [
		{ ...gone, units: [[4, "D"], [24, "C"]] },
		{ ...said, units: [[4, "C"]] },
		{ ...same, units: [[84, "C"]] },
	];
	assert.deepEqual(assemble({ steps, keys: keysOf(typist.log)!, message }), experiment("same-timeout"));
});

test("three movements, one after another, inside one pause (forty-million)", () => {
	const message = "Estimate the monthly cost of our public API on a managed gateway: about 40 million requests a month, average response 2 KB, one region.";
	const typist = new Typist().type("Estimate the monthly cost of our public API on a managed gateway: about");
	const paused = typist.now;
	typist.wait(7000).type(" 40 million requests a month, average response 2 KB, one region.");
	assert.equal(typist.text, message);
	const steps: TimedStep[] = [
		{ from: paused + 500, to: paused + 1700, units: [[1, "C"], [2, "C"]] },
		{ from: paused + 2000, to: paused + 5500, units: [[4, "C"]] },
		{ from: paused + 6000, to: paused + 6600, units: [[32, "C"]] },
	];
	assert.deepEqual(assemble({ steps, keys: keysOf(typist.log)!, message }), experiment("forty-million"));
});

test("a face over a few words mid-sentence is tied to those words, without the comma after them (qa-two-days)", () => {
	const message = "Plan the release for me: we freeze the code on Thursday, QA gets two days, and we ship the following Monday. Draft the checklist.";
	const typist = new Typist().type("Plan the release for me: we freeze the code on Thursday, ");
	// The face begins mid-word and ends mid-word: the anchor is whole words.
	const held = during(typist, "QA gets two days", 3200);
	typist.wait(100).type(", and we ship the following Monday. Draft the checklist.");
	assert.equal(typist.text, message);
	const timeline = assemble({ steps: [{ from: held.from + 100, to: held.from + 3300, units: [[4, "C"], [24, "D"]] }], keys: keysOf(typist.log)!, message });
	assert.deepEqual(timeline, experiment("qa-two-days"));
});

test("a face while nothing was typed, or over text that has no time, says nothing", () => {
	const typist = new Typist("was here before ").paste("pasted in ").wait(500).type("typed");
	const end = typist.now;
	const keys = keysOf(typist.log)!;
	assert.deepEqual(assemble({ steps: [{ from: 0, to: 900, units: [[4, "D"]] }], keys, message: typist.text }), {});
	assert.deepEqual(assemble({ steps: [{ from: end + 500, to: end + 1500, units: [[4, "D"]] }], keys, message: typist.text }), {});
	assert.deepEqual(assemble({ steps: [], keys, message: typist.text }), {});
});

test("text the message holds twice is told apart, and the message may hold more than was typed", () => {
	const typist = new Typist().type("the cache is slow, and ");
	const second = during(typist, "the cache", 900);
	typist.type(" is also wrong");
	// What pi is handed: a line the app put in front, then the prompt.
	const message = `[cell values] {"x":"the cache"}\n${typist.text}`;
	const timeline = assemble({ steps: [{ ...second, units: [[4, "C"]] }], keys: keysOf(typist.log)!, message, offset: message.indexOf(typist.text) });
	assert.deepEqual(timeline, { type: [{ kind: "during", text: "the cache", nth: 3, run: [{ units: [[4, "C"]], dur: 0.9 }] }] });
	assert.equal(renderFace(timeline, message), '[face]\ntyping "the cache"#3: brows lowered marked 0.9s');
});

test("steps over neighbouring words are one entry's run, and entries follow the message, not the clock", () => {
	const typist = new Typist().type("ship it ");
	const late = during(typist, "by Friday", 1000);
	typist.moveTo(0);
	const early = during(typist, "Please ", 600);
	const message = "Please ship it by Friday";
	assert.equal(typist.text, message);
	const half = (late.from + late.to) / 2;
	const steps: TimedStep[] = [
		{ from: late.from, to: half, units: [[4, "C"]] },
		{ from: half, to: late.to, units: [[24, "C"]] },
		{ ...early, units: [[12, "C"]] },
	];
	assert.deepEqual(assemble({ steps, keys: keysOf(typist.log)!, message }), {
		type: [
			{ kind: "during", text: "Please", run: [{ units: [[12, "C"]], dur: 0.6 }] },
			{ kind: "during", text: "by Friday", run: [{ units: [[4, "C"]], dur: 0.5 }, { units: [[24, "C"]], dur: 0.5 }] },
		],
	});
});

test("a pause after a space is named by the word before it, and one at the very start by nothing", () => {
	const typist = new Typist().wait(0).type("well ").wait(4000).type("fine");
	const keys = keysOf(typist.log)!;
	const paused = keys.pauses[0]!;
	assert.deepEqual(assemble({ steps: [{ from: paused.from + 500, to: paused.from + 2500, units: [[4, "C"]] }], keys, message: typist.text }), { type: [{ kind: "pause", after: "well", pause: 4, run: [{ units: [[4, "C"]], dur: 2 }] }] });
	const start = new Typist().type("x").backspace(1).wait(4000).type("fine");
	const first = keysOf(start.log)!;
	assert.equal(first.pauses.length, 1);
	assert.deepEqual(assemble({ steps: [{ from: first.pauses[0]!.from + 500, to: first.pauses[0]!.from + 2500, units: [[4, "C"]] }], keys: first, message: start.text }), {});
});

test("what the face did in the seconds after an answer appeared is the reading, timed from when it appeared and tied to no words", () => {
	const typist = new Typist();
	typist.wait(10_000);
	const said = during(typist, "why the cache", 3000);
	const keys = keysOf(typist.log)!;
	const reading = { from: 1000, to: 5000 };
	const steps: TimedStep[] = [
		// Begun before the answer appeared: the reading has only what came after.
		{ from: 500, to: 2800, units: [[4, "C"]] },
		{ from: 2800, to: 3400, units: [[4, "C"], [24, "C"]] },
		// Apart from the run before it: an event of its own. It outlasts the window.
		{ from: 4200, to: 7000, units: [[1, "D"]] },
		{ ...said, units: [[4, "C"]] },
	];
	assert.deepEqual(assemble({ steps, keys, message: "why the cache", reading }), {
		read: { window: 4, events: [{ at: 0, run: [{ units: [[4, "C"]], dur: 1.8 }, { units: [[4, "C"], [24, "C"]], dur: 0.6 }] }, { at: 3.2, run: [{ units: [[1, "D"]], dur: 0.8 }] }] },
		type: [{ kind: "during", text: "why the cache", run: [{ units: [[4, "C"]], dur: 3 }] }],
	});
	assert.equal(renderFace(assemble({ steps, keys, message: "why the cache", reading }), "why the cache").split("\n")[1], "read 0.0s: brows lowered marked 1.8s, then brows lowered marked + lips pressed marked 0.6s");
});

test("a reading the first key cut short is as long as it lasted, and a step across its end is the keyboard's from there", () => {
	const typist = new Typist();
	typist.wait(2000);
	const said = during(typist, "hold on", 2000);
	const shown = said.from - 1100;
	const steps: TimedStep[] = [{ from: shown, to: said.to, units: [[4, "D"]] }];
	const timeline = assemble({ steps, keys: keysOf(typist.log)!, message: "hold on", reading: { from: shown, to: said.from } });
	assert.deepEqual(timeline.read, { window: 1.1, events: [{ at: 0, run: [{ units: [[4, "D"]], dur: 1.1 }] }] });
	assert.deepEqual(timeline.type, [{ kind: "during", text: "hold on", run: [{ units: [[4, "D"]], dur: 2 }] }]);
});

test("with no reading given, and with one in which the face did nothing, there is no read at all", () => {
	const typist = new Typist();
	const said = during(typist, "fine", 1000);
	const steps: TimedStep[] = [{ ...said, units: [[12, "C"]] }];
	const keys = keysOf(typist.log)!;
	assert.equal("read" in assemble({ steps, keys, message: "fine" }), false);
	assert.equal("read" in assemble({ steps, keys, message: "fine", reading: { from: -9000, to: -5000 } }), false);
	// And a reading alone is a timeline: nothing was typed with a time.
	assert.deepEqual(assemble({ steps: [{ from: 0, to: 2000, units: [[4, "C"]] }], keys: { text: "", typed: [], pauses: [], deleted: [] }, message: "pasted", reading: { from: 0, to: 4000 } }), {
		read: { window: 4, events: [{ at: 0, run: [{ units: [[4, "C"]], dur: 2 }] }] },
	});
});

