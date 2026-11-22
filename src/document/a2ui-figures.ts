// What Piary's A2UI components show, read from their resolved props: a stat
// tile's figure and delta, a table's cells, a decision matrix's verdicts and a
// chart's Plot options. The elements in src/components/views/a2ui-*.ts only
// draw these, so every reading of the data — the order categories come in,
// whether a delta is good news, the margin a six-digit tick needs — lives here,
// where the suite reaches it without a page.

/** A unit written before the number: a currency symbol or code. */
const PREFIX = /^(?:[$€£¥₹₩₺₽₪₱฿]|[A-Z]{1,3}\$|USD|EUR|GBP|CHF|JPY|CAD|AUD|TRY|SEK|NOK|DKK|PLN)$/;
/** A unit that sits against the number rather than a space away. */
const TIGHT = /^(?:%|‰|°.*|×|x)$/;
const NBSP = " ";
const MINUS = "−";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** A number as a reader takes it in: grouped, at most two decimals (three below one). */
function digits(value: number): string {
	const abs = Math.abs(value);
	return abs.toLocaleString(undefined, { maximumFractionDigits: abs > 0 && abs < 1 ? 3 : 2 });
}

/**
 * A figure with its unit: `$480,000`, `91%`, `2.4 h`. A string is shown as
 * written; a number that did not compute shows as missing rather than as NaN.
 */
export function formatFigure(value: unknown, unit?: string, sign = false): string {
	if (typeof value === "string") return value;
	if (typeof value === "boolean") return value ? "Yes" : "No";
	if (typeof value !== "number") return value == null ? "" : String(value);
	if (!Number.isFinite(value)) return "—";
	const lead = value < 0 ? MINUS : sign && value > 0 ? "+" : "";
	const body = digits(value);
	unit = unit?.trim();
	if (!unit) return lead + body;
	// A currency in thousands or millions (`$k`, `€M`) is one figure: `$102k`.
	const scaled = /^(.+?)(k|K|M|B|bn|mn)$/.exec(unit);
	if (scaled && PREFIX.test(scaled[1]!)) return `${lead}${scaled[1]}${body}${scaled[2]}`;
	if (PREFIX.test(unit)) return `${lead}${unit}${/^[A-Z]{3}$/.test(unit) ? NBSP : ""}${body}`;
	return `${lead}${body}${TIGHT.test(unit) ? "" : NBSP}${unit}`;
}

export type Tone = "success" | "destructive" | "muted";
export type Good = "up" | "down";

/** The sign of a delta, numeric or written (`+3 pts`, `▼ 0.7 h`, `-12%`). */
function direction(delta: unknown): number {
	if (typeof delta === "number") return Math.sign(delta);
	if (typeof delta !== "string") return 0;
	const lead = delta.trim()[0];
	if (lead === "+" || lead === "▲" || lead === "↑") return 1;
	if (lead === "-" || lead === MINUS || lead === "▼" || lead === "↓") return -1;
	return 0;
}

export interface StatProps {
	label?: unknown;
	value?: unknown;
	unit?: string;
	delta?: unknown;
	good?: Good;
	note?: unknown;
}

/** A stat tile: its figure, its delta arrowed and signed, and whether that is good news. */
export function statModel(props: StatProps): { label: string; value: string; delta: string; tone: Tone; note: string } {
	const dir = direction(props.delta);
	let delta = "";
	if (typeof props.delta === "number")
		delta = props.delta === 0 ? "0" : `${dir > 0 ? "▲" : "▼"} ${formatFigure(props.delta, props.unit, true)}`;
	else if (typeof props.delta === "string") delta = props.delta;
	const tone: Tone = !props.good || dir === 0 ? "muted" : (dir > 0) === (props.good === "up") ? "success" : "destructive";
	return {
		label: formatFigure(props.label),
		value: formatFigure(props.value, props.unit),
		delta,
		tone,
		note: formatFigure(props.note),
	};
}

export type Align = "start" | "end";

export interface TableColumn {
	key: string;
	label?: string;
	align?: Align;
	unit?: string;
}

/** A column given as its key alone, or in full. */
const column = (c: string | TableColumn): TableColumn => (typeof c === "string" ? { key: c } : c);

