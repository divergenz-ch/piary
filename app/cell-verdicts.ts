// The `cell` tool's question — how did the cell I wrote run? — and the page's
// answer (`docs/notebook-cells.md` §Policy). The tool asks with an `input`
// dialog titled `VERDICT_REQUEST`; the canvas judges the cell; this decides
// what the answer says, and stops a cell that keeps failing.
//
// Pure — no DOM, no IPC — so the suite runs it from source. `Turn` hears the
// request, asks the canvas, and sends the answer.

import type { CellVerdict } from "../src/components/DocumentChat.ts";

/** The dialog title the `cell` tool asks under (`pi-extension/cell.ts` holds
 *  the same string). */
export const VERDICT_REQUEST = "piary:cell-verdict";

/** How long a cell may stay pending before it is answered as still running:
 *  long enough for a chart or a small fetch, short enough that a turn does not
 *  stall on a cell that waits forever. The tool waits 15 s for the answer. */
export const CELL_VERDICT_MS = 10_000;

/** Failed writes of one cell a run may make before the tool tells the agent to
 *  stop and tell the user. A deterministic bound, the app's and not the
 *  agent's: three is enough to fix a typo and a wrong API, and a fourth guess
 *  at the same error is a loop. A write that left a chart with no data counts
 *  as one. */
export const MAX_FIXES_PER_CELL = 3;

/** The answer as the tool reads it (`pi-extension/verdict-text.ts`). */
export type WireVerdict =
	| { verdict: "ok" | "running" }
	| { verdict: "waiting"; name: string }
	| { verdict: "empty"; cell: string; names: string[]; attempt: number; limit: number }
	| { verdict: "failed" | "give-up"; error: string; attempt: number; limit: number };

/** A chart with no data, in the words the chip and a `give-up` use: the empty
 *  values by name when a cell declares them. */
export function noData(names: readonly string[]): string {
	const [first, ...rest] = names;
	if (first === undefined) return "the chart has no data";
	return rest.length ? `${names.join(", ")} have no rows` : `${first} has no rows`;
}

/** The cell a verdict request is about, or null for a request that is not one. */
export function requestedCell(event: Record<string, unknown>): { requestId: string; cellId: string } | null {
	if (event["method"] !== "input" || event["title"] !== VERDICT_REQUEST) return null;
	const requestId = event["id"];
	if (typeof requestId !== "string") return null;
	try {
		const { id } = JSON.parse(String(event["placeholder"] ?? "")) as { id?: unknown };
		return typeof id === "string" && id ? { requestId, cellId: id } : null;
	} catch {
		return null;
	}
}

/** One run's count of failed writes, per cell. */
export class CellVerdicts {
	readonly #failures = new Map<string, number>();

	/** A fresh prompt: every cell starts with its whole allowance again. */
	reset(): void {
		this.#failures.clear();
	}

	/** What to tell the agent about cell `id`, judged `verdict`. */
	answer(id: string, verdict: CellVerdict): WireVerdict {
		if (verdict.verdict !== "failed" && verdict.verdict !== "empty") return verdict;
		const attempt = (this.#failures.get(id) ?? 0) + 1;
		this.#failures.set(id, attempt);
		const bound = { attempt, limit: MAX_FIXES_PER_CELL };
		if (verdict.verdict === "empty") {
			if (attempt < MAX_FIXES_PER_CELL) return { ...verdict, ...bound };
			return { verdict: "give-up", error: `the chart in cell #${verdict.cell} shows no data (${noData(verdict.names)})`, ...bound };
		}
		return { verdict: attempt >= MAX_FIXES_PER_CELL ? "give-up" : "failed", error: verdict.error, ...bound };
	}
}
