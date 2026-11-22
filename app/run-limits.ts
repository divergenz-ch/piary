// The bounds on one run, and when one has been passed (ADR 0031). The hard
// ones are the app's, never the agent's: a model asked to bound itself is the
// thing being bounded, so they are constants here and the check is code. The
// soft one is the agent's estimate (the `budget` tool), clamped under them —
// the agent proposes, the app enforces.
//
// Pure — the clock is passed in — so the suite runs it from source. `Turn`
// counts, asks, and stops the run.

/** The longest one run may take. A real job — a refactor across files, a
 *  page of cells — fits well inside it; a run past it has stopped making
 *  progress the user can see, and should come back and say so. */
export const RUN_LIMIT_MS = 20 * 60_000;

/** The most tool calls one run may make. A loop calls tools far faster than
 *  a clock catches it; sixty is several times a long, honest run's count. */
export const RUN_TOOL_CALLS = 60;

/** The soft limit when the agent gave no estimate: long enough for a page of
 *  cells or a small change across files, short enough that a run that needed
 *  the user's direction comes back for it. */
export const DEFAULT_BUDGET_MS = 5 * 60_000;

/** The shortest estimate taken: under a minute, the steer would arrive before
 *  the first tool had answered. */
export const MIN_BUDGET_MS = 60_000;

/** The tool the agent estimates with (`pi-extension/budget.ts`). */
export const BUDGET_TOOL = "budget";

/** The agent's estimate in `minutes`, as the soft limit it becomes: clamped
 *  between a minute and the hard time bound, the default when it is not a
 *  number. */
export function budgetMs(minutes: unknown): number {
	if (typeof minutes !== "number" || !Number.isFinite(minutes)) return DEFAULT_BUDGET_MS;
	return Math.min(RUN_LIMIT_MS, Math.max(MIN_BUDGET_MS, minutes * 60_000));
}

/** What pi is steered when its soft limit passes. Visible in the document, as
 *  every steer is (`docs/notebook-cells.md` §Policy). */
export function budgetSteer(ms: number): string {
	const minutes = Math.round((ms / 60_000) * 10) / 10;
	return `[budget] ${minutes} min reached — stop here, report what is done and what is left, and ask the user whether to continue.`;
}

/** What the document says when a run is stopped at a limit. */
export const PAST_TIME = `Stopped: this run reached its ${RUN_LIMIT_MS / 60_000}-minute limit.`;
export const PAST_CALLS = `Stopped: this run reached its limit of ${RUN_TOOL_CALLS} tool calls.`;

/** One run's clock and tool-call count. */
export class RunLimits {
	#started = 0;
	#calls = 0;

	/** A run begins at `now`. */
	start(now: number): void {
		this.#started = now;
		this.#calls = 0;
	}

	/** pi started a tool. */
	toolCall(): void {
		this.#calls++;
	}

	/** Which limit the run has passed at `now`, as the document says it, or null. */
	passed(now: number): string | null {
		if (this.#calls > RUN_TOOL_CALLS) return PAST_CALLS;
		if (now - this.#started >= RUN_LIMIT_MS) return PAST_TIME;
		return null;
	}
}
