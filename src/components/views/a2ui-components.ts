// Piary's components in its A2UI catalog, beside the basic ones: a stat tile,
// a table, a decision matrix and a callout (the chart is `a2ui-chart.ts`). Each
// is an API — its name and a strict schema, which is what the agent's payload
// is held to, here and in the `view` tool's serialized copy — and a Lit
// element that draws what `src/document/a2ui-figures.ts` reads from the
// resolved props.
//
// The elements render into light DOM, as the basic catalog's do, so their look
// is the stylesheet's (`.piary-a2ui` in src/styles/document.css, over Piary's
// tokens) and a screenshot's settle sees them change.
import { html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { z } from "zod";
import { A2uiLitElement, DynamicStringSchema, DynamicValueSchema } from "@a2ui/web_core/v1_0";
import { compareModel, statModel, tableModel, type Criterion, type TableColumn } from "../../document/a2ui-figures.ts";

// `REF:<def>|<description>` is how the catalog document keeps a common type's
// `$ref` while describing the property (`@a2ui/web_core`'s spec annotations).
const ref = (def: "DynamicString" | "DynamicNumber" | "DynamicValue", description: string) =>
	`REF:#/$defs/${def}|${description}`;

const Weight = z.number().describe("Flex weight inside a Row or Column.").optional();

/** A literal number, or a string/binding/call that resolves to the figure. */
const Figure = (description: string) => z.union([z.number(), DynamicStringSchema.describe(ref("DynamicString", description))]);

export const StatApi = {
	name: "Stat",
	schema: z
		.object({
			label: DynamicStringSchema.describe(ref("DynamicString", "What the figure is, e.g. 'Tickets opened'.")),
			value: Figure("The figure: a number (formatted here) or a string shown as written."),
			unit: z.string().describe("Its unit: a currency ($, €, USD) is written before the number, anything else (%, h, ms) after.").optional(),
			delta: Figure("The change since last time: a number is signed and arrowed here; a string ('+3 pts') is shown as written.").optional(),
			good: z
				.enum(["up", "down"])
				.describe("Which direction of the delta is good news, which colours it; omit when neither is.")
				.optional(),
			note: DynamicStringSchema.describe(ref("DynamicString", "A short line under the figure, e.g. 'vs 380 last week'.")).optional(),
			weight: Weight,
		})
		.strict(),
};

const Align = z.enum(["start", "end"]);

const TableColumnSchema = z.union([
	z.string(),
	z
		.object({
			key: z.string().describe("The row key (or, for array rows, the column's header)."),
			label: z.string().describe("The header, when not the key.").optional(),
			align: Align.describe("Overrides the alignment: a column of numbers is set at the end.").optional(),
			unit: z.string().describe("A unit for every number in the column, as Stat's.").optional(),
		})
		.strict(),
]);

export const TableApi = {
	name: "Table",
	schema: z
		.object({
			columns: z.array(TableColumnSchema).describe("The columns in order: a row key, or { key, label?, align?, unit? }. Default: the first row's keys.").optional(),
			rows: DynamicValueSchema.describe(ref("DynamicValue", "The rows: objects by key or arrays by column; a literal list, a binding, or a `series` call.")),
			caption: DynamicStringSchema.describe(ref("DynamicString", "A line under the table: its source or a note.")).optional(),
			weight: Weight,
		})
		.strict(),
};

const CriterionSchema = z
	.object({
		key: z.string().describe("The option key this criterion reads."),
		label: z.string().describe("The row's name, when not the key.").optional(),
		best: z.enum(["min", "max"]).describe("Marks the lowest or highest value of the options that pass every must.").optional(),
		must: z
			.object({
				min: z.number().optional(),
				max: z.number().optional(),
				oneOf: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
			})
			.strict()
			.describe("A requirement: a value outside it is struck, and its option is out.")
			.optional(),
		unit: z.string().describe("A unit for the row's numbers, as Stat's.").optional(),
	})
	.strict();

export const CompareApi = {
	name: "Compare",
	schema: z
		.object({
			options: DynamicValueSchema.describe(ref("DynamicValue", "The options, one object each, e.g. { name, price, sso }.")),
			name: z.string().describe("The key naming an option. Default 'name'.").optional(),
			criteria: z.array(CriterionSchema).describe("The rows: what the options are compared on, in order."),
			pick: DynamicStringSchema.describe(ref("DynamicString", "The name of the option recommended, which is marked.")).optional(),
			weight: Weight,
		})
		.strict(),
};

export const CalloutApi = {
	name: "Callout",
	schema: z
		.object({
			tone: z.enum(["info", "success", "warning", "destructive"]).describe("What kind of note it is. Default info.").optional(),
			title: DynamicStringSchema.describe(ref("DynamicString", "A few words in bold before the text.")).optional(),
			text: DynamicStringSchema.describe(ref("DynamicString", "The note: the takeaway, a caveat, what to do next.")),
			weight: Weight,
		})
		.strict(),
};

/**
 * The part every Piary element shares: light DOM, and the flex weight a Row or
 * Column gives it — what the basic catalog's own base class does, which is
 * internal to the package.
 */
export abstract class PiaryA2uiElement<Api extends { name: string; schema: z.ZodTypeAny }> extends A2uiLitElement<Api> {
	protected override createRenderRoot() {
		return this;
	}
	override willUpdate(changed: PropertyValues): void {
		super.willUpdate(changed);
		const weight = (this.controller?.props as { weight?: unknown } | undefined)?.weight;
		if (typeof weight === "number") this.style.flex = String(weight);
		else this.style.removeProperty("flex");
	}
}

class StatElement extends PiaryA2uiElement<typeof StatApi> {
	protected override readonly api = StatApi;
	override render() {
		const props = this.controller?.props;
		if (!props) return nothing;
		const stat = statModel(props as Parameters<typeof statModel>[0]);
		return html`<div class="piary-stat">
			<div class="piary-stat-label">${stat.label}</div>
			<div class="piary-stat-value">${stat.value}</div>
			${stat.delta ? html`<div class="piary-stat-delta" data-tone=${stat.tone}>${stat.delta}</div>` : nothing}
			${stat.note ? html`<div class="piary-stat-note">${stat.note}</div>` : nothing}
		</div>`;
	}
}

class TableElement extends PiaryA2uiElement<typeof TableApi> {
	protected override readonly api = TableApi;
	override render() {
		const props = this.controller?.props;
		if (!props) return nothing;
		const model = tableModel(props.columns as (string | TableColumn)[] | undefined, props.rows);
		const caption = typeof props.caption === "string" ? props.caption : "";
		return html`<div class="piary-table-wrap">
			<table class="piary-table">
				<thead>
					<tr>
						${model.head.map((h) => html`<th data-align=${h.align}>${h.label}</th>`)}
					</tr>
				</thead>
				<tbody>
					${model.body.map((row) => html`<tr>${row.map((c) => html`<td data-align=${c.align}>${c.text}</td>`)}</tr>`)}
				</tbody>
			</table>
			${caption ? html`<div class="piary-table-caption">${caption}</div>` : nothing}
		</div>`;
	}
}

const flag = (on: boolean) => (on ? "" : nothing);

class CompareElement extends PiaryA2uiElement<typeof CompareApi> {
	protected override readonly api = CompareApi;
	override render() {
		const props = this.controller?.props;
		if (!props) return nothing;
		const model = compareModel({
			options: props.options,
			name: props.name,
			criteria: props.criteria as Criterion[],
			pick: props.pick,
		});
		const head = (o: (typeof model.options)[number]): TemplateResult => html`<th data-out=${flag(o.fails.length > 0)} data-pick=${flag(o.pick)}>
			<span class="piary-compare-name">${o.name}</span>
			${o.pick ? html`<span class="piary-compare-badge">Recommended</span>` : nothing}
			${o.fails.length ? html`<span class="piary-compare-fails">fails ${o.fails.join(", ")}</span>` : nothing}
		</th>`;
		return html`<div class="piary-table-wrap">
			<table class="piary-table piary-compare">
				<thead>
					<tr>
						<th></th>
						${model.options.map(head)}
					</tr>
				</thead>
				<tbody>
					${model.rows.map(
						(row) => html`<tr>
							<th scope="row">${row.label}</th>
							${row.cells.map(
								(c, i) =>
									html`<td data-best=${flag(c.best)} data-fails=${flag(c.fails)} data-pick=${flag(model.options[i]!.pick)}>${c.text}</td>`,
							)}
						</tr>`,
					)}
				</tbody>
			</table>
		</div>`;
	}
}

class CalloutElement extends PiaryA2uiElement<typeof CalloutApi> {
	protected override readonly api = CalloutApi;
	override render() {
		const props = this.controller?.props;
		if (!props) return nothing;
		const title = typeof props.title === "string" ? props.title : "";
		return html`<div class="piary-callout" data-tone=${props.tone ?? "info"} role="note">
			${title ? html`<strong class="piary-callout-title">${title}</strong> ` : nothing}<span>${props.text}</span>
		</div>`;
	}
}

/** The catalog entries: an API with the element that draws it, under a tag of Piary's. */
export const PIARY_COMPONENTS = [
	{ ...StatApi, tagName: "piary-a2ui-stat", element: StatElement },
	{ ...TableApi, tagName: "piary-a2ui-table", element: TableElement },
	{ ...CompareApi, tagName: "piary-a2ui-compare", element: CompareElement },
	{ ...CalloutApi, tagName: "piary-a2ui-callout", element: CalloutElement },
];

