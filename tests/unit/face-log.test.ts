// The key log the app keeps per prompt, and the face a script plays (app/face/*): what is
// here is what a wrong answer from either would look like, asserted without a page.
import test from "node:test";
import assert from "node:assert/strict";
import { PromptLogs, sentPrompt } from "../../app/face/log.ts";
import { AS_MEASURED, sampledDetector } from "../../app/face/detector.ts";
import { parseFaceScript, scriptedDetector } from "../../app/face/scripted.ts";
import type { FaceSample } from "../../src/document/face-episodes.ts";
import { sitting } from "../helpers/face-samples.ts";
import { parseDocument } from "../../src/document/format.ts";
import type { PromptEdit } from "../../src/document/keystrokes.ts";

const key = (at: number, from: number, inserted: string, deleted = ""): PromptEdit => ({ at, from, deleted, inserted, origin: inserted ? "type" : "delete" });

test("a log begins over the body the prompt had before its first edit, and answers for the body it leads to", () => {
	const logs = new PromptLogs();
	// The body is read after the edit landed: "\n\nold x", of which "x" is new.
	logs.take(0, [key(10, 6, "x")], () => "\n\nold x");
	logs.take(0, [key(20, 7, "y")], () => assert.fail("the body is asked for once"));
	const keys = logs.keys(0, "\n\nold xy")!;
	assert.deepEqual(keys.typed, [null, null, null, null, null, null, 10, 20]);
});

test("blank lines the machine moved under a prompt do not make its log a stranger", () => {
	const logs = new PromptLogs();
	logs.take(0, [key(10, 1, "a")], () => "\na");
	assert.deepEqual(logs.keys(0, "\na\n\n")?.typed, [null, 10]);
	assert.equal(logs.keys(0, "\n a"), null, "space in front is the prompt's own text");
});

test("a log that does not lead to the body being sent is dropped, and the next edit begins another", () => {
	const logs = new PromptLogs();
	logs.take(0, [key(10, 0, "a")], () => "a");
	assert.equal(logs.keys(0, "another prompt stands here now"), null);
	assert.equal(logs.keys(0, "a"), null, "it was dropped, not kept for a later match");
	logs.take(0, [key(30, 1, "b")], () => "ab");
	assert.deepEqual(logs.keys(0, "ab")?.typed, [null, 30]);
});

test("an edit that does not fit the body it is said to have made begins no log, and prompts are kept apart", () => {
	const logs = new PromptLogs();
	logs.take(0, [key(10, 3, "zzz")], () => "abc");
	assert.equal(logs.keys(0, "abc"), null);
	logs.take(1, [key(10, 0, "b")], () => "b");
	logs.take(2, [key(10, 0, "c")], () => null);
	assert.equal(logs.keys(0, "b"), null);
	assert.ok(logs.keys(1, "b"));
	assert.equal(logs.keys(2, "c"), null);
	logs.forget(1);
	assert.equal(logs.keys(1, "b"), null);
});

test("a sent prompt is named as the canvas names it: by the prompts above it, with its body as the document holds it", () => {
	const md = "<!-- you -->\n\nfirst\n\n<!-- pi -->\n\nanswer\n\n<!-- you -->\n\nsecond one";
	const { segments } = parseDocument(md);
	assert.deepEqual(sentPrompt(md, segments, 2), { ordinal: 1, body: "\nsecond one" });
	assert.equal(sentPrompt(md, segments, 0).ordinal, 0);
	assert.deepEqual(sentPrompt(md, segments, 1), { ordinal: -1, body: "" });
	assert.deepEqual(sentPrompt(md, segments, -1), { ordinal: -1, body: "" });
});

test("a scripted face plays from the moment it is first started; stopping it changes nothing, and clearing winds it back", () => {
	const detector = scriptedDetector(parseFaceScript('[{"from":0,"to":1500,"units":[[4,"C"],[24,"D"]]}]'));
	assert.deepEqual(detector.steps(), []);
	detector.start(1000);
	detector.start(5000);
	const played = [{ from: 1000, to: 2500, units: [[4, "C"], [24, "D"]] }];
	assert.deepEqual(detector.steps(), played);
	detector.stop();
	assert.deepEqual(detector.steps(), played);
	detector.clear();
	assert.deepEqual(detector.steps(), []);
	detector.start(7000);
	assert.equal(detector.steps()[0]?.from, 7000);
});

