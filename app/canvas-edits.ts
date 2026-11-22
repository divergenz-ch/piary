// The `canvas_edit` tool's request — change this prose already in the
// document — and what the page answers (ADR 0033). The tool asks with an
// `input` dialog titled `EDIT_REQUEST`, the channel the `cell` tool's verdicts
// use; the canvas plans and applies the change; this reads the request and
// bounds a run's failed edits the way `cell-verdicts.ts` bounds a cell's.
//
// Pure — no DOM, no IPC — so the suite runs it from source. `Turn` hears the
// request, asks the canvas, and sends the answer.

import type { CanvasEdit } from "../src/document/canvas-edit.ts";

/** The dialog title the `canvas_edit` tool asks under (`pi-extension/canvas-edit.ts`
 *  holds the same string). */
export const EDIT_REQUEST = "piary:canvas-edit";

/** Refused edits a run may make before the tool tells the agent to stop and
 *  tell the user. The cell's bound and its reason (ADR 0031): three is room to
 *  requote a quote that missed, and a fourth miss is a guess. */
export const MAX_FAILED_EDITS = 3;

/** The answer as the tool reads it. */
export type WireEdit = { ok: true } | { error: string; giveUp?: true };

/** The edit a request asks for, or null for a request that is not one. */
export function requestedEdit(event: Record<string, unknown>): { requestId: string; edit: CanvasEdit } | null {
	if (event["method"] !== "input" || event["title"] !== EDIT_REQUEST) return null;
	const requestId = event["id"];
	if (typeof requestId !== "string") return null;
	try {
		const { oldText, newText } = JSON.parse(String(event["placeholder"] ?? "")) as { oldText?: unknown; newText?: unknown };
		return typeof oldText === "string" && typeof newText === "string" ? { requestId, edit: { oldText, newText } } : null;
	} catch {
		return null;
	}
}

/** One run's count of refused edits. */
export class CanvasEdits {
	#failures = 0;

	/** A fresh prompt: the whole allowance again. */
	reset(): void {
		this.#failures = 0;
	}

	/** What to tell the agent, given what the canvas made of the edit. */
	answer(result: { ok: true } | { ok: false; error: string }): WireEdit {
		if (result.ok) return { ok: true };
		this.#failures++;
		if (this.#failures < MAX_FAILED_EDITS) return { error: result.error };
		return { error: `${result.error}. That is ${this.#failures} refused edits this run: stop, and tell the user what you meant to change`, giveUp: true };
	}
}
