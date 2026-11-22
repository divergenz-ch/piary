// The seam between whatever reads a face and the rest of the app (ADR 0058).
//
// A detector says what the face did, as steps on the page's clock
// (`performance.now()`, the clock a `prompt-edit` is on). Behind it there are
// two ways to know: a script that says so outright (`scripted.ts`), and a
// source of samples, one per frame read, which `src/document/face-episodes.ts`
// turns into steps. The camera is such a source (`mediapipe.ts`), and so is a
// script of samples. No frame, image or landmark crosses this line: a sample
// is numbers.

import { FACE_THRESHOLD } from "../../src/document/face.ts";
import type { TimedStep } from "../../src/document/face-assemble.ts";
import { episodes, FACE_TUNING, type FaceSample, type Inspected, inspected, type Level, levelsAt, type Seen, seenIn } from "../../src/document/face-episodes.ts";
import type { Tuned } from "./state.ts";

/** What the reading makes of the last while, for the user to look at (ADR 0059). */
export interface Inspection {
	/** Where each expression unit stands now; `null` when nothing reads frames (the camera is
	 *  off, or a script says steps outright). */
	levels: readonly Level[] | null;
	/** The mouth is talking, so its units are not read. */
	talking: boolean;
	/** What was found in the last `RECENT_MS`, with what the filter does to each. */
	recent: readonly Inspected[];
}

/** How far back an inspection looks. */
export const RECENT_MS = 30_000;

/** The reading with nothing set by the user. */
export const AS_MEASURED: Tuned = { threshold: FACE_THRESHOLD, tuning: FACE_TUNING };

export interface FaceDetector {
	/** Begins watching at `at`, the page's clock now. Does nothing while it
	 *  already watches. */
	start(at: number): void;
	/** Stops watching. What it saw so far is kept: a draft may be watched in
	 *  several stretches. */
	stop(): void;
	/** Puts what it saw behind it: `steps` begins again from here. What the face
	 *  looks like at rest is not forgotten. */
	clear(): void;
	/** What the face has done in everything watched since the last `clear`. */
	steps(): readonly TimedStep[];
	/** Where whatever reads the face stands, each time that changes. */
	onState(heard: (state: SourceState) => void): void;
	/** What the reading makes of the face right now, at `now` on the page's
	 *  clock; `null` before anything was seen. */
	seen(now: number): Seen | null;
	/** The cameras there are to choose from, as the system labels them, each
	 *  time that is learned. */
	onCameras(heard: (labels: readonly string[]) => void): void;
	/** What the reading makes of the last while, at `now` on the page's clock;
	 *  `null` before anything was seen. */
	inspect(now: number): Inspection | null;
	/** Shows the camera's picture inside `host`, mirrored, for as long as the
	 *  camera is on, or takes it back with `null`. `false` from a detector with
	 *  no picture to show. The picture is the source's own element: nothing
	 *  here or beyond can read it. */
	picture(host: HTMLElement | null): boolean;
}

/** Where a source of samples stands. `refused` is the user or the system
 *  saying no to the camera; `absent` is no camera to ask for. */
export type SourceState = "starting" | "watching" | "stopped" | "refused" | "absent" | { failed: string };

/** Something that reads a face a frame at a time. */
export interface SampleSource {
	start(): void;
	stop(): void;
	onSample(heard: (sample: FaceSample) => void): void;
	onState(heard: (state: SourceState) => void): void;
	onCameras(heard: (labels: readonly string[]) => void): void;
	/** `FaceDetector.picture`, for a source that has one. */
	picture?(host: HTMLElement | null): void;
}

/** What a long draft may hold: twenty minutes of samples. Past it the oldest go. */
const MAX_SAMPLES = 10_000;
/** What is kept from before a `clear`: about a minute of samples, which is what a
 *  resting value is read from (`FaceTuning.baselineS`). Without it every message
 *  would begin with a face never seen at rest, and a frown worn from its first
 *  key would be taken for the rest itself. */
const REST_SAMPLES = 500;

/** A detector over a source of samples: it keeps what the source reports while
 *  watching, and reads the steps out of it when asked, as `tuned` says at that
 *  moment. Only movements the app would pass on are read: a weaker one would
 *  only cut a stronger one's step in two. */
export function sampledDetector(source: SampleSource, tuned: () => Tuned = () => AS_MEASURED): FaceDetector {
	let samples: FaceSample[] = [];
	let watching = false;
	/** Where the last `clear` fell on the samples' clock. */
	let cut = -Infinity;
	source.onSample((sample) => {
		if (!watching) return;
		samples.push(sample);
		if (samples.length > MAX_SAMPLES) samples = samples.slice(-MAX_SAMPLES);
	});
	return {
		start() {
			if (watching) return;
			watching = true;
			source.start();
		},
		stop() {
			if (!watching) return;
			watching = false;
			source.stop();
		},
		clear() {
			cut = samples.at(-1)?.at ?? cut;
			samples = samples.slice(-REST_SAMPLES);
		},
		// A step that straddles the cut is the part of it after the cut.
		steps: () =>
			episodes(samples, tuned().threshold.intensity, tuned().tuning)
				.filter((step) => step.to > cut)
				.map((step) => (step.from > cut ? step : { ...step, from: cut })),
		onState: (heard) => source.onState(heard),
		// The last minute is what a rest is read from, and so all this needs.
		seen: () => (watching ? seenIn(samples.slice(-REST_SAMPLES), tuned().tuning) : null),
		onCameras: (heard) => source.onCameras(heard),
		inspect: (now) => {
			if (samples.length === 0) return null;
			const { threshold, tuning } = tuned();
			// The last minute again: what the rest is read from covers what is shown.
			const late = samples.slice(-REST_SAMPLES);
			const recent = inspected(late, threshold, tuning).filter((found) => found.to > now - RECENT_MS);
			return watching ? { ...levelsAt(late, tuning), recent } : { levels: null, talking: false, recent };
		},
		picture: (host) => {
			source.picture?.(host);
			return source.picture !== undefined;
		},
	};
}
