// The face-format experiment's one source of truth for a case: a timeline of what the user's
// face did while reading the last answer and while typing, and the encodings of it that the
// experiment compares (spec.md). Every block an arm sends is serialized from a timeline, so two
// arms differ in encoding and never in content. Pure: no I/O.

import { anchor, before, CLIPPED, CODES as WORDS, count, INTENSITY, occurrence, ranges, sec, type Step, type Timeline, type Typing, type Unit, type Wording, worded } from "../../../src/document/face.ts";

// The timeline's types, the anchors, the filter and the `clipped` wording are the app's
// (`docs/face-format.md`); what stays here is what the experiment alone compares.
export { filtered, INTENSITY, ranges, type Reading, type Step, type Threshold, type Timeline, type Typing, type Unit } from "../../../src/document/face.ts";

/** The token the `names` format writes for each code. */
const NAMES: Record<number, string> = {
	1: "brow-in-up",
	2: "brow-out-up",
	4: "brow-down",
	5: "lid-up",
	6: "cheek-up",
	7: "lid-tight",
	9: "nose-wrinkle",
	12: "lip-corner-up",
	15: "lip-corner-down",
	17: "chin-up",
	24: "lip-press",
	25: "lips-part",
	26: "jaw-drop",
	28: "lip-suck",
	32: "bite",
	34: "puff",
	43: "eyes-closed",
	45: "blink",
	51: "turn-left",
	52: "turn-right",
	53: "head-up",
	54: "head-down",
	55: "tilt-left",
	56: "tilt-right",
	57: "head-forward",
	58: "head-back",
	84: "head-shake",
	85: "head-nod",
};
/** The codes a webcam face model can report, with the token and the words each format uses. */
export const CODES: Record<number, { name: string; words: string }> = Object.fromEntries(Object.entries(WORDS).map(([code, words]) => [code, { name: NAMES[Number(code)]!, words }]));

export const FORMATS = ["codes", "names", "words", "json", "phrases", "clipped", "telegraphic"] as const;
export type Format = (typeof FORMATS)[number];
/** The renderings an agent is shown: plain words, from the fullest to the tersest. `words` is
 *  the first experiment's shape, with its own header; the other three share one header and one
 *  anchor rule, and differ only in how few words a line spends. */
export const RENDERINGS = ["words", "phrases", "clipped", "telegraphic"] as const satisfies readonly Format[];

const HEADER = "[face/1]";

function runOf(run: Step[], unit: (u: Unit) => string): string {
	return run.map((step) => `${step.units.map(unit).join("+")} ${sec(step.dur)}`).join(" > ");
}

function lines(timeline: Timeline, message: string, unit: (u: Unit) => string): string[] {
	const out: string[] = [];
	for (const event of timeline.read?.events ?? []) out.push(`r ${sec(event.at)} ${runOf(event.run, unit)}`);
	const where = ranges(timeline, message);
	(timeline.type ?? []).forEach((entry, i) => {
		const range = where[i];
		if (entry.kind === "deleted" || !range) out.push(`d ${JSON.stringify((entry as { text: string }).text)} ${runOf(entry.run, unit)}`);
		else if (entry.kind === "during") out.push(`t ${anchor(message, range[0], range[1])} ${runOf(entry.run, unit)}`);
		else out.push(`p ${anchor(message, ...before(message, range[0]))} ${sec(entry.pause)} ${runOf(entry.run, unit)}`);
	});
	return out;
}

function words(timeline: Timeline, message: string): string {
	const unit = ([code, letter]: Unit) => `${CODES[code]!.words} (${INTENSITY[letter]})`;
	const run = (steps: Step[]) => steps.map((step) => `${step.units.map(unit).join(" + ")}, ${sec(step.dur)} s`).join("; then ");
	const out = ["[face: what the camera saw of the user's face. Movements, not feelings.]"];
	if (timeline.read) {
		for (const event of timeline.read.events) out.push(`- ${sec(event.at)} s after your last answer appeared (where the user was looking is not known): ${run(event.run)}`);
		if (timeline.read.events.length === 0) out.push(`- in the first ${sec(timeline.read.window)} s after your last answer appeared: nothing`);
	}
	const where = ranges(timeline, message);
	(timeline.type ?? []).forEach((entry, i) => {
		const range = where[i];
		if (entry.kind === "deleted" || !range) out.push(`- typed then deleted "…${(entry as { text: string }).text}…": ${run(entry.run)}`);
		else if (entry.kind === "during") out.push(`- while typing "…${message.slice(range[0], range[1])}…"${count(message, entry.text) > 1 ? ` (occurrence ${entry.nth ?? 1} of it)` : ""}: ${run(entry.run)}`);
		else out.push(`- paused ${sec(entry.pause)} s after typing "…${message.slice(...before(message, range[0]))}": ${run(entry.run)}`);
	});
	return out.join("\n");
}

