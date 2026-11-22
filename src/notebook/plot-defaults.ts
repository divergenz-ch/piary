// Piary's defaults over `Plot.plot` options, for a cell's chart: the token
// palette on a categorical colour scale, categories in the order the data gives
// them, a left margin as wide as its labels, and the width of the column it is
// drawn in. The engine applies them to every `Plot.plot` a cell calls
// (src/notebook/engine.ts), so a cell writes plain Plot and anything it sets
// itself wins. Pure: the palette and the width are handed in.

/** Plot's options as far as the defaults read them; the rest passes through. */
export interface PlotOptions {
	marks?: readonly unknown[];
}

/** What the defaults may set, beside whatever the chart was given. */
export type PlotDefaults = Partial<Record<Scale | "width" | "height" | "marginLeft" | "marginBottom", unknown>>;

/** The same options, read by name. */
type Options = PlotOptions & Record<string, unknown>;

/** The scales a categorical channel lands on, by channel name: `fill: "auto"` is colour
 *  unless it is a literal, and a literal never reaches the channels. */
const SCALES = ["x", "y", "fx", "fy", "color"] as const;
type Scale = (typeof SCALES)[number];
const scaleOf = (channel: string, scale: unknown): Scale | null =>
	scale === "auto" && (channel === "fill" || channel === "stroke")
		? "color"
		: SCALES.includes(scale as Scale)
			? (scale as Scale)
			: null;

/** Strings Plot reads as dates (`2026-01-01`), which it puts on a time axis, not in categories. */
const ISO_DATE = /^[+-]?\d{4,6}-\d{2}(-\d{2})?([T ]|$)/;

interface InitializedMark {
	sort?: Record<string, unknown> | null;
	/** A mark-level facet: the mark's raw data and how each row names its facet. */
	data?: unknown;
	fx?: unknown;
	fy?: unknown;
	initialize(facets?: unknown, facetChannels?: unknown, options?: unknown): {
		channels: Record<string, { value?: ArrayLike<unknown>; scale?: unknown; type?: unknown }>;
	};
}
const isMark = (m: unknown): m is InitializedMark => typeof (m as InitializedMark | null)?.initialize === "function";

/** Plot's tick labels are 10 px sans: about this wide per character, digit or letter. */
const TICK_CHAR_PX = 6;
/** Plot's y tick (6 px) and its padding (3 px), and a few pixels so no glyph meets the edge. */
const TICK_ROOM_PX = 13;
/** Plot's default left margin, which holds four digits. */
const PLOT_MARGIN_LEFT = 40;
/** Plot draws a numeric y axis 400 px tall whatever the width; a chart in an answer is read
 *  at a glance, so it takes this share of its width, between the two bounds. */
const HEIGHT_RATIO = 0.4;
const HEIGHT_MIN = 200;
const HEIGHT_MAX = 320;
const PLOT_WIDTH = 640;

/** Plot's x tick: its length, padding, and the room a turned label's own height takes. */
const X_TICK_ROOM_PX = 20;
/** How far a label too wide for its band is turned. */
const TICK_ROTATE = -30;

/** The facet each row of `data` falls in, as Plot reads a facet option: a field name, an
 *  accessor, or the values themselves. */
function facetValues(data: unknown, spec: unknown): unknown[] {
	if (spec == null) return [];
	if (Array.isArray(spec) && !Array.isArray(data)) return spec;
	if (!Array.isArray(data)) return [];
	if (typeof spec === "string") return data.map((row) => (row as Record<string, unknown> | null)?.[spec]);
	if (typeof spec === "function") return data.map((row, i) => (spec as (d: unknown, i: number) => unknown)(row, i));
	return Array.isArray(spec) ? spec : [];
}

/** The y tick labels at the ends of the axis, as the chart will write them. */
function yLabels(values: readonly unknown[], own: Record<string, unknown>): string[] {
	if (values.every((v) => typeof v === "string" && !ISO_DATE.test(v))) return values as string[];
	if (!values.every((v) => typeof v === "number")) return [];
	const numbers = values as number[];
	const format = typeof own.tickFormat === "function" ? (own.tickFormat as (v: number) => unknown) : (v: number) => v.toLocaleString("en-US");
	return [Math.min(...numbers), Math.max(...numbers)].map((v) => String(format(v)));
}

/**
 * Piary's defaults over `Plot.plot` options. Plot sorts an ordinal axis
 * ascending, so weekdays come out Fri, Mon, Thu…: a categorical scale with no
 * domain and no mark `sort` takes its values in the order the data gives them.
 * A categorical colour scale takes `palette` unless the chart names a range or
 * scheme, or has more series than the palette has colours. Numeric and date
 * scales are left to Plot. Plot also keeps a 40 px left
 * margin that clips "140,000" or a long category name, and a numeric y axis 400 px
 * tall: the margin grows to the widest y label, category labels too wide for
 * their band are turned, and a chart takes `width` (the column it is drawn in)
 * and a height in proportion, unless it sets its own.
 */
