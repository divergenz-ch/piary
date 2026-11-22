// Piary's Chart component in its A2UI catalog: rows of data drawn with
// Observable Plot as one of five marks. What is drawn — scales, domains in data
// order, margins, height — is `chartPlan`'s (src/document/a2ui-figures.ts);
// this element measures its width, resolves the `--chart-*` palette and hands
// the plan to Plot.
//
// Plot is the copy a cell charts with (src/utils/plot.ts), loaded on the first
// chart and never at import: the catalog is imported in plain node too.
import type { Data } from "@observablehq/plot";
import { html, nothing } from "lit";
import { z } from "zod";
import { DynamicStringSchema, DynamicValueSchema } from "@a2ui/web_core/v1_0";
import { chartPlan, THEME_RAMP, type ChartProps, type PlannedMark } from "../../document/a2ui-figures.ts";
import { chartPalette } from "../../utils/chart-palette.ts";
import { loadPlot } from "../../utils/plot.ts";
import { PiaryA2uiElement } from "./a2ui-components.ts";

export const ChartApi = {
	name: "Chart",
	schema: z
		.object({
			data: DynamicValueSchema.describe("REF:#/$defs/DynamicValue|The rows, one object each: a literal list, a binding, or a `series` call."),
			mark: z
				.enum(["bar", "barH", "line", "area", "dot"])
				.describe("bar: vertical bars per category; barH: horizontal bars, categories down the side; line, area: over an ordered x; dot: a scatter."),
			x: z.string().describe("The row key along the bottom: the category, or the ordered value (a month, a year)."),
			y: z
				.union([z.string(), z.array(z.string())])
				.describe("The row key of the value drawn, or several keys drawn as one series each. For barH, x and y are read whichever way round holds the categories."),
			series: z.string().describe("A row key splitting the rows into coloured series, with a legend.").optional(),
			layout: z.enum(["stack", "group"]).describe("Bars with a series: stacked (default) or side by side.").optional(),
			yScale: z.enum(["linear", "log"]).describe("log for values spanning orders of magnitude.").optional(),
			scheme: z
				.enum(["categorical", "sequential", "diverging"])
				.describe(
					"How series are coloured. categorical (default): distinct hues. Ordered series (a rating, a scale, low to high) take sequential, light to dark, or diverging, from a negative end through a neutral middle to a positive end; series come in the order of the rows.",
				)
				.optional(),
			labels: z
				.record(z.string(), z.string())
				.describe("Names in the legend for series values or value keys, by what the rows hold: { \"cash5\": \"5% growth\" }.")
				.optional(),
			unit: z.string().describe("The value's unit, on the axis ticks: a currency before the number, anything else after.").optional(),
			xLabel: z.string().describe("The axis label along the bottom, when not the key.").optional(),
			yLabel: z.string().describe("The value axis label, when not the key.").optional(),
			title: DynamicStringSchema.describe("REF:#/$defs/DynamicString|A heading over the chart.").optional(),
			caption: DynamicStringSchema.describe("REF:#/$defs/DynamicString|A line under the chart: its source or how to read it.").optional(),
			height: z.number().describe("Height in pixels, when the default does not suit.").optional(),
			weight: z.number().describe("Flex weight inside a Row or Column.").optional(),
		})
		.strict(),
};

/** Plot's own width, for a chart measured before it has a layout (and under jsdom). */
const FALLBACK_WIDTH = 640;
/** A width change smaller than this is the scrollbar, not a reason to redraw. */
const REDRAW_PX = 8;

class ChartElement extends PiaryA2uiElement<typeof ChartApi> {
	protected override readonly api = ChartApi;
	#width = 0;
	#resize: ResizeObserver | undefined;
	/** Bumped on every draw, so a Plot that loads after a newer draw is dropped. */
	#draw = 0;

	override connectedCallback(): void {
		super.connectedCallback();
		if (typeof ResizeObserver === "undefined") return;
		this.#resize = new ResizeObserver(() => {
			if (Math.abs(this.#measure() - this.#width) >= REDRAW_PX) this.requestUpdate();
		});
		this.#resize.observe(this);
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.#resize?.disconnect();
		this.#resize = undefined;
		this.#draw++;
	}

	#measure(): number {
		return Math.round(this.clientWidth) || FALLBACK_WIDTH;
	}

	#plan() {
		const plan = chartPlan(this.controller.props as ChartProps, { width: this.#width, palette: chartPalette(this), ramp: THEME_RAMP });
		// Plot sets a colour as an SVG attribute, where var() and color-mix() are
		// not read: each is resolved to the colour it computes to here.
		if (plan.options.color) plan.options.color.range = plan.options.color.range.map((c) => this.#resolve(c));
		return plan;
	}

	#resolve(colour: string): string {
		if (!/var\(|color-mix\(/.test(colour)) return colour;
		const probe = document.createElement("span");
		probe.style.color = colour;
		this.append(probe);
		const value = getComputedStyle(probe).color;
		probe.remove();
		return value || colour;
	}

	override render() {
		const props = this.controller?.props;
		if (!props) return nothing;
		this.#width = this.#measure();
		const plan = this.#plan();
		const title = typeof props.title === "string" ? props.title : "";
		const caption = typeof props.caption === "string" ? props.caption : "";
		return html`<figure class="piary-chart">
			${title ? html`<div class="piary-chart-title">${title}</div>` : nothing}
			<div class="piary-chart-plot" style="min-height: ${plan.options.height}px"></div>
			${caption ? html`<figcaption class="piary-chart-caption">${caption}</figcaption>` : nothing}
		</figure>`;
	}

	protected override updated(): void {
		const target = this.querySelector<HTMLElement>(".piary-chart-plot");
		if (!target || !this.controller?.props) return;
		const plan = this.#plan();
		const draw = ++this.#draw;
		const fail = (error: unknown) => {
			const note = document.createElement("div");
			note.className = "piary-chart-failed";
			note.textContent = `The chart did not draw: ${error instanceof Error ? error.message : String(error)}`;
			target.replaceChildren(note);
			this.setAttribute("data-answer-ui-error", "");
		};
		loadPlot().then(
			(Plot) => {
				if (draw !== this.#draw) return;
				try {
					const mark = (m: PlannedMark) => Plot[m.type](m.data as Data, m.options);
					const figure = Plot.plot({
						...plan.options,
						marks: plan.marks.map(mark),
						style: { fontFamily: "var(--font-sans)", fontSize: "12px", background: "transparent", color: "inherit", overflow: "visible" },
					});
					target.replaceChildren(figure);
					this.removeAttribute("data-answer-ui-error");
					this.setAttribute("data-drawn", "");
				} catch (error) {
					fail(error);
				}
			},
			(error: unknown) => {
				if (draw === this.#draw) fail(error);
			},
		);
	}
}

export const CHART_COMPONENT = { ...ChartApi, tagName: "piary-a2ui-chart", element: ChartElement };
