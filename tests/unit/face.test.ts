// The face block pi is handed (docs/face-format.md): the wording, the anchors, the filter and
// the cap — run `pnpm build` first.
import test from "node:test";
import assert from "node:assert/strict";
import { CODES, dropOf, FACE_THRESHOLD, filtered, INTENSITY, isFaceLine, MAX_FACE_LINES, renderFace, type Timeline, type Typing, type Unit } from "../../dist/document/face.js";

const MESSAGE = "Can we drop the cache line and still ship by Friday? I need the build under two minutes.";

test("a timeline is one header and a line per entry, reading first", () => {
	const timeline: Timeline = {
		read: { window: 4, events: [{ at: 0.6, run: [{ units: [[4, "C"], [24, "B"]], dur: 1.8 }] }] },
		type: [
			{ kind: "during", text: "drop the cache line", run: [{ units: [[4, "C"]], dur: 2.3 }] },
			{ kind: "pause", after: "by Friday", pause: 6.2, run: [{ units: [[1, "B"], [2, "B"]], dur: 1.4 }, { units: [[4, "C"]], dur: 2 }, { units: [[28, "B"]], dur: 0.8 }] },
			{ kind: "deleted", text: "this is ridiculous", run: [{ units: [[4, "D"]], dur: 1.1 }] },
		],
	};
	assert.equal(
		renderFace(timeline, MESSAGE),
		[
			"[face]",
			"read 0.6s: brows lowered marked + lips pressed slight 1.8s",
			'typing "drop the cache line": brows lowered marked 2.3s',
			'pause 6.2s after "still ship by Friday": inner brows raised slight + outer brows raised slight 1.4s, then brows lowered marked 2.0s, then lips sucked in slight 0.8s',
			'deleted "this is ridiculous": brows lowered severe 1.1s',
		].join("\n"),
	);
});

test("text the message holds twice is marked with its occurrence, and a long anchor is elided once", () => {
	const twice = "the cache is slow, and the cache is also wrong";
	assert.equal(renderFace({ type: [{ kind: "during", text: "the cache", nth: 2, run: [{ units: [[4, "C"]], dur: 1 }] }] }, twice), '[face]\ntyping "the cache"#2: brows lowered marked 1.0s');
	const long = "I think the whole migration plan we agreed on last week needs another look before anyone starts on it, honestly.";
	const text = "the whole migration plan we agreed on last week needs another look before anyone starts";
	assert.equal(renderFace({ type: [{ kind: "during", text, run: [{ units: [[15, "C"]], dur: 4 }] }] }, long), '[face]\ntyping "the whole migration…anyone starts": lip corners pulled down marked 4.0s');
});

test("a head movement is said as a movement, not as what it may mean", () => {
	assert.equal(CODES[84], "head moved side to side");
	assert.equal(CODES[85], "head moved up and down");
	for (const words of Object.values(CODES)) assert.doesNotMatch(words, /\b(nod|shake)\b/);
});

test("nothing to say is no block", () => {
	assert.equal(renderFace({}, "hello"), "");
	assert.equal(renderFace({ read: { window: 4, events: [] }, type: [] }, "hello"), "");
});

test("an entry whose text the message does not hold is left out, and the rest is said", () => {
	const timeline: Timeline = {
		type: [
			{ kind: "during", text: "not in the message", run: [{ units: [[4, "D"]], dur: 2 }] },
			{ kind: "pause", after: "nor this", pause: 3, run: [{ units: [[4, "D"]], dur: 2 }] },
			{ kind: "during", text: "", run: [{ units: [[4, "D"]], dur: 2 }] },
			{ kind: "during", text: "ship by Friday", run: [{ units: [[4, "C"]], dur: 1 }] },
		],
	};
	assert.equal(renderFace(timeline, MESSAGE), '[face]\ntyping "ship by Friday": brows lowered marked 1.0s');
	assert.equal(renderFace({ type: timeline.type!.slice(0, 3) }, MESSAGE), "");
});

