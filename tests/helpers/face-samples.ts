// A face made of numbers, for the episode tests: samples as a detector would report them, at a
// frame rate, with the scores and the head pose a test asks for and a little rest otherwise.
import type { FaceSample } from "../../dist/document/face-episodes.js";

const RAD = Math.PI / 180;

/** The transform `poseOf` reads `pose` back from. */
export function matrixOf({ yaw = 0, pitch = 0, roll = 0, depth = -35 }: { yaw?: number; pitch?: number; roll?: number; depth?: number }): number[] {
	const m = Array<number>(16).fill(0);
	const cp = Math.cos(pitch * RAD);
	m[9] = -Math.sin(pitch * RAD);
	m[8] = Math.sin(yaw * RAD) * cp;
	m[10] = Math.cos(yaw * RAD) * cp;
	m[1] = Math.sin(roll * RAD) * cp;
	m[5] = Math.cos(roll * RAD) * cp;
	m[14] = depth;
	m[15] = 1;
	return m;
}

/** What a face at rest scores: not zero, as a real one is not. */
export const REST: Record<string, number> = { browDownLeft: 0.09, browDownRight: 0.09, browInnerUp: 0.03, eyeSquintLeft: 0.3, eyeSquintRight: 0.3, jawOpen: 0.02, mouthSmileLeft: 0.01, mouthSmileRight: 0.01 };

export interface Moment {
	scores?: Record<string, number>;
	yaw?: number;
	pitch?: number;
	roll?: number;
	depth?: number;
	faces?: number;
}

/**
 * Samples every `everyMs` from `from` for `ms`, each as `at(t)` says for `t` milliseconds in
 * (rest where it says nothing). Chain calls by passing the last sample's time on.
 */
export function watch(from: number, ms: number, at: (t: number) => Moment = () => ({}), everyMs = 133): FaceSample[] {
	const out: FaceSample[] = [];
	for (let t = 0; t < ms; t += everyMs) {
		const moment = at(t);
		const faces = moment.faces ?? 1;
		out.push({ at: from + t, faces, scores: { ...REST, ...moment.scores }, matrix: faces === 0 ? null : matrixOf(moment) });
	}
	return out;
}

/** Stretches one after another on one clock: `[ms, what the face does meanwhile]`. */
export function sitting(...stretches: [ms: number, at?: (t: number) => Moment][]): FaceSample[] {
	const out: FaceSample[] = [];
	let from = 0;
	for (const [ms, at] of stretches) {
		out.push(...watch(from, ms, at));
		from += ms;
	}
	return out;
}
