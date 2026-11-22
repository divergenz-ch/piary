// What a detector's samples say the face did — run `pnpm build` first. These are faces made
// of numbers (tests/helpers/face-samples.ts): each rule of the reading, on its own.
import test from "node:test";
import assert from "node:assert/strict";
import { episodes, FACE_TUNING, inspected, levelsAt, poseOf, seenIn, tunedBy, unitEpisodes } from "../../dist/document/face-episodes.js";
import { matrixOf, sitting } from "../helpers/face-samples.ts";

const frown = (v: number) => () => ({ scores: { browDownLeft: v, browDownRight: v - 0.05 } });
const codes = (samples: ReturnType<typeof sitting>, floor: "A" | "B" | "C" = "C") => unitEpisodes(samples, floor).map((e) => `${e.code}${e.letter}`);
const near = (actual: number, expected: number, within: number) => assert.ok(Math.abs(actual - expected) <= within, `${actual} is not within ${within} of ${expected}`);

test("a pose is read back from the head's transform", () => {
	const pose = poseOf(matrixOf({ yaw: 17, pitch: -8, roll: 5, depth: -25 }));
	near(pose.yaw, 17, 1e-9);
	near(pose.pitch, -8, 1e-9);
	near(pose.roll, 5, 1e-9);
	assert.equal(pose.depth, -25);
});

test("a held frown is one step, from where it began to where it let go, and a face at rest is none", () => {
	const samples = sitting([5000], [3000, frown(0.6)], [4000]);
	const steps = episodes(samples, "C");
	assert.equal(steps.length, 1);
	assert.deepEqual(steps[0]!.units, [[4, "D"]]);
	near(steps[0]!.from, 5000, 150);
	near(steps[0]!.to, 8000, 150);
	assert.deepEqual(episodes(sitting([12_000]), "A"), []);
});

test("how strong a movement is depends on how far that score moves: raised brows at 0.33 are as strong as a frown at 0.55", () => {
	assert.deepEqual(codes(sitting([5000], [2000, () => ({ scores: { browInnerUp: 0.33 } })], [2000])), ["1D"]);
	assert.deepEqual(codes(sitting([5000], [2000, frown(0.47 + 0.09)], [2000])), ["4D"]);
	assert.deepEqual(codes(sitting([5000], [2000, frown(0.3 + 0.09)], [2000])), ["4C"]);
	assert.deepEqual(codes(sitting([5000], [2000, frown(0.2 + 0.09)], [2000])), []);
	assert.deepEqual(codes(sitting([5000], [2000, frown(0.2 + 0.09)], [2000]), "B"), ["4B"]);
});

test("a score is read against the face's own rest, which is not zero and drifts", () => {
	// A brow that sits at 0.3 all along is this face at rest, not a frown.
	assert.deepEqual(codes(sitting([20_000, frown(0.3)]), "A"), []);
	// And the same 0.3 on a face that rests at 0.09 is one.
	assert.deepEqual(codes(sitting([6000], [2000, frown(0.42)], [2000])), ["4C"]);
});

test("a movement shorter than it takes to hold is not one, and a dip shorter than it takes to let go does not split one", () => {
	assert.deepEqual(codes(sitting([5000], [200, frown(0.6)], [3000])), []);
	const dipped = unitEpisodes(sitting([5000], [1500, frown(0.6)], [250], [1500, frown(0.6)], [3000]), "C");
	assert.equal(dipped.length, 1);
	near(dipped[0]!.to - dipped[0]!.from, 3250, 300);
});

test("nothing is read before the face has been seen at rest", () => {
	assert.deepEqual(codes(sitting([1000, frown(0.6)], [500])), []);
});

test("a marked movement that fades into a slight one ends where it stopped being marked", () => {
	// A long rest first: the resting value is the middle of the last minute, and must not move.
	const samples = sitting([30_000], [2000, frown(0.6)], [6000, frown(0.27)], [2000]);
	const [marked] = unitEpisodes(samples, "C");
	near(marked!.to - marked!.from, 2000, 550);
	const [whole] = unitEpisodes(samples, "A");
	near(whole!.to - whole!.from, 8000, 550);
});

test("eyes closed briefly are a blink, and closed for longer are closed", () => {
	const shut = () => ({ scores: { eyeBlinkLeft: 0.75, eyeBlinkRight: 0.74, eyeSquintLeft: 0.8, eyeSquintRight: 0.8 } });
	assert.deepEqual(codes(sitting([5000], [200, shut], [3000]), "A"), ["45B"]);
	assert.deepEqual(codes(sitting([5000], [2500, shut], [3000]), "A"), ["43C"]);
	// One eye closed is a wink, which this does not name.
	assert.deepEqual(codes(sitting([5000], [2500, () => ({ scores: { eyeBlinkLeft: 0.8 } })], [3000]), "A"), []);
	// The squint score rides up with closing eyes and sits high at rest: it names nothing.
	assert.deepEqual(codes(sitting([5000], [2500, () => ({ scores: { eyeSquintLeft: 0.8, eyeSquintRight: 0.8 } })], [3000]), "A"), []);
});

