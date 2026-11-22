// What the `cell` tool tells the agent once the page has run its cell
// (`docs/notebook-cells.md` §Policy). Pure, so the suite runs it from source;
// `cell.ts` asks the page and hands the answer here.

/** The page's answer to a verdict request, as it arrives over the wire. */
export interface CellVerdict {
	verdict: "ok" | "empty" | "failed" | "give-up" | "blank" | "waiting" | "running";
	error?: string;
	/** For `empty`: the cell showing the chart with no data, and the declared
	 *  names of the empty values it was drawn from. */
	cell?: string;
	names?: string[];
	/** For `waiting`: the name no cell declares yet. */
	name?: string;
	/** For `empty`, `failed` and `give-up`: which failed write of this cell this was. */
	attempt?: number;
	/** For `empty`, `failed` and `give-up`: how many the page allows per cell in a run. */
	limit?: number;
}

/** The tool's text, and whether pi is to read it as a failed call. */
export interface VerdictText {
	text: string;
	failed: boolean;
}

/** The answer when no page answered: a terminal pi, a page that went away, or
 *  a bound that ran out. Written, not run — and said so. */
export const UNVERIFIED = " (not verified: the cell has not been seen running)";

/** The page's answer `raw` as a JSON string, read defensively: anything that
 *  is not a verdict is no answer at all. */
export function parseVerdict(raw: string | undefined): CellVerdict | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<CellVerdict> | null;
		const known = ["ok", "empty", "failed", "give-up", "blank", "waiting", "running"];
		return value && typeof value.verdict === "string" && known.includes(value.verdict) ? (value as CellVerdict) : null;
	} catch {
		return null;
	}
}

/** What the agent reads for cell `id`. `written` is what the tool says when it
 *  cannot verify — the id, and the write-time note if there is one. */
export function verdictText(id: string, verdict: CellVerdict | null, written: string): VerdictText {
	if (!verdict) return { text: `${written}${UNVERIFIED}`, failed: false };
	const error = verdict.error ?? "no message";
	const of = verdict.attempt && verdict.limit ? ` (attempt ${verdict.attempt} of ${verdict.limit})` : "";
	switch (verdict.verdict) {
		case "ok":
			return { text: `ok — cell #${id} ran.`, failed: false };
		case "empty": {
			const names = (verdict.names ?? []).map((name) => `\`${name}\``);
			const where = verdict.cell && verdict.cell !== id ? `the chart in cell #${verdict.cell}` : "its chart";
			const what = names.length ? `: ${names.join(", ")} ${names.length > 1 ? "have" : "has"} no rows` : "";
			return {
				text:
					`cell #${id} ran, but ${where} shows no data${of}${what}. Find why it is empty (a filter that matches nothing, ` +
					"a date compared with a string) and redefine the cell that computes it. If no data is the true answer, " +
					"tell the user so plainly.",
				failed: true,
			};
		}
		case "failed":
			return { text: `cell #${id} failed${of}: ${error}. Redefine #${id} (pass id "${id}") to fix it.`, failed: true };
		case "give-up":
			return {
				text:
					`cell #${id} failed again${of}: ${error}. Stop rewriting it: tell the user what is wrong, ` +
					"what you tried, and what you need from them.",
				failed: true,
			};
		case "blank":
			return {
				text:
					`cell #${id} ran, but its artifact displays nothing — every cell in it is a declaration. ` +
					"Add a bare-expression cell that returns the node to show, or call display().",
				failed: true,
			};
		case "waiting":
			return {
				text: `ok — cell #${id} is written and waiting on \`${verdict.name ?? "?"}\`, which no cell defines yet. Define it next, or this cell fails.`,
				failed: false,
			};
		case "running":
			return { text: `ok — cell #${id} is still running; not verified yet.`, failed: false };
	}
}
