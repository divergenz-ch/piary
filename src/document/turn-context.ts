// What a send adds to the user's message for pi alone: the line that says when
// it is (ADR 0028), and before it the block that says what the user's face did
// (`face-format.md`, ADR 0055).
//
// pi's own prompt names the working directory but not the date, so without
// the line a question about today is answered from the model's training data.
// Both ride on the user message, after any `[attached: …]` lines, the time
// line last, and neither is document content: `serializeUser` drops them when
// a transcript is written back as a document (`document-format.md`
// §Serialization rules).

import { FACE_HEADER, isFaceLine } from "./face.ts";

/** The whole line, and nothing else on it. */
const NOW_LINE = /^\[now: [^\]\n]*\]$/;

/** Whether `line` is a `[now: …]` line. */
export function isNowLine(line: string): boolean {
	return NOW_LINE.test(line);
}

/** `[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]`: the wall clock
 *  in `timeZone` at `at`. Built from parts rather than a locale's string, so
 *  the runner's locale cannot change it, and the offset is computed from those
 *  parts rather than read from the engine's `longOffset` name, which an older
 *  engine may not give. */
export function nowLine(at: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "long",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(at);
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
	const [year, month, day, hour, minute] = (["year", "month", "day", "hour", "minute"] as const).map((type) => Number(part(type)));
	// The zone's wall clock read as if it were UTC, less the instant itself, is
	// the zone's offset at that instant — to the minute, which every zone is.
	const wall = Date.UTC(year!, month! - 1, day!, hour!, minute!);
	const offset = Math.round((wall - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
	const sign = offset < 0 ? "-" : "+";
	const pad = (n: number) => String(n).padStart(2, "0");
	const utc = `UTC${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
	return `[now: ${part("weekday")} ${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}, ${timeZone} (${utc})]`;
}

/** `message` with `line` after it. A user message pi is handed takes it: the
 *  prompt today, and steering and follow-up when the app sends them. */
export function withNow(message: string, line: string): string {
	return `${message}\n${line}`;
}

/** `message` with the face block after it, a blank line between; `message`
 *  itself when there is no block. */
export function withFace(message: string, block: string): string {
	return block ? `${message}\n\n${block}` : message;
}

/** `text` without the `[now: …]` lines at its end — every one, so text a
 *  rebuild wrote back and text a send stamped again read alike
 *  (`document-format.md` §Serialization rules). */
export function withoutNow(text: string): string {
	let rest = text;
	for (;;) {
		const cut = rest.lastIndexOf("\n");
		if (!isNowLine(rest.slice(cut + 1))) return rest;
		rest = rest.slice(0, Math.max(cut, 0)).trimEnd();
	}
}

/** Where a face block at the end of `rest` begins, as a line index, or -1 with none there.
 *  A block is the `[face]` line after a blank line (or first), with nothing under it but
 *  lines the block's own wording writes, and at least one. */
function faceHeader(lines: readonly string[]): number {
	let header = lines.length - 1;
	while (header >= 0 && isFaceLine(lines[header]!)) header--;
	if (header === lines.length - 1 || header < 0 || lines[header] !== FACE_HEADER) return -1;
	return header > 0 && lines[header - 1] !== "" ? -1 : header;
}

/**
 * `text` without what a send added at its end: the `[now: …]` lines, and
 * before them a face block. This is the text the user wrote.
 *
 * A `[face]` the user typed above prose of their own is theirs and stays.
 */
export function withoutAppTail(text: string): string {
	const rest = withoutNow(text);
	const lines = rest.split("\n");
	const header = faceHeader(lines);
	return header < 0 ? rest : lines.slice(0, header).join("\n").trimEnd();
}

/** What stands for a message that was only a face block once a history has been rewritten
 *  from the document, which never held the block: pi is told a face moved and that what it
 *  did is not kept (`document-format.md` §An unasked reply). */
export const FACE_UNKEPT = `${FACE_HEADER}\n(what the face did is not kept)`;

/** Whether `text` is a message the user wrote no word of: a face block and nothing else, as
 *  the app sends for an unasked reply, or what stands for one after a rewrite. */
export function isFaceOnly(text: string): boolean {
	const rest = withoutNow(text).trim();
	return rest === FACE_UNKEPT || (rest !== "" && withoutAppTail(rest) === "" && faceBlockOf(rest) !== "");
}

/** What an agent answers a face-only message with when it has nothing to say: never drawn. */
export const SILENT = "[silent]";

/** Whether `said` is an agent choosing to say nothing: no words, the word for it as the
 *  guidance gives it, or the ways a model was seen to write that (in quotes or code marks,
 *  with a full stop, as `∅`). Anything else is something it said. */
export function isSilent(said: string): boolean {
	const bare = said.trim().replace(/^[`"'“”]+|[`"'“”.]+$/g, "").trim();
	return bare === "" || bare === "∅" || bare.toLowerCase() === SILENT;
}

/** The face block a send ended `text` with, header and all: exactly what
 *  `withoutAppTail` takes away as one. The empty string when it carries none. */
export function faceBlockOf(text: string): string {
	const lines = withoutNow(text).split("\n");
	const header = faceHeader(lines);
	return header < 0 ? "" : lines.slice(header).join("\n");
}
