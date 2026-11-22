// Piary's A2UI catalog: what an `a2ui` view may be built from, and how strictly
// a payload is held to it. The page renders with it; the `view` tool checks
// against its serialized copy, `pi-extension/a2ui-catalog.ts`
// (tests/contract/a2ui-copies.test.ts).
//
// One catalog under one id holds the basic v1.0 components and functions and
// Piary's own, so the id the renderer stamps on every surface is the only one
// there is. Piary's components are the figures the basic catalog has no word
// for — Stat, Table, Compare, Callout, Chart — and its functions are the
// arithmetic it lacks: `calc` and `series` derive values from the data model
// (src/document/a2ui-expr.ts), which is how a surface computes without running
// agent code.
import { z } from "zod";
import { basicCatalog, createFunctionImplementation, DynamicNumberSchema, DynamicValueSchema, STRICT_VALIDATION } from "@a2ui/web_core/v1_0";
import { A2UI_CATALOG_ID } from "../../document/a2ui.ts";
import { calc, series } from "../../document/a2ui-expr.ts";
import { CHART_COMPONENT } from "./a2ui-chart.ts";
import { PIARY_COMPONENTS } from "./a2ui-components.ts";

const Vars = z
	.record(z.string(), DynamicValueSchema.describe("REF:#/$defs/DynamicValue"))
	.describe('The formula\'s names and their values: literals, or bindings such as { "@path": "/rate" }.');

const CalcApi = {
	name: "calc",
	returnType: "number",
	description: "The value of an arithmetic formula over named values, e.g. p * (1 + r / 100) ^ n.",
	schema: z
		.object({
			expr: z
				.string()
				.describe("Numbers, names from vars, + - * / % ^, comparisons, and abs ceil floor round(x, digits?) min max pow sqrt exp log log10 if(cond, a, b)."),
			vars: Vars.optional(),
		})
		.strict(),
} as const;

const SeriesApi = {
	name: "series",
	returnType: "array",
	description: "Rows from a range, one per step, each column a formula: data for a Chart or rows for a Table that follow the data model.",
	schema: z
		.object({
			from: DynamicNumberSchema.describe("REF:#/$defs/DynamicNumber|The first step."),
			to: DynamicNumberSchema.describe("REF:#/$defs/DynamicNumber|The last step (at most 1000 rows are made)."),
			step: DynamicNumberSchema.describe("REF:#/$defs/DynamicNumber|The step. Default 1.").optional(),
			index: z.string().describe("The name a formula reads the step by, and the column it is written to, e.g. year."),
			columns: z
				.record(z.string(), z.string())
				.describe(
					"Column name → formula, in order; a formula may read the index, vars, the columns before it, and prev_<column>: that column in the previous row (a running balance).",
				),
			start: z
				.record(z.string(), DynamicValueSchema.describe("REF:#/$defs/DynamicValue"))
				.describe("The first row's values for the columns named, which their prev_ reads on the second: where a running balance starts.")
				.optional(),
			vars: Vars.optional(),
		})
		.strict(),
} as const;

const PIARY_FUNCTIONS = [
	createFunctionImplementation(CalcApi, (args) => calc(args.expr, args.vars)),
	createFunctionImplementation(SeriesApi, (args) => series(args as Parameters<typeof series>[0])),
];

export const piaryCatalog = basicCatalog.derive({
	catalogId: A2UI_CATALOG_ID,
	components: [...basicCatalog.components.keys(), ...PIARY_COMPONENTS, CHART_COMPONENT],
	functions: [...basicCatalog.functions.keys(), ...PIARY_FUNCTIONS],
});

/**
 * The graph checks — unknown component, dangling child, missing root — run only
 * when a validation config is passed; without one a broken payload renders
 * blank. Orphans are allowed: an unused component is harmless, and refusing it
 * would cost a whole answer.
 */
export const A2UI_VALIDATION = { ...STRICT_VALIDATION, allowOrphanComponents: true };
