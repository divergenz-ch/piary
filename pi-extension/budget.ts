// The `budget` tool: the agent says, early in a run, how long the work asked
// for should take. That is all it does. The estimate is the agent's; enforcing
// it is the app's — Piary steers the run to stop and report once the estimate
// has passed, and stops it outright at its own hard bounds, whatever was
// estimated (ADR 0031).
//
// The registration is not unit-tested: it needs pi's runtime, and `typebox`
// resolves only inside pi's image. The page's half is `app/run-limits.ts`.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "budget",
		label: "Budget",
		description:
			"Say how many minutes the work you were just asked for should take, before starting anything that needs " +
			"more than one or two tool calls. Estimate the work, not the hard limit. When the estimate has passed, " +
			"Piary tells you so: then stop, report what is done and what is left, and ask the user whether to go on.",
		promptSnippet: "Estimate how long this run's work should take, so the user hears back in time",
		parameters: Type.Object({
			minutes: Type.Number({ description: "Your estimate, in minutes. Whole or fractional." }),
			reason: Type.String({ description: "One line: what the work is, as you estimated it." }),
		}),
		async execute(_toolCallId: string, params: { minutes: number; reason: string }) {
			return { content: [{ type: "text", text: `ok — budget ${params.minutes} min` }], details: {} };
		},
	});
}
