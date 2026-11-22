// A person at a prompt, for the key-log tests: types, waits, removes and pastes on a clock of
// its own, and leaves the edits the canvas would have reported (`prompt-edit`).
import type { KeyLog, PromptEdit } from "../../dist/document/keystrokes.js";

export class Typist {
	readonly edits: PromptEdit[] = [];
	readonly base: string;
	text: string;
	caret: number;
	/** The clock, in milliseconds. */
	now: number;

	constructor(base = "", now = 1000) {
		this.base = this.text = base;
		this.caret = base.length;
		this.now = now;
	}

	get log(): KeyLog {
		return { base: this.base, edits: this.edits };
	}

	#edit(from: number, deleted: string, inserted: string, origin: PromptEdit["origin"]): void {
		this.edits.push({ at: this.now, from, deleted, inserted, origin });
		this.text = this.text.slice(0, from) + inserted + this.text.slice(from + deleted.length);
		this.caret = from + inserted.length;
	}

	/** Types `text` so that its keys span `over` milliseconds; the clock ends on the last key. */
	type(text: string, over = text.length * 100): this {
		const step = text.length > 1 ? over / (text.length - 1) : 0;
		const start = this.now;
		[...Array(text.length)].forEach((_, i) => {
			this.now = start + i * step;
			this.#edit(this.caret, "", text[i]!, "type");
		});
		return this;
	}

	wait(ms: number): this {
		this.now += ms;
		return this;
	}

	/** Removes the `n` characters before the caret, a key each. */
	backspace(n: number, each = 50): this {
		for (let i = 0; i < n; i++) {
			this.now += each;
			this.#edit(this.caret - 1, this.text[this.caret - 1]!, "", "delete");
		}
		return this;
	}

	paste(text: string): this {
		this.#edit(this.caret, "", text, "paste");
		return this;
	}

	moveTo(caret: number): this {
		this.caret = caret;
		return this;
	}
}
