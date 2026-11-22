// What the `view` tool's description teaches about the `a2ui` template. It is
// in the agent's context on every turn, where the skill is read only on
// demand, so it carries everything a first payload needs: when to use it, the
// shape, one complete example and the props of the components answers reach
// for. The rarer components are named with their required props alone: a
// refusal names the fault at a JSON pointer, which teaches the rest.
// The example is checked against the catalog (tests/contract/a2ui-copies.test.ts),
// because a taught payload that is refused would be copied into every answer.
//
// No `typebox` here, so the suite can import this file directly.

/** One small surface exercising the syntax a model gets wrong: ids, bindings, calc, series. */
export const A2UI_EXAMPLE = {
	dataModel: { rate: 5 },
	components: [
		{ id: "root", component: "Column", children: ["title", "kpis", "rateIn", "growth", "why"] },
		{ id: "title", component: "Text", text: "## $1,000 left for 10 years" },
		{ id: "kpis", component: "Row", children: ["start", "after"] },
		{ id: "start", component: "Stat", label: "Put in", value: 1000, unit: "$" },
		{
			id: "after",
			component: "Stat",
			label: "At the end",
			unit: "$",
			value: { "@call": "calc", args: { expr: "round(1000 * (1 + r / 100) ^ 10)", vars: { r: { "@path": "/rate" } } } },
		},
		{ id: "rateIn", component: "Slider", label: "Interest, % a year", min: 0, max: 15, value: { "@path": "/rate" } },
		{
			id: "growth",
			component: "Chart",
			mark: "line",
			x: "year",
			y: "balance",
			unit: "$",
			data: {
				"@call": "series",
				args: { from: 0, to: 10, index: "year", columns: { balance: "round(1000 * (1 + r / 100) ^ year)" }, vars: { r: { "@path": "/rate" } } },
			},
		},
		{ id: "why", component: "Callout", tone: "info", title: "Why it curves", text: "Each year's interest earns interest too." },
	],
};

export const A2UI_GUIDE = [
	"a2ui is the default for any answer to look at: stat tiles, a comparison or a decision, a chart, a table of figures, " +
		"a form, an explainer to play with (sliders that recompute stats, tables and charts). " +
		"The app draws it in Piary's own design: send no colours or styles, and name a series by its label. " +
		"Figures you worked out (with bash or in your head) are shown this way too, never as a markdown table, the table template " +
		"or a list in prose. Scenarios over time (a balance, a runway, a forecast) are a line Chart of the curve, one series per " +
		"scenario, so the reader sees when it runs out or turns, with a Stat per scenario for the answer. " +
		"Data that lives in a workspace file (a CSV, a JSON, a log) is the exception: always chart it in a cell, which reads " +
		"it with FileAttachment and follows the file, where a surface would hold a stale copy. " +
		"Use a cell also for what a2ui cannot express: a calculation whose " +
		"working the user asks to be shown (its formula and steps, as code they can edit), a drawing, a simulation or an animation, or a change " +
		"to an existing cell.",
	'a2ui data is { "components": [...], "dataModel"?: {...} }: a flat list with one "id": "root", children by id; ' +
		"ids are camelCase, never a hyphen. " +
		'A prop is a literal, a binding { "@path": "/rate" } or a function { "@call": ... }. Example: ' +
		JSON.stringify(A2UI_EXAMPLE),
	"Components (* required): " +
		"Text {text*: markdown, \"## \" for a heading; variant: body|caption}. " +
		"Row, Column {children*; justify, align}. Card {child*}. Divider. Tabs {tabs*}. " +
		'Stat {label*, value*, unit ("$" "€" "$k" go before the number: 102 with "$k" is $102k; "%" "h" "ms" after), delta (a number, or text like "+3 pts"), ' +
		'good: "up"|"down", which direction of the delta is good news (lower is better for times, costs, backlogs); ' +
		"omit it when neither is, never null; note}. " +
		"Table {rows*: [{key: value}] or [[...]], columns: [key or {key, label, align: start|end, unit}], caption}. " +
		"Chart {data*: [{...}] a row per point, mark*: bar|barH|line|area|dot, x*: key, y*: key or [keys] (a series each), " +
		"series: key splitting long rows into series, layout: stack|group, yScale: linear|log, " +
		"scheme: categorical|sequential|diverging (ordered series, such as ratings or disagree → neutral → agree, always take " +
		'a ramp in row order, diverging when the scale has a neutral middle; without one they read as unrelated hues), labels: {key: "legend name"}, unit, xLabel, yLabel, title, caption}. ' +
		"Compare {options*: [{name, ...values}], criteria*: [{key, label, best: min|max, must: {min, max, oneOf}, unit}], pick: name}. " +
		"Callout {text*, title, tone: info|success|warning|destructive}: the takeaway or a caveat, under 40 words. " +
		'Inputs bind to a { "@path" } value: Slider {label, min, max*, value*, steps}, ' +
		"TextField {label*}, CheckBox {label*, value*}, ChoicePicker {options*, value*}.",
	"Functions: calc {expr, vars} is a number; series {from, to, step, index, columns: {name: expr}, start, vars} is rows for a " +
		"Chart or Table, each column a formula over the index, vars, the columns before it and prev_<column>, that column in the " +
		'previous row; `start` gives the first row\'s values ({"start": {"cash": 480}, "columns": {"cash": "prev_cash - burn"}}). ' +
		"Formulas: + - * / % ^, comparisons, abs ceil floor round min max sqrt exp log if(cond, a, b). " +
		'A range that follows an input is bound ("to": { "@path": "/years" }), not padded with zeros.',
	"Put the headline and the takeaway inside the surface (a Text heading, a Callout), not in prose around it. " +
		"A refused payload names one fault at a JSON pointer: fix it and call again.",
].join(" ");
