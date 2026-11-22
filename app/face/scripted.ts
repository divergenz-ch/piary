// A face that follows a script, in place of a camera: how a driven run and a
// page spec say what the face did (`PIARY_FACE_SCRIPT`,
// docs/TEST_ARCHITECTURE.md §6).
//
// The script is JSON, in one of two shapes. A list of timed steps, or
// `{ "steps": [...] }`, says what the face did outright. `{ "samples": [...] }`
// says what a detector saw frame by frame, and goes through the same reading
// as a camera's samples do. Either way its clock starts when the detector
// first does, which the app does at the first key of a prompt: `from: 0`, or
// `at: 0`, is that key.
//
// The object shapes may also say what a camera would: `"state"`, where it ends
// up when started in place of watching (`"refused"`, `"absent"`,
// `{ "failed": "…" }`); `"seen"`, what a script of steps has in view (a script
// of samples is read for it); and `"cameras"`, the labels there are to choose
// from.

import { CODES, dropOf, INTENSITY, type Unit } from "../../src/document/face.ts";
import type { TimedStep } from "../../src/document/face-assemble.ts";
import { episodes, type FaceSample, inspected, levelsAt, type Seen, seenIn } from "../../src/document/face-episodes.ts";
import { AS_MEASURED, type FaceDetector, RECENT_MS, type SourceState } from "./detector.ts";
import type { Tuned } from "./state.ts";

/** What a script may say in a camera's place. */
interface Staged {
	/** Where a start ends up, in place of `watching`. */
	state?: SourceState;
	/** What a script of steps has in view while it watches. */
	seen?: Seen;
	cameras?: string[];
}

/** What a script holds: steps, or the samples steps are read from. */
export type FaceScript = ({ steps: TimedStep[] } | { samples: FaceSample[] }) & Staged;

const FAILURES: readonly unknown[] = ["refused", "absent"];
const SEEN: readonly unknown[] = ["face", "none", "many", "turned"];

const isUnit = (unit: unknown): unit is Unit => Array.isArray(unit) && unit.length === 2 && typeof unit[0] === "number" && unit[0] in CODES && typeof unit[1] === "string" && unit[1] in INTENSITY;
const isStep = (step: unknown): step is TimedStep => {
	const { from, to, units } = (step ?? {}) as Partial<TimedStep>;
	return typeof from === "number" && typeof to === "number" && Array.isArray(units) && units.every(isUnit);
};
const isSample = (sample: unknown): sample is FaceSample => {
	const { at, faces, scores, matrix } = (sample ?? {}) as Partial<FaceSample>;
	const numbers = (list: unknown) => Array.isArray(list) && list.every((n) => typeof n === "number");
	return typeof at === "number" && typeof faces === "number" && typeof scores === "object" && scores !== null && numbers(Object.values(scores)) && (matrix === null || (numbers(matrix) && matrix!.length === 16));
};

/** The script `text` holds; throws on text that is not one, because a run
 *  driven by a script that was misread would pass for the wrong reason. */
export function parseFaceScript(text: string): FaceScript {
	const script: unknown = JSON.parse(text);
	if (Array.isArray(script) && script.every(isStep)) return { steps: script };
	const { steps, samples, state, seen, cameras } = (script ?? {}) as { steps?: unknown; samples?: unknown; state?: unknown; seen?: unknown; cameras?: unknown };
	const staged: Staged = {};
	if (FAILURES.includes(state)) staged.state = state as SourceState;
	else if (typeof (state as { failed?: unknown } | undefined)?.failed === "string") staged.state = { failed: (state as { failed: string }).failed };
	else if (state !== undefined) throw new Error('the face script\'s "state" is none of "refused", "absent" and {failed: "…"}');
	if (SEEN.includes(seen)) staged.seen = seen as Seen;
	else if (seen !== undefined) throw new Error('the face script\'s "seen" is none of "face", "none", "many" and "turned"');
	if (Array.isArray(cameras) && cameras.every((label) => typeof label === "string")) staged.cameras = cameras;
	else if (cameras !== undefined) throw new Error('the face script\'s "cameras" is not a list of labels');
	if (Array.isArray(steps) && steps.every(isStep)) return { steps, ...staged };
	if (Array.isArray(samples) && samples.every(isSample)) return { samples, ...staged };
	throw new Error("the face script is neither a list of {from, to, units} steps nor {samples: [{at, faces, scores, matrix}]}");
}

/** A detector that plays `script` from the moment it is first started. A
 *  script is not a camera: stopping it does not wind its clock back, and only
 *  `clear` does. It says the states a camera would, so what shows them can be
 *  driven. Samples are read as `tuned` says; steps are what they say. */
export function scriptedDetector(script: FaceScript, tuned: () => Tuned = () => AS_MEASURED): FaceDetector {
	let origin: number | null = null;
	let watching = false;
	let said: (state: SourceState) => void = () => {};
	let listed: (labels: readonly string[]) => void = () => {};
	const played = (from: number): readonly TimedStep[] =>
		"steps" in script
			? script.steps.map((step) => ({ ...step, from: step.from + from, to: step.to + from }))
			: episodes(script.samples.map((sample) => ({ ...sample, at: sample.at + from })), tuned().threshold.intensity, tuned().tuning);
	return {
		start: (at) => {
			origin ??= at;
			if (watching) return;
			watching = true;
			said("starting");
			if (script.cameras) listed(script.cameras);
			said(script.state ?? "watching");
		},
		stop: () => {
			if (!watching) return;
			watching = false;
			said("stopped");
		},
		clear: () => void (origin = null),
		// A camera that could not be had saw nothing.
		steps: () => (origin === null || script.state ? [] : played(origin)),
		onState: (heard) => void (said = heard),
		seen: (now) => {
			if (!watching || origin === null || script.state) return null;
			if ("steps" in script) return script.seen ?? "face";
			const from = origin;
			return seenIn(script.samples.filter((sample) => sample.at + from <= now), tuned().tuning);
		},
		onCameras: (heard) => void (listed = heard),
		inspect: (now) => {
			if (origin === null || script.state) return null;
			const from = origin;
			const { threshold, tuning } = tuned();
			if ("samples" in script) {
				const late = script.samples.filter((sample) => sample.at + from <= now).map((sample) => ({ ...sample, at: sample.at + from }));
				const recent = inspected(late, threshold, tuning).filter((found) => found.to > now - RECENT_MS);
				return watching ? { ...levelsAt(late, tuning), recent } : { levels: null, talking: false, recent };
			}
			// A step still going is as long as it has lasted.
			const recent = played(from)
				.filter((step) => step.from < now && step.to > now - RECENT_MS)
				.map((step) => ({ ...step, to: Math.min(step.to, now) }))
				.map((step) => ({ ...step, dropped: dropOf({ units: step.units, dur: (step.to - step.from) / 1000 }, threshold) }));
			return { levels: null, talking: false, recent };
		},
		// A script has no picture.
		picture: () => false,
	};
}
