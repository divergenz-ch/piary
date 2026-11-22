// What a real face reads as — run `pnpm build` first. The fixtures are one person making one
// movement at a time on request (tests/fixtures/face/, cut by scripts/face-fixtures.ts from a
// recording made with app/face/record.ts). One face, one sitting: what is asserted is coarse.
// The movement asked for is found while it was held, at the strength the app passes on; what
// the model cannot see is not invented; and a face that is only reading, talking or typing
// says nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { FACE_THRESHOLD, filtered, type Timeline } from "../../dist/document/face.js";
import { episodes, unitEpisodes, type UnitEpisode } from "../../dist/document/face-episodes.js";
import { recorded, recordedNames, type Recorded } from "../helpers/face-fixtures.ts";

/** People begin a movement up to a second and a half after being told to, and let go as late. */
const LATE_MS = 1500;

/** The units read while the movement was held, at `floor` or stronger. */
function during(fixture: Recorded, floor: UnitEpisode["letter"] = "C"): UnitEpisode[] {
	return unitEpisodes(fixture.samples, floor).filter((e) => e.from < fixture.endAt && e.to > fixture.goAt);
}
const codesOf = (found: UnitEpisode[]) => [...new Set(found.map((e) => e.code))].sort((a, b) => a - b);

/** What the app would pass on of the time the movement was held: the steps, through its filter. */
function passedOn(fixture: Recorded): string[] {
	const run = episodes(fixture.samples, FACE_THRESHOLD.intensity)
		.filter((step) => step.from < fixture.endAt && step.to > fixture.goAt)
		.map((step) => ({ units: step.units, dur: (step.to - step.from) / 1000 }));
	const timeline: Timeline = filtered({ read: { window: 0, events: [{ at: 0, run }] } }, FACE_THRESHOLD);
	return (timeline.read?.events ?? []).flatMap((event) => event.run.flatMap((step) => step.units.map(([code, letter]) => `${code}${letter}`)));
}

/** Each movement the reading can name: the fixture, the code it must be read as, and the codes
 *  that may come with it (a person leaning in also turns a little). */
const NAMED: [fixture: string, code: number, alongside?: number[]][] = [
	["brows-down", 4],
	["eyes-narrow", 4],
	["brows-up", 1, [2]],
	["smile-wide", 12],
	["lips-pressed", 24],
	["lips-in", 24],
	["lip-bite", 24],
	["mouth-open", 26],
	["eyes-closed", 43],
	["head-left", 51],
	["head-right", 52],
	["head-up", 53],
	["tilt-left", 55],
	["tilt-right", 56],
	["lean-in", 57, [51]],
	["lean-back", 58, [53]],
	["head-up-and-down", 85],
	["head-side-to-side", 84],
];

for (const [name, code, alongside = []] of NAMED) {
	test(`"${recorded(name).say}" is read as ${code}, held for most of the time it was held`, () => {
		const fixture = recorded(name);
		const found = during(fixture);
		assert.deepEqual(codesOf(found).filter((c) => !alongside.includes(c)), [code], `read as ${found.map((e) => `${e.code}${e.letter}`).join(" ")}`);
		const mine = found.filter((e) => e.code === code);
		const held = mine.reduce((ms, e) => ms + Math.min(e.to, fixture.endAt) - Math.max(e.from, fixture.goAt), 0);
		assert.ok(held >= (fixture.endAt - fixture.goAt) * 0.4, `held ${Math.round(held)} ms of ${Math.round(fixture.endAt - fixture.goAt)}`);
		assert.ok(Math.min(...mine.map((e) => e.from)) <= fixture.goAt + 2 * LATE_MS + 500, "it began when the person did");
	});
}

test("left and right, up and down, are the person's own", () => {
	// The camera sees a mirror image of nothing: the person's left is 51, not the picture's.
	assert.deepEqual(codesOf(during(recorded("head-left"))), [51]);
	assert.deepEqual(codesOf(during(recorded("head-right"))), [52]);
	assert.deepEqual(codesOf(during(recorded("tilt-left"))), [55]);
	assert.deepEqual(codesOf(during(recorded("tilt-right"))), [56]);
	assert.ok(codesOf(during(recorded("head-up"))).includes(53));
});

test("a small smile and a head tipped a little down are slight, and so are not passed on", () => {
	assert.deepEqual(passedOn(recorded("smile-small")), []);
	assert.ok(codesOf(during(recorded("smile-small"), "B")).includes(12));
	assert.deepEqual(passedOn(recorded("head-down")), []);
	assert.ok(codesOf(during(recorded("head-down"), "B")).includes(54));
});

test("a head tipped down, as to the keyboard, is not read as a frown", () => {
	assert.ok(!codesOf(during(recorded("head-down"), "B")).includes(4));
});

test("what the model cannot see is not invented: widened eyes and lowered mouth corners say nothing", () => {
	assert.deepEqual(passedOn(recorded("eyes-wide")), []);
	assert.deepEqual(passedOn(recorded("mouth-corners-down")), []);
});

test("three ordinary blinks are blinks, which are never passed on, and not eyes closed", () => {
	const fixture = recorded("blinks");
	const found = during(fixture, "A");
	assert.ok(found.filter((e) => e.code === 45).length >= 3, `read as ${found.map((e) => `${e.code}${e.letter}`).join(" ")}`);
	assert.deepEqual(passedOn(fixture), []);
});

test("looking at something beside the screen is a head that turned, and no expression", () => {
	const codes = codesOf(during(recorded("look-away")));
	assert.ok(codes.length > 0 && codes.every((code) => code >= 51 && code <= 58), `read as ${codes.join(" ")}`);
});

for (const name of ["rest", "reading", "talking", "typing"]) {
	test(`a face that is only ${name === "rest" ? "at rest" : name} says nothing the app would pass on`, () => {
		assert.deepEqual(passedOn(recorded(name)), []);
	});
}

test("typing with nothing seen before it, as the first message of a session is, says nothing either", () => {
	const fixture = recorded("typing");
	assert.deepEqual(passedOn({ ...fixture, samples: fixture.samples.filter((sample) => sample.at >= fixture.goAt) }), []);
});

test("a movement made after the face was last seen at rest some minutes ago is read from its first moment", () => {
	// As the app holds it: the rest of an earlier message, then the camera off, then this one.
	const rest = recorded("rest").samples;
	const fixture = recorded("lips-pressed");
	const later = fixture.samples.filter((sample) => sample.at >= fixture.goAt).map((sample) => ({ ...sample, at: sample.at + 600_000 }));
	const found = unitEpisodes([...rest, ...later], "C").filter((e) => e.from >= 600_000);
	assert.ok(found.some((e) => e.code === 24), `read as ${found.map((e) => `${e.code}${e.letter}`).join(" ")}`);
});

test("every fixture is accounted for above", () => {
	const used = new Set([...NAMED.map(([name]) => name), "smile-small", "head-down", "eyes-wide", "mouth-corners-down", "blinks", "look-away", "rest", "reading", "talking", "typing", "nose"]);
	assert.deepEqual(recordedNames().filter((name) => !used.has(name)), []);
});

test("a wrinkled nose, which the model has no score for, is at most the brows it pulls down", () => {
	assert.deepEqual(passedOn(recorded("nose")).filter((unit) => !unit.startsWith("4")), []);
});
