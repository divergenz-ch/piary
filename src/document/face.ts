// What a camera saw of the user's face, as the app holds it and as pi is told it
// (`docs/face-format.md`).
//
// Two layers. A detector hands the app a timeline: FACS codes against the text
// that was typed. The app drops what means nothing with a fixed rule
// (`filtered`) and writes the rest as a block of plain words at the end of the
// message pi is handed (`renderFace`). Movements, never feelings, and no model
// in between. The block is never document content: `withoutAppTail` drops it
// wherever a message is read back as what the user wrote.
//
// Pure: numbers and strings in, strings out.

/** A FACS code and its intensity letter, A (trace) to E (maximum). */
export type Unit = [code: number, intensity: "A" | "B" | "C" | "D" | "E"];
/** Movements held together for `dur` seconds. */
export interface Step {
	units: Unit[];
	dur: number;
}
/** What the face did during the first `window` seconds after the last answer was shown. Where
 *  the user was looking is not known. */
export interface Reading {
	window: number;
	events: { at: number; run: Step[] }[];
}
/** `during`: `text` was typed while the run lasted. `pause`: nothing was typed for `pause`
 *  seconds with the caret after `after`. `deleted`: `text` was typed and removed. `nth` picks
 *  an occurrence of the text in the message when it has more than one. */
export type Typing =
	| { kind: "during"; text: string; nth?: number; run: Step[] }
	| { kind: "pause"; after: string; nth?: number; pause: number; run: Step[] }
	| { kind: "deleted"; text: string; run: Step[] };
export interface Timeline {
	read?: Reading;
	type?: Typing[];
}

/** The codes a webcam face model can report, and the words a block says each in. The words
 *  name the movement and never what it may mean: a head that moved up and down is not a
 *  "nod", which is a yes in one place and a no in another. */
export const CODES: Record<number, string> = {
	1: "inner brows raised",
	2: "outer brows raised",
	4: "brows lowered",
	5: "upper lids raised",
	6: "cheeks raised",
	7: "lids tightened",
	9: "nose wrinkled",
	12: "lip corners pulled up",
	15: "lip corners pulled down",
	17: "chin raised",
	24: "lips pressed",
	25: "lips parted",
	26: "jaw dropped",
	28: "lips sucked in",
	32: "lip bitten",
	34: "cheeks puffed",
	43: "eyes closed",
	45: "blink",
	51: "head turned left",
	52: "head turned right",
	53: "head up",
	54: "head down",
	55: "head tilted left",
	56: "head tilted right",
	57: "head forward",
	58: "head back",
	84: "head moved side to side",
	85: "head moved up and down",
};
export const INTENSITY: Record<Unit[1], string> = { A: "trace", B: "slight", C: "marked", D: "severe", E: "maximum" };

/** The line that opens a block. */
export const FACE_HEADER = "[face]";
/** The most lines a block carries; past it the strongest are kept. */
export const MAX_FACE_LINES = 6;
/** An anchor longer than this is written as its first and last words around an ellipsis. */
const LONG_ANCHOR = 48;
/** How much text before the caret a pause's anchor carries at most. */
const PAUSE_ANCHOR = 24;

/** Seconds as a block writes them: one decimal. */
export const sec = (n: number) => n.toFixed(1);

/** Where the `nth` occurrence of `text` starts in `message`, or -1. */
export function occurrence(message: string, text: string, nth: number): number {
	let at = -1;
	for (let i = 0; i < nth; i++) {
		at = message.indexOf(text, at + 1);
		if (at < 0) return -1;
	}
	return at;
}
/** How many times `message` holds `text`. */
export function count(message: string, text: string): number {
	let n = 0;
	for (let at = message.indexOf(text); at >= 0; at = message.indexOf(text, at + 1)) n++;
	return n;
}

/** The `[start, end)` of the message a typing entry is about; a pause is the empty range at its
 *  caret. `null` for a deleted text, which is in no message, and for text the message does not
 *  hold. */
function rangeOf(entry: Typing, message: string): [number, number] | null {
	if (entry.kind === "deleted") return null;
	const text = entry.kind === "during" ? entry.text : entry.after;
	const at = text ? occurrence(message, text, entry.nth ?? 1) : -1;
	if (at < 0) return null;
	return entry.kind === "during" ? [at, at + text.length] : [at + text.length, at + text.length];
}

