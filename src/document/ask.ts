// Inline questions: an extension's dialog is answered *in* the buffer, under
// the run that asked it — for plan mode, right below its `plan_mode_question`
// tool call. Pure derivation: no DOM, and nothing is ever written into the
// document (the call already carries the questions, the result the answers).
import type { DocSegment } from "./format.ts";
import { viewPayload } from "./views.ts";

/** An extension dialog awaiting an answer (pi's `extension_ui_request`). */
export interface AskRequest {
	method: "select" | "confirm" | "input" | "editor";
	title: string;
	message?: string;
	options?: string[];
	placeholder?: string;
	prefill?: string;
}

/**
 * Line-end offset where an inline question mounts: the end of the last inked
 * segment — the trailing empty `you`/`pi` placeholders are not a place to
 * ask. Mid-tool-call this lands right under the pending fence. Same line-end
 * construction as `cellAnchors`, so a block widget is legal there.
 */
export function askAnchor(md: string, segments: readonly DocSegment[]): number {
	for (let i = segments.length - 1; i >= 0; i--) {
		if (!segments[i].text) continue;
		return md.slice(0, segments[i].to).replace(/\s+$/, "").length;
	}
	return md.length;
}

/** The rich render of a pending plan-mode question. */
export interface QuestionCard {
	header: string;
	question: string;
	options: { label: string; description?: string; value: string }[];
	other: { label: string; value: string } | null;
	/** 1-based position in the tool call's question list ("2 of 3"). */
	index: number;
	total: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Pair a `select` request with the pending `plan_mode_question` call that
 * raised it, giving the card its labels, descriptions and progress. Null when
 * nothing matches — the host then shows the generic dialog.
 */
export function questionCard(
	md: string,
	segments: readonly DocSegment[],
	req: AskRequest,
): QuestionCard | null {
	const choices = req.options;
	if (req.method !== "select" || !choices?.length) return null;
	const answered = new Set(segments.filter((s) => s.kind === "toolResult").map((s) => s.id));
	let call: DocSegment | undefined;
	for (const s of segments)
		if (s.kind === "toolCall" && s.name === "plan_mode_question" && !answered.has(s.id)) call = s;
	const args = call && viewPayload(md, call)?.data;
	const questions = isRecord(args) ? args.questions : undefined;
	if (!Array.isArray(questions)) return null;
	// question-tool.ts asks with `${header}: ${question}` — the only link
	// between the request and the call that produced it.
	const index = questions.findIndex((q) => isRecord(q) && `${q.header}: ${q.question}` === req.title);
	const q = index >= 0 ? (questions[index] as Record<string, unknown>) : null;
	const options = q && Array.isArray(q.options) ? (q.options as Record<string, unknown>[]) : null;
	// N options + "Other (free-form)". Any other shape is a different dialog.
	if (!options || choices.length !== options.length + 1) return null;
	const rawOther = choices[options.length];
	return {
		header: String(q!.header),
		question: String(q!.question),
		// `value` is the verbatim choice string: the extension resolves the
		// answer with `choices.indexOf(choice)`, so it must never be re-derived.
		options: options.map((o, i) => ({
			label: String(o.label ?? choices[i]),
			description: typeof o.description === "string" ? o.description : undefined,
			value: choices[i],
		})),
		other: /other/i.test(rawOther) ? { label: rawOther.replace(/^\d+\.\s*/, ""), value: rawOther } : null,
		index: index + 1,
		total: questions.length,
	};
}
