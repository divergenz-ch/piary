// How an answer to look at is drawn, and what the `view` and `cell` tools say
// about it (ADR 0044). The mode picks guidance, never rendering: the page draws
// a2ui views and cells whatever it is. The app passes `PIARY_DRAW` to every pi it
// starts, and the two tools read it once, when they register, so pi carries one
// mode's teaching and never both.
//
// No `typebox` here, so the suite can import this file directly
// (tests/unit/draw-mode.test.ts, tests/contract/guidance-budget.test.ts, which
// also holds each mode's texts to a size).
import { A2UI_GUIDE } from "./a2ui-guide.ts";

/** `a2ui`: an answer is a `view` drawn through Piary's catalog. `free`: it is a cell. */
export type DrawMode = "a2ui" | "free";

/** The mode `PIARY_DRAW` names. Anything but `free` is `a2ui`, so a pi started
 *  outside the app, with nothing set, draws as the app does by default. */
export function drawMode(env: string | undefined): DrawMode {
	return env === "free" ? "free" : "a2ui";
}

export function viewDescription(mode: DrawMode): string {
	if (mode === "free") {
		return (
			"Render structured data as a visual block in the document (templates: table, diff, file-tree, cards, matches, " +
			"properties). The call itself is the rendered artifact: it computes nothing. " +
			"Use it when data is clearer as a table/tree/diff than as prose; read the view-templates skill for each " +
			"template's payload schema first."
		);
	}
	return (
		"Render an answer as a visual block in the document (templates: a2ui, table, diff, file-tree, cards, matches, " +
		"properties). The call itself is the rendered artifact: it computes nothing. " +
		A2UI_GUIDE +
		" The other templates show a tool's output as it came (table: a listing such as ps or df; diff; file-tree; cards; matches; " +
		"properties); their payloads are in the view-templates skill."
	);
}

export function viewSnippet(mode: DrawMode): string {
	return mode === "free"
		? "Render data as a visual template block in the document (schemas: view-templates skill)"
		: "Answer figures (ones you computed too), stat tiles, scenarios, comparisons, charts, forms and explainers with view template a2ui, drawn in Piary's design";
}

/** The description of the `view` tool's `template` parameter. */
export function viewTemplateHint(mode: DrawMode): string {
	return `Template name: ${mode === "free" ? "" : "a2ui | "}table | diff | file-tree | cards | matches | properties`;
}

/** The description of the `view` tool's `data` parameter. */
export function viewDataHint(mode: DrawMode): string {
	return mode === "free"
		? "The template's payload, shaped per the view-templates skill. A payload that does not fit is refused with the reason."
		: "The template's payload: for a2ui { components, dataModel? } as above, for the others per the view-templates skill. A payload that does not fit is refused with the reason.";
}

/** What a cell is for. This sentence, and the `view` tool's own text, is where
 *  an answer is routed, so it is the one part of the description a mode changes. */
const CELL_ROUTE: Record<DrawMode, string> = {
	a2ui:
		"A cell is for code: data read from a workspace file, a calculation shown as code, a drawing, a simulation, " +
		"or a change to an existing cell. Anything else to look at is a `view` with template a2ui. ",
	free:
		"A cell is the default for anything to look at: a computation, a chart, a result the user should explore " +
		"(tweak a parameter, filter data); `view` is for a fixed snapshot of data as it came. ",
};

export function cellDescription(mode: DrawMode): string {
	return (
		"Write a reactive code cell into the document. The call itself is the cell; the code runs (and " +
		"re-runs on dependency changes) in the document, and the call answers once it has run: `ok — cell " +
		"#ID ran.`, or a failed result with the error — then redefine that id to fix it. Cells reference each " +
		"other's top-level declarations by name, Observable-style. Every call answers with the cell's id " +
		"(`ok — cell #ID`); pass that `id` back to redefine THAT cell. Redefining an id replaces the whole " +
		"cell, so check the id you were given for the cell you mean — replacing the wrong one deletes the " +
		"declarations everything else reads. " +
		"NOT React: JSX does not parse, className/Tailwind do nothing, there is no component model. " +
		"Build markup with htl.html`<div class=…>`, or return a Plot/Inputs value. " +
		"Its output is already in Piary's type and colours: write no colour, font family or font size the user did not ask for. " +
		'htl, Plot, Inputs, d3, md and tex are AMBIENT — never import them; a bare `import … from "htl"` ' +
		"fails to resolve. Only npm packages need importing, and only as `npm:name`. " +
		CELL_ROUTE[mode] +
		"Read the reactive-cells section of the view-templates skill before first use."
	);
}

export function cellSnippet(mode: DrawMode): string {
	return mode === "free"
		? "Write a reactive code cell into the document (semantics: view-templates skill)"
		: "Write a reactive code cell: data from a workspace file, a calculation shown as code, a drawing or a simulation (semantics: view-templates skill)";
}