/** The range of the message each typing entry is about (`rangeOf`). Throws on an entry whose
 *  text the message does not hold: for a caller whose timelines are written by hand, one that
 *  cannot be anchored is broken. */
export function ranges(timeline: Timeline, message: string): ([number, number] | null)[] {
	return (timeline.type ?? []).map((entry) => {
		const range = rangeOf(entry, message);
		if (!range && entry.kind !== "deleted") throw new Error(`the message does not hold ${JSON.stringify(entry.kind === "during" ? entry.text : entry.after)} (occurrence ${entry.nth ?? 1})`);
		return range;
	});
}

/** `text` as an anchor: quoted with JSON's escapes, elided in the middle when long, and marked
 *  `#n` when the message holds it more than once. */
export function anchor(message: string, start: number, end: number): string {
	let text = message.slice(start, end);
	let shown = text;
	if (text.length > LONG_ANCHOR) {
		const head = text.slice(0, text.lastIndexOf(" ", 20) > 0 ? text.lastIndexOf(" ", 20) : 20);
		const cut = text.indexOf(" ", text.length - 20);
		const tail = text.slice(cut > 0 ? cut + 1 : text.length - 20);
		shown = `${head}…${tail}`;
		text = head;
	}
	const total = count(message, text);
	let nth = 1;
	for (let at = message.indexOf(text); at >= 0 && at < start; at = message.indexOf(text, at + 1)) nth++;
	return JSON.stringify(shown) + (total > 1 ? `#${nth}` : "");
}

/** The text before a pause's caret that its anchor shows: the last few words. */
export function before(message: string, caret: number): [number, number] {
	let start = Math.max(0, caret - PAUSE_ANCHOR);
	const space = message.indexOf(" ", start);
	if (start > 0 && space >= 0 && space < caret - 1) start = space + 1;
	return [start, caret];
}

/** How a block spends its words: each construct of a line, as text. */
export interface Wording {
	unit: (u: Unit) => string;
	/** Movements held together, then for how long. */
	step: (units: string[], dur: string) => string;
	then: string;
	read: (at: string, run: string) => string;
	typing: (anchor: string, run: string) => string;
	pause: (anchor: string, pause: string, run: string) => string;
	deleted: (quoted: string, run: string) => string;
}

/** The wording pi is shown: the fewest words every model tested read without a legend. */
export const CLIPPED: Wording = {
	unit: ([code, letter]) => `${CODES[code]!} ${INTENSITY[letter]}`,
	step: (units, dur) => `${units.join(" + ")} ${dur}s`,
	then: ", then ",
	read: (at, run) => `read ${at}s: ${run}`,
	typing: (anchor, run) => `typing ${anchor}: ${run}`,
	pause: (anchor, pause, run) => `pause ${pause}s after ${anchor}: ${run}`,
	deleted: (quoted, run) => `deleted ${quoted}: ${run}`,
};

/** One line of a block, and the run it says. */
interface Line {
	text: string;
	run: Step[];
}

/** A timeline's lines in `wording`: reading lines first, then the typing entries in the
 *  timeline's order. An entry whose text the message does not hold has no line. */
function linesOf(wording: Wording, timeline: Timeline, message: string): Line[] {
	const run = (steps: Step[]) => steps.map((step) => wording.step(step.units.map(wording.unit), sec(step.dur))).join(wording.then);
	const out: Line[] = [];
	for (const event of timeline.read?.events ?? []) out.push({ text: wording.read(sec(event.at), run(event.run)), run: event.run });
	for (const entry of timeline.type ?? []) {
		if (entry.kind === "deleted") {
			out.push({ text: wording.deleted(JSON.stringify(entry.text), run(entry.run)), run: entry.run });
			continue;
		}
		const range = rangeOf(entry, message);
		if (!range) continue;
		const text = entry.kind === "during" ? wording.typing(anchor(message, range[0], range[1]), run(entry.run)) : wording.pause(anchor(message, ...before(message, range[0])), sec(entry.pause), run(entry.run));
		out.push({ text, run: entry.run });
	}
	return out;
}

/** A timeline in `wording`, under the header. Throws where `ranges` does, and says a timeline
 *  with nothing in it as a header alone: the experiment's renderings, which compare wordings
 *  over timelines written by hand. */
