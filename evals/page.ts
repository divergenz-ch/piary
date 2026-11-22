// The eval's stand-in for the app's page: what it answers when a tool asks it
// something. The `cell` tool asks how its cell ran and gets a compile check
// (`verdict.ts`); `canvas_edit` asks for its edit to be applied and, when the
// run accepts edits, gets it planned against the conversation as the page would
// plan it. Any other dialog is cancelled at once. Pure: each harness feeds it
// the events it hears and writes the reply where its pi listens.
import { requestedEdit } from "../app/canvas-edits.ts";
import { CellVerdicts } from "../app/cell-verdicts.ts";
import { planCanvasEdit } from "../src/document/canvas-edit.ts";
import { TurnCalls } from "./calls.ts";
import { dialogReply } from "./verdict.ts";

export class Page {
	/** The turn's tool calls, as heard so far. */
	readonly calls = new TurnCalls();
	readonly #verdicts = new CellVerdicts();
	readonly #acceptEdits: boolean;
	/** The conversation as accepted edits leave it: a second edit is planned against the first. */
	#md: string;
	/** Where the prompt being answered ends in the conversation: the turn's region opens there, as on the page. */
	#answering: number;

	constructor(md: string, acceptEdits: boolean, answering: number) {
		this.#md = md;
		this.#acceptEdits = acceptEdits;
		this.#answering = answering;
	}

	/** Hears one of pi's events. The reply to write back when it asks the page something, else null. */
	hear(event: Record<string, unknown>): Record<string, unknown> | null {
		this.calls.hear(event);
		const edit = this.#acceptEdits ? requestedEdit(event) : null;
		if (edit) {
			const plan = planCanvasEdit(this.#md, edit.edit, { from: this.#answering, to: this.#answering });
			if (plan.ok) {
				this.#md = this.#md.slice(0, plan.from) + plan.insert + this.#md.slice(plan.to);
				if (plan.to <= this.#answering) this.#answering += plan.insert.length - (plan.to - plan.from);
			}
			return { type: "extension_ui_response", id: edit.requestId, value: JSON.stringify(plan.ok ? { ok: true } : { error: plan.error }) };
		}
		return dialogReply(event, (cell) => this.calls.cell(cell), this.#verdicts);
	}
}
