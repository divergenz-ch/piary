// The key log of each prompt being written in this window (ADR 0055).
//
// The canvas reports every change to a prompt's body (`prompt-edit`); this
// keeps them per prompt, over the body the prompt had before the first one, so
// a send can ask when its words were typed. A prompt is known by how many
// prompts stand above it, which a block added or removed above changes: so a
// log is trusted only if replaying it gives the very body being sent, and one
// that does not is dropped. The cost of a miss is a message with no face
// block, never one with a wrong one.

import type { DocSegment } from "../../src/document/format.ts";
import { type KeyLog, type Keys, keysOf, type PromptEdit } from "../../src/document/keystrokes.ts";

/** A prompt as a send names it: how many prompts stand above it, which is how
 *  the canvas names it too, and its body as the document holds it. */
export interface SentPrompt {
	ordinal: number;
	body: string;
}

/** The prompt at `index` of `segments`, parsed from `md`; one that is not
 *  there has no body and an ordinal no log is kept under. */
export function sentPrompt(md: string, segments: readonly DocSegment[], index: number): SentPrompt {
	const segment = segments[index];
	if (segment?.kind !== "user") return { ordinal: -1, body: "" };
	return { ordinal: segments.slice(0, index).filter((s) => s.kind === "user").length, body: md.slice(segment.bodyFrom, segment.to) };
}

/** A log longer than this is a draft worked on for hours; it starts over. */
const MAX_LOG_EDITS = 20_000;

/** `body` as it was before `edits`, or `null` when they do not lead to it. */
function before(body: string, edits: readonly PromptEdit[]): string | null {
	let text = body;
	for (const edit of [...edits].reverse()) {
		if (text.slice(edit.from, edit.from + edit.inserted.length) !== edit.inserted) return null;
		text = text.slice(0, edit.from) + edit.deleted + text.slice(edit.from + edit.inserted.length);
	}
	return text;
}

export class PromptLogs {
	readonly #logs = new Map<number, KeyLog>();

	/** Takes `edits` made to prompt `prompt`. `body` is asked for the prompt's
	 *  body as it now stands, only when a log begins. */
	take(prompt: number, edits: readonly PromptEdit[], body: () => string | null): void {
		const log = this.#logs.get(prompt);
		if (log && log.edits.length + edits.length <= MAX_LOG_EDITS) {
			log.edits.push(...edits);
			return;
		}
		this.#logs.delete(prompt);
		const now = body();
		const base = now === null ? null : before(now, edits);
		if (base !== null) this.#logs.set(prompt, { base, edits: [...edits] });
	}

	/** When the words of prompt `prompt` were typed, if its log leads to
	 *  `body`; a log that does not is dropped. Space at the end is not compared:
	 *  a turn opening under a prompt moves the blank lines below it, which is
	 *  the machine's edit and never reported. */
	keys(prompt: number, body: string): Keys | null {
		const keys = this.peek(prompt, body);
		if (!keys) this.#logs.delete(prompt);
		return keys;
	}

	/** `keys`, for a look at a draft: a log that does not lead to `body` is
	 *  kept, since a draft's body may be asked about between two edits. */
	peek(prompt: number, body: string): Keys | null {
		const log = this.#logs.get(prompt);
		const keys = log ? keysOf(log) : null;
		return keys?.text.trimEnd() === body.trimEnd() ? keys : null;
	}

	forget(prompt: number): void {
		this.#logs.delete(prompt);
	}

	clear(): void {
		this.#logs.clear();
	}
}

/** What a send asks of the face (`app/face/index.ts`). Named here, apart from
 *  the module that answers it, so a send's code and what reads it without a
 *  page do not take in the pill and its stylesheet. */
export interface FaceBlocks {
	/** The block to end `message` with, for the prompt it was written in; the
	 *  empty string when there is nothing to say. */
	blockFor(message: string, prompt: SentPrompt): string;
	/** pi took the message the last block was asked for. */
	taken(): void;
}