test("movements held together are one step, and the step is cut where one of them lets go", () => {
	const both = () => ({ scores: { browDownLeft: 0.6, mouthPressLeft: 0.45 } });
	const steps = episodes(sitting([5000], [2000, both], [2000, frown(0.6)], [3000]), "C");
	assert.deepEqual(steps.map((s) => s.units), [[[4, "D"], [24, "D"]], [[4, "D"]]]);
	assert.equal(steps[0]!.to, steps[1]!.from);
});

test("a head turned far away, a second face and no face are not read, and end what was being read", () => {
	const away = (extra: object) => () => ({ ...frown(0.6)(), ...extra });
	for (const gone of [{ yaw: 40 }, { pitch: 30 }, { faces: 2 }, { faces: 0 }]) {
		const found = unitEpisodes(sitting([5000], [1500, frown(0.6)], [3000, away(gone)], [3000]), "C").filter((e) => e.code === 4);
		assert.equal(found.length, 1, JSON.stringify(gone));
		near(found[0]!.to - found[0]!.from, 1500, 550);
	}
});

test("a head held off its rest is a pose, by how far; a head going to and fro is that movement and no pose", () => {
	assert.deepEqual(codes(sitting([5000], [3000, () => ({ yaw: 14 })], [3000])), ["51C"]);
	assert.deepEqual(codes(sitting([5000], [3000, () => ({ yaw: -14 })], [3000])), ["52C"]);
	assert.deepEqual(codes(sitting([5000], [3000, () => ({ roll: 12 })], [3000])), ["56C"]);
	assert.deepEqual(codes(sitting([5000], [3000, () => ({ depth: -27 })], [3000])), ["57C"]);
	// Up and down, ±8° four times over, as a person does it.
	const upDown = (t: number) => ({ pitch: 8 * Math.sin((2 * Math.PI * t) / 800) });
	assert.deepEqual(codes(sitting([5000], [3200, upDown], [3000])), ["85C"]);
	const sideToSide = (t: number) => ({ yaw: 8 * Math.sin((2 * Math.PI * t) / 800) });
	assert.deepEqual(codes(sitting([5000], [3200, sideToSide], [3000])), ["84C"]);
	// One look down and back is not a to and fro.
	assert.deepEqual(codes(sitting([5000], [600, () => ({ pitch: 9 })], [3000]), "B").filter((c) => c.startsWith("85")), []);
});

test("a face is read only on a head near its rest: turned further it is a pose and nothing else, and tipped down a frown needs more", () => {
	const turned = (yaw: number) => () => ({ yaw, scores: { browDownLeft: 0.6, mouthPressLeft: 0.45 } });
	assert.deepEqual(codes(sitting([5000], [3000, turned(8)], [3000])), ["4D", "24D"]);
	assert.deepEqual(codes(sitting([5000], [3000, turned(14)], [3000])), ["51C"]);
	// Eight degrees down lifts the brow score by itself: what is left of 0.36 is no frown, and 0.6 still is one.
	assert.deepEqual(codes(sitting([5000], [3000, () => ({ pitch: 8, scores: { browDownLeft: 0.36 } })], [3000])), []);
	assert.deepEqual(codes(sitting([5000], [3000, () => ({ pitch: 8, scores: { browDownLeft: 0.6 } })], [3000])), ["4C"]);
});

test("a mouth that is talking is not read, and a face around it still is", () => {
	const talk = (t: number) => ({ scores: { jawOpen: 0.25 + 0.2 * Math.sin((2 * Math.PI * t) / 400), mouthSmileLeft: 0.5, browDownLeft: 0.6 } });
	assert.deepEqual(codes(sitting([5000], [4000, talk], [3000])), ["4D"]);
	// The same smile with a still jaw is read.
	assert.deepEqual(codes(sitting([5000], [4000, () => ({ scores: { mouthSmileLeft: 0.5 } })], [3000])), ["12C"]);
	// And a jaw dropped and held is not talking.
	assert.deepEqual(codes(sitting([5000], [3000, () => ({ scores: { jawOpen: 0.6 } })], [3000])), ["26D"]);
});