test("a script of samples is read as a camera's samples are: a frown held after a rest is a step, on the detector's clock", () => {
	const samples = sitting([5000], [3000, () => ({ scores: { browDownLeft: 0.6 } })], [3000]);
	const detector = scriptedDetector(parseFaceScript(JSON.stringify({ samples })));
	detector.start(10_000);
	const steps = detector.steps();
	assert.deepEqual(steps.map((step) => step.units), [[[4, "D"]]]);
	assert.ok(Math.abs(steps[0]!.from - 15_000) < 200 && Math.abs(steps[0]!.to - 18_000) < 200);
});

test("a detector over a source of samples keeps what it is shown while watching, across stops, until it is cleared", () => {
	let heard: (sample: FaceSample) => void = () => {};
	const calls: string[] = [];
	const detector = sampledDetector({ start: () => calls.push("start"), stop: () => calls.push("stop"), onSample: (cb) => void (heard = cb), onState: () => {}, onCameras: () => {} });
	const [rest, frown, after] = [sitting([5000]), sitting([2000, () => ({ scores: { browDownLeft: 0.6 } })]), sitting([2000])];
	const feed = (samples: FaceSample[], from: number) => samples.forEach((sample) => heard({ ...sample, at: sample.at + from }));
	feed(frown, 0);
	assert.deepEqual(detector.steps(), [], "not watching yet: what the source says is not kept");
	detector.start(0);
	detector.start(1);
	feed(rest, 0);
	detector.stop();
	feed(frown, 5000);
	detector.start(2);
	feed(rest, 10_000);
	feed(frown, 15_000);
	feed(after, 17_000);
	assert.deepEqual(calls, ["start", "stop", "start"]);
	assert.deepEqual(detector.steps().map((step) => step.units), [[[4, "D"]]]);
	detector.clear();
	assert.deepEqual(detector.steps(), []);
	// The next message: the rest seen before the clear still stands, so a frown
	// worn from its first frame is read, and nothing from before the clear comes back.
	feed(frown, 100_000);
	feed(after, 102_000);
	const next = detector.steps();
	assert.deepEqual(next.map((step) => step.units), [[[4, "D"]]]);
	assert.ok(next[0]!.from >= 100_000);
});

test("text that is not a face script is refused", () => {
	for (const text of ["{}", '[{"from":0,"to":1}]', '[{"from":0,"to":1,"units":[[999,"C"]]}]', '[{"from":0,"to":1,"units":[[4,"Z"]]}]', '[{"from":"0","to":1,"units":[]}]']) assert.throws(() => parseFaceScript(text), text);
	assert.throws(() => parseFaceScript("not json"));
	assert.throws(() => parseFaceScript('{"samples":[{"at":0,"faces":1,"scores":{},"matrix":[1,2]}]}'));
	assert.throws(() => parseFaceScript('{"samples":[{"at":0,"faces":1,"scores":{"jawOpen":"wide"},"matrix":null}]}'));
});

test("a scripted face says the states a camera would: starting then watching, stopped, and where a script says it ends up instead", () => {
	const heard: unknown[] = [];
	const detector = scriptedDetector(parseFaceScript('{"steps":[],"cameras":["FaceTime HD Camera","Studio Display Camera"]}'));
	const cameras: string[][] = [];
	detector.onState((state) => heard.push(state));
	detector.onCameras((labels) => cameras.push([...labels]));
	assert.equal(detector.seen(0), null);
	detector.start(0);
	detector.start(10);
	assert.equal(detector.seen(20), "face");
	detector.stop();
	detector.stop();
	assert.deepEqual(heard, ["starting", "watching", "stopped"]);
	assert.deepEqual(cameras, [["FaceTime HD Camera", "Studio Display Camera"]]);
	assert.equal(detector.seen(30), null);

	for (const state of ["refused", "absent", { failed: "the model did not load" }]) {
		const said: unknown[] = [];
		const refused = scriptedDetector(parseFaceScript(JSON.stringify({ steps: [{ from: 0, to: 1000, units: [[4, "C"]] }], state })));
		refused.onState((next) => said.push(next));
		refused.start(0);
		assert.deepEqual(said, ["starting", state]);
		assert.deepEqual(refused.steps(), [], "a camera that could not be had saw nothing");
	}
	assert.equal(scriptedDetector(parseFaceScript('{"steps":[],"seen":"many"}')).seen(0), null, "nothing is in view before it watches");
	const two = scriptedDetector(parseFaceScript('{"steps":[],"seen":"many"}'));
	two.start(0);
	assert.equal(two.seen(1), "many");
});

