// What one arm of a design run did, counted from its eval reports and its
// shots. Pure, so a hand-built arm shows a count that counts nothing; the script
// beside it (`metrics.ts`) reads the files and prints this.
import type { ToolCall } from "../checks.ts";

/** One answer, as an eval report holds it. */
export interface Answer {
	toolCalls?: readonly ToolCall[];
	checks?: readonly { pass: boolean }[];
	ms: number;
}

/** One rendered answer, as the shots spec writes it. */
export interface Shot {
	name: string;
	widgets: number;
	errors: number;
}

/** The tools whose arguments are what the answer drew. */
const UI_TOOLS = new Set(["cell", "view", "ui", "a2ui"]);
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/g;

const failedCalls = (answer: Answer, tool: string) => (answer.toolCalls ?? []).filter((c) => c.name === tool && c.failed === true);
const isA2ui = (call: ToolCall) => call.name === "view" && call.args["template"] === "a2ui";

/** Whether the answer's last accepted a2ui payload is composed: a headline (a
 *  `Text` whose text starts with `#`) and a takeaway (a `Callout`). */
function composed(answer: Answer): boolean {
	const last = (answer.toolCalls ?? []).filter((c) => isA2ui(c) && c.failed !== true).at(-1);
	const components = (last?.args["data"] as { components?: unknown } | undefined)?.components;
	if (!Array.isArray(components)) return false;
	const parts = components as { component?: unknown; text?: unknown }[];
	const headline = parts.some((c) => c.component === "Text" && typeof c.text === "string" && c.text.startsWith("#"));
	return headline && parts.some((c) => c.component === "Callout");
}

export function summarise(answers: readonly Answer[], shots: readonly Shot[]) {
	let payload = 0;
	let colors = 0;
	const tools: Record<string, number> = {};
	for (const answer of answers) {
		for (const call of answer.toolCalls ?? []) {
			tools[call.name] = (tools[call.name] ?? 0) + 1;
			if (!UI_TOOLS.has(call.name)) continue;
			const text = JSON.stringify(call.args);
			payload += text.length;
			colors += (text.match(COLOR) ?? []).length;
		}
	}
	const ms = answers.map((a) => a.ms).sort((a, b) => a - b);
	const broken = shots.filter((s) => s.widgets === 0 || s.errors > 0).map((s) => s.name);
	return {
		answers: answers.length,
		passed: answers.filter((a) => (a.checks ?? []).every((c) => c.pass)).length,
		rendered: shots.length,
		broken: broken.length,
		brokenNames: broken,
		medianMs: ms[Math.floor(ms.length / 2)],
		payloadCharsPerAnswer: Math.round(payload / Math.max(1, answers.length)),
		handColorsPerAnswer: +(colors / Math.max(1, answers.length)).toFixed(1),
		tools,
		refusedViews: answers.reduce((n, a) => n + failedCalls(a, "view").length, 0),
		failedCells: answers.reduce((n, a) => n + failedCalls(a, "cell").length, 0),
		answersWithRefusal: answers.filter((a) => failedCalls(a, "view").length > 0).length,
		a2uiAnswers: answers.filter((a) => (a.toolCalls ?? []).some(isA2ui)).length,
		cellAnswers: answers.filter((a) => (a.toolCalls ?? []).some((c) => c.name === "cell")).length,
		composed: answers.filter(composed).length,
	};
}
