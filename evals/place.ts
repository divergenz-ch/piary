// Where a case's prompt is, what pi is told before it, and where its answer
// lands — the same rules the app follows, so a case is answered the way the
// canvas would answer it. Pure: the runner does the I/O.
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { type DocSegment, documentMessages, parseDocument, serializeMessages } from "../src/document/format.ts";
import { historyAbove, promptAt, promptEnd, tailPrompt } from "../src/document/run.ts";
import type { DocumentHistory } from "../src/document/transcript.ts";

const YOU = "<!-- you -->";
const PI = "<!-- pi -->";

/** The prompt a case asks pi to answer, and the history above it. */
export interface Target {
	segment: DocSegment;
	/** The prompt's text, as the app sends it (before the `[now: …]` line). */
	prompt: string;
	/** The document above the prompt — what pi's history is rebuilt from. */
	history: DocumentHistory;
}

/** The prompt at `caret` (a substring of `md`), else the trailing prompt (run.ts). */
export function target(md: string, caret?: string): Target {
	const { segments } = parseDocument(md);
	const index = caret === undefined ? tailPrompt(segments) : promptAt(segments, md.indexOf(caret));
	if (index < 0) throw new Error(caret === undefined ? "the document has no trailing prompt" : `no prompt holds "${caret}"`);
	const segment = segments[index];
	return { segment, prompt: segment.text, history: documentMessages(historyAbove(md, segment)) };
}

/**
 * The answer as document text: the messages pi produced after the prompt,
 * serialized the way the app writes a turn, without the fresh prompt slot
 * `serializeMessages` closes with.
 */
export function answerText(after: readonly AgentMessage[]): string {
	let body = serializeMessages(after).trimEnd();
	if (body.endsWith(YOU)) body = body.slice(0, -YOU.length).trimEnd();
	return body;
}

/**
 * The document with the answer under its prompt and before whatever followed,
 * as `beginTurnAt` places a turn (run.ts): the prompt's trimmed end, a blank
 * line, the answer, then the old tail — or a fresh prompt slot when the prompt
 * was the last thing on the page.
 */
export function placeAnswer(md: string, segment: DocSegment, answer: string): string {
	const head = md.slice(0, promptEnd(md, segment));
	const tail = md.slice(segment.to).replace(/^\s+/, "");
	const body = answer.startsWith(PI) || answer.startsWith("<!-- pi:") ? answer : `${PI}\n\n${answer}`;
	return `${head}\n\n${body}\n\n${tail || `${YOU}\n\n`}`;
}

/** The answer's prose: every text part pi wrote after the prompt. */
export function answerProse(after: readonly AgentMessage[]): string {
	const out: string[] = [];
	for (const msg of after as readonly (AgentMessage & { role: string; content?: unknown })[]) {
		if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
		for (const part of msg.content as { type: string; text?: string }[]) if (part.type === "text" && part.text) out.push(part.text);
	}
	return out.join("\n\n").trim();
}

/** The messages after the last user message: the turn the prompt started. */
export function turnOf(messages: readonly AgentMessage[]): AgentMessage[] {
	let last = -1;
	messages.forEach((m, i) => {
		if ((m as { role: string }).role === "user") last = i;
	});
	return messages.slice(last + 1);
}

/**
 * Why the provider refused `turn`, in its own words, or null when the turn was
 * answered: its last assistant message stopped on `error`. One that failed and
 * was then answered on pi's retry is an answer.
 */
export function refusalOf(turn: readonly AgentMessage[]): string | null {
	const last = turn.filter((m) => (m as { role: string }).role === "assistant").at(-1) as { stopReason?: unknown; errorMessage?: unknown } | undefined;
	if (last?.stopReason !== "error") return null;
	return typeof last.errorMessage === "string" && last.errorMessage ? last.errorMessage : "the provider refused the request";
}