const WORDINGS: Record<Exclude<(typeof RENDERINGS)[number], "words">, Wording> = {
	phrases: {
		unit: ([code, letter]) => `${CODES[code]!.words} (${INTENSITY[letter]})`,
		step: (units, dur) => `${units.join(" + ")}, ${dur} s`,
		then: "; then ",
		read: (at, run) => `- ${at} s after your answer appeared: ${run}`,
		typing: (anchor, run) => `- while typing ${anchor}: ${run}`,
		pause: (anchor, pause, run) => `- paused ${pause} s after ${anchor}: ${run}`,
		deleted: (quoted, run) => `- typed then deleted ${quoted}: ${run}`,
	},
	clipped: CLIPPED,
	telegraphic: {
		unit: ([code, letter]) => `${CODES[code]!.words} ${INTENSITY[letter]}`,
		step: (units, dur) => `${units.join("+")} ${dur}`,
		then: " > ",
		read: (at, run) => `read ${at} ${run}`,
		typing: (anchor, run) => `typing ${anchor} ${run}`,
		pause: (anchor, pause, run) => `pause ${anchor} ${pause} ${run}`,
		deleted: (quoted, run) => `deleted ${quoted} ${run}`,
	},
};

/** The block a format sends for `timeline`, or the empty string when there is nothing to say. */
export function serialize(format: Format, timeline: Timeline, message: string): string {
	const empty = (timeline.read?.events.length ?? 0) === 0 && (timeline.type?.length ?? 0) === 0;
	if (empty) return "";
	if (format === "json") return `[face/json] ${JSON.stringify(timeline)}`;
	if (format === "words") return words(timeline, message);
	if (format === "phrases" || format === "clipped" || format === "telegraphic") return worded(WORDINGS[format], timeline, message);
	const unit = format === "codes" ? ([code, letter]: Unit) => `${code}${letter}` : ([code, letter]: Unit) => `${CODES[code]!.name}:${letter}`;
	return [HEADER, ...lines(timeline, message, unit)].join("\n");
}

const UNIT = /^(\d+)([A-E])$/;
function parseRun(text: string): Step[] {
	return text.split(" > ").map((step) => {
		const [units, dur] = step.split(" ");
		if (!units || !dur || Number.isNaN(Number(dur))) throw new Error(`not a step: ${step}`);
		return {
			units: units.split("+").map((u): Unit => {
				const m = UNIT.exec(u);
				if (!m || !CODES[Number(m[1])]) throw new Error(`not a unit: ${u}`);
				return [Number(m[1]), m[2] as Unit[1]];
			}),
			dur: Number(dur),
		};
	});
}

/** A quoted anchor at the start of `rest`, its `#n`, and what follows it. */
function parseAnchor(rest: string): { text: string; nth: number; after: string } {
	let end = 1;
	while (end < rest.length && (rest[end] !== '"' || rest[end - 1] === "\\")) end++;
	const text = JSON.parse(rest.slice(0, end + 1)) as string;
	const mark = /^#(\d+)/.exec(rest.slice(end + 1));
	return { text, nth: mark ? Number(mark[1]) : 1, after: rest.slice(end + 1 + (mark?.[0].length ?? 0)).trimStart() };
}

/**
 * What a `codes` block says, as `[start, end)` ranges of `message` rather than quoted text, so
 * a block read back is compared with the timeline it came from whatever its anchors elided
 * (`resolved` gives a timeline the same shape). Throws on a line the grammar does not allow.
 */
