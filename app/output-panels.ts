// Which running tool's output the page draws as a panel in the answer.
//
// A command the agent runs for its own work is a step of the answer, and its
// output is already under its call (`pi:result`), one click from view. A panel
// is for output the user is meant to SEE: the agent says so by running the
// command through Piary's `terminal` tool rather than pi's `bash`
// (`pi-extension/terminal.ts`). A user's `/terminal` is not this module's: it
// opens its own panel (`app/terminals.ts`).
//
// A command still running after `LONG_RUN_MS` gets a panel too, so a build or a
// server can be watched while it goes. That is a stand-in, drawn as the only
// streaming element the canvas has: a long process wants a surface of its own,
// not a cell-shaped block in the answer.

/** The tool whose output is always drawn: the agent showing a command. */
export const SHOWN_TOOL = "terminal";

/** How long a command runs before its output is drawn anyway — long enough
 *  that a quick `ls` or `cat` never flashes a panel. */
export const LONG_RUN_MS = 3000;

interface Running {
	shown: boolean;
	/** The output so far, whole: what a panel opened late starts with. */
	text: string;
	timer: ReturnType<typeof setTimeout> | undefined;
}

export class OutputPanels {
	readonly #running = new Map<string, Running>();
	readonly #show: (id: string, text: string) => void;

	/** `show` draws a panel for `id` with the output so far, or writes it to the
	 *  one already drawn. */
	constructor(show: (id: string, text: string) => void) {
		this.#show = show;
	}

	/** A tool call started. */
	start(id: string, tool: string): void {
		this.#entry(id, tool);
	}

	/** The output so far, whole. Drawn now if the call's panel is shown. */
	update(id: string, tool: string, text: string): void {
		const run = this.#entry(id, tool);
		run.text = text;
		if (run.shown && text) this.#show(id, text);
	}

	/** The call ended: a panel never drawn stays undrawn. */
	end(id: string): void {
		clearTimeout(this.#running.get(id)?.timer);
		this.#running.delete(id);
	}

	/** The run is over, every call with it. */
	clear(): void {
		for (const id of [...this.#running.keys()]) this.end(id);
	}

	#entry(id: string, tool: string): Running {
		let run = this.#running.get(id);
		if (run) return run;
		run = { shown: tool === SHOWN_TOOL, text: "", timer: undefined };
		if (!run.shown) {
			const late = run;
			late.timer = setTimeout(() => {
				late.shown = true;
				if (late.text) this.#show(id, late.text);
			}, LONG_RUN_MS);
		}
		this.#running.set(id, run);
		return run;
	}
}
