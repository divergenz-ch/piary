// The colours a chart's series take, read from the `--chart-*` tokens: one
// order for an a2ui Chart (src/components/views/a2ui-chart.ts) and for a
// cell's `Plot.plot` (src/notebook/engine.ts), so the two agree.

/** The tokens run light to dark; in this order neighbouring series differ most in lightness. */
const PALETTE_ORDER = [3, 1, 5, 2, 4];

/**
 * The palette as `root` sees the tokens, each already a colour: Plot writes a
 * colour into an SVG attribute, where a `var()` does not resolve.
 */
export function chartPalette(root: Element): string[] {
	const style = getComputedStyle(root);
	return PALETTE_ORDER.map((n) => style.getPropertyValue(`--chart-${n}`).trim()).filter(Boolean);
}