/** One cell's raw value: a row is an object by key, or an array by column position. */
const cellValue = (row: unknown, key: string, index: number): unknown =>
	Array.isArray(row) ? row[index] : isRecord(row) ? row[key] : undefined;

/**
 * A table's header and cells. A column whose every value is a number is set at
 * the end, so the digits line up (the stylesheet sets them tabular).
 */
export function tableModel(columns: readonly (string | TableColumn)[] | undefined, rows: unknown): {
	head: { label: string; align: Align }[];
	body: { text: string; align: Align }[][];
} {
	const list = Array.isArray(rows) ? rows : [];
	const first = list[0];
	const cols = (columns?.length ? columns : isRecord(first) ? Object.keys(first) : Array.isArray(first) ? first.map((_, i) => String(i + 1)) : []).map(column);
	const aligns = cols.map((c, i): Align => {
		if (c.align) return c.align;
		const values = list.map((row) => cellValue(row, c.key, i)).filter((v) => v != null && v !== "");
		return values.length > 0 && values.every((v) => typeof v === "number") ? "end" : "start";
	});
	return {
		head: cols.map((c, i) => ({ label: c.label ?? c.key, align: aligns[i]! })),
		body: list.map((row) => cols.map((c, i) => ({ text: formatFigure(cellValue(row, c.key, i), c.unit), align: aligns[i]! }))),
	};
}

export interface Must {
	min?: number;
	max?: number;
	oneOf?: readonly (string | number | boolean)[];
}

export interface Criterion {
	key: string;
	label?: string;
	best?: "min" | "max";
	must?: Must;
	unit?: string;
}

const same = (a: unknown, b: unknown) =>
	typeof a === "string" && typeof b === "string" ? a.trim().toLowerCase() === b.trim().toLowerCase() : a === b;

function passes(value: unknown, must: Must | undefined): boolean {
	if (!must) return true;
	if (must.oneOf && !must.oneOf.some((ok) => same(ok, value))) return false;
	if (must.min !== undefined && !(typeof value === "number" && value >= must.min)) return false;
	if (must.max !== undefined && !(typeof value === "number" && value <= must.max)) return false;
	return true;
}

/**
 * A decision matrix: options across, criteria down. A value failing its
 * criterion's must is struck, an option failing any must is out, and each
 * row's best is marked among the options still standing — the cheapest
 * option that cannot be chosen is not crowned.
 */
export function compareModel(props: { options?: unknown; name?: string; criteria?: readonly Criterion[]; pick?: unknown }): {
	options: { name: string; fails: string[]; pick: boolean }[];
	rows: { label: string; cells: { text: string; best: boolean; fails: boolean }[] }[];
} {
	const nameKey = props.name ?? "name";
	const options = (Array.isArray(props.options) ? props.options : []).filter(isRecord);
	const criteria = props.criteria ?? [];
	const label = (c: Criterion) => c.label ?? c.key;
	const fails = options.map((o) => criteria.filter((c) => !passes(o[c.key], c.must)).map(label));
	const standing = (i: number) => fails[i]!.length === 0;
	return {
		options: options.map((o, i) => ({ name: formatFigure(o[nameKey]), fails: fails[i]!, pick: props.pick != null && same(o[nameKey], props.pick) })),
		rows: criteria.map((c) => {
			const values = options.map((o) => o[c.key]);
			const ranked = values.filter((v, i): v is number => typeof v === "number" && standing(i));
			const best = c.best && ranked.length ? (c.best === "min" ? Math.min(...ranked) : Math.max(...ranked)) : undefined;
			return {
				label: label(c),
				cells: values.map((v, i) => ({
					text: formatFigure(v, c.unit),
					best: best !== undefined && standing(i) && v === best,
					fails: !passes(v, c.must),
				})),
			};
		}),
	};
}

export type ChartMark = "bar" | "barH" | "line" | "area" | "dot";

