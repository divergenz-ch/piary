// The face-format experiment's encodings (evals/spikes/face-format/spec.md): a `codes` block
// read back is the timeline it was written from, whatever the typed text holds, and the noise
// and the filter are what a run says they are.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FORMATS, filtered, noisy, parseCodes, RENDERINGS, resolved, serialize, type Timeline } from "../../evals/spikes/face-format/timeline.ts";

const roundTrip = (timeline: Timeline, message: string) => assert.deepEqual(parseCodes(serialize("codes", timeline, message), message), resolved(timeline, message));

test("a block reads back as its timeline: reading, typing, a pause with a sequence, deleted text", () => {
	const message = "Can we drop the cache line and still ship by Friday? I need the build under two minutes.";
	const timeline: Timeline = {
		read: { window: 4, events: [{ at: 0.6, run: [{ units: [[4, "C"], [24, "B"]], dur: 1.8 }] }] },
		type: [
			{ kind: "during", text: "drop the cache line", run: [{ units: [[4, "C"]], dur: 2.3 }] },
			{ kind: "pause", after: "by Friday", pause: 6.2, run: [{ units: [[1, "B"], [2, "B"]], dur: 1.4 }, { units: [[4, "C"]], dur: 2 }, { units: [[28, "B"]], dur: 0.8 }] },
			{ kind: "deleted", text: "this is ridiculous", run: [{ units: [[4, "D"]], dur: 1.1 }] },
		],
	};
	assert.equal(
		serialize("codes", timeline, message),
		['[face/1]', 'r 0.6 4C+24B 1.8', 't "drop the cache line" 4C 2.3', 'p "still ship by Friday" 6.2 1B+2B 1.4 > 4C 2.0 > 28B 0.8', 'd "this is ridiculous" 4D 1.1'].join("\n"),
	);
	roundTrip(timeline, message);
});

test("text the message holds twice is told apart by its occurrence", () => {
	const message = "the cache is slow, and the cache is also wrong";
	const timeline: Timeline = { type: [{ kind: "during", text: "the cache", nth: 2, run: [{ units: [[4, "B"]], dur: 1 }] }] };
	assert.match(serialize("codes", timeline, message), /^t "the cache"#2 /m);
	roundTrip(timeline, message);
});

test("quotes, a newline, code and text outside ASCII survive in an anchor", () => {
	const message = 'She said "ship it"\nthen ran `rm -rf dist/` — günaydın, 3 × 4 = 12';
	for (const text of ['said "ship it"\nthen', "`rm -rf dist/`", "günaydın, 3 × 4"]) roundTrip({ type: [{ kind: "during", text, run: [{ units: [[12, "C"]], dur: 0.9 }] }] }, message);
});

test("a long anchor is its first and last words around an ellipsis", () => {
	const message = "I think the whole migration plan we agreed on last week needs another look before anyone starts on it, honestly.";
	const timeline: Timeline = { type: [{ kind: "during", text: "the whole migration plan we agreed on last week needs another look before anyone starts", run: [{ units: [[15, "C"]], dur: 4 }] }] };
	const block = serialize("codes", timeline, message);
	assert.match(block, /^t "the whole migration…anyone starts" /m);
	roundTrip(timeline, message);
});

test("the plain-words renderings say one timeline in fewer and fewer words", () => {
	const message = "Can we drop the cache line and still ship by Friday? I need the build under two minutes.";
	const timeline: Timeline = {
		read: { window: 4, events: [{ at: 0.6, run: [{ units: [[4, "C"], [24, "B"]], dur: 1.8 }] }] },
		type: [
			{ kind: "pause", after: "by Friday", pause: 6.2, run: [{ units: [[1, "B"]], dur: 1.4 }, { units: [[4, "C"]], dur: 2 }] },
			{ kind: "deleted", text: "this is ridiculous", run: [{ units: [[4, "D"]], dur: 1.1 }] },
		],
	};
	assert.equal(
		serialize("phrases", timeline, message),
		["[face]", "- 0.6 s after your answer appeared: brows lowered (marked) + lips pressed (slight), 1.8 s", '- paused 6.2 s after "still ship by Friday": inner brows raised (slight), 1.4 s; then brows lowered (marked), 2.0 s', '- typed then deleted "this is ridiculous": brows lowered (severe), 1.1 s'].join("\n"),
	);
	assert.equal(
		serialize("clipped", timeline, message),
		["[face]", "read 0.6s: brows lowered marked + lips pressed slight 1.8s", 'pause 6.2s after "still ship by Friday": inner brows raised slight 1.4s, then brows lowered marked 2.0s', 'deleted "this is ridiculous": brows lowered severe 1.1s'].join("\n"),
	);
	assert.equal(
		serialize("telegraphic", timeline, message),
		["[face]", "read 0.6 brows lowered marked+lips pressed slight 1.8", 'pause "still ship by Friday" 6.2 inner brows raised slight 1.4 > brows lowered marked 2.0', 'deleted "this is ridiculous" brows lowered severe 1.1'].join("\n"),
	);
	const lengths = RENDERINGS.map((r) => serialize(r, timeline, message).length);
	assert.deepEqual(lengths, [...lengths].sort((a, b) => b - a));
});

test("a plain-words rendering shows no code, and anchors text as the grammar does", () => {
	const twice = "the cache is slow, and the cache is also wrong";
	const long = "I think the whole migration plan we agreed on last week needs another look before anyone starts on it, honestly.";
	for (const rendering of ["phrases", "clipped", "telegraphic"] as const) {
		const second = serialize(rendering, { type: [{ kind: "during", text: "the cache", nth: 2, run: [{ units: [[4, "B"]], dur: 1 }] }] }, twice);
		assert.match(second, /typing "the cache"#2/);
		assert.doesNotMatch(second, /\b4B\b|brow-down/);
		assert.match(serialize(rendering, { type: [{ kind: "during", text: "the whole migration plan we agreed on last week needs another look before anyone starts", run: [{ units: [[15, "C"]], dur: 4 }] }] }, long), /typing "the whole migration…anyone starts"/);
	}
});

test("every format says nothing for a timeline with nothing in it", () => {
	for (const format of FORMATS) assert.equal(serialize(format, { read: { window: 4, events: [] }, type: [] }, "hello"), "");
});

test("noise is the same for the same seed, and the filter takes it out again", () => {
	const message = "Please rename the handler and keep the old export around for one release.";
	const timeline: Timeline = { read: { window: 4, events: [] }, type: [{ kind: "during", text: "keep the old export", run: [{ units: [[4, "C"]], dur: 1.6 }] }] };
	const once = noisy(timeline, message, 7, { miss: 0 });
	assert.deepEqual(once, noisy(timeline, message, 7, { miss: 0 }));
	assert.ok((once.type?.length ?? 0) > 1 && (once.read?.events.length ?? 0) > 0);
	roundTrip(once, message);
	assert.deepEqual(filtered(once, { intensity: "C", seconds: 0.5 }), { read: { window: 4, events: [] }, type: timeline.type });
});