test("what the face looks like at rest is remembered across a gap: a frown worn from the first frame after one is read", () => {
	const before = sitting([10_000]);
	const after = sitting([2000, frown(0.6)], [2000]).map((s) => ({ ...s, at: s.at + 300_000 }));
	const found = unitEpisodes([...before, ...after], "C");
	assert.deepEqual(found.map((e) => `${e.code}${e.letter}`), ["4D"]);
	near(found[0]!.from, 300_000, 150);
	// With nothing before it, the same frown is all this face has ever shown: it is the rest.
	assert.deepEqual(unitEpisodes(after, "C"), []);
});

test("two sittings are not joined across the gap between them", () => {
	const first = sitting([5000], [1000, frown(0.6)]);
	const second = sitting([1000, frown(0.6)], [2000]).map((s) => ({ ...s, at: s.at + 60_000 }));
	const found = unitEpisodes([...first, ...second], "C");
	assert.deepEqual(found.map((e) => e.code), [4, 4]);
	assert.ok(found[0]!.to < 6200 && found[1]!.from >= 60_000);
});

test("what is in view is said by the gates the reading goes through: no face, more than one, a head turned off its rest", () => {
	assert.equal(seenIn([]), null);
	assert.equal(seenIn(sitting([5000])), "face");
	assert.equal(seenIn(sitting([5000], [1000, () => ({ faces: 0 })])), "none");
	assert.equal(seenIn(sitting([5000], [1000, () => ({ faces: 2 })])), "many");
	// Past the angle an expression is read within, though short of looking away.
	assert.equal(seenIn(sitting([5000], [1000, () => ({ yaw: 20 })])), "turned");
	assert.equal(seenIn(sitting([5000], [1000, () => ({ yaw: 5 })])), "face");
	// And back: the last sample is what is in view.
	assert.equal(seenIn(sitting([5000], [1000, () => ({ yaw: 40 })], [500])), "face");
});

test("where each expression stands now is read against rest, as a share of how far that score moves", () => {
	const { levels, talking } = levelsAt(sitting([5000], [1000, frown(0.39)]));
	const brows = levels.find((level) => level.code === 4)!;
	// 0.3 above a rest of 0.09, on a score that moves by 0.5.
	near(brows.value!, 0.6, 0.02);
	assert.equal(brows.letter, "C");
	assert.deepEqual(levels.filter((level) => level.code !== 4).map((level) => level.letter), [null, null, null, null, null]);
	assert.equal(talking, false);
	// A face not yet seen at rest has no level to say.
	assert.deepEqual(levelsAt(sitting([1000, frown(0.6)])).levels.map((level) => level.value), [null, null, null, null, null, null]);
});

test("a level is not said where the reading itself would not read: a head turned away", () => {
	const turned = levelsAt(sitting([5000], [1000, () => ({ ...frown(0.6)(), yaw: 20 })]));
	assert.deepEqual(turned.levels.map((level) => level.value), [null, null, null, null, null, null]);
});

test("what was found is shown with what the filter does to it: passed on, too short, too weak, a blink", () => {
	const shut = () => ({ scores: { eyeBlinkLeft: 0.75, eyeBlinkRight: 0.74 } });
	const samples = sitting([30_000], [2000, frown(0.6)], [3000], [400, frown(0.6)], [3000], [2000, frown(0.2 + 0.09)], [3000], [200, shut], [3000]);
	const found = inspected(samples, { intensity: "C", seconds: 0.5 }).map((stretch) => `${stretch.units.map(([code, letter]) => `${code}${letter}`).join("+")} ${stretch.dropped ?? "passed"}`);
	assert.deepEqual(found, ["4D passed", "4D short", "4B weak", "45B blink"]);
	// Set to slight, the slight frown is read as a step of its own and passes.
	const slight = inspected(samples, { intensity: "B", seconds: 0.3 }).map((stretch) => `${stretch.units.map(([code, letter]) => `${code}${letter}`).join("+")} ${stretch.dropped ?? "passed"}`);
	assert.deepEqual(slight, ["4D passed", "4D passed", "4B passed", "45B blink"]);
});

test("how far the head may tip before the face is not read is the user's to widen", () => {
	const tipped = sitting([5000], [3000, () => ({ ...frown(0.6 + 0.02 * 15)(), pitch: 15 })], [2000]);
	assert.deepEqual(codes(tipped).filter((code) => code.startsWith("4")), [], "past ten degrees nothing is read of the brows");
	const wider = unitEpisodes(tipped, "C", tunedBy(FACE_TUNING, 12, 20)).map((e) => `${e.code}${e.letter}`);
	assert.ok(wider.includes("4D"), `read within twenty: ${wider.join(" ")}`);
	// A bound wider than where the head counts as away moves that too.
	assert.equal(tunedBy(FACE_TUNING, 25, 20).awayYaw, 25);
	assert.equal(tunedBy(FACE_TUNING, 8, 6).awayYaw, FACE_TUNING.awayYaw);
});