export interface ChartProps {
	data?: unknown;
	mark?: ChartMark;
	x?: string;
	/** One value key, or several: each then draws as a series named by its key. */
	y?: string | readonly string[];
	series?: string;
	layout?: "stack" | "group";
	yScale?: "linear" | "log";
	/** How series are coloured: distinct hues, or a ramp in their order for ordered ones (a rating, a scale). */
	scheme?: "categorical" | "sequential" | "diverging";
	/** Display names for series values or value keys, by what the rows hold. */
	labels?: Readonly<Record<string, string>>;
	unit?: string;
	xLabel?: string;
	yLabel?: string;
	height?: number;
}

/** A Plot mark, named by its constructor (`Plot.barY`), with its data and options. */
export interface PlannedMark {
	type: "barY" | "barX" | "lineY" | "areaY" | "dot" | "ruleY" | "ruleX";
	data: unknown[];
	options: Record<string, unknown>;
}

export interface ScaleOptions {
	domain?: unknown[];
	nice?: boolean;
	zero?: boolean;
	type?: "log";
	label?: string | null;
	grid?: boolean;
	axis?: null;
	tickFormat?: (value: number) => string;
	[key: string]: unknown;
}

export interface ChartPlan {
	marks: PlannedMark[];
	options: {
		width: number;
		height: number;
		marginLeft: number;
		x?: ScaleOptions;
		y?: ScaleOptions;
		fx?: ScaleOptions;
		fy?: ScaleOptions;
		color?: { domain: unknown[]; range: string[]; legend: boolean };
	};
}

/** Roughly how wide one character of a 12px tick label is. */
const CHAR_PX = 7;
/** Room for the tick itself and the gap to its label. */
const TICK_PX = 14;
const PLOT_MIN_MARGIN = 40;

const unique = (values: unknown[]) => [...new Set(values)];
const isCategorical = (values: unknown[]) => values.some((v) => v != null && typeof v !== "number" && !(v instanceof Date));

/** The colours an ordered scheme ramps between, resolved from the theme's tokens. */
export interface Ramp {
	low: string;
	mid: string;
	high: string;
	light: string;
	dark: string;
}

/**
 * The ends of an ordered scheme, as the theme names them. The positive end is
 * the chart blue at full strength; the negative end is the theme's red taken
 * toward the page, so a diverging chart reads as part of the document rather
 * than as a warning; the neutral is the muted text faded into the page.
 */
export const THEME_RAMP: Ramp = {
	low: "color-mix(in oklab, var(--destructive) 60%, var(--background))",
	mid: "color-mix(in oklab, var(--muted-foreground) 40%, var(--background))",
	high: "var(--chart-3)",
	light: "var(--chart-1)",
	dark: "var(--chart-5)",
};

/** `a` and `b` mixed, `weight` percent of `a`, as CSS the page resolves. */
const mix = (a: string, b: string, weight: number) =>
	weight >= 100 ? a : weight <= 0 ? b : `color-mix(in oklab, ${a} ${Math.round(weight * 100) / 100}%, ${b})`;

/**
 * `count` colours in order along a ramp: diverging runs from `low` through a
 * neutral `mid` to `high`, so an odd count has the neutral at its middle;
 * sequential runs from light to dark.
 */
export function rampColours(count: number, scheme: "sequential" | "diverging", ramp: Ramp): string[] {
	return Array.from({ length: count }, (_, i) => {
		const t = count < 2 ? 1 : i / (count - 1);
		if (scheme === "sequential") return mix(ramp.dark, ramp.light, t * 100);
		return t < 0.5 ? mix(ramp.low, ramp.mid, (0.5 - t) * 200) : mix(ramp.high, ramp.mid, (t - 0.5) * 200);
	});
}

/** `top` raised to a round step: about where a niced axis puts its last tick. */
function roundedUp(top: number): number {
	if (!(top > 0)) return top;
	const step = 10 ** Math.floor(Math.log10(top));
	return Math.ceil(top / step) * step;
}

/**
 * The Plot options that draw `props` at `width`, in `palette`'s colours.
 * Categories keep the order the data gives them (Plot would sort them); one
 * series is drawn in the first colour, several take the palette in order with a
 * legend; the value axis leaves room for its longest tick, unit included.
 */
