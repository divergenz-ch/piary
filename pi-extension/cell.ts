// The `cell` tool: lets the agent write a reactive code cell into the Piary
// document. The tool call's transcript entry IS the artifact; Piary serializes
// it as a `pi:cell` block, runs it in the document's dataflow graph, and re-runs
// dependents on every change (everywhere else it degrades to a plain code
// fence). Cell semantics and examples live in the reactive-cells section of
// SKILL.md next to this file.
//
// The cell runs in the page, not here. Started by the Piary app, pi is told so
// (`PIARY_VERDICTS`), and the tool asks the page how the cell ran before it
// answers: a cell is not finished until it has run (`docs/notebook-cells.md`
// §Policy). Anywhere else there is no page to ask — a terminal pi would put the
// question to a person — so "ok" means "written", and says it was not verified.
//
// The registration below is not unit-tested: it needs pi's runtime, and
// `typebox` resolves only inside pi's image. Its pure parts are
// `renders-nothing.ts` and `verdict-text.ts` (tests/unit/), and the two copies
// it keeps of document-layer facts are held to the originals by
// tests/contract/extension-copies.test.ts.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { cellDescription, cellSnippet, drawMode } from "./draw-mode.ts";
import { rendersNothing } from "./renders-nothing.ts";
import { parseVerdict, verdictText } from "./verdict-text.ts";

/** The question the page answers (`app/cell-verdicts.ts` holds the same
 *  string). An `input` dialog, because that is the one rpc-mode request that
 *  carries a string back. */
const VERDICT_REQUEST = "piary:cell-verdict";

/** How long to wait for the page's answer: its own bound on a running cell
 *  (`CELL_VERDICT_MS`, 10 s) with room for the cell to reach the page. */
const VERDICT_TIMEOUT_MS = 15_000;

export { rendersNothing }; // re-export: existing importers keep working

/** The modes a cell can actually run in. `CELL_MODES` in
 *  `src/document/cells.ts` is the source of truth; this is the extension's copy
 *  (separate package — importing it would drag the document layer in here). */
const CELL_MODES = ["js", "ts", "ojs", "md", "html", "tex", "dot"] as const;

/** The id a fresh cell will be addressed by in the document — the last six word
 *  characters of the tool-call id. `shortCellId` in `src/document/format.ts` is
 *  the source of truth; this is the extension's copy, for the same reason
 *  `CELL_MODES` is duplicated above. The two must agree: this is the id the
 *  agent is told, and that is the id the document writes. */
function shortCellId(toolCallId: string): string {
	const safe = toolCallId.replace(/[^\w-]/g, "");
	return safe.length > 6 ? safe.slice(-6) : safe || toolCallId;
}

export default function (pi: ExtensionAPI) {
	const mode = drawMode(process.env["PIARY_DRAW"]);
	pi.registerTool({
		name: "cell",
		label: "Cell",
		description: cellDescription(mode),
		promptSnippet: cellSnippet(mode),
		parameters: Type.Object({
			source: Type.String({
				description:
					"The cell's source. Top-level declarations become names other cells can reference; " +
					"a bare expression displays its value.",
			}),
			// An enum, not a free string: a model told "no JSX in a js cell"
			// answers with `mode: "jsx"`, which is not a mode — so the cell is
			// inert, runs nothing, reports nothing, and the page shows a wall of
			// source and no widget. Refusing it here is exact; guessing at the
			// source to catch the same mistake is not.
			mode: Type.Optional(
				Type.Union([...CELL_MODES.map((m) => Type.Literal(m))], {
					description: "Cell language: js (default) | ts | ojs | md | html | tex | dot",
				}),
			),
			id: Type.Optional(
				Type.String({
					description:
						"Redefine the cell with this id (from an earlier call, or a #id visible in the document). " +
						"Omit to create a fresh cell.",
				}),
			),
			group: Type.Optional(
				Type.String({
					description:
						"Artifact group (single token, no spaces). Cells sharing a group render together as one artifact: " +
						"every member's output gathers at the group's first cell, no matter where in the conversation it " +
						"was authored. Use one group per app; repeat it when redefining a member — only the winning " +
						"definition's group counts.",
				}),
			),
		}),
		async execute(toolCallId, params, signal, _onUpdate, ctx) {
			// The id this cell is addressed by, said out loud.
			//
			// It used to return a bare "ok", and the document derived the id from
			// the tool-call id where the agent could not see it. Failure reports
			// then arrived as `#rPDBaU failed`, naming a cell the agent had no way
			// to map back to anything it had written — and one that had to guess
			// guessed wrong, redefined `#rPDBaU` (which held the data every other
			// cell read) with a button, and took the whole artifact down. Its own
			// reasoning is in the transcript: "I don't have a reliable way to map
			// ids to source without more info."
			//
			// Now it does. This is also what makes `id` usable deliberately rather
			// than by luck: to redefine a cell you must know its name.
			const id = typeof params.id === "string" && params.id ? params.id : shortCellId(toolCallId);
			// "ok" means "written", not "ran" — but a declaration-only cell is a
			// knowable no-show at write time, so say so before the user asks
			// "where is it?". Everything else that can go wrong with the source
			// is reported by the document once it tries to run it: a cell that
			// fails to compile now reaches the agent (docs/notebook-cells.md,
			// "The agent loop"), which is a better answer than guessing here.
			const note = rendersNothing(params.source, params.mode)
				? " — note: declaration-only cell, runs headless and renders nothing. " +
					"If the user should see its value, reference it from a separate bare-expression cell " +
					"or call display()."
				: "";
			const written = `ok — cell #${id}${note}`;
			if (process.env["PIARY_VERDICTS"] !== "1" || !ctx.hasUI) {
				return { content: [{ type: "text", text: written }], details: { id } };
			}
			const answer = await ctx.ui.input(VERDICT_REQUEST, JSON.stringify({ id }), { timeout: VERDICT_TIMEOUT_MS, signal });
			const said = verdictText(id, parseVerdict(answer), written);
			// Thrown, because a thrown error is how a tool says its call failed: pi
			// hands the agent an error result, which is what makes it fix the cell.
			if (said.failed) throw new Error(said.text);
			return { content: [{ type: "text", text: said.text }], details: { id } };
		},
	});
}
