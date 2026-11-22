// What a face detector's numbers say the face did (ADR 0058): samples on a clock in,
// steps of FACS units on the same clock out, for `face-assemble.ts` to tie to words.
//
// A sample is what the model reports for one frame: a score per expression, the head's
// transform, how many faces. Nothing here knows a camera. The work is telling a movement
// from a face at rest: every score is read against the person's own recent resting value,
// a unit begins only after it has held and ends only after it has let go, and nothing is
// read while the head is turned away, a second face is in view, or the mouth is talking.
// Pure: numbers in, numbers out.

import type { TimedStep } from "./face-assemble.ts";
import { type Dropped, dropOf, type Threshold, type Unit } from "./face.ts";

/** One frame as the detector saw it. `scores` are the model's expression scores by its own
 *  names, 0 to 1; `matrix` is the head's 4×4 transform, column-major, or `null` with no face. */
export interface FaceSample {
	at: number;
	faces: number;
	scores: Readonly<Record<string, number>>;
	matrix: readonly number[] | null;
}

/** The head's pose: degrees, and `depth` in the transform's own units (about centimetres). */
export interface Pose {
	yaw: number;
	pitch: number;
	roll: number;
	depth: number;
}

const DEG = 180 / Math.PI;
export function poseOf(matrix: readonly number[]): Pose {
	return { yaw: Math.atan2(matrix[8]!, matrix[10]!) * DEG, pitch: Math.asin(Math.max(-1, Math.min(1, -matrix[9]!))) * DEG, roll: Math.atan2(matrix[1]!, matrix[5]!) * DEG, depth: matrix[14]! };
}

type Letter = Unit[1];
const LETTERS: readonly Letter[] = ["A", "B", "C", "D", "E"];

/** Everything that is a judgement about a face, in one place, so it can be tuned against
 *  recordings without touching the rules. */
export interface FaceTuning {
	/** How far back a resting value looks, and how much it needs before anything is read. */
	baselineS: number;
	baselineMinS: number;
	/** A unit begins once it has held this long, and ends once it has let go this long. */
	onMs: number;
	offMs: number;
	/** Samples further apart than this are two sittings: everything ends at the gap. */
	gapMs: number;
	/** Where each intensity letter begins, as a share of a unit's `ranges` entry. */
	letters: readonly [number, number, number, number, number];
	/** How far above rest each expression's score sits when the movement is severe. One scale
	 *  does not fit: a strong frown moves its score half as far as lips rolled in move theirs. */
	ranges: Readonly<Record<number, number>>;
	/** Eyes count as closed from this score; closed for less than `blinkMs` is a blink. */
	closed: number;
	blinkMs: number;
	/** Past these angles off the resting pose the user is looking elsewhere: nothing is read. */
	awayYaw: number;
	awayPitch: number;
	/** Past these the head is still read, but not the face on it: a turned head moves the
	 *  model's expression scores by itself. */
	steadyYaw: number;
	steadyPitch: number;
	/** How much the brow-lowering score rises per degree the head tips down, with no brow moved:
	 *  a person glancing at the keyboard is not frowning at it. */
	browPerDegreeDown: number;
	/** Where each letter begins for a held head pose, in degrees and in depth units. */
	poseDeg: readonly [number, number, number, number, number];
	poseDepth: readonly [number, number, number, number, number];
	/** A head moving to and fro: swings of at least `swayDeg`, each within `swayMs` of the last;
	 *  the letters begin at these swing sizes. */
	swayMs: number;
	swayDeg: readonly [number, number, number, number, number];
	/** Talking: the jaw crossing its own one-second mean at least this often a second, for at
	 *  least `speechMs`. */
	speechPerS: number;
	speechMs: number;
}

