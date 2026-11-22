// What the pill beside the model shows of the face being read, and which
// camera is read: the rules, with no page (ADR 0057). `pill.ts` draws what
// these say.

import type { FaceReading } from "../../src/bridge-types.ts";
import { CLIPPED, type Dropped, FACE_THRESHOLD, sec, type Threshold, type Unit } from "../../src/document/face.ts";
import { FACE_TUNING, type FaceTuning, type Inspected, type Seen, tunedBy } from "../../src/document/face-episodes.ts";
import type { SourceState } from "./detector.ts";

/** Everything the pill can show. */
export type PillState =
	/** The switch is off. */
	| "off"
	/** On, but the user has not yet read what is sent: nothing is read. */
	| "ask"
	/** On, and the camera is off until a key in a prompt. */
	| "idle"
	| "starting"
	/** The camera is on and a face is being read. */
	| "watching"
	/** The camera is on and there is nothing to read: why. */
	| "no-face"
	| "two-faces"
	| "turned"
	| "no-camera"
	/** The user or the system said no to the camera. */
	| "refused"
	| "failed";

/** What the pill's state is decided from. */
export interface FaceFacts {
	/** The switch. */
	face: boolean;
	/** The user agreed to what is sent. */
	explained: boolean;
	/** Where whatever reads the face last said it stands; `null` before it has. */
	source: SourceState | null;
	/** What is in view while it watches. */
	seen: Seen | null;
}

const UNREAD: Record<Exclude<Seen, "face">, PillState> = { none: "no-face", many: "two-faces", turned: "turned" };

export function pillState({ face, explained, source, seen }: FaceFacts): PillState {
	if (!face) return "off";
	if (!explained) return "ask";
	if (source === "refused") return "refused";
	if (source === "absent") return "no-camera";
	if (source !== null && typeof source === "object") return "failed";
	if (source === "starting") return "starting";
	if (source !== "watching") return "idle";
	return seen === null || seen === "face" ? "watching" : UNREAD[seen];
}

/** What the pill's popover says of a state, in a sentence. */
const SAID: Record<Exclude<PillState, "failed">, string> = {
	off: "Your face is not read. On, what it did while you typed goes to the agent with your message, as a few words.",
	ask: "Before the camera is used, read what is sent and to whom.",
	idle: "On. The camera is off until you type.",
	starting: "Starting the camera…",
	watching: "The camera is on, and your face is being read.",
	"no-face": "The camera is on, and no face is in view.",
	"two-faces": "The camera is on, and more than one face is in view, so none is read.",
	turned: "The camera is on. Your head is turned away, so your face is not read.",
	"no-camera": "No camera was found, so your face is not read.",
	refused: "Piary may not use the camera, so your face is not read. Allow it in System Settings → Privacy & Security → Camera.",
};

/** The sentence for `state`; a failure says the reason the source gave. */
export function pillSays(state: PillState, source: SourceState | null): string {
	if (state !== "failed") return SAID[state];
	return `Your face is not read: ${source !== null && typeof source === "object" ? source.failed : "the camera failed"}`;
}

/** A few words for the pill's tooltip and its accessible name. */
const NAMED: Record<PillState, string> = {
	off: "off",
	ask: "on, not yet agreed to",
	idle: "on, the camera is off until you type",
	starting: "starting the camera",
	watching: "the camera is on",
	"no-face": "no face in view",
	"two-faces": "more than one face in view",
	turned: "head turned away",
	"no-camera": "no camera",
	refused: "the camera is not allowed",
	failed: "the camera failed",
};

export const pillTitle = (state: PillState): string => `Read my face: ${NAMED[state]}`;

/** A camera that belongs to another device, or shows the desk and not a face:
 *  never read unless the user chose it by name. A phone would wake to be one. */
const ELSEWHERE = /iphone|ipad|continuity|desk view/i;

/** Which of the cameras `labels` names is read: the one the user chose while
 *  it is there, else the first that is this Mac's own; `null` when there is
 *  none to read. */