test("a script of samples has in view what its samples show at that moment", () => {
	const samples = sitting([5000], [2000, () => ({ faces: 0 })]);
	const detector = scriptedDetector(parseFaceScript(JSON.stringify({ samples })));
	detector.start(1000);
	assert.equal(detector.seen(1000 + 4000), "face");
	assert.equal(detector.seen(1000 + 6000), "none");
});

test("a script that says a state, a view or cameras that are none is refused, loudly", () => {
	assert.throws(() => parseFaceScript('{"steps":[],"state":"denied"}'), /"state"/);
	assert.throws(() => parseFaceScript('{"steps":[],"seen":"nobody"}'), /"seen"/);
	assert.throws(() => parseFaceScript('{"steps":[],"cameras":"FaceTime"}'), /"cameras"/);
});

test("a look at a draft's keys drops nothing: a body asked about between two edits is not the log's end", () => {
	const logs = new PromptLogs();
	logs.take(0, [key(10, 0, "a")], () => "a");
	assert.equal(logs.peek(0, "ab"), null);
	assert.deepEqual(logs.peek(0, "a")?.typed, [10]);
	assert.deepEqual(logs.keys(0, "a")?.typed, [10]);
});

/** A source of samples a test feeds by hand. */
function fakeSource() {
	let heard: (sample: FaceSample) => void = () => {};
	return { start: () => {}, stop: () => {}, onSample: (cb: (sample: FaceSample) => void) => void (heard = cb), onState: () => {}, onCameras: () => {}, emit: (sample: FaceSample) => heard(sample) };
}

test("a detector reads by what is set at the moment it is asked, and says what it found with what is dropped", () => {
	const source = fakeSource();
	let tuned = AS_MEASURED;
	const detector = sampledDetector(source, () => tuned);
	detector.start(0);
	const frown = () => ({ scores: { browDownLeft: 0.29, browDownRight: 0.29 } });
	const samples = sitting([5000], [2000, frown], [1000]);
	for (const sample of samples) source.emit(sample);
	assert.deepEqual(detector.steps(), [], "a slight frown is not read at marked");
	const now = samples.at(-1)!.at;
	assert.deepEqual(detector.inspect(now)?.recent.map((found) => found.dropped), ["weak"]);
	assert.equal(detector.inspect(now)?.levels?.length, 6);
	tuned = { ...AS_MEASURED, threshold: { intensity: "B", seconds: 0.5 } };
	assert.deepEqual(detector.steps().map((step) => step.units), [[[4, "B"]]]);
	assert.deepEqual(detector.inspect(now)?.recent.map((found) => found.dropped), [null]);
	// Stopped, what was found is still there to look at, and no level is: nothing reads frames.
	detector.stop();
	assert.equal(detector.inspect(now)?.levels, null);
	assert.equal(detector.inspect(now)?.recent.length, 1);
	assert.equal(detector.inspect(now + 60_000)?.recent.length, 0, "only the last half minute");
	// A source with no picture has none to show.
	assert.equal(detector.picture(null), false);
});

test("a script of steps is inspected as far as it has played, each step with what the filter does to it", () => {
	const detector = scriptedDetector(parseFaceScript(JSON.stringify([{ from: 0, to: 60_000, units: [[4, "C"]] }, { from: 61_000, to: 61_200, units: [[4, "E"]] }])));
	assert.equal(detector.inspect(1000), null, "nothing before it starts");
	detector.start(1000);
	assert.deepEqual(detector.inspect(3000)?.recent, [{ from: 1000, to: 3000, units: [[4, "C"]], dropped: null }]);
	assert.deepEqual(detector.inspect(62_500)?.recent.map((found) => found.dropped), [null, "short"]);
	assert.equal(detector.inspect(3000)?.levels, null);
});
