// The `view` tool: lets the agent request a rendered template block in the
// Piary document. Execution only checks the payload — the tool call's
// transcript entry IS the artifact; Piary serializes it as a `pi:view` block
// and renders the template (everywhere else it degrades to a JSON fence).
//
// The registration below is not unit-tested: it needs pi's runtime, and
// `typebox` resolves only inside pi's image. Its pure parts are the shape check,
// `view-shapes.ts` (tests/unit/view-tool.test.ts), and the a2ui check, `a2ui.ts`
// (tests/contract/a2ui-copies.test.ts).
// What the tool says of itself follows the draw mode (`draw-mode.ts`, ADR 0044).
// In a2ui mode the a2ui template is taught in the description itself
// (`a2ui-guide.ts`), because the choice of tool is made from it; in free mode
// the template is neither named nor accepted. The other templates' payload
// schemas live in the view-templates skill (SKILL.md next to this file).
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkA2ui } from "./a2ui.ts";
import { drawMode, viewDescription, viewDataHint, viewSnippet, viewTemplateHint } from "./draw-mode.ts";
import { checkView } from "./view-shapes.ts";

export default function (pi: ExtensionAPI) {
	const mode = drawMode(process.env["PIARY_DRAW"]);
	pi.registerTool({
		name: "view",
		label: "View",
		description: viewDescription(mode),
		promptSnippet: viewSnippet(mode),
		parameters: Type.Object({
			template: Type.String({
				description: viewTemplateHint(mode),
			}),
			data: Type.Object(
				{},
				{
					additionalProperties: true,
					description: viewDataHint(mode),
				},
			),
		}),
		async execute(_toolCallId: string, params: { template: string; data: unknown }) {
			const problem = checkView(params.template, params.data, mode);
			if (problem) return { content: [{ type: "text", text: problem }], isError: true, details: {} };
			if (params.template === "a2ui") {
				const checked = await checkA2ui(params.data);
				if ("problem" in checked) return { content: [{ type: "text", text: checked.problem }], isError: true, details: {} };
				return { content: [{ type: "text", text: checked.note }], details: {} };
			}
			return { content: [{ type: "text", text: "ok" }], details: {} };
		},
	});

	// UI plumbing, not agent surface (SKILL.md stays silent about it): Piary
	// records block openings in the transcript as `block-new` custom entries
	// (blocks-plan step 14). `/block new` appends one — no-turn, in-process.
	// Fold is the unmarked default; a user entry opens a block iff a block-new
	// entry precedes it since the last message entry.
	pi.registerCommand("block", {
		description: "Piary block plumbing: `/block new` marks the next prompt as opening a new block",
		async handler(args) {
			if (args.trim() === "new") pi.appendEntry("block-new", {});
		},
	});
}