export const FACE_TUNING: FaceTuning = {
	baselineS: 60,
	baselineMinS: 2,
	onMs: 300,
	offMs: 400,
	gapMs: 500,
	letters: [0.2, 0.35, 0.55, 0.85, 1.15],
	ranges: { 1: 0.35, 2: 0.2, 4: 0.5, 12: 0.65, 24: 0.5, 26: 0.55 },
	closed: 0.5,
	blinkMs: 700,
	awayYaw: 25,
	awayPitch: 20,
	steadyYaw: 12,
	steadyPitch: 10,
	browPerDegreeDown: 0.02,
	poseDeg: [4, 7, 11, 16, 22],
	poseDepth: [2, 4, 6, 9, 13],
	swayMs: 1500,
	swayDeg: [4, 6, 10, 18, 28],
	speechPerS: 3,
	speechMs: 1000,
};

const most = (scores: Readonly<Record<string, number>>, ...names: string[]) => Math.max(0, ...names.map((name) => scores[name] ?? 0));

/** An expression unit: the score that carries it, and whether it is the mouth's (and so not
 *  read while talking). */
interface Expression {
	code: number;
	/** `down` is how far the head is tipped down off its rest, in degrees, and never negative. */
	score: (scores: Readonly<Record<string, number>>, down: number, tuning: FaceTuning) => number;
	mouth?: true;
}
// Which units this reading can name is a fact about the model, settled on recordings. Its
// scores for widened eyes, a wrinkled nose, raised cheeks and lowered mouth corners do not
// move on a real face, and its squint score sits high at rest and follows the brows. It
// cannot tell lips pressed from lips rolled in or bitten: all three are said as pressed.
const EXPRESSIONS: readonly Expression[] = [
	{ code: 1, score: (s) => most(s, "browInnerUp") },
	{ code: 2, score: (s) => most(s, "browOuterUpLeft", "browOuterUpRight") },
	{ code: 4, score: (s, down, tuning) => most(s, "browDownLeft", "browDownRight") - tuning.browPerDegreeDown * down },
	{ code: 12, score: (s) => most(s, "mouthSmileLeft", "mouthSmileRight"), mouth: true },
	{ code: 24, score: (s) => most(s, "mouthPressLeft", "mouthPressRight", "mouthRollLower", "mouthRollUpper"), mouth: true },
	{ code: 26, score: (s) => most(s, "jawOpen"), mouth: true },
];

/** A held pose: which axis, which way, and the code for it. Which way is which is a fact
 *  about the model's transform, held to recordings by the fixtures' test. */
const POSES: readonly { code: number; axis: keyof Pose; sign: 1 | -1 }[] = [
	{ code: 51, axis: "yaw", sign: 1 },
	{ code: 52, axis: "yaw", sign: -1 },
	{ code: 53, axis: "pitch", sign: -1 },
	{ code: 54, axis: "pitch", sign: 1 },
	{ code: 55, axis: "roll", sign: -1 },
	{ code: 56, axis: "roll", sign: 1 },
	{ code: 57, axis: "depth", sign: 1 },
	{ code: 58, axis: "depth", sign: -1 },
];
/** A head moving to and fro on an axis, and the held poses that movement is not. */
const SWAYS: readonly { code: number; axis: "yaw" | "pitch"; instead: readonly number[] }[] = [
	{ code: 84, axis: "yaw", instead: [51, 52] },
	{ code: 85, axis: "pitch", instead: [53, 54] },
];

/** One unit, from when to when, and how strong. */
export interface UnitEpisode {
	code: number;
	letter: Letter;
	from: number;
	to: number;
}

const median = (values: number[]): number => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** The highest letter `value` reaches on a scale that begins each letter at `starts`. */
function letterOn(value: number, starts: readonly number[]): Letter | null {
	let found: Letter | null = null;
	starts.forEach((start, i) => {
		if (value >= start) found = LETTERS[i]!;
	});
	return found;
}

/** A value read against its own rest, per sample; `null` where it says nothing. */
type Series = (number | null)[];

/**
 * The stretches where `series` held at or above `threshold`: begun once it has stayed there
 * for `onMs`, ended once it has stayed below for `offMs` or at a gap. A sample that says
 * nothing neither begins nor ends one. `value` is the stretch's median.
 */
