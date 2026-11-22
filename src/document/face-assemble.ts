// A face on a clock and a keyboard on a clock, joined into a timeline that has
// no clock (`face-format.md` §The timeline).
//
// A detector says what the face did from when to when; the key log says what
// was typed when (`keystrokes.ts`). Each step of the face is tied to what the
// keyboard was doing meanwhile: the words being typed, a pause, or words that
// were later removed. A step the keyboard was doing nothing under says nothing
// about the message and is left out. Pure.

import { count, type Reading, type Step, type Timeline, type Typing, type Unit } from "./face.ts";
import type { Keys } from "./keystrokes.ts";

/** Movements held together from `from` to `to`, on the clock the keys are on
 *  (milliseconds). */
export interface TimedStep {
	from: number;
	to: number;
	units: Unit[];
}

/** The stretch after an answer appeared in which the face is taken to be reading it, on
 *  the clock the steps are on: from when it was shown to when the reading ended, which is
 *  the window's length later or the user's first key, whichever came first. */
export interface ReadWindow {
	from: number;
	to: number;
}

/** How much of the text before a pause's caret names the pause. */
const PAUSE_WORD = /\S+$/;
/** What an anchor does not begin or end with: punctuation and space around the words. */
const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

const seconds = (ms: number) => Math.round(ms / 100) / 10;
const overlap = (a: { from: number; to: number }, b: { from: number; to: number }) => Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));

/** Which occurrence of `text` in `message` the one at `start` is, from 1; left
 *  out when the message holds it once. */
function nthOf(message: string, text: string, start: number): { nth?: number } {
	if (count(message, text) < 2) return {};
	let nth = 1;
	for (let at = message.indexOf(text); at >= 0 && at < start; at = message.indexOf(text, at + 1)) nth++;
	return { nth };
}

/** The longest stretch of `keys.text` typed while `step` lasted, grown to whole
 *  words and trimmed of the punctuation around them; `null` when nothing was. */
function typedDuring(keys: Keys, step: TimedStep): [number, number] | null {
	let best: [number, number] | null = null;
	let from = -1;
	for (let i = 0; i <= keys.typed.length; i++) {
		const at = keys.typed[i];
		const inside = at !== null && at !== undefined && at >= step.from && at <= step.to;
		if (inside && from < 0) from = i;
		if (!inside && from >= 0) {
			if (!best || i - from > best[1] - best[0]) best = [from, i];
			from = -1;
		}
	}
	if (!best) return null;
	let [start, end] = best;
	// A space typed at either end is not a word begun: growing from it would
	// take in a neighbour that was typed at another time.
	while (start < end && /\s/.test(keys.text[start]!)) start++;
	while (end > start && /\s/.test(keys.text[end - 1]!)) end--;
	if (start === end) return null;
	while (start > 0 && !/\s/.test(keys.text[start - 1]!)) start--;
	while (end < keys.text.length && !/\s/.test(keys.text[end]!)) end++;
	const word = keys.text.slice(start, end);
	const kept = word.replace(EDGE, "");
	if (!kept) return null;
	start += word.search(/[\p{L}\p{N}]/u);
	return [start, start + kept.length];
}

/** One entry being gathered: what it is tied to, where in the message it sits
 *  and when its first step began, for the order entries are written in. */
interface Entry {
	typing: Typing;
	/** What two steps must share to be one entry: the pause, the deletion, or
	 *  for typing nothing, since those join by the text they cover. */
	key: string;
	range: [number, number];
	first: number;
}

/**
 * The timeline of `steps` against `keys`, for `message`: the text pi is handed,
 * which holds `keys.text` from `offset` on.
 *
 * A step counts as a pause's when most of it fell inside the pause, as a
 * deletion's when most of it fell while the removed text was typed, and
 * otherwise as typing over whatever text of the message was typed meanwhile.
 * Steps tied to the same thing, one after another, are one entry's run.
 * Entries come in the order of the message's text.
 *
 * With `reading`, what the face did inside that stretch is the timeline's `read`, each
 * unbroken run of steps an event timed from the stretch's start, and is tied to nothing
 * typed: a step that crosses the stretch's end is the reading's up to there and the
 * keyboard's after.
 */