export function chartPlan(props: ChartProps, env: { width: number; palette: readonly string[]; ramp?: Ramp }): ChartPlan {
	let data = (Array.isArray(props.data) ? props.data : []).filter(isRecord);
	const mark = props.mark ?? "bar";
	const horizontal = mark === "barH";
	let x = props.x ?? "x";
	let y = typeof props.y === "string" ? props.y : "y";
	let seriesKey = props.series;
	const melted = Array.isArray(props.y);
	// Several value keys — a `series` call's columns — are melted into one row
	// per value, named by its key, so each draws as a series of its own.
	if (Array.isArray(props.y)) {
		const keys = props.y as readonly string[];
		seriesKey = "series";
		y = "value";
		data = data.flatMap((row) => keys.map((key) => ({ [x]: row[x], series: props.labels?.[key] ?? key, value: row[key] })));
	} else if (seriesKey && props.labels) {
		const key = seriesKey;
		const labels = props.labels;
		data = data.map((row) => ({ ...row, [key]: labels[String(row[key])] ?? row[key] }));
	}
	const valuesOf = (key: string) => data.map((row) => row[key]);
	// Horizontal bars put their categories down the side: whichever key holds
	// them is the category, so naming them as `x` still draws the chart meant.
	if (horizontal && isCategorical(valuesOf(x)) && !isCategorical(valuesOf(y))) [x, y] = [y, x];
	const category = horizontal ? y : x;
	const value = horizontal ? x : y;
	const series = seriesKey;
	const seriesDomain = series ? unique(valuesOf(series)) : [];
	const log = props.yScale === "log";
	// Bars on a log scale cannot stack (there is no zero to stack from), so a
	// series of them stands side by side whatever the layout asked.
	const grouped = !!series && (props.layout === "group" || log) && (mark === "bar" || horizontal);
	const single = env.palette[0] ?? "currentColor";
	const categoryValues = valuesOf(category);
	const categorical = isCategorical(categoryValues);
	const numbers = valuesOf(value).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
	const tickFormat = (v: number) => formatFigure(v, props.unit);

	// An axis names its key unless something else already says it: the unit on
	// every tick, the legend of melted keys, or category names that read alone.
	const valueScale: ScaleOptions = { grid: true, tickFormat };
	if (props.yLabel !== undefined || props.unit || melted) valueScale.label = props.yLabel ?? null;
	const categoryScale: ScaleOptions = {};
	if (categorical) categoryScale.domain = unique(categoryValues);
	if (props.xLabel !== undefined || categorical) categoryScale.label = props.xLabel ?? null;
	// Melted keys are each a total of their own (a balance, what was paid in), so
	// their areas overlap from zero; a series column names parts, which stack.
	const overlapping = melted && mark === "area";
	const stacked = !!series && !grouped && !overlapping && (mark === "bar" || horizontal || mark === "area");
	const totals = new Map<unknown, number>();
	if (stacked)
		for (const row of data) if (typeof row[value] === "number") totals.set(row[category], (totals.get(row[category]) ?? 0) + (row[value] as number));
	if (!log) {
		// Shares of a whole run to 100: rounding leaves them at 99.9 or 100.1,
		// which a niced axis would carry on to 110. Anything else ends on a round
		// tick above its tallest value rather than below it.
		if (totals.size && [...totals.values()].every((t) => Math.abs(t - 100) <= 1)) valueScale.domain = [0, 100];
		else valueScale.nice = true;
		// A line of amounts reads against zero, unless its values sit in a band
		// far from it, which zero would flatten.
		const low = Math.min(...numbers);
		if (mark === "line" && numbers.length && low >= 0 && low <= Math.max(...numbers) / 2) valueScale.zero = true;
	}
	const positives = numbers.filter((v) => v > 0);
	const floor = log && positives.length ? 10 ** Math.floor(Math.log10(Math.min(...positives))) : 0;
	if (log) {
		// One tick and grid line per power of ten; Plot's own log ticks rule
		// every minor step, which reads as a hatched band.
		valueScale.type = "log";
		const top = positives.length ? Math.ceil(Math.log10(Math.max(...positives))) : 1;
		const low = Math.log10(floor || 1);
		valueScale.ticks = Array.from({ length: Math.max(1, top - low + 1) }, (_, i) => Number(((floor || 1) * 10 ** i).toPrecision(12)));
		// The frame spans the same whole powers, so the lowest tick is inside it.
		valueScale.domain = [floor || 1, 10 ** top];
	}

	const colour = series ? { [mark === "line" ? "stroke" : "fill"]: series } : { [mark === "line" ? "stroke" : "fill"]: single };
	const marks: PlannedMark[] = [];
	const options: ChartPlan["options"] = { width: env.width, height: 0, marginLeft: PLOT_MIN_MARGIN };

	if (mark === "bar" || horizontal) {
		const bar: Record<string, unknown> = { ...colour, tip: true };
		if (horizontal) Object.assign(bar, log ? { y: category, x1: floor, x2: value } : { y: category, x: value });
		else Object.assign(bar, log ? { x: category, y1: floor, y2: value } : { x: category, y: value });
		if (grouped) {
			// Side by side: one facet per category, the series across it.
			if (horizontal) Object.assign(bar, { fy: category, y: series });
			else Object.assign(bar, { fx: category, x: series });
		}
		marks.push({ type: horizontal ? "barX" : "barY", data, options: bar });
		if (!log) marks.push({ type: horizontal ? "ruleX" : "ruleY", data: [0], options: {} });
	} else if (mark === "line") {
		marks.push({ type: "lineY", data, options: { x, y, ...colour, strokeWidth: 2, tip: true } });
		const perSeries = series ? data.length / Math.max(1, seriesDomain.length) : data.length;
		if (perSeries <= 24) marks.push({ type: "dot", data, options: { x, y, fill: series ?? single, r: 3 } });
	} else if (mark === "area") {
		if (overlapping) {
			marks.push({ type: "areaY", data, options: { x, y1: 0, y2: y, fill: series, fillOpacity: 0.3, tip: true } });
			marks.push({ type: "lineY", data, options: { x, y, stroke: series, strokeWidth: 2 } });
		} else {
			marks.push({ type: "areaY", data, options: { x, y, ...colour, fillOpacity: series ? 0.85 : 0.3, tip: true } });
			if (!series) marks.push({ type: "lineY", data, options: { x, y, stroke: single, strokeWidth: 2 } });
		}
		marks.push({ type: "ruleY", data: [0], options: {} });
	} else {
		marks.push({ type: "dot", data, options: { x, y, fill: series ?? single, r: 4, tip: true } });
	}
	if (mark !== "bar" && !horizontal && !log && numbers.some((v) => v < 0) && !marks.some((m) => m.type === "ruleY"))
		marks.push({ type: "ruleY", data: [0], options: {} });

	if (series) {
		const ordered = props.scheme === "sequential" || props.scheme === "diverging" ? props.scheme : undefined;
		const range =
			ordered && env.ramp ? rampColours(seriesDomain.length, ordered, env.ramp) : seriesDomain.map((_, i) => env.palette[i % env.palette.length] ?? single);
		options.color = { domain: seriesDomain, range, legend: true };
	}

	const longest = (labels: string[]) => Math.max(0, ...labels.map((l) => l.length));
	if (horizontal) {
		options.x = valueScale;
		options.y = categoryScale;
		if (grouped) {
			options.fy = { ...categoryScale, label: null };
			options.y = { axis: null, domain: seriesDomain };
		}
		options.marginLeft = Math.min(240, Math.max(PLOT_MIN_MARGIN, longest(unique(categoryValues).map(String)) * CHAR_PX + TICK_PX));
		const rows = unique(categoryValues).length;
		options.height = props.height ?? rows * (grouped ? seriesDomain.length * 18 + 12 : 34) + 50;
	} else {
		options.x = categoryScale;
		options.y = valueScale;
		if (grouped) {
			options.fx = { ...categoryScale, label: props.xLabel ?? null };
			options.x = { axis: null, domain: seriesDomain };
		}
		const top = Math.max(...numbers, ...totals.values());
		const ticks = numbers.length ? [log ? top : roundedUp(top), Math.min(...numbers)].map(tickFormat) : [];
		options.marginLeft = Math.max(PLOT_MIN_MARGIN, longest(ticks) * CHAR_PX + TICK_PX);
		options.height = props.height ?? Math.min(360, Math.max(240, Math.round(env.width * 0.4)));
	}
	options.height = Math.min(800, Math.max(120, options.height));
	return { marks, options };
}
