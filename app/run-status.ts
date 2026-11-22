// What a run is doing right now, in one short line: the badge beside the
// status line. Derived only from pi's events and the page's own verdicts and
// limits, so it says what happened, never what a model claims (ADR 0031).
//
// Pure — the clock is passed in — so the suite runs it from source. `Turn`
// feeds it and shows its label.

import { shortCellId } from "../src/document/format.ts";
import { MAX_FIXES_PER_CELL, noData, type WireVerdict } from "./cell-verdicts.ts";

/** What one cell is doing, for the chip at the top of its artifact. Blue for
 *  as long as the run is working on it — a failed attempt it goes on to fix
 *  included — and only once the run is over green, amber when it ran and a
 *  chart it feeds has no data, or red when the cell's last word was a failure. */
export interface CellActivity {
	id: string;
	text: string;
	tone: "working" | "done" | "warning" | "error";
}

/** One run's state, as the badge reads it. */
export class RunStatus {
	#doing = "";
	#started = 0;
	#budgetMs = 0;
	#ended: number | null = null;
	/** Messages pi holds for this run, steers and follow-ups, as its last
	 *  `queue_update` counted them. */
	#queued = 0;
	/** Failed writes so far, per cell, as the verdicts counted them. */
	readonly #failures = new Map<string, number>();
	/** The cell the run touched last, and what it is doing. */
	#cell: CellActivity | null = null;
	/** Whether that cell's last verdict was a failure, which is what decides
	 *  the colour it ends in. */
	#cellFailed = false;
	/** Charts the run left with no data, by the cell showing each, and the
	 *  empty values each was drawn from. One stays until a later check that
	 *  covers its cell finds data, whatever cell the run touches meanwhile. */
	readonly #empty = new Map<string, string[]>();

	/** A run begins at `now`, under a soft limit of `budgetMs`. */
	start(now: number, budgetMs: number): void {
		this.#doing = "thinking";
		this.#started = now;
		this.#budgetMs = budgetMs;
		this.#ended = null;
		this.#queued = 0;
		this.#failures.clear();
		this.#cell = null;
		this.#cellFailed = false;
		this.#empty.clear();
	}

	/** The soft limit changed: pi gave its estimate. */
	budget(ms: number): void {
		this.#budgetMs = ms;
	}

	/** One of pi's events. */
	event(event: Record<string, unknown>): void {
		if (this.#ended !== null) return;
		switch (event["type"]) {
			case "message_update": {
				const kind = (event["assistantMessageEvent"] as { type?: string } | undefined)?.type ?? "";
				if (kind.startsWith("thinking")) this.#doing = "thinking";
				else if (kind.startsWith("text") || kind.startsWith("toolcall")) this.#doing = "writing";
				break;
			}
			case "tool_execution_start": {
				const tool = typeof event["toolName"] === "string" ? event["toolName"] : "a tool";
				if (tool !== "cell") {
					this.#doing = `running ${tool}`;
					break;
				}
				const id = this.#cellOf(event);
				const failed = this.#failures.get(id) ?? 0;
				this.#doing = "working on a cell";
				this.#cell = { id, tone: "working", text: failed ? `fixing (${failed + 1}/${MAX_FIXES_PER_CELL})` : "writing" };
				this.#cellFailed = false;
				break;
			}
			case "tool_execution_end":
				this.#doing = "thinking";
				break;
		}
	}

	/** pi holds `n` messages for the run, not yet delivered. */
	queued(n: number): void {
		if (this.#ended === null) this.#queued = n;
	}

	/** The page is judging cell `id` for the tool. */
	checking(id: string): void {
		if (this.#ended !== null) return;
		this.#doing = "working on a cell";
		const failed = this.#failures.get(id) ?? 0;
		this.#cell = { id, tone: "working", text: failed ? `checking (${failed + 1}/${MAX_FIXES_PER_CELL})` : "checking" };
	}

	/** The page answered the tool about cell `id`. `readers` are the cells that
	 *  read what it declares: an `ok` vouches for their charts too. */
	verdict(id: string, answer: WireVerdict, readers: readonly string[] = []): void {
		if (this.#ended !== null) return;
		this.#cellFailed = answer.verdict === "failed" || answer.verdict === "give-up";
		switch (answer.verdict) {
			case "ok":
				for (const covered of [id, ...readers]) this.#empty.delete(covered);
				this.#cell = { id, tone: "working", text: "ran" };
				break;
			case "empty":
				this.#failures.set(id, answer.attempt);
				this.#empty.set(answer.cell, answer.names);
				this.#cell = { id, tone: "working", text: `ran · ${EMPTY(answer.names)}` };
				break;
			case "failed":
				this.#failures.set(id, answer.attempt);
				this.#cell = { id, tone: "working", text: `failed (${answer.attempt}/${answer.limit})` };
				break;
			case "give-up":
				this.#failures.set(id, answer.attempt);
				this.#cell = { id, tone: "working", text: `failed ${answer.attempt}× — pi stopped` };
				break;
			case "waiting":
				this.#cell = { id, tone: "working", text: `waiting on ${answer.name}` };
				break;
			case "running":
				this.#cell = { id, tone: "working", text: "still running" };
				break;
		}
	}

	/** The chip for the cell the run touched last, or null. */
	cell(): CellActivity | null {
		return this.#cell;
	}

	/** The soft limit passed and pi was asked to wrap up. */
	wrapping(): void {
		if (this.#ended === null) this.#doing = "wrapping up: budget reached";
	}

	/** The run is over at `now`: done, or stopped and why. */
	end(now: number, stopped: string | null): void {
		this.#doing = stopped ? "stopped" : "done";
		this.#ended = now;
		this.#queued = 0;
		const cell = this.#cell;
		if (!cell) return;
		// The work on the cell is over: its colour says how it ended. A cell
		// never judged (no page to ask) or still pending ended as written.
		// A chart left with no data outlasts a later cell that ran: the chip
		// goes to the cell showing it, amber.
		const [empty] = this.#empty;
		if (this.#cellFailed) this.#cell = { ...cell, tone: "error" };
		else if (empty) this.#cell = { id: empty[0], tone: "warning", text: `ran · ${EMPTY(empty[1])}` };
		else this.#cell = { ...cell, tone: "done", text: cell.text === "ran" ? "ran" : "done" };
	}

	/** The badge's text at `now`: what the run is doing, and how long it has
	 *  taken, and what pi holds queued. Empty before any run. */
	label(now: number): string {
		if (!this.#doing) return "";
		const label = `${this.#doing} · ${clock((this.#ended ?? now) - this.#started)}`;
		return this.#queued > 0 ? `${label} · ${this.#queued} queued` : label;
	}

	/** The run's soft limit, as the chip beside the badge says it. Empty
	 *  before any run. */
	budgetLabel(): string {
		return this.#doing ? `max time: ${clock(this.#budgetMs)}` : "";
	}

	/** The cell a `cell` tool call writes: the id it redefines, or the one the
	 *  document derives from the call (`shortCellId`). */
	#cellOf(event: Record<string, unknown>): string {
		const given = (event["args"] as { id?: unknown } | undefined)?.id;
		if (typeof given === "string" && given) return given;
		return shortCellId(String(event["toolCallId"] ?? ""));
	}
}

/** The chip's words for a chart with no data. */
const EMPTY = (names: readonly string[]) => `no data: ${noData(names)}`;

/** `ms` as the badge spells a duration: `42s`, `3m`, `1m12s`. */
export function clock(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	if (!minutes) return `${seconds}s`;
	return seconds ? `${minutes}m${seconds}s` : `${minutes}m`;
}
