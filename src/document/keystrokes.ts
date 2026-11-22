// When each part of a prompt was typed, from the edits the canvas reports
// (`prompt-edit`, `src/canvas/events.ts`).
//
// A face is tied to words, not to a clock (`face-format.md`), so what the app
// needs of the keyboard is which text of the final message was typed when,
// where typing stopped for a while, and what was typed and then removed. The
// edits of one prompt are replayed over the text it had when the log began;
// only text typed key by key has a time. Pure: edits in, numbers out.

/** Typing that stops for longer than this is a pause. */
export const PAUSE_MIN_S = 2.0;
/** Typing that stops for longer than this is the user gone, not a pause. */
export const AWAY_S = 60;
/** More characters than this arriving in one edit were not a key: dictation, a
 *  completion taken, a text replacement. They are text with no time. */
const KEY_MAX_CHARS = 4;
/** Text typed and removed is remembered from this many words up. */
const DELETED_MIN_WORDS = 2;

/** How an edit was made: typed key by key, pasted or dropped, removed with a
 *  key, undone or redone, composed by an input method, or anything else. */
export type EditOrigin = "type" | "paste" | "delete" | "undo" | "compose" | "other";

/** The origin of an edit CodeMirror tagged with `userEvent`. An untagged one is
 *  a program's. A bare `input` is a key CodeMirror handled itself, like Enter. */
export function originOf(userEvent: string | undefined): EditOrigin {
	if (!userEvent) return "other";
	if (userEvent.startsWith("input.type.compose")) return "compose";
	if (userEvent === "input" || userEvent.startsWith("input.type")) return "type";
	if (userEvent.startsWith("input.paste") || userEvent.startsWith("input.drop")) return "paste";
	if (userEvent.startsWith("delete")) return "delete";
	if (userEvent.startsWith("undo") || userEvent.startsWith("redo")) return "undo";
	return "other";
}

/** One change to a prompt's body: at `from`, `deleted` went and `inserted`
 *  came. `at` is the page's clock in milliseconds. */
export interface PromptEdit {
	at: number;
	from: number;
	deleted: string;
	inserted: string;
	origin: EditOrigin;
}

/** The edits of one prompt, over the body it had before the first of them. */
export interface KeyLog {
	base: string;
	edits: PromptEdit[];
}

/** What a log says of the text it ends with. Offsets are into `text`; clocks
 *  are the edits' own. */
export interface Keys {
	/** The body after every edit. */
	text: string;
	/** When each character of `text` was typed, or `null` for one that was
	 *  there before the log, pasted, composed or brought back by undo. */
	typed: (number | null)[];
	/** Typing stopped from `from` to `to` with the caret at `offset`. */
	pauses: { offset: number; from: number; to: number }[];
	/** `text` was typed between `from` and `to` and then removed, at `offset`. */
	deleted: { text: string; offset: number; from: number; to: number }[];
}

interface Char {
	c: string;
	at: number | null;
}
/** A stretch being removed key by key: its characters in text order, and the
 *  character it followed. */
interface Removal {
	start: number;
	chars: Char[];
	after: Char | null;
}

/**
 * `log` replayed. `null` when an edit does not fit the text before it: a log
 * that missed a change says nothing true, and its prompt is sent without one.
 */
export function keysOf(log: KeyLog): Keys | null {
	const chars: Char[] = Array.from({ length: log.base.length }, (_, i) => ({ c: log.base[i]!, at: null }));
	const pauses: { after: Char | null; from: number; to: number }[] = [];
	const removals: Removal[] = [];
	let removing: Removal | null = null;
	let lastKey: { at: number; after: Char | null } | null = null;

	for (const edit of log.edits) {
		if (edit.from < 0 || edit.from > chars.length || chars.slice(edit.from, edit.from + edit.deleted.length).map((x) => x.c).join("") !== edit.deleted) return null;
		const keyed = edit.origin === "type" || edit.origin === "delete";
		if (keyed && lastKey) {
			const gap = edit.at - lastKey.at;
			if (gap > PAUSE_MIN_S * 1000 && gap <= AWAY_S * 1000) pauses.push({ after: lastKey.after, from: lastKey.at, to: edit.at });
		}
		const inserted: Char[] = Array.from({ length: edit.inserted.length }, (_, i) => ({ c: edit.inserted[i]!, at: edit.origin === "type" && edit.inserted.length <= KEY_MAX_CHARS ? edit.at : null }));
		const removed = chars.splice(edit.from, edit.deleted.length, ...inserted);
		// Backspace walks left and Delete eats rightwards: either way the next
		// removal touches the stretch already gone, and the two are one deletion.
		const continues = removing && keyed && removed.length > 0 && inserted.length === 0 && (edit.from + removed.length === removing.start || edit.from === removing.start);
		if (continues && removing) {
			if (edit.from === removing.start) removing.chars.push(...removed);
			else removing.chars.unshift(...removed);
			removing.start = edit.from;
			removing.after = chars[edit.from - 1] ?? null;
		} else {
			removing = keyed && removed.length > 0 ? { start: edit.from, chars: removed, after: chars[edit.from - 1] ?? null } : null;
			if (removing) removals.push(removing);
			// Typing over a selection removes it in the same edit, and ends there.
			if (inserted.length > 0) removing = null;
		}
		if (keyed) lastKey = { at: edit.at, after: chars[edit.from + inserted.length - 1] ?? null };
	}

	const index = new Map(chars.map((char, i) => [char, i]));
	// Where something that followed `after` is now: just past it, the start for
	// what followed nothing, and nowhere once that character is gone too.
	const offsetOf = (after: Char | null) => (after === null ? 0 : index.has(after) ? index.get(after)! + 1 : -1);
	const final = chars.map((x) => x.c).join("");
	const deleted: Keys["deleted"] = [];
	for (const removal of removals) {
		const text = removal.chars.map((x) => x.c).join("").trim();
		const times = removal.chars.map((x) => x.at);
		if (times.some((at) => at === null) || text.split(/\s+/).length < DELETED_MIN_WORDS) continue;
		// Words the message still holds were moved or typed again, not taken
		// back: saying they were removed would be false.
		if (final.includes(text)) continue;
		deleted.push({ text, offset: offsetOf(removal.after), from: Math.min(...(times as number[])), to: Math.max(...(times as number[])) });
	}
	return {
		text: final,
		typed: chars.map((x) => x.at),
		pauses: pauses.map((pause) => ({ offset: offsetOf(pause.after), from: pause.from, to: pause.to })).filter((pause) => pause.offset >= 0),
		deleted,
	};
}
