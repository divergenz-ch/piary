// The tool calls of one turn, folded from pi's events as they arrive. Pure, so
// the suite feeds it events by hand.
import { shortCellId } from "../src/document/format.ts";
import type { ToolCall } from "./checks.ts";

/** A cell as its latest `cell` call wrote it. */
export interface WrittenCell {
	source: string;
	mode: string;
}

export class TurnCalls {
	/** Every call, in the order pi started them. A nested one counts too: an
	 *  `edit` made from inside another tool is still an edit. */
	readonly calls: ToolCall[] = [];
	/** By pi's tool-call id: parallel calls end in the order they finish. */
	readonly #open = new Map<string, ToolCall>();
	readonly #cells = new Map<string, WrittenCell>();

	hear(event: Record<string, unknown>): void {
		const { type, toolName, toolCallId } = event;
		if (type === "tool_execution_end" && typeof toolCallId === "string") {
			const ended = this.#open.get(toolCallId);
			if (ended) ended.failed = event["isError"] === true;
			this.#open.delete(toolCallId);
			return;
		}
		if (type !== "tool_execution_start" || typeof toolName !== "string") return;
		const call: ToolCall = { name: toolName, args: (event["args"] ?? {}) as Record<string, unknown> };
		this.calls.push(call);
		if (typeof toolCallId !== "string") return;
		this.#open.set(toolCallId, call);
		if (toolName !== "cell") return;
		const { id, source, mode } = call.args;
		// The id the tool addresses the cell by: the one it was given, else the
		// one the document derives from the call (`pi-extension/cell.ts`).
		const cellId = typeof id === "string" && id ? id : shortCellId(toolCallId);
		this.#cells.set(cellId, { source: String(source ?? ""), mode: typeof mode === "string" ? mode : "js" });
	}

	/** What cell `id` holds after the calls heard so far. */
	cell(id: string): WrittenCell | undefined {
		return this.#cells.get(id);
	}
}