test("past the cap the strongest lines are kept, in the order they had", () => {
	const words = MESSAGE.split(" ").filter((word) => word.length > 3 && MESSAGE.indexOf(word) === MESSAGE.lastIndexOf(word));
	// Eight lines: two severe, then marked ones of rising length.
	const strong = (text: string): Typing => ({ kind: "during", text, run: [{ units: [[4, "D"]], dur: 0.5 }] });
	const marked = (text: string, dur: number): Typing => ({ kind: "during", text, run: [{ units: [[4, "C"]], dur }] });
	const type = [marked(words[0]!, 1), strong(words[1]!), marked(words[2]!, 2), marked(words[3]!, 3), marked(words[4]!, 4), strong(words[5]!), marked(words[6]!, 5), marked(words[7]!, 6)];
	const lines = renderFace({ type }, MESSAGE).split("\n").slice(1);
	assert.equal(lines.length, MAX_FACE_LINES);
	const anchors = lines.map((line) => /^typing "([^"]*)"/.exec(line)![1]);
	// The two shortest marked lines went; the severe ones stayed though they are the briefest.
	assert.deepEqual(anchors, [words[1], words[3], words[4], words[5], words[6], words[7]]);
});

test("a line the block writes is recognised whole, and prose that begins like one is not", () => {
	const timeline: Timeline = {
		read: { window: 4, events: [{ at: 0.6, run: [{ units: [[85, "C"]], dur: 1 }, { units: [[84, "E"], [12, "A"]], dur: 12.5 }] }] },
		type: [
			{ kind: "during", text: 'said "ship it"\nthen', run: [{ units: [[4, "C"]], dur: 2.3 }] },
			{ kind: "during", text: "the", nth: 2, run: [{ units: [[4, "C"]], dur: 2.3 }] },
			{ kind: "pause", after: "günaydın, 3 × 4", pause: 6.2, run: [{ units: [[1, "B"]], dur: 1.4 }] },
			{ kind: "deleted", text: "a \\ and a\ttab", run: [{ units: [[4, "D"]], dur: 1.1 }] },
		],
	};
	const message = 'She said "ship it"\nthen ran the build — günaydın, 3 × 4 = 12, and the rest';
	const lines = renderFace(timeline, message).split("\n").slice(1);
	assert.equal(lines.length, 5);
	for (const line of lines) assert.ok(isFaceLine(line), line);
	for (const code of Object.keys(CODES)) for (const letter of Object.keys(INTENSITY) as Unit[1][]) assert.ok(isFaceLine(renderFace({ read: { window: 4, events: [{ at: 0, run: [{ units: [[Number(code), letter]], dur: 1 }] }] } }, "").split("\n")[1]));
	for (const prose of ["read the docs first", "read 0.6s: then decide", 'typing "fast": is hard', "pause 2.0s after lunch", 'deleted "x": brows lowered marked 1.0s and more', "[face]", "", "typing: brows lowered marked 1.0s"]) assert.ok(!isFaceLine(prose), prose);
});

test("the filter drops blinks, what is weaker than marked and what is briefer than half a second", () => {
	const timeline: Timeline = {
		read: { window: 4, events: [{ at: 1, run: [{ units: [[45, "E"]], dur: 1 }] }] },
		type: [
			{ kind: "during", text: "drop", run: [{ units: [[4, "B"]], dur: 3 }, { units: [[4, "C"], [12, "A"]], dur: 0.5 }] },
			{ kind: "during", text: "ship", run: [{ units: [[4, "E"]], dur: 0.4 }] },
		],
	};
	assert.deepEqual(filtered(timeline, FACE_THRESHOLD), { read: { window: 4, events: [] }, type: [{ kind: "during", text: "drop", run: [{ units: [[4, "C"]], dur: 0.5 }] }] });
});

test("why a step is not passed on is the filter's own rule, said of one step", () => {
	const marked = { intensity: "C", seconds: 0.5 } as const;
	assert.equal(dropOf({ units: [[4, "C"]], dur: 0.5 }, marked), null);
	assert.equal(dropOf({ units: [[4, "B"]], dur: 3 }, marked), "weak");
	assert.equal(dropOf({ units: [[4, "E"]], dur: 0.4 }, marked), "short");
	assert.equal(dropOf({ units: [[45, "E"]], dur: 1 }, marked), "blink");
	// A weak movement beside a marked one is not what the step is dropped for.
	assert.equal(dropOf({ units: [[4, "C"], [12, "A"]], dur: 0.5 }, marked), null);
	// The threshold is whatever it is set to: slight passes when slight is asked for.
	assert.equal(dropOf({ units: [[4, "B"]], dur: 0.3 }, { intensity: "B", seconds: 0.3 }), null);
	assert.equal(dropOf({ units: [[4, "C"]], dur: 3 }, { intensity: "D", seconds: 0.3 }), "weak");
});