function held(samples: readonly FaceSample[], series: Series, threshold: number, tuning: FaceTuning): { from: number; to: number; value: number }[] {
	const out: { from: number; to: number; value: number }[] = [];
	let from: number | null = null;
	let last = 0;
	let values: number[] = [];
	let on = false;
	const end = () => {
		if (on && from !== null) out.push({ from, to: last, value: median(values) });
		from = null;
		on = false;
		values = [];
	};
	samples.forEach((sample, i) => {
		if (i > 0 && sample.at - samples[i - 1]!.at > tuning.gapMs) end();
		const value = series[i];
		if (value === null || value === undefined) return;
		if (value >= threshold) {
			from ??= sample.at;
			last = sample.at;
			values.push(value);
			if (sample.at - from >= tuning.onMs) on = true;
		} else if (from !== null && sample.at - last >= tuning.offMs) end();
		else if (from !== null && !on) end();
	});
	end();
	return out;
}

/** How long the face had been watched at each sample: the clock with the gaps taken out. A
 *  camera that was off for five minutes has not forgotten what the face looks like at rest. */
function watchedAt(samples: readonly FaceSample[], tuning: FaceTuning): number[] {
	let watched = 0;
	return samples.map((sample, i) => {
		const step = i > 0 ? sample.at - samples[i - 1]!.at : 0;
		if (step <= tuning.gapMs) watched += step;
		return watched;
	});
}

/** The resting value of `raw` at each sample: the median of the attended samples of the last
 *  `baselineS` seconds watched, refreshed once a second, and `null` until there is enough to
 *  say. */
function resting(watched: readonly number[], raw: Series, attended: readonly boolean[], tuning: FaceTuning): Series {
	const out: Series = [];
	const window: { at: number; value: number }[] = [];
	let rest: number | null = null;
	let refreshed = -Infinity;
	let first: number | null = null;
	watched.forEach((at, i) => {
		const value = raw[i];
		if (attended[i] && value !== null && value !== undefined) {
			first ??= at;
			window.push({ at, value });
			while (window.length && at - window[0]!.at > tuning.baselineS * 1000) window.shift();
			if (at - first >= tuning.baselineMinS * 1000 && at - refreshed >= 1000) {
				rest = median(window.map((w) => w.value));
				refreshed = at;
			}
		}
		out.push(rest);
	});
	return out;
}

/** Where the jaw is talking: per sample. */
function talking(samples: readonly FaceSample[], tuning: FaceTuning): boolean[] {
	const jaw = samples.map((s) => s.scores["jawOpen"] ?? 0);
	// When the jaw crossed its own trailing one-second mean, by a margin a still jaw does not make.
	const crossings: number[] = [];
	let side = 0;
	let start = 0;
	let sum = 0;
	samples.forEach((sample, i) => {
		sum += jaw[i]!;
		while (sample.at - samples[start]!.at > 1000) sum -= jaw[start++]!;
		const off = jaw[i]! - sum / (i - start + 1);
		const now = off > 0.02 ? 1 : off < -0.02 ? -1 : side;
		if (side !== 0 && now !== side) crossings.push(sample.at);
		side = now;
	});
	const out = samples.map(() => false);
	let since: number | null = null;
	let c = 0;
	samples.forEach((sample, i) => {
		while (c < crossings.length && crossings[c]! < sample.at - 1000) c++;
		let n = 0;
		for (let k = c; k < crossings.length && crossings[k]! <= sample.at; k++) n++;
		if (n >= tuning.speechPerS) since ??= sample.at;
		else since = null;
		if (since !== null && sample.at - since >= tuning.speechMs) {
			// The second it took to notice was talking too.
			for (let k = i; k >= 0 && samples[k]!.at >= since - 1000; k--) out[k] = true;
		}
	});
	return out;
}

/** A head moving to and fro on one axis: runs of swings of at least the smallest `swayDeg`,
 *  each begun within `swayMs` of the one before, two reversals or more. */
