// The rule for telling pi a cell it wrote has failed (`docs/notebook-cells.md`
// §Policy): one line per failure, steered while the turn still runs, so the
// agent sees its own mistake and fixes it in the same turn.
//
// Pure — no DOM, no IPC — so the suite runs it from source. `Turn` decides
// when a run is live and sends the steer; this decides what, if anything, it
// says.

import type { CellFailure } from "../src/components/DocumentChat.ts";
import type { HostFragment } from "./canvas-events.ts";
import type { AppContext } from "./context.ts";

/** Reports one run may send. A turn that keeps breaking its cells is told a
 *  few times and then left to the red rail, rather than steered on every
 *  sweep of a page that is failing everywhere. */
const MAX_REPORTS_PER_RUN = 3;

export class CellReports {
	/** What was reported this run, by the canvas's stable key: the same failure
	 *  re-swept, or re-worded by a later line number, is not news. */
	readonly #reported = new Set<string>();
	#count = 0;

	/** A fresh prompt: a fresh budget, and nothing remembered. One window holds
	 *  one session, so there is nothing to keep per session. */
	reset(): void {
		this.#reported.clear();
		this.#count = 0;
	}

	/** `key` reached the agent another way — as the `cell` tool's verdict — so
	 *  a sweep finding it is not news. Spends none of the budget. */
	told(key: string): void {
		this.#reported.add(key);
	}

	/** The steer to send for `detail`, or `null` when it was already reported
	 *  or the run's budget is spent. */
	report(detail: CellFailure): string | null {
		const key = detail.key ?? `${detail.id}|${detail.error}`;
		if (this.#reported.has(key) || this.#count >= MAX_REPORTS_PER_RUN) return null;
		this.#reported.add(key);
		this.#count++;
		return detail.scope ? `[artifact report] ${detail.scope} ${detail.error}` : `[cell report] #${detail.id} failed: ${detail.error}`;
	}
}

/** The canvas's failure report, steered to pi while a turn runs (`notebook-cells.md` §Policy). */
export function cellFailureHandlers({ turn }: Pick<AppContext, "turn">): HostFragment<"cell-failure"> {
	return { "cell-failure": (detail) => turn.reportCellFailure(detail) };
}