export function pickCamera(labels: readonly string[], wanted: string): string | null {
	if (wanted && labels.includes(wanted)) return wanted;
	return labels.find((label) => label && !ELSEWHERE.test(label)) ?? null;
}

/** What the user may set each part of the reading to (`faceTuning`), least first. The
 *  measured value is among each (`MEASURED`). */
export const TUNABLE = {
	intensity: ["B", "C", "D"],
	minMs: [300, 500, 1000, 2000],
	yaw: [8, 12, 18, 25],
	pitch: [6, 10, 15, 20],
} as const satisfies { [K in keyof FaceReading]: readonly FaceReading[K][] };

/** The reading as it was measured, which is what nothing kept means. */
export const MEASURED: FaceReading = { intensity: FACE_THRESHOLD.intensity, minMs: FACE_THRESHOLD.seconds * 1000, yaw: FACE_TUNING.steadyYaw, pitch: FACE_TUNING.steadyPitch };

/** `kept` with every part held to what is offered: a file is the user's to write, and a
 *  value from nowhere would be a reading nobody measured and no control shows. */
export function readingOf(kept: Partial<FaceReading> | undefined): FaceReading {
	const held = <K extends keyof FaceReading>(key: K): FaceReading[K] => ((TUNABLE[key] as readonly unknown[]).includes(kept?.[key]) ? kept![key]! : MEASURED[key]);
	return { intensity: held("intensity"), minMs: held("minMs"), yaw: held("yaw"), pitch: held("pitch") };
}

/** How a face is read and what of it is passed on. */
export interface Tuned {
	threshold: Threshold;
	tuning: FaceTuning;
}

/** `kept` as the reading uses it. */
export function tunedOf(kept: Partial<FaceReading> | undefined): Tuned {
	const { intensity, minMs, yaw, pitch } = readingOf(kept);
	return { threshold: { intensity: intensity as Unit[1], seconds: minMs / 1000 }, tuning: tunedBy(FACE_TUNING, yaw, pitch) };
}

/** The agent speaking first, as one session has gone (ADR 0061). */
export interface Unprompted {
	/** How often the agent was shown a reading with no message. */
	asked: number;
	spoke: number;
	silent: number;
	/** Silent replies one after another, with none spoken between. */
	silentRun: number;
	/** The user said one did not help: no more in this conversation for now. */
	dismissed: boolean;
}

/** After this many silent replies in a row the agent is not asked again this
 *  session: a model that never speaks costs a request each time it is asked. */
export const SILENT_RUN_MAX = 3;

/** Models known never to speak when shown a face alone, by a part of their id:
 *  not asked at all. The experiment measured Haiku; a model not listed here is
 *  tried, and `SILENT_RUN_MAX` bounds what trying costs. */
export const NEVER_SPEAK: readonly RegExp[] = [/haiku/i];

/** Whether the agent may be asked to speak first now, for the model `id`
 *  answering (empty when it is not known yet, which is tried). */
export function mayAsk(so: Unprompted, id: string): boolean {
	return !so.dismissed && so.silentRun < SILENT_RUN_MAX && !NEVER_SPEAK.some((known) => known.test(id));
}

/** What a reading must hold for the agent to be asked unasked: the user's own
 *  threshold, and never weaker than the measured one, since a filter set to
 *  slight is a choice about messages the user sends, not about being spoken to. */
export function unaskedThreshold(set: Threshold): Threshold {
	return { intensity: set.intensity > FACE_THRESHOLD.intensity ? set.intensity : FACE_THRESHOLD.intensity, seconds: Math.max(set.seconds, FACE_THRESHOLD.seconds) };
}

/** Why a stretch is not passed on, in a word or two. */
export const DROPPED: Record<Dropped, string> = { blink: "a blink", weak: "too weak", short: "too short" };

/** A stretch the reading found, in the block's own words. */
export function stretchSays(stretch: Pick<Inspected, "from" | "to" | "units">): string {
	return CLIPPED.step(stretch.units.map(CLIPPED.unit), sec((stretch.to - stretch.from) / 1000));
}
