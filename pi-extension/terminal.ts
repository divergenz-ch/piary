// The `terminal` tool: pi's own `bash`, under the name that means "show this to
// the user". The command runs exactly as `bash` runs it — same shell, same
// output, same truncation — and the only difference is what the page does with
// it: a `terminal` call's output streams into a panel in the answer, where a
// `bash` call's is a folded step under its call (`app/output-panels.ts`).
//
// The choice is the agent's because nothing else knows it: whether the user
// wants to see a command run is in what they asked, not in the command.
//
// The registration is not unit-tested: it needs pi's runtime, and `typebox`
// resolves only inside pi's image. The page's half is held by
// `e2e/flows.spec.ts`.
import { createBashToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const bash = createBashToolDefinition(process.cwd());
	pi.registerTool({
		...bash,
		name: "terminal",
		label: "Terminal",
		description:
			`${bash.description} Unlike bash, the user sees the output, live, as a terminal panel in the document. ` +
			"Use it only when the user should see the command run: they asked for a terminal or to see the output, " +
			"or will watch a long process (a build, a server, a test run). For your own work — looking at files, " +
			"checking a result, a step toward the answer — use bash, whose output the user does not see as a panel.",
		promptSnippet: "Run a shell command whose output the user watches, as a terminal panel in the document",
		promptGuidelines: undefined,
	});
}