function sways(samples: readonly FaceSample[], series: Series, tuning: FaceTuning): { from: number; to: number; value: number }[] {
	// Turning points: where the value had gone furthest before coming back by a swing.
	const turns: { at: number; value: number }[] = [];
	let extreme: { at: number; value: number } | null = null;
	let direction = 0;
	const out: { from: number; to: number; value: number }[] = [];
	const close = () => {
		// Three turning points are two reversals: there, back, and there again.
		for (let i = 0; i < turns.length; ) {
			let j = i;
			while (j + 1 < turns.length && turns[j + 1]!.at - turns[j]!.at <= tuning.swayMs) j++;
			if (j - i >= 2) {
				const swings = turns.slice(i + 1, j + 1).map((turn, k) => Math.abs(turn.value - turns[i + k]!.value));
				out.push({ from: turns[i]!.at, to: turns[j]!.at, value: median(swings) });
			}
			i = j + 1;
		}
		turns.length = 0;
		extreme = null;
		direction = 0;
	};
	samples.forEach((sample, i) => {
		if (i > 0 && sample.at - samples[i - 1]!.at > tuning.gapMs) close();
		const value = series[i];
		if (value === null || value === undefined) return;
		if (!extreme) {
			extreme = { at: sample.at, value };
			return;
		}
		const moved = value - extreme.value;
		if (direction === 0) {
			if (Math.abs(moved) >= tuning.swayDeg[0]) {
				turns.push(extreme);
				direction = Math.sign(moved);
				extreme = { at: sample.at, value };
			}
		} else if (moved * direction > 0) extreme = { at: sample.at, value };
		else if (-moved * direction >= tuning.swayDeg[0]) {
			turns.push(extreme);
			direction = -direction;
			extreme = { at: sample.at, value };
		}
	});
	if (extreme && direction !== 0) turns.push(extreme);
	close();
	return out;
}

/** Where the head is at each sample, against its own rest. */
interface Heads {
	/** How far the head is off its resting pose on `axis`; `null` with no pose or no rest yet. */
	off(axis: keyof Pose, i: number): number | null;
	/** One face in view, with a pose. */
	alone: boolean[];
	/** Alone and not turned away: the samples a resting value is read from. */
	attended: boolean[];
	/** Attended and near its rest: the samples an expression is read on. */
	steady: boolean[];
	watched: number[];
}

function headsOf(samples: readonly FaceSample[], tuning: FaceTuning): Heads {
	const poses = samples.map((s) => (s.matrix ? poseOf(s.matrix) : null));
	const alone = samples.map((s, i) => s.faces === 1 && poses[i] !== null);
	// The resting pose comes from every frame with one face in it; what is attended is then
	// decided against it, and every other resting value comes from attended frames alone.
	const watched = watchedAt(samples, tuning);
	const restPose = (axis: keyof Pose) => resting(watched, poses.map((p) => p?.[axis] ?? null), alone, tuning);
	const rest = { yaw: restPose("yaw"), pitch: restPose("pitch"), roll: restPose("roll"), depth: restPose("depth") };
	const off = (axis: keyof Pose, i: number): number | null => (poses[i] && rest[axis][i] !== null ? poses[i]![axis] - rest[axis][i]! : null);
	const within = (i: number, yawMost: number, pitchMost: number): boolean => {
		const yaw = off("yaw", i);
		const pitch = off("pitch", i);
		return yaw === null || pitch === null || (Math.abs(yaw) <= yawMost && Math.abs(pitch) <= pitchMost);
	};
	const attended = samples.map((_, i) => alone[i]! && within(i, tuning.awayYaw, tuning.awayPitch));
	// The face is read only on a head that is near its rest.
	const steady = samples.map((_, i) => attended[i]! && within(i, tuning.steadyYaw, tuning.steadyPitch));
	return { off, alone, attended, steady, watched };
}

/** Each expression unit read against its own rest, per sample: how far above rest its score
 *  is (`-Infinity` where the face is not read, `null` where there is no rest yet), and where
 *  each letter begins for it. */
