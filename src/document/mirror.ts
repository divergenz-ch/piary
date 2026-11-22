// A run written as text, with no editor: what the canvas writes for a turn, for
// a session no canvas shows (a child running in the background). The same
// helpers underneath — `beginTurnAt`, `serializeAssistant` — so the two cannot
// disagree about what a run leaves in the document.
//
// The text is held in three parts: everything settled above the message being
// streamed (`head`), that message as it stands (`current`, the placeholder
// until it has content), and everything below the run (`tail`). Each function
// returns a new value and leaves its argument alone.

import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { BLOCK_MARKER, cellModes, PI_PLACEHOLDER, serializeAssistant, serializeToolResult } from "./format.ts";
import { beginTurnAt } from "./run.ts";

export interface Mirror {
	head: string;
	current: string;
	tail: string;
}

/** The document as it stands, mid-run. */
export function mirrorText(m: Mirror): string {
	return m.head + m.current + m.tail;
}

/** Opens a run at the end of `md`, as the canvas's `beginTurn` does at the tail. */
export function openMirror(md: string): Mirror {
	const turn = beginTurnAt(md, md.length);
	return {
		head: turn.doc.slice(0, turn.msgAnchor),
		current: turn.doc.slice(turn.msgAnchor, turn.tailAnchor),
		tail: turn.doc.slice(turn.tailAnchor),
	};
}

/** The mode a cell settled above the message being streamed has: what a
 *  redefinition that names none keeps, as on the canvas. Read only when a call
 *  asks, so a message with no such call parses nothing. */
const settledMode = (m: Mirror) => (id: string) => cellModes(m.head).get(id);

/** The message being streamed, as far as it has come. An all-empty partial
 *  keeps the placeholder: there is nothing to show yet. */
export function mirrorPartial(m: Mirror, partial: AssistantMessage): Mirror {
	const text = serializeAssistant(partial, settledMode(m));
	return text ? { ...m, current: `${text}\n\n` } : m;
}

/** Settles `text` above the run and starts the next message empty. */
function commit(m: Mirror, text: string): Mirror {
	return { ...m, head: m.head + (text ? `${text}\n\n` : ""), current: "" };
}

/** A message finished: it is settled, and the next one starts after it. */
export function mirrorFinal(m: Mirror, message: AssistantMessage): Mirror {
	return commit(m, serializeAssistant(message, settledMode(m)));
}

/** A tool's result, settled under its call as the canvas's `appendToolResult`
 *  writes it; the next message starts after it. */
export function mirrorToolResult(m: Mirror, msg: ToolResultMessage): Mirror {
	return commit(m, serializeToolResult(msg));
}

/** A failure, recorded in the document like any reply (ADR 0001). */
export function mirrorError(m: Mirror, message: string): Mirror {
	return commit(m, `<!-- pi -->\n\n**Error:** ${message}`);
}

/** A user message pi delivered mid-run (`text` already serialized), folded into
 *  the block; the run goes on below it. */
export function mirrorUser(m: Mirror, text: string): Mirror {
	const settled = m.current === PI_PLACEHOLDER ? "" : m.current;
	return { ...m, head: `${m.head}${settled}${BLOCK_MARKER}\n\n${text}\n\n`, current: PI_PLACEHOLDER };
}

/** The run ended: a placeholder nothing replaced goes, and the document is whole. */
export function closeMirror(m: Mirror): string {
	return mirrorText(m.current === PI_PLACEHOLDER ? { ...m, current: "" } : m);
}