export function plotOptions<T extends PlotOptions>(given: T, palette: readonly string[], width?: number): T & PlotDefaults {
	const options = given as Options;
	const order = new Map<Scale, Set<unknown>>();
	const sorted = new Set<string>();
	/** Scales a mark lays out in bands, whatever its values are: a bar per rank is a band of numbers. */
	const banded = new Set<Scale>();
	const marks = (options.marks ?? []).flat(Infinity).filter(isMark);
	const add = (scale: Scale, values: readonly unknown[]) => {
		const present = values.filter((v) => v != null);
		if (!present.length) return;
		const seen = order.get(scale) ?? new Set();
		for (const v of present) seen.add(v);
		order.set(scale, seen);
	};
	// Facets are not mark channels: Plot reads them off the data apart, so they are read here too.
	const facet = (options.facet ?? {}) as { data?: unknown; x?: unknown; y?: unknown };
	add("fx", facetValues(facet.data, facet.x));
	add("fy", facetValues(facet.data, facet.y));
	for (const mark of marks) {
		add("fx", facetValues(mark.data, mark.fx));
		add("fy", facetValues(mark.data, mark.fy));
		for (const key of Object.keys(mark.sort ?? {})) sorted.add(key);
		let channels;
		try {
			// Plot's own pass from data to channel values, transforms included: a
			// `groupX` mark's x is its groups, not a field of the raw rows.
			({ channels } = mark.initialize(undefined, undefined, options));
		} catch {
			continue;
		}
		for (const [name, channel] of Object.entries(channels)) {
			const scale = scaleOf(name, channel.scale);
			if (scale && channel.value) add(scale, Array.from(channel.value));
			if (scale && channel.type === "band") banded.add(scale);
		}
	}
	const out: Options = { ...options };
	for (const [scale, seen] of order) {
		const own = (options[scale] ?? {}) as Record<string, unknown>;
		const values = [...seen];
		const first = values[0];
		const categorical = typeof first === "boolean" || (typeof first === "string" && !ISO_DATE.test(first));
		if (!categorical) continue;
		// A range or scheme pairs with Plot's own sorted order, by position: the
		// colour scale of a chart that names one is left exactly as written.
		const named = scale === "color" && ["range", "scheme", "interpolate"].some((k) => own[k] !== undefined);
		if (named) continue;
		const next: Record<string, unknown> = { ...own };
		// A domain the chart gives, or a mark's sort, decides the order; neither
		// names a colour, so the palette is still owed.
		const ordered = own.domain !== undefined || sorted.has(scale);
		if (!ordered) next.domain = values;
		const count = Array.isArray(own.domain) ? own.domain.length : values.length;
		// Plot repeats a range shorter than its domain, which would draw two
		// series in one colour: past the palette's length Plot's own scheme stays.
		const themed = scale === "color" && palette.length > 0 && count <= palette.length;
		if (themed) next.range = palette;
		if (!ordered || themed) out[scale] = next;
	}
	const y = (options.y ?? {}) as Record<string, unknown>;
	const yValues = [...(order.get("y") ?? [])];
	const yOnLeft = yValues.length > 0 && y.axis !== "right" && y.axis !== null && options.axis !== null;
	if (options.marginLeft === undefined && options.margin === undefined && yOnLeft) {
		const widest = Math.max(0, ...yLabels(yValues, y).map((label) => label.length));
		const needed = Math.ceil(widest * TICK_CHAR_PX + TICK_ROOM_PX);
		if (needed > PLOT_MARGIN_LEFT) out.marginLeft = needed;
	}
	if (width && options.width === undefined) out.width = width;
	const x = (out.x ?? {}) as Record<string, unknown>;
	const xValues = [...(order.get("x") ?? [])];
	if (xValues.length && xValues.every((v) => typeof v === "string" && !ISO_DATE.test(v)) && x.tickRotate === undefined) {
		const panels = Math.max(1, order.get("fx")?.size ?? 1);
		const across = ((out.width as number | undefined) ?? PLOT_WIDTH) - ((out.marginLeft as number | undefined) ?? PLOT_MARGIN_LEFT);
		const band = across / panels / xValues.length;
		const widest = Math.max(...xValues.map((v) => (v as string).length)) * TICK_CHAR_PX;
		if (widest > band * 0.9) {
			out.x = { ...x, tickRotate: TICK_ROTATE };
			if (options.marginBottom === undefined && options.margin === undefined)
				out.marginBottom = Math.ceil(widest * Math.sin((-TICK_ROTATE * Math.PI) / 180) + X_TICK_ROOM_PX);
		}
	}
	// Bands on y are sized by their count, which is Plot's own rule and the right one.
	const yBands = banded.has("y") || y.type === "band" || y.type === "point";
	const yNumeric = !yBands && yValues.length > 0 && yValues.every((v) => typeof v === "number");
	const sized = ["height", "aspectRatio", "projection"].some((k) => options[k] !== undefined);
	if (!sized && yNumeric && !order.has("fy")) {
		const across = (out.width as number | undefined) ?? PLOT_WIDTH;
		out.height = Math.round(Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, across * HEIGHT_RATIO)));
	}
	return out as T & PlotDefaults;
}