function expressionsOf(samples: readonly FaceSample[], { off, steady, watched }: Heads, speaking: readonly boolean[], tuning: FaceTuning): { unit: Expression; above: Series; starts: number[] }[] {
	return EXPRESSIONS.map((unit) => {
		const raw: Series = samples.map((s, i) => (steady[i] ? unit.score(s.scores, Math.max(0, off("pitch", i) ?? 0), tuning) : null));
		const base = resting(watched, raw, steady, tuning);
		// Not steady is an ending, not a silence: a face that turned away stopped being read.
		const above: Series = samples.map((_, i) => (!steady[i] || (unit.mouth && speaking[i]) ? -Infinity : raw[i] === null || base[i] === null ? null : raw[i]! - base[i]!));
		return { unit, above, starts: tuning.letters.map((share) => share * tuning.ranges[unit.code]!) };
	});
}

/** What a reading of the face can make of the newest sample: a face it reads, none in
 *  view, more than one, or one turned too far from its rest to read an expression on. */
export type Seen = "face" | "none" | "many" | "turned";

/** What the reading makes of the last of `samples`, by the gates `unitEpisodes` reads
 *  through; `null` with no sample to say it of. */
export function seenIn(samples: readonly FaceSample[], tuning: FaceTuning = FACE_TUNING): Seen | null {
	const last = samples.at(-1);
	if (!last) return null;
	if (last.faces > 1) return "many";
	if (last.faces < 1 || !last.matrix) return "none";
	return headsOf(samples, tuning).steady.at(-1) ? "face" : "turned";
}

/**
 * Every unit the samples show at `floor` intensity or stronger, each from when to when.
 *
 * `floor` is part of the reading, not a filter after it: a unit is held while its score stays
 * at the floor's level, so a marked frown that fades into a slight one ends where it stopped
 * being marked, instead of being averaged into a long slight one.
 */
export function unitEpisodes(samples: readonly FaceSample[], floor: Letter = "A", tuning: FaceTuning = FACE_TUNING): UnitEpisode[] {
	if (samples.length === 0) return [];
	const level = LETTERS.indexOf(floor);
	const heads = headsOf(samples, tuning);
	const { off, attended } = heads;
	const speaking = talking(samples, tuning);
	const out: UnitEpisode[] = [];
	const add = (code: number, found: { from: number; to: number; value: number }[], starts: readonly number[]) => {
		for (const { from, to, value } of found) {
			const letter = letterOn(value, starts);
			if (letter && LETTERS.indexOf(letter) >= level && to > from) out.push({ code, letter, from, to });
		}
	};

	for (const { unit, above, starts } of expressionsOf(samples, heads, speaking, tuning)) add(unit.code, held(samples, above, starts[level]!, tuning), starts);

	// Eyes: read as they are, not against rest, and with no wait: a blink is over in two frames.
	const shut: Series = samples.map((s, i) => (attended[i] ? Math.min(s.scores["eyeBlinkLeft"] ?? 0, s.scores["eyeBlinkRight"] ?? 0) : -Infinity));
	for (const { from, to } of held(samples, shut, tuning.closed, { ...tuning, onMs: 0, offMs: 0 })) {
		const blink = to - from < tuning.blinkMs;
		const letter: Letter = blink ? "B" : "C";
		if (LETTERS.indexOf(letter) >= level) out.push({ code: blink ? 45 : 43, letter, from, to: Math.max(to, from + 1) });
	}

	const swaying: Record<number, { from: number; to: number }[]> = {};
	for (const sway of SWAYS) {
		const found = sways(samples, samples.map((_, i) => (attended[i] ? off(sway.axis, i) : null)), tuning);
		add(sway.code, found, tuning.swayDeg);
		for (const code of sway.instead) swaying[code] = found;
	}
	for (const pose of POSES) {
		const starts = pose.axis === "depth" ? tuning.poseDepth : tuning.poseDeg;
		const series: Series = samples.map((_, i) => {
			const value = attended[i] ? off(pose.axis, i) : null;
			return value === null ? -Infinity : value * pose.sign;
		});
		// A head going to and fro passes through every held pose on its way: that is the sway's.
		const found = held(samples, series, starts[level]!, tuning).filter((h) => !(swaying[pose.code] ?? []).some((s) => s.from < h.to && h.from < s.to));
		add(pose.code, found, starts);
	}
	return out.sort((a, b) => a.from - b.from || a.code - b.code);
}

