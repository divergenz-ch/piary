// Observable Plot, the one copy every chart in the page draws with: an a2ui
// Chart (src/components/views/a2ui-chart.ts) and a cell's `Plot`
// (src/notebook/engine.ts). It ships in the app, so a chart needs no network
// and draws at the version package.json pins (ADR 0043).

type Plot = typeof import("@observablehq/plot");

let plot: Promise<Plot> | undefined;

/**
 * Plot, loaded on the first chart and once for the page. The import is dynamic
 * so the bundler makes Plot a chunk of its own: a page that draws no chart
 * never loads it, and importing this module in plain node costs nothing.
 */
export function loadPlot(): Promise<Plot> {
	// A failed load is not kept: the next chart tries again.
	plot ??= import("@observablehq/plot").catch((error: unknown) => {
		plot = undefined;
		throw error;
	});
	return plot;
}
