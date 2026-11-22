// Whether a chart a cell draws has anything to show: the marks that carry the
// chart's data, read off `Plot.plot` options before Plot draws them
// (`docs/notebook-cells.md` §Policy, the `empty` verdict). Pure.

/** A Plot mark as far as this reads it: what it draws and the rows it was given. */
interface DataMark {
	ariaLabel?: unknown;
	data?: unknown;
}

/** Marks that annotate a chart instead of showing its data, by the first word
 *  of Plot's own `ariaLabel` (the one name of a mark's kind a minified build
 *  keeps): a limit line or a caption is still there when the data is not. An
 *  axis or a grid is labelled `x-axis tick`, `y-grid`. */
const ANNOTATION = /^(rule|frame|text|tip|crosshair)\b|(^|-)(axis|grid)\b/;

/** The rows a mark was given, or null when it was given none to count (a mark
 *  over literal channels, an iterable). */
function rows(data: unknown): number | null {
	if (data == null || typeof data !== "object") return null;
	const { length, numRows } = data as { length?: unknown; numRows?: unknown };
	if (typeof length === "number") return length;
	return typeof numRows === "number" ? numRows : null;
}

/**
 * The empty data a chart was drawn from, when it shows none at all: every mark
 * that carries data was given zero rows. Null for a chart with data, and for
 * one with nothing but annotations.
 *
 * One mark over an empty set beside marks with rows is an answer (no lot
 * failed), so it is not flagged: only a chart with no data anywhere is.
 */
export function emptyPlotData(options: { marks?: readonly unknown[] }): unknown[] | null {
	const marks = ((options.marks ?? []) as unknown[])
		.flat(Infinity)
		.filter((m): m is DataMark => typeof m === "object" && m !== null && typeof (m as DataMark).ariaLabel === "string")
		.filter((m) => !ANNOTATION.test(m.ariaLabel as string));
	if (!marks.length || marks.some((m) => rows(m.data) !== 0)) return null;
	return [...new Set(marks.map((m) => m.data))];
}
