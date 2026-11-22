// The `canvas_edit` tool: lets the agent change prose already in the Piary
// document — a heading, a paragraph, an earlier answer — by quoting it, the
// way `edit` changes a file (ADR 0033). The page owns the open document, so the
// page applies the change and says whether it did; pi never touches the file.
//
// Started by the Piary app, pi is told a page answers (`PIARY_VERDICTS`, the
// channel the `cell` tool's verdicts use). Anywhere else nothing can apply the
// edit, and the call fails saying so, so the agent writes the change in its
// answer instead of claiming it.
//
// The registration below is not unit-tested: it needs pi's runtime, and
// `typebox` resolves only inside pi's image. The page's half is
// `src/document/canvas-edit.ts` and `app/canvas-edits.ts`, and the request title
// is held equal by tests/contract/extension-copies.test.ts.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** The question the page answers (`app/canvas-edits.ts` holds the same string). */
const EDIT_REQUEST = "piary:canvas-edit";

/** How long to wait for the page: applying a quote is immediate, so this only
 *  bounds a page that went away. */
const EDIT_TIMEOUT_MS = 10_000;

const NO_PAGE =
	"No Piary page is open to apply this. Write the change in your answer and say you could not apply it; " +
	"do not edit the conversation's file.";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "canvas_edit",
		label: "Canvas edit",
		description:
			"Change prose already in this conversation's document — a heading, a paragraph, a list, an earlier answer " +
			"— by quoting it. oldText must match the document exactly, once, inside one block; newText replaces it " +
			"(empty removes it, and a block left with no text is removed whole; repeat oldText and add to it to insert " +
				"after). The open page applies the change and " +
			"answers ok, or why not, so a refusal means nothing changed: requote and try again. To change a cell, " +
			"redefine it with the `cell` tool instead. The `[now: …]` and `[attached: …]` lines on the user's messages are " +
			"added on the way to you and are not in the document: leave them out of both texts. Never edit the conversation's markdown file with edit, write " +
			"or bash.",
		promptSnippet: "Change prose already in the conversation by quoting it",
		parameters: Type.Object({
			oldText: Type.String({ description: "The text to change, exactly as the document has it, enough of it to occur once." }),
			newText: Type.String({ description: "What replaces it. Empty removes it." }),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (process.env["PIARY_VERDICTS"] !== "1" || !ctx.hasUI) throw new Error(NO_PAGE);
			const raw = await ctx.ui.input(EDIT_REQUEST, JSON.stringify({ oldText: params.oldText, newText: params.newText }), {
				timeout: EDIT_TIMEOUT_MS,
				signal,
			});
			let answer: { ok?: unknown; error?: unknown } | null = null;
			try {
				answer = raw ? (JSON.parse(raw) as { ok?: unknown; error?: unknown }) : null;
			} catch {
				answer = null;
			}
			if (answer?.ok === true) return { content: [{ type: "text", text: "ok — the document now has the new text." }], details: {} };
			// Thrown, because a thrown error is how a tool says its call failed.
			if (typeof answer?.error === "string") throw new Error(`not applied: ${answer.error}`);
			throw new Error(`not applied: the page did not answer. ${NO_PAGE}`);
		},
	});
}