/** Unit episodes as steps: time cut wherever the set of units held together changes. */
export function stepsOf(episodes: readonly UnitEpisode[]): TimedStep[] {
	const cuts = [...new Set(episodes.flatMap((e) => [e.from, e.to]))].sort((a, b) => a - b);
	const steps: TimedStep[] = [];
	for (let i = 0; i + 1 < cuts.length; i++) {
		const from = cuts[i]!;
		const to = cuts[i + 1]!;
		const units = episodes.filter((e) => e.from <= from && e.to >= to).sort((a, b) => a.code - b.code).map((e): Unit => [e.code, e.letter]);
		if (units.length === 0) continue;
		const last = steps.at(-1);
		if (last && last.to === from && JSON.stringify(last.units) === JSON.stringify(units)) last.to = to;
		else steps.push({ from, to, units });
	}
	return steps;
}

/** What the samples say the face did, as steps, at `floor` intensity or stronger. */
export function episodes(samples: readonly FaceSample[], floor: Letter = "A", tuning: FaceTuning = FACE_TUNING): TimedStep[] {
	return stepsOf(unitEpisodes(samples, floor, tuning));
}

/** Where one expression unit stands at the newest sample. */
export interface Level {
	code: number;
	/** How far the unit's score is above its rest, as a share of that unit's range: 0 at rest,
	 *  about 1 at its strongest. `null` where it is not read: no rest yet, the head turned
	 *  away, or for the mouth's units the mouth talking. */
	value: number | null;
	/** The intensity that is, were it held; `null` under a trace. */
	letter: Letter | null;
}

/** Where each expression unit stands at the last of `samples`, through the gates and against
 *  the rest `unitEpisodes` reads by, and whether the mouth is talking there. */
export function levelsAt(samples: readonly FaceSample[], tuning: FaceTuning = FACE_TUNING): { levels: Level[]; talking: boolean } {
	const speaking = talking(samples, tuning);
	const levels = expressionsOf(samples, headsOf(samples, tuning), speaking, tuning).map(({ unit, above, starts }): Level => {
		const now = above.at(-1);
		if (now === null || now === undefined || now === -Infinity) return { code: unit.code, value: null, letter: null };
		return { code: unit.code, value: now / tuning.ranges[unit.code]!, letter: letterOn(now, starts) };
	});
	return { levels, talking: speaking.at(-1) ?? false };
}

/** A stretch the reading found, and what the app's filter makes of it. */
export interface Inspected extends TimedStep {
	/** Why it is not passed on; `null` when it is. */
	dropped: Dropped | null;
}

/**
 * Everything the samples show, with what `threshold` does to each: the steps read at the
 * threshold's intensity, which are what a message is built from, each passed on or dropped
 * as too short; and beside them every unit that is weaker than that, or a blink.
 *
 * The weaker units are a second reading, at a trace: the floor is part of a reading
 * (`unitEpisodes`), so they are shown as what was seen and never as steps that were cut.
 */
export function inspected(samples: readonly FaceSample[], threshold: Threshold, tuning: FaceTuning = FACE_TUNING): Inspected[] {
	const read = episodes(samples, threshold.intensity, tuning).map((step): Inspected => ({ ...step, dropped: dropOf({ units: step.units, dur: (step.to - step.from) / 1000 }, threshold) }));
	const under = unitEpisodes(samples, "A", tuning)
		.filter((e) => e.letter < threshold.intensity)
		.map((e): Inspected => ({ from: e.from, to: e.to, units: [[e.code, e.letter]], dropped: e.code === 45 ? "blink" : "weak" }));
	return [...read, ...under].sort((a, b) => a.from - b.from);
}

/** `tuning` with the user's own bounds on how far the head may turn and tip before the face
 *  is not read. A head further off than that is not attended to either. */
export function tunedBy(tuning: FaceTuning, yaw: number, pitch: number): FaceTuning {
	return { ...tuning, steadyYaw: yaw, steadyPitch: pitch, awayYaw: Math.max(tuning.awayYaw, yaw), awayPitch: Math.max(tuning.awayPitch, pitch) };
}