export function parseCodes(block: string, message: string): Resolved {
	const [header, ...rows] = block.split("\n");
	if (header !== HEADER) throw new Error(`not a face/1 block: ${header}`);
	const out: Resolved = { read: [], type: [] };
	for (const row of rows) {
		const phase = row[0];
		const rest = row.slice(2);
		if (phase === "r") {
			const space = rest.indexOf(" ");
			out.read.push({ at: Number(rest.slice(0, space)), run: parseRun(rest.slice(space + 1)) });
		} else if (phase === "d") {
			const a = parseAnchor(rest);
			out.type.push({ kind: "deleted", text: a.text, run: parseRun(a.after) });
		} else if (phase === "t" || phase === "p") {
			const a = parseAnchor(rest);
			const [head, tail] = a.text.includes("…") ? (a.text.split("…") as [string, string]) : [a.text, ""];
			const start = occurrence(message, head, a.nth);
			if (start < 0) throw new Error(`the message does not hold ${JSON.stringify(head)}`);
			const end = tail ? message.indexOf(tail, start + head.length) + tail.length : start + head.length;
			if (phase === "t") out.type.push({ kind: "during", range: [start, end], run: parseRun(a.after) });
			else {
				const space = a.after.indexOf(" ");
				out.type.push({ kind: "pause", range: [end, end], pause: Number(a.after.slice(0, space)), run: parseRun(a.after.slice(space + 1)) });
			}
		} else throw new Error(`not a line: ${row}`);
	}
	return out;
}

/** A timeline with its typing anchors resolved to ranges of the message. */
export interface Resolved {
	read: { at: number; run: Step[] }[];
	type: ({ kind: "during"; range: [number, number]; run: Step[] } | { kind: "pause"; range: [number, number]; pause: number; run: Step[] } | { kind: "deleted"; text: string; run: Step[] })[];
}
export function resolved(timeline: Timeline, message: string): Resolved {
	const where = ranges(timeline, message);
	return {
		read: (timeline.read?.events ?? []).map(({ at, run }) => ({ at, run })),
		type: (timeline.type ?? []).map((entry, i) =>
			entry.kind === "deleted" ? { kind: "deleted", text: entry.text, run: entry.run } : entry.kind === "during" ? { kind: "during", range: where[i]!, run: entry.run } : { kind: "pause", range: where[i]!, pause: entry.pause, run: entry.run },
		),
	};
}

/** A small seeded generator (mulberry32), so a noisy timeline is the same on every run. */
function random(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** What a face does when it means nothing: brief, weak, and mostly blinks. */
const JITTER: Unit[][] = [[[45, "B"]], [[45, "B"]], [[4, "A"]], [[1, "A"], [2, "A"]], [[12, "A"]], [[24, "B"]], [[51, "B"]], [[52, "A"]], [[7, "A"]], [[54, "B"]]];

/**
 * `timeline` as a real detector might report it: each true step is missed with probability
 * `miss`, and `extra` brief weak movements are added, in the reading window when there is one
 * and over random words of the message.
 */
export function noisy(timeline: Timeline, message: string, seed: number, { miss = 0.15, extra = 5 } = {}): Timeline {
	const rand = random(seed);
	const keep = (run: Step[]) => run.filter(() => rand() >= miss);
	const jitter = (): Step[] => [{ units: JITTER[Math.floor(rand() * JITTER.length)]!, dur: Math.round((0.2 + rand() * 0.3) * 10) / 10 }];
	const out: Timeline = {};
	if (timeline.read) {
		const events = timeline.read.events.map((e) => ({ at: e.at, run: keep(e.run) })).filter((e) => e.run.length > 0);
		const window = timeline.read.window;
		for (let i = 0; i < Math.ceil(extra / 2); i++) events.push({ at: Math.round(rand() * (window - 0.5) * 10) / 10, run: jitter() });
		out.read = { window, events: events.sort((a, b) => a.at - b.at) };
	}
	if (timeline.type || message) {
		const kept = (timeline.type ?? []).map((entry) => ({ ...entry, run: keep(entry.run) })).filter((entry) => entry.run.length > 0) as Typing[];
		const spans = [...message.matchAll(/\S+/g)].filter((m) => m[0].length > 3 && count(message, m[0]) === 1 && !kept.some((entry) => entry.kind !== "deleted" && (entry.kind === "during" ? entry.text : entry.after).includes(m[0])));
		const added: Typing[] = [];
		for (let i = 0; i < extra && spans.length > 0; i++) added.push({ kind: "during", text: spans.splice(Math.floor(rand() * spans.length), 1)[0]![0], run: jitter() });
		const all = [...kept, ...added];
		const where = ranges({ type: all }, message);
		// Deleted text has no place in the message: it stays where the timeline had it, first.
		out.type = all.map((entry, i) => ({ entry, at: where[i]?.[0] ?? -1 })).sort((a, b) => a.at - b.at).map((x) => x.entry);
	}
	return out;
}