export function worded(wording: Wording, timeline: Timeline, message: string): string {
	ranges(timeline, message);
	return [FACE_HEADER, ...linesOf(wording, timeline, message).map((line) => line.text)].join("\n");
}

/** How strong a line is: its highest intensity, then its longest step. */
function strength(run: Step[]): [letter: string, dur: number] {
	let letter = "";
	let dur = 0;
	for (const step of run) {
		dur = Math.max(dur, step.dur);
		for (const [, l] of step.units) if (l > letter) letter = l;
	}
	return [letter, dur];
}

/**
 * The block pi is handed for `timeline`, or the empty string when there is nothing to say.
 *
 * It never throws: an entry whose text the message does not hold is left out, because a
 * message must go whatever the face log holds. Over `MAX_FACE_LINES` the strongest lines are
 * kept, in the order they had.
 */
export function renderFace(timeline: Timeline, message: string): string {
	const lines = linesOf(CLIPPED, timeline, message);
	if (lines.length === 0) return "";
	const kept = new Set(
		lines
			.map((line, i) => ({ i, rank: strength(line.run) }))
			.sort((a, b) => (a.rank[0] === b.rank[0] ? b.rank[1] - a.rank[1] || a.i - b.i : a.rank[0] < b.rank[0] ? 1 : -1))
			.slice(0, MAX_FACE_LINES)
			.map((x) => x.i),
	);
	return [FACE_HEADER, ...lines.filter((_, i) => kept.has(i)).map((line) => line.text)].join("\n");
}

const escaped = (words: string) => words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const UNIT = `(?:${Object.values(CODES).map(escaped).join("|")}) (?:${Object.values(INTENSITY).join("|")})`;
const STEP = `${UNIT}(?: \\+ ${UNIT})* \\d+\\.\\ds`;
const RUN = `${STEP}(?:, then ${STEP})*`;
const ANCHOR = `"(?:[^"\\\\]|\\\\.)*"(?:#\\d+)?`;
const FACE_LINE = new RegExp(`^(?:read \\d+\\.\\ds|typing ${ANCHOR}|pause \\d+\\.\\ds after ${ANCHOR}|deleted ${ANCHOR}): ${RUN}$`);

/** Whether `line` is a line `renderFace` writes under the header: one of its four shapes, whole,
 *  down to the movements' words. Prose that begins like one is not one. */
export function isFaceLine(line: string): boolean {
	return FACE_LINE.test(line);
}

/** The weakest intensity and the shortest step the app passes on (`filtered`). */
export interface Threshold {
	intensity: Unit[1];
	seconds: number;
}

/** What the app passes on unless the user chose otherwise: marked or stronger, held half a
 *  second or longer. */
export const FACE_THRESHOLD: Threshold = { intensity: "C", seconds: 0.5 };

/** Why the app does not pass a step on. */
export type Dropped = "blink" | "weak" | "short";

const passes = ([code, letter]: Unit, threshold: Threshold): boolean => code !== 45 && letter >= threshold.intensity;

/** Why `threshold` drops `step`, or `null` when it passes: nothing in it but blinks, nothing
 *  in it strong enough, or not held long enough. This is `filtered`'s rule, said of one step. */
export function dropOf(step: Step, threshold: Threshold): Dropped | null {
	if (!step.units.some((unit) => passes(unit, threshold))) return step.units.length > 0 && step.units.every(([code]) => code === 45) ? "blink" : "weak";
	return step.dur < threshold.seconds ? "short" : null;
}

/** `timeline` as the app passes it on: without blinks, movements weaker than
 *  `threshold.intensity`, or steps shorter than `threshold.seconds`. */
export function filtered(timeline: Timeline, threshold: Threshold): Timeline {
	const run = (steps: Step[]) => steps.filter((step) => dropOf(step, threshold) === null).map((step) => ({ ...step, units: step.units.filter((unit) => passes(unit, threshold)) }));
	const out: Timeline = {};
	if (timeline.read) out.read = { window: timeline.read.window, events: timeline.read.events.map((e) => ({ at: e.at, run: run(e.run) })).filter((e) => e.run.length > 0) };
	if (timeline.type) out.type = timeline.type.map((entry) => ({ ...entry, run: run(entry.run) })).filter((entry) => entry.run.length > 0) as Typing[];
	return out;
}