export function assemble({ steps, keys, message, offset = 0, reading }: { steps: readonly TimedStep[]; keys: Keys; message: string; offset?: number; reading?: ReadWindow }): Timeline {
	const sorted = [...steps].sort((a, b) => a.from - b.from);
	const events: Reading["events"] = [];
	let outside = sorted;
	if (reading && reading.to > reading.from) {
		outside = [];
		let ended = -Infinity;
		for (const timed of sorted) {
			const from = Math.max(timed.from, reading.from);
			const to = Math.min(timed.to, reading.to);
			if (to > from) {
				const step: Step = { units: timed.units, dur: seconds(to - from) };
				if (ended === from) events.at(-1)!.run.push(step);
				else events.push({ at: seconds(from - reading.from), run: [step] });
				ended = to;
			}
			if (timed.from < reading.from) outside.push({ ...timed, to: Math.min(timed.to, reading.from) });
			if (timed.to > reading.to) outside.push({ ...timed, from: Math.max(timed.from, reading.to) });
		}
	}
	const read: Pick<Timeline, "read"> = reading && events.length > 0 ? { read: { window: seconds(reading.to - reading.from), events } } : {};
	const entries: Entry[] = [];
	// The entry the step before this one joined, if it joined one.
	const held: { last: Entry | null } = { last: null };
	const add = (entry: Entry, step: Step): void => {
		entry.typing.run.push(step);
		held.last = entry;
	};
	for (const timed of outside) {
		const length = timed.to - timed.from;
		if (length <= 0) continue;
		const step: Step = { units: timed.units, dur: seconds(length) };
		const prior = held.last;
		held.last = null;

		const pauseAt = keys.pauses.findIndex((pause) => overlap(pause, timed) * 2 > length);
		if (pauseAt >= 0) {
			const pause = keys.pauses[pauseAt]!;
			const key = `pause:${pauseAt}`;
			if (prior?.key === key) {
				add(prior, step);
				continue;
			}
			// The caret, back over the space typed before stopping: the anchor is words.
			const caret = keys.text.slice(0, pause.offset).trimEnd().length;
			const after = PAUSE_WORD.exec(keys.text.slice(0, caret))?.[0];
			if (!after) continue;
			const start = offset + caret - after.length;
			if (message.slice(start, start + after.length) !== after) continue;
			const entry: Entry = { typing: { kind: "pause", after, ...nthOf(message, after, start), pause: seconds(pause.to - pause.from), run: [] }, key, range: [start + after.length, start + after.length], first: timed.from };
			entries.push(entry);
			add(entry, step);
			continue;
		}

		const deletedAt = keys.deleted.findIndex((gone) => overlap(gone, timed) * 2 > length);
		if (deletedAt >= 0) {
			const gone = keys.deleted[deletedAt]!;
			const key = `deleted:${deletedAt}`;
			if (prior?.key === key) {
				add(prior, step);
				continue;
			}
			const at = offset + Math.max(gone.offset, 0);
			const entry: Entry = { typing: { kind: "deleted", text: gone.text, run: [] }, key, range: [at, at], first: timed.from };
			entries.push(entry);
			add(entry, step);
			continue;
		}

		const typed = typedDuring(keys, timed);
		if (!typed) continue;
		const range: [number, number] = [offset + typed[0], offset + typed[1]];
		if (message.slice(...range) !== keys.text.slice(...typed)) continue;
		if (prior?.typing.kind === "during" && range[0] <= prior.range[1] && prior.range[0] <= range[1]) {
			prior.range = [Math.min(prior.range[0], range[0]), Math.max(prior.range[1], range[1])];
			const text = message.slice(...prior.range);
			prior.typing = { kind: "during", text, ...nthOf(message, text, prior.range[0]), run: prior.typing.run };
			add(prior, step);
			continue;
		}
		const text = message.slice(...range);
		const entry: Entry = { typing: { kind: "during", text, ...nthOf(message, text, range[0]), run: [] }, key: "", range, first: timed.from };
		entries.push(entry);
		add(entry, step);
	}
	if (entries.length === 0) return read;
	return { ...read, type: entries.sort((a, b) => a.range[0] - b.range[0] || a.first - b.first).map((entry) => entry.typing) };
}
